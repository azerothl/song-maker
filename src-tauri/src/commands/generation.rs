use super::shared::{normalize_stem_separator, write_checksums};
use super::AppState;
use crate::abc_metadata::{write_aligned_score_abc, AbcAlignRequest};
use crate::audiocpp::AudioCppServer;
use crate::form::{guidance_scale, validate_form_for_engine, validate_target_duration};
use crate::hashutil::{normalize_seed, random_seed, sha256_file};
use crate::library::{
    library_row_from_project, load_project, load_settings, project_folder, save_project,
    upsert_library_row,
};
use crate::mix::wav_duration_ms;
use crate::models::*;
use crate::paths::{atomic_write_json, ensure_dir, next_folder_id, now_iso};
use crate::pins::*;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Resample / HTDemucs alignment only — not a YuE2 wall-clock contract.
const STEM_ALIGN_TOLERANCE_MS: i64 = 250;
const REQUESTED_DURATION_TOLERANCE_MS: i64 = 250;
const INSTRUMENTAL_AR_ADAPTER_FILENAME: &str = "ar_lora_inst_v3abc.bf16.safetensors";
const INSTRUMENTAL_AR_ADAPTER_SHA256: &str =
    "e408fd3148b75b1165f7ddbf63db575d83bb6402a0b5f876fcb767dbcb2c5414";

fn uses_verified_instrumental_ar_adapter(provenance: &serde_json::Value) -> bool {
    let Some(adapter) = provenance.pointer("/adapters/ar") else {
        return false;
    };
    let filename_matches = adapter
        .get("filename")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|filename| filename == INSTRUMENTAL_AR_ADAPTER_FILENAME);
    let hash_matches = adapter
        .get("sha256")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|sha| sha.eq_ignore_ascii_case(INSTRUMENTAL_AR_ADAPTER_SHA256));
    let enabled = adapter
        .get("scale")
        .and_then(serde_json::Value::as_f64)
        .is_some_and(|scale| scale > 0.0);
    filename_matches && hash_matches && enabled
}

fn check_requested_duration(duration_ms: i64, expected_ms: i64) -> Result<(), String> {
    if duration_ms <= 0 || (duration_ms - expected_ms).abs() > REQUESTED_DURATION_TOLERANCE_MS {
        return Err(format!(
            "GENERATION_DURATION_MISMATCH|{expected_ms}|{duration_ms}"
        ));
    }
    Ok(())
}

fn engine_requires_fixed_duration(
    requested_engine: &str,
    prefer_full_lyrics: bool,
    instrumental_mode: bool,
) -> bool {
    match requested_engine {
        // YuE2 preserves a duration range when the user prioritizes complete lyrics.
        "yue2" => !prefer_full_lyrics || instrumental_mode,
        // ACE-Step receives duration_seconds for every request; verify its actual WAV too.
        "ace_step" => true,
        _ => false,
    }
}

#[cfg(test)]
mod fixed_duration_policy_tests {
    use super::engine_requires_fixed_duration;

    #[test]
    fn ace_step_always_enforces_the_requested_duration() {
        assert!(engine_requires_fixed_duration("ace_step", true, false));
        assert!(engine_requires_fixed_duration("ace_step", false, false));
        assert!(engine_requires_fixed_duration("ace_step", true, true));
    }

    #[test]
    fn yue2_keeps_its_lyric_duration_policy() {
        assert!(!engine_requires_fixed_duration("yue2", true, false));
        assert!(engine_requires_fixed_duration("yue2", false, false));
        assert!(engine_requires_fixed_duration("yue2", true, true));
    }

    #[test]
    fn engines_without_a_duration_contract_are_not_marked_fixed() {
        assert!(!engine_requires_fixed_duration("unknown", true, false));
    }
}

fn record_generation_failure(
    gen_dir: &Path,
    generation_id: &str,
    started_at: &str,
    error: &str,
) -> Result<(), String> {
    let result = json!({
        "schema": SCHEMA_GEN_RESULT,
        "schemaVersion": SCHEMA_VERSION,
        "id": generation_id,
        "state": "failed",
        "decode": "unsupported",
        "startedAt": started_at,
        "finishedAt": now_iso(),
        "audio": null,
        "score": null,
        "error": error
    });
    atomic_write_json(&gen_dir.join("result.json"), &result)
}

#[cfg(test)]
mod requested_duration_tests {
    use super::check_requested_duration;

    #[test]
    fn accepts_codec_rounding_but_rejects_short_or_long_audio() {
        assert!(check_requested_duration(359_998, 360_000).is_ok());
        assert!(check_requested_duration(75_278, 360_000).is_err());
        assert!(check_requested_duration(109_798, 360_000).is_err());
        assert!(check_requested_duration(0, 30_000).is_err());
        assert!(check_requested_duration(361_000, 360_000).is_err());
    }
}

#[cfg(test)]
mod instrumental_adapter_tests {
    use super::uses_verified_instrumental_ar_adapter;
    use serde_json::json;

    #[test]
    fn only_the_enabled_catalog_instrumental_adapter_is_recognized() {
        let valid = json!({
            "adapters": {
                "ar": {
                    "filename": "ar_lora_inst_v3abc.bf16.safetensors",
                    "sha256": "e408fd3148b75b1165f7ddbf63db575d83bb6402a0b5f876fcb767dbcb2c5414",
                    "scale": 1.0
                }
            }
        });
        assert!(uses_verified_instrumental_ar_adapter(&valid));

        let uppercase_hash = json!({
            "adapters": {
                "ar": {
                    "filename": "ar_lora_inst_v3abc.bf16.safetensors",
                    "sha256": "E408FD3148B75B1165F7DDBF63DB575D83BB6402A0B5F876FCB767DBCB2C5414",
                    "scale": 0.5
                }
            }
        });
        assert!(uses_verified_instrumental_ar_adapter(&uppercase_hash));

        let wrong_hash = json!({
            "adapters": {
                "ar": {
                    "filename": "ar_lora_inst_v3abc.bf16.safetensors",
                    "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
                    "scale": 1.0
                }
            }
        });
        assert!(!uses_verified_instrumental_ar_adapter(&wrong_hash));

        let disabled = json!({
            "adapters": {
                "ar": {
                    "filename": "ar_lora_inst_v3abc.bf16.safetensors",
                    "sha256": "e408fd3148b75b1165f7ddbf63db575d83bb6402a0b5f876fcb767dbcb2c5414",
                    "scale": 0.0
                }
            }
        });
        assert!(!uses_verified_instrumental_ar_adapter(&disabled));
        assert!(!uses_verified_instrumental_ar_adapter(&json!({})));
    }
}

fn check_stem_alignment(duration_ms: i64, source_ms: i64) -> Result<(), String> {
    if duration_ms <= 0 {
        return Err("Piste instrumentale vide après retrait des voix.".into());
    }
    if (duration_ms - source_ms).abs() > STEM_ALIGN_TOLERANCE_MS {
        return Err(format!(
            "Le retrait des voix a changé la durée ({:.2} s au lieu de {:.2} s). L’original est conservé.",
            duration_ms as f64 / 1000.0,
            source_ms as f64 / 1000.0
        ));
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum InstrumentalSeparatorProvider {
    AudioCpp,
    HtDemucsOnnx,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct InstrumentalSeparatorPlan {
    id: &'static str,
    sha256: &'static str,
    provider: InstrumentalSeparatorProvider,
    output_roles: &'static [&'static str],
    included_stems: &'static [&'static str],
}

fn instrumental_separator_plan(raw: &str) -> InstrumentalSeparatorPlan {
    match normalize_stem_separator(raw) {
        "bs_roformer" => InstrumentalSeparatorPlan {
            id: "bs_roformer",
            sha256: BS_ROFORMER_SHA,
            provider: InstrumentalSeparatorProvider::AudioCpp,
            output_roles: &["other"],
            included_stems: &["instrumental"],
        },
        "mel_band_roformer" => InstrumentalSeparatorPlan {
            id: "mel_band_roformer",
            sha256: MEL_BAND_ROFORMER_SHA,
            provider: InstrumentalSeparatorProvider::AudioCpp,
            output_roles: &["other"],
            included_stems: &["instrumental"],
        },
        "htdemucs_6s" => InstrumentalSeparatorPlan {
            id: "htdemucs_6s",
            sha256: crate::demucs_onnx::MODEL_SHA256,
            provider: InstrumentalSeparatorProvider::HtDemucsOnnx,
            output_roles: &["drums", "bass", "other", "guitar", "piano"],
            included_stems: &["drums", "bass", "other", "guitar", "piano"],
        },
        _ => InstrumentalSeparatorPlan {
            id: "htdemucs",
            sha256: HTDEMUCS_SHA,
            provider: InstrumentalSeparatorProvider::AudioCpp,
            output_roles: &["drums", "bass", "other"],
            included_stems: &["drums", "bass", "other"],
        },
    }
}

#[cfg(test)]
mod instrumental_separator_tests {
    use super::{instrumental_separator_plan, InstrumentalSeparatorProvider};

    #[test]
    fn instrumental_generation_uses_the_selected_separator() {
        let cases = [
            (
                "htdemucs",
                "htdemucs",
                InstrumentalSeparatorProvider::AudioCpp,
                &["drums", "bass", "other"][..],
            ),
            (
                "bs_roformer",
                "bs_roformer",
                InstrumentalSeparatorProvider::AudioCpp,
                &["other"][..],
            ),
            (
                "mel_band_roformer",
                "mel_band_roformer",
                InstrumentalSeparatorProvider::AudioCpp,
                &["other"][..],
            ),
            (
                "htdemucs_6s",
                "htdemucs_6s",
                InstrumentalSeparatorProvider::HtDemucsOnnx,
                &["drums", "bass", "other", "guitar", "piano"][..],
            ),
        ];
        for (selected, expected_id, expected_provider, expected_roles) in cases {
            let plan = instrumental_separator_plan(selected);
            assert_eq!(plan.id, expected_id);
            assert_eq!(plan.provider, expected_provider);
            assert_eq!(plan.output_roles, expected_roles);
            assert!(plan.included_stems.iter().all(|role| *role != "vocals"));
        }
    }
}

fn validate_instrumental_separator(
    settings: &AppSettings,
    plan: InstrumentalSeparatorPlan,
) -> Result<(), String> {
    let cache = Path::new(&settings.cache_dir);
    match plan.id {
        "htdemucs" => {
            let weights = crate::paths::htdemucs_path(cache);
            if !weights.is_file() {
                return Err("Pour créer un instrumental, installez les composants audio dans Paramètres → Modèle (séparation des voix).".into());
            }
            if sha256_file(&weights)? != plan.sha256 {
                return Err("Le composant de retrait des voix est incomplet. Réinstallez les composants audio dans Paramètres → Modèle.".into());
            }
        }
        "bs_roformer" => {
            if !crate::paths::bs_roformer_weights_present(cache) {
                return Err("BS-RoFormer doit être installé dans Paramètres → Production audio avant de générer un instrumental.".into());
            }
            crate::bs_roformer::verify_sha256(cache)?;
        }
        "mel_band_roformer" => {
            if !crate::paths::mel_band_roformer_weights_present(cache) {
                return Err("Mel-Band RoFormer doit être installé dans Paramètres → Production audio avant de générer un instrumental.".into());
            }
            crate::mel_band_roformer::verify_sha256(cache)?;
        }
        "htdemucs_6s" => {
            if !crate::demucs_onnx::is_installed(cache) {
                return Err("Le runtime HTDemucs 6 stems doit être installé dans Paramètres → Production audio avant de générer un instrumental.".into());
            }
        }
        _ => unreachable!("separator plan is normalized"),
    }
    Ok(())
}

impl InstrumentalSeparatorPlan {
    fn method(self) -> String {
        format!("{}-accompaniment", self.id)
    }
}

#[cfg(test)]
mod stem_align_tests {
    use super::check_stem_alignment;

    #[test]
    fn codec_rounding_is_accepted() {
        assert!(check_stem_alignment(359_998, 360_000).is_ok());
        assert!(check_stem_alignment(0, 360_000).is_err());
        assert!(check_stem_alignment(361_000, 360_000).is_err());
    }
}

/// Keep the generator output and publish only the accompaniment. Empty lyrics
/// do not prevent a music model from hallucinating vocals.
async fn remove_generated_vocals(
    server: &AudioCppServer,
    server_url: &str,
    settings: &AppSettings,
    plan: InstrumentalSeparatorPlan,
    gen_dir: &Path,
) -> Result<serde_json::Value, String> {
    let raw = gen_dir.join("audio-original.wav");
    std::fs::copy(gen_dir.join("audio.wav"), &raw).map_err(|e| e.to_string())?;
    let sep_dir = gen_dir.join("instrumental");
    ensure_dir(&sep_dir).map_err(|e| e.to_string())?;
    let input = sep_dir.join("input-44100.wav");
    crate::resample::resample_soxr(&raw, &input, SEPARATOR_SAMPLE_RATE)?;
    match plan.provider {
        InstrumentalSeparatorProvider::AudioCpp => {
            // RoFormer separates with its own weights. Restart the shared server
            // after generation so the generation model can be unloaded first.
            let separator_url = if matches!(plan.id, "bs_roformer" | "mel_band_roformer") {
                server.shutdown();
                server.ensure_started(settings)?
            } else {
                server_url.to_string()
            };
            let response = AudioCppServer::run_task(
                &separator_url,
                json!({
                    "model": plan.id,
                    "request": {"audio": input.display().to_string()}
                }),
            )
            .await?;
            AudioCppServer::write_named_audio_outputs(&response, &sep_dir)?;
            if matches!(plan.id, "bs_roformer" | "mel_band_roformer") {
                super::shared::alias_instrumental_to_other(&sep_dir)?;
            }
        }
        InstrumentalSeparatorProvider::HtDemucsOnnx => {
            crate::demucs_onnx::separate(
                PathBuf::from(&settings.cache_dir),
                input,
                sep_dir.clone(),
            )
            .await?;
        }
    }
    let mut stems = Vec::new();
    let original_duration = wav_duration_ms(&raw)?;
    for role in plan.output_roles {
        let source = super::shared::find_stem_file(&sep_dir, role)?;
        let path = sep_dir.join(format!("{role}-48000.wav"));
        crate::resample::resample_soxr(&source, &path, SAMPLE_RATE)?;
        let duration = wav_duration_ms(&path)?;
        check_stem_alignment(duration, original_duration)?;
        stems.push((
            role.to_string(),
            PathBuf::from(format!("instrumental/{role}-48000.wav")),
            sha256_file(&path)?,
            duration,
        ));
    }
    let mix = crate::mix::new_mix_from_separation("instrumental", "instrumental", &stems, false);
    let rendered = gen_dir.join("audio-instrumental.wav");
    let trim = crate::mix::render_mix(&mix, gen_dir, &rendered)?;
    check_stem_alignment(wav_duration_ms(&rendered)?, original_duration)?;
    std::fs::copy(&rendered, gen_dir.join("audio.wav")).map_err(|e| e.to_string())?;
    Ok(
        json!({"method":plan.method(), "separatorId":plan.id, "modelSha256":plan.sha256,
        "originalPath":"audio-original.wav", "originalSha256":sha256_file(&raw)?,
        "includedStems":plan.included_stems, "excludedStems":["vocals"],
        "peakTrimDb":trim, "residualVocalsPossible":true}),
    )
}

pub(crate) struct GenerationWorker {
    pub server: Arc<AudioCppServer>,
    pub queue: crate::queue::JobQueue,
    pub settings: AppSettings,
    pub id: String,
    pub cancelled: Arc<std::sync::atomic::AtomicBool>,
}

struct AceStepTaskOptions<'a> {
    tempo_bpm: Option<u32>,
    key: Option<&'a KeySig>,
    meter: Option<&'a Meter>,
    language: Option<&'a str>,
}

fn generation_lyrics_for_engine<'a>(
    draft_lyrics: &'a str,
    instrumental_mode: bool,
    requested_engine: &str,
    instrumental_adapter_active: bool,
) -> (&'a str, bool) {
    if !instrumental_mode {
        return (draft_lyrics, false);
    }

    // ACE-Step's text-to-music route uses this marker for instrumental output.
    // YuE2 only receives its marker with the verified instrumental adapter.
    match requested_engine {
        "ace_step" => ("[Instrumental]", true),
        "yue2" if instrumental_adapter_active => ("[instrumental]", true),
        _ => ("", false),
    }
}

pub(crate) fn engine_id_from_generation_request(req: &serde_json::Value) -> String {
    if let Some(id) = req
        .get("model")
        .and_then(|model| model.get("engineId"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        return id.to_string();
    }
    match req
        .get("generationEngine")
        .and_then(|v| v.as_str())
        .unwrap_or("yue2")
    {
        "ace_step" => "ace_step_1_5".into(),
        "ace_step_lego" => crate::ace_step_lego::ENGINE_ID.into(),
        _ => "yue2_3b".into(),
    }
}

fn resolve_generation_engine(
    requested: Option<&str>,
    settings_engine: &str,
) -> Result<String, String> {
    if requested
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some_and(|s| s == "ace_step_lego")
    {
        return Ok("ace_step_lego".into());
    }
    let engine = requested
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(settings_engine);
    if engine == "house_model" {
        return Err(crate::house_model::REFUSE_GENERATE_FR.into());
    }
    if engine == "ace_step_lego" {
        return Err(
            "ACE-Step Lego n’est pas le moteur global. YuE2 reste le défaut Créer ; Lego n’est appelé que pour ajouter une piste (mix/stems)."
                .into(),
        );
    }
    if engine != "yue2" && engine != "ace_step" {
        return Err("Moteur de génération inconnu (yue2|ace_step).".into());
    }
    Ok(engine.to_string())
}

fn ace_step_task_request(
    text: &str,
    lyrics: &str,
    seed: u64,
    duration_seconds: u32,
    task_options: AceStepTaskOptions<'_>,
) -> serde_json::Value {
    let mut request = json!({
        "task_route": "text2music",
        "text": text,
        "lyrics": lyrics,
        "seed": seed,
        "duration_seconds": duration_seconds,
        "num_inference_steps": 8,
        "guidance_scale": 1.0
    });
    let options = request.as_object_mut().expect("JSON object");
    if let Some(bpm) = task_options.tempo_bpm {
        options.insert("bpm".into(), json!(bpm));
    }
    if let Some(key) = task_options.key {
        options.insert(
            "keyscale".into(),
            json!(format!("{} {}", key.tonic, key.mode)),
        );
    }
    if let Some(meter) = task_options.meter {
        options.insert(
            "timesignature".into(),
            json!(format!("{}/{}", meter.numerator, meter.denominator)),
        );
    }
    if let Some(language) = task_options
        .language
        .filter(|value| !value.trim().is_empty())
    {
        options.insert("language".into(), json!(language));
    }
    request
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn start_generation(
    state: tauri::State<'_, AppState>,
    id: String,
    form: FormInput,
    abc: Option<String>,
    stop_after: Option<String>,
    source_generation_id: Option<String>,
    engine: Option<String>,
    instrumental_role: Option<String>,
) -> Result<ProjectDoc, String> {
    if instrumental_role.is_some() {
        return Err("Utilisez la commande d’ajout de partie instrumentale.".into());
    }
    run_generation(
        state.inner(),
        id,
        form,
        abc,
        stop_after,
        source_generation_id,
        engine,
        None,
        false,
        None,
    )
    .await
    .map(|result| result.project)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstrumentalPartResult {
    pub(crate) project: ProjectDoc,
    pub(crate) generation_id: String,
}

#[tauri::command]
pub async fn generate_instrumental_part(
    state: tauri::State<'_, AppState>,
    id: String,
    mut form: FormInput,
    engine: Option<String>,
    role: String,
) -> Result<InstrumentalPartResult, String> {
    if !matches!(role.as_str(), "bass" | "drums" | "other") {
        return Err("Choisissez basse, batterie ou autre instrument.".into());
    }
    form.instrumental_mode = true;
    form.continuation_generation_id = None;
    run_generation(
        state.inner(),
        id,
        form,
        None,
        None,
        None,
        engine,
        Some(role),
        true,
        None,
    )
    .await
}

/// Versions creates alternatives without replacing the arrangement before selection.
#[tauri::command]
pub async fn generate_comparison_take(
    state: tauri::State<'_, AppState>,
    id: String,
    mut form: FormInput,
    abc: Option<String>,
    engine: Option<String>,
    stop_after: Option<String>,
) -> Result<InstrumentalPartResult, String> {
    if engine.as_deref() == Some("ace_step_lego") {
        return Err("Utilisez Ajouter une piste pour le modèle guidé par l’audio.".into());
    }
    form.continuation_generation_id = None;
    run_generation(
        state.inner(),
        id,
        form,
        abc,
        stop_after,
        None,
        engine,
        None,
        true,
        None,
    )
    .await
}

pub(crate) async fn generate_worker_take(
    state: tauri::State<'_, AppState>,
    id: String,
    form: FormInput,
    worker: &GenerationWorker,
) -> Result<InstrumentalPartResult, String> {
    run_generation(
        state.inner(),
        id,
        form,
        None,
        None,
        None,
        Some(worker.settings.generation_engine.clone()),
        None,
        true,
        Some(worker),
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn run_generation(
    state: &AppState,
    id: String,
    form: FormInput,
    abc: Option<String>,
    stop_after: Option<String>,
    source_generation_id: Option<String>,
    engine: Option<String>,
    instrumental_role: Option<String>,
    preserve_project: bool,
    worker: Option<&GenerationWorker>,
) -> Result<InstrumentalPartResult, String> {
    let mut settings = match worker {
        Some(worker) => worker.settings.clone(),
        None => load_settings()?,
    };
    let requested_engine =
        resolve_generation_engine(engine.as_deref(), &settings.generation_engine)?;
    let style_sent =
        validate_form_for_engine(&form, &requested_engine).map_err(|e| e.to_string())?;
    // Empty lyrics alone do not stop music models from hallucinating vocals.
    // Make instrumental intent explicit in the model prompt as well.
    let style_sent = if form.instrumental_mode {
        format!("{style_sent}; instrumental only, no vocals, no singing, no spoken voice")
    } else {
        style_sent
    };
    let use_ace_step = requested_engine == "ace_step";
    let use_lego = requested_engine == "ace_step_lego";
    let (lora_provenance, lora_warnings) = if use_ace_step || use_lego {
        (json!({}), Vec::new())
    } else {
        resolve_lora_provenance_for_generation(&mut settings)
    };
    let instrumental_adapter_active = requested_engine == "yue2"
        && form.instrumental_mode
        && uses_verified_instrumental_ar_adapter(&lora_provenance);
    if instrumental_adapter_active && form.cot != "full" {
        return Err("L’adaptateur instrumental YuE2 nécessite « Analyse complète ». Choisissez ce réglage ou désactivez l’adaptateur dans Paramètres → Modèle.".into());
    }
    let target_duration_sec =
        validate_target_duration(form.target_duration_sec).map_err(|e| e.to_string())?;
    let (lyrics_for_engine, instrumental_marker_used) = generation_lyrics_for_engine(
        &form.lyrics,
        form.instrumental_mode,
        &requested_engine,
        instrumental_adapter_active,
    );
    let lyrics_sent = lyrics_for_engine.to_string();
    let (mut semantic_min_tokens, mut semantic_max_tokens) = semantic_token_budget(
        target_duration_sec,
        &lyrics_sent,
        form.prefer_full_lyrics && !form.instrumental_mode,
    );
    let fixed_duration = engine_requires_fixed_duration(
        &requested_engine,
        form.prefer_full_lyrics,
        form.instrumental_mode,
    );
    let mut expected_duration_ms = i64::from(target_duration_sec) * 1000;
    let stop_after_abc = match stop_after
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        None => false,
        Some("abc") => true,
        Some(other) => {
            return Err(format!(
                "stop_after={other} hors contrat (seul « abc » est pris en charge)."
            ));
        }
    };
    let mut abc_trimmed = abc
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let remove_vocals = form.instrumental_mode && !use_lego && !stop_after_abc;
    let instrumental_separator = if remove_vocals {
        let plan = instrumental_separator_plan(&settings.stem_separator);
        validate_instrumental_separator(&settings, plan)?;
        Some(plan)
    } else {
        None
    };
    if use_ace_step {
        if !settings.ace_step_license_accepted {
            return Err(
                "Lisez et acceptez l’information de licence ACE-Step avant de l’utiliser.".into(),
            );
        }
        let cache = PathBuf::from(&settings.cache_dir);
        if !crate::ace_step::weights_valid(&cache) {
            return Err("Les poids ACE-Step sont absents ou incomplets; réinstallez-les depuis Paramètres → Modèle.".into());
        }
    }
    if use_lego {
        if !settings.ace_step_lego_license_accepted {
            return Err(
                "Lisez et acceptez l’avis ACE-Step 1.5 Base (Lego) avant d’ajouter une piste."
                    .into(),
            );
        }
        if !crate::profiles::ace_step_contract_accepted_for_active_profile()? {
            return Err("Avant Lego dans le profil Commercial, acceptez l’avertissement ACE-Step dans Paramètres → Modèle.".into());
        }
        if stop_after_abc
            || form.continuation_generation_id.is_some()
            || source_generation_id.is_some()
            || abc_trimmed.is_some()
        {
            return Err(
                "Lego n’est que l’ajout d’une piste depuis le mix/stems. Partition, continuation et rendu score restent YuE2."
                    .into(),
            );
        }
    }
    if abc_trimmed.is_some() && form.cot == "off" {
        return Err("Un ABC avec cot=off est interdit (erreur locale, avant l'appel).".into());
    }
    if stop_after_abc {
        if form.cot == "off" {
            return Err("stop_after=abc exige cot=melody|full.".into());
        }
        if abc_trimmed.is_some() {
            return Err("stop_after=abc refuse un ABC externe.".into());
        }
        if form.continuation_generation_id.is_some() {
            return Err("stop_after=abc est incompatible avec une continuation.".into());
        }
        if source_generation_id.is_some() {
            return Err(
                "stop_after=abc est incompatible avec un rendu depuis un score existant.".into(),
            );
        }
    }
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    let source_gen_id = source_generation_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let continuation = form.continuation_generation_id.as_deref();
    if use_ace_step {
        if stop_after_abc
            || continuation.is_some()
            || source_gen_id.is_some()
            || abc_trimmed.is_some()
        {
            return Err("ACE-Step génère l’audio depuis un prompt; la génération de partition, la continuation YuE2 et le rendu depuis un score restent disponibles avec YuE2.".into());
        }
        if !crate::profiles::ace_step_contract_accepted_for_active_profile()? {
            return Err("Avant une génération ACE-Step dans le profil Commercial, lisez et acceptez l’avertissement dans Paramètres → Modèle.".into());
        }
    }
    if let Some(ref src_id) = source_gen_id {
        let score_path = folder.join("generations").join(src_id).join("score.abc");
        if !score_path.is_file() {
            return Err(format!(
                "Score ABC introuvable pour {src_id} (attendu generations/{src_id}/score.abc)."
            ));
        }
        if abc_trimmed.is_none() {
            abc_trimmed = Some(std::fs::read_to_string(&score_path).map_err(|e| e.to_string())?);
        }
    }
    let semantic_prefix_path = if let Some(parent_id) = continuation {
        let parent_dir = folder.join("generations").join(parent_id);
        let resolved = resolve_semantic_prefix_for_continuation(
            &parent_dir,
            parent_id,
            &form.cot,
            abc_trimmed.as_deref(),
        )?;
        if let Some(abc) = resolved.parent_score_abc {
            abc_trimmed = Some(abc);
        }
        if fixed_duration {
            expected_duration_ms += resolved.frame_count as i64 * 1000 / i64::from(SEMANTIC_HZ);
        }
        semantic_min_tokens = semantic_min_tokens
            .saturating_add(resolved.frame_count as u32)
            .min(resolved.token_ceiling as u32);
        semantic_max_tokens = semantic_max_tokens
            .saturating_add(resolved.frame_count as u32)
            .min(resolved.token_ceiling as u32)
            .max(semantic_min_tokens);
        Some(resolved.semantic_path)
    } else {
        None
    };
    doc.title = form.title.trim().to_string();
    doc.style = form.style.trim().to_string();
    if continuation.is_some() {
        doc.lyrics = format!("{}\n\n{}", doc.lyrics.trim_end(), form.lyrics.trim());
    } else {
        doc.lyrics = form.lyrics.clone();
    }
    doc.cot = form.cot.clone();
    doc.singing_language = form.singing_language.clone();
    doc.tempo_bpm = form.tempo_bpm;
    doc.key = form.key.clone();
    doc.meter = form.meter.clone();
    doc.target_duration_sec = target_duration_sec;
    doc.prefer_full_lyrics = form.prefer_full_lyrics;
    doc.instrumental_mode = form.instrumental_mode;
    doc.updated_at = now_iso();
    if !preserve_project {
        crate::project_transaction::with_lock(&folder, || {
            let mut latest = load_project(&folder)?;
            latest.title = doc.title.clone();
            latest.style = doc.style.clone();
            latest.lyrics = doc.lyrics.clone();
            latest.cot = doc.cot.clone();
            latest.singing_language = doc.singing_language.clone();
            latest.tempo_bpm = doc.tempo_bpm;
            latest.key = doc.key.clone();
            latest.meter = doc.meter.clone();
            latest.target_duration_sec = doc.target_duration_sec;
            latest.prefer_full_lyrics = doc.prefer_full_lyrics;
            latest.instrumental_mode = doc.instrumental_mode;
            latest.updated_at = doc.updated_at.clone();
            save_project(&folder, &latest)?;
            doc = latest;
            Ok(())
        })?;
    }
    let seed = normalize_seed(form.seed.unwrap_or_else(random_seed));
    let gen_id = crate::project_transaction::with_lock(&folder, || {
        let id = next_folder_id(&folder.join("generations"), "gen-")?;
        ensure_dir(&folder.join("generations").join(&id)).map_err(|e| e.to_string())?;
        Ok(id)
    })?;
    let gen_dir = folder.join("generations").join(&gen_id);
    ensure_dir(&gen_dir).map_err(|e| e.to_string())?;

    let lyrics_path = gen_dir.join("lyrics.txt");
    std::fs::write(&lyrics_path, &lyrics_sent).map_err(|e| e.to_string())?;

    let abc_path_rel = if let Some(ref abc_text) = abc_trimmed {
        std::fs::write(gen_dir.join("input.abc"), abc_text).map_err(|e| e.to_string())?;
        Some("input.abc")
    } else {
        None
    };

    let (archive, archive_sha) = if cfg!(target_os = "windows") {
        (ARCHIVE_WINDOWS, ARCHIVE_WINDOWS_SHA)
    } else {
        (ARCHIVE_LINUX, ARCHIVE_LINUX_SHA)
    };

    let parent_generation_id = continuation
        .or(source_gen_id.as_deref())
        .or(doc.active_generation_id.as_deref());
    let model_metadata = if use_lego {
        json!({
            "engineId": crate::ace_step_lego::ENGINE_ID,
            "repo": ACE_STEP_LEGO_HF_REPO,
            "revision": ACE_STEP_LEGO_HF_REVISION,
            "git": ACE_STEP_LEGO_GIT,
            "weightLicense": "MIT per ACE-Step/acestep-v15-base card; training data and output rights unverified",
            "outputKind": crate::ace_step_lego::OUTPUT_KIND,
            "outputVerified": false
        })
    } else if use_ace_step {
        json!({
            "engineId": "ace_step_1_5",
            "repo": ACE_STEP_REPO,
            "revision": ACE_STEP_REVISION,
            "gguf": ACE_STEP_GGUF,
            "sha256": ACE_STEP_SHA,
            "originRepo": ACE_STEP_ORIGIN_REPO,
            "originRevision": ACE_STEP_ORIGIN_REVISION,
            "weightLicense": "MIT per original card; conversion metadata: other",
            "outputVerified": false
        })
    } else {
        json!({
            "engineId": "yue2_3b",
            "repo": YUE2_REPO,
            "revision": YUE2_REVISION,
            "gguf": settings.model_gguf,
            "sha256": settings.model_sha256,
            "vae": YUE2_VAE,
            "vaeSha256": YUE2_VAE_SHA
        })
    };
    let job_kind = if use_lego {
        "lego_add_track"
    } else if continuation.is_some() {
        "continuation"
    } else if stop_after_abc {
        "score_only"
    } else if source_gen_id.is_some() {
        "render_from_score"
    } else {
        "generation"
    };
    let lego_role = if use_lego {
        Some(crate::ace_step_lego::lego_track_name(
            instrumental_role.as_deref().unwrap_or(""),
        )?)
    } else {
        None
    };
    let request = json!({
        "schema": SCHEMA_GEN_REQUEST,
        "schemaVersion": SCHEMA_VERSION,
        "id": gen_id,
        "projectId": id,
        "parentGenerationId": parent_generation_id,
        "continuationGenerationId": continuation,
        "sourceGenerationId": source_gen_id,
        "stopAfter": if stop_after_abc { Some("abc") } else { None::<&str> },
        "createdAt": now_iso(),
        "provider": if use_lego { "ace_step_lego_python" } else { "audiocpp" },
        "generationEngine": requested_engine,
        "binary": {
            "tag": AUDIOCPP_TAG,
            "commit": AUDIOCPP_COMMIT,
            "archive": archive,
            "sha256": archive_sha
        },
        "model": model_metadata,
        "backend": "cuda",
        "styleSent": style_sent,
        "lyricsPath": "lyrics.txt",
        "cot": form.cot,
        "abcPath": abc_path_rel,
        "seed": seed,
        "numInferenceSteps": NUM_INFERENCE_STEPS,
        "guidanceScale": guidance_scale(&form.cot),
        "targetDurationSec": target_duration_sec,
        "preferFullLyrics": form.prefer_full_lyrics && !form.instrumental_mode,
        "instrumentalMode": form.instrumental_mode,
        "instrumentalMarkerUsed": instrumental_marker_used,
        "instrumentalMarker": if instrumental_marker_used {
            Some(lyrics_sent.as_str())
        } else {
            None::<&str>
        },
        "draftLyricsUsed": !form.instrumental_mode,
        "instrumentalProcessing": instrumental_separator.map(InstrumentalSeparatorPlan::method),
        "expectedDurationMs": if fixed_duration { Some(expected_duration_ms) } else { None },
        "instrumentalRole": instrumental_role,
        "legoTrackName": lego_role,
        "outputKind": if use_lego { Some(crate::ace_step_lego::OUTPUT_KIND) } else { None },
        "leftoverNotesFr": if use_lego { Some(crate::ace_step_lego::leftover_notes_fr()) } else { None },
        "semanticMinTokens": semantic_min_tokens,
        "semanticMaxTokens": semantic_max_tokens,
        "lora": lora_provenance,
        "loraWarnings": lora_warnings
    });
    atomic_write_json(&gen_dir.join("request.json"), &request)?;
    atomic_write_json(
        &gen_dir.join("job.json"),
        &json!({
            "id": gen_id,
            "projectId": id,
            "kind": job_kind,
            "state": "queued",
            "updatedAt": now_iso(),
        }),
    )?;

    let queue = worker
        .map(|worker| worker.queue.clone())
        .unwrap_or_else(|| state.queue.clone());
    let queue_ref = queue.clone();
    let lego_source = if use_lego {
        if let Some(path) = form
            .audio_input_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            let p = PathBuf::from(path);
            if !p.is_file() {
                return Err(format!("Source mix/stems introuvable : {}", p.display()));
            }
            Some(p)
        } else {
            let bounce = gen_dir.join("lego-source.wav");
            Some(crate::ace_step_lego::resolve_lego_source_wav(
                &folder, &doc, &bounce,
            )?)
        }
    } else {
        None
    };
    let server = worker
        .map(|worker| worker.server.as_ref())
        .unwrap_or(&state.server);
    let worker_id = worker.map(|worker| worker.id.clone());
    let worker_cancelled = worker.map(|worker| worker.cancelled.clone());
    let runtime_settings = settings.clone();
    let lego_sidecar = &state.ace_step_lego;

    let out_wav = gen_dir.join("audio.wav");
    let cot = form.cot.clone();
    let lyrics_for_req = lyrics_sent.clone();
    let ace_request_for_job = use_ace_step.then(|| {
        ace_step_task_request(
            &style_sent,
            &lyrics_sent,
            seed,
            target_duration_sec,
            AceStepTaskOptions {
                tempo_bpm: form.tempo_bpm,
                key: form.key.as_ref(),
                meter: form.meter.as_ref(),
                language: form
                    .singing_language
                    .as_deref()
                    .filter(|_| !form.instrumental_mode),
            },
        )
    });
    let abc_for_req = abc_trimmed.clone();
    let gen_id_for_job = gen_id.clone();
    let gen_dir_for_job = gen_dir.clone();
    let project_id_for_job = id.clone();
    let job_kind_for_job = job_kind.to_string();
    let style_for_lego = style_sent.clone();
    let lego_instruction = lego_role.map(crate::ace_step_lego::lego_instruction);
    let abc_align =
        AbcAlignRequest::from_form(form.tempo_bpm, form.key.clone(), form.meter.clone());
    let result = queue
        .run_exclusive(
            Some(id.clone()),
            if use_lego {
                "Ajout de piste Lego"
            } else if stop_after_abc {
                "Génération partition seule"
            } else {
                "Génération en cours"
            },
            async move {
                let cancelled = || queue_ref.cancel_requested() || worker_cancelled.as_ref().is_some_and(|flag|flag.load(std::sync::atomic::Ordering::Acquire));
                if cancelled() { return Err("cancelled".into()); }
                // Startup and model residency belong inside the resource guard.
                // A queued interactive request must not start a server that a
                // batch worker subsequently shuts down to release GPU memory.
                let server_url = if use_lego {
                    server.shutdown();
                    crate::ace_step_lego::with_local_cancellation(
                        lego_sidecar,
                        crate::ace_step_lego::ensure_started(lego_sidecar, &PathBuf::from(&runtime_settings.cache_dir)),
                        &cancelled,
                    ).await?;
                    crate::ace_step_lego::base_url()
                } else {
                    lego_sidecar.shutdown();
                    server.ensure_started(&runtime_settings)?
                };
                if let Some(worker_id) = worker_id {
                    let mut request = request;
                    request["worker"] = json!({"id": worker_id, "baseUrl": server_url, "processId": server.process_id()});
                    atomic_write_json(&gen_dir_for_job.join("request.json"), &request)?;
                }
                atomic_write_json(&gen_dir_for_job.join("job.json"), &json!({
                    "id": gen_id_for_job,
                    "projectId": project_id_for_job,
                    "kind": job_kind_for_job,
                    "state": "running",
                    "updatedAt": now_iso(),
                }))?;
                queue_ref.set_state(
                    "generating",
                    if use_lego {
                        "Ajout de piste Lego (mix/stems)"
                    } else if stop_after_abc {
                        "Génération partition seule"
                    } else {
                        "Génération en cours"
                    },
                    Some(project_id_for_job.clone()),
                );
                if cancelled() { return Err("cancelled".into()); }
                if use_lego {
                    let started = now_iso();
                    let src = lego_source.ok_or_else(|| "source Lego manquante".to_string())?;
                    let instruction = lego_instruction
                        .unwrap_or_else(|| "Generate the instrument track.".into());
                    let lego_result = crate::ace_step_lego::with_local_cancellation(
                        lego_sidecar,
                        crate::ace_step_lego::run_lego(
                        &src,
                        &out_wav,
                        &style_for_lego,
                        &instruction,
                        seed,
                    ),
                        &cancelled,
                    ).await;
                    let finished = now_iso();
                    if cancelled() {
                        return Err("cancelled".into());
                    }
                    match lego_result {
                        Ok(_) => {
                            let (duration, audio_sha) =
                                crate::ace_step_lego::verify_written_wav(&out_wav)?;
                            let result = json!({
                                "schema": SCHEMA_GEN_RESULT,
                                "schemaVersion": SCHEMA_VERSION,
                                "id": gen_id_for_job,
                                "state": "generated",
                                "decode": "unsupported",
                                "startedAt": started,
                                "finishedAt": finished,
                                "outputKind": crate::ace_step_lego::OUTPUT_KIND,
                                "leftoverNotesFr": crate::ace_step_lego::leftover_notes_fr(),
                                "audio": {
                                    "path": "audio.wav",
                                    "sampleRate": SAMPLE_RATE,
                                    "channels": CHANNELS,
                                    "durationMs": duration,
                                    "sha256": audio_sha
                                },
                                "score": null,
                                "error": null
                            });
                            atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                            write_checksums(&gen_dir_for_job)?;
                            queue_ref.set_state(
                                "generated",
                                "Piste Lego générée (mix fusionné possible)",
                                Some(project_id_for_job.clone()),
                            );
                            return Ok(duration);
                        }
                        Err(e) => {
                            let result = json!({
                                "schema": SCHEMA_GEN_RESULT,
                                "schemaVersion": SCHEMA_VERSION,
                                "id": gen_id_for_job,
                                "state": "failed",
                                "decode": "unsupported",
                                "startedAt": started,
                                "finishedAt": finished,
                                "audio": null,
                                "score": null,
                                "error": e
                            });
                            atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                            return Err(e);
                        }
                    }
                }
                let mut options = json!({
                    "style": style_sent,
                    "cot": cot,
                    "num_inference_steps": NUM_INFERENCE_STEPS,
                    "guidance_scale": guidance_scale(&cot),
                    "semantic_min_tokens": semantic_min_tokens,
                    "semantic_max_tokens": semantic_max_tokens,
                    "export_semantic": !stop_after_abc
                });
                if stop_after_abc {
                    options
                        .as_object_mut()
                        .ok_or_else(|| "options invalides".to_string())?
                        .insert("stop_after".into(), json!("abc"));
                }
                if let Some(path) = semantic_prefix_path.as_ref() {
                    options.as_object_mut().ok_or_else(|| "options invalides".to_string())?
                        .insert("semantic_prefix_file".into(), json!(path.display().to_string()));
                }
                if let Some(abc_text) = &abc_for_req {
                    options
                        .as_object_mut()
                        .ok_or_else(|| "options invalides".to_string())?
                        .insert("abc".into(), json!(abc_text));
                }
                let body = if let Some(request) = ace_request_for_job {
                    json!({ "model": "ace_step", "request": request })
                } else {
                    json!({
                        "model": "yue2",
                        "request": {
                            "lyrics": lyrics_for_req,
                            "seed": seed,
                            "options": options
                        }
                    })
                };
                let started = now_iso();
                let api_result = AudioCppServer::run_task(&server_url, body).await;
                let finished = now_iso();
                if cancelled() {
                    let result = json!({
                        "schema": SCHEMA_GEN_RESULT,
                        "schemaVersion": SCHEMA_VERSION,
                        "id": gen_id_for_job,
                        "state": "cancelled",
                        "decode": "unsupported",
                        "startedAt": started,
                        "finishedAt": finished,
                        "audio": null,
                        "score": null,
                        "error": "cancel_requested"
                    });
                    atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                    return Err("cancelled".into());
                }
                match api_result {
                    Ok(response) => {
                        let semantic_truncated =
                            AudioCppServer::semantic_truncated(&response);
                        let semantic_path = gen_dir_for_job.join("semantic.json");
                        let has_semantic = AudioCppServer::write_semantic_artifact(&response, &semantic_path).unwrap_or(false);

                        if let Some(abc) = AudioCppServer::extract_score_abc(&response) {
                            // Align Q:/K:/M: on the form request (#106); notes unchanged.
                            let _ = write_aligned_score_abc(
                                &gen_dir_for_job.join("score.abc"),
                                &abc,
                                &abc_align,
                            );
                        } else if let Some(abc_text) = &abc_for_req {
                            // Conserve l'ABC envoyé si le modèle n'en renvoie pas.
                            let _ = write_aligned_score_abc(
                                &gen_dir_for_job.join("score.abc"),
                                abc_text,
                                &abc_align,
                            );
                        }

                        let score_path = gen_dir_for_job.join("score.abc");
                        if stop_after_abc {
                            if !score_path.is_file() {
                                let err = "Réponse score-only sans score.abc.".to_string();
                                let result = json!({
                                    "schema": SCHEMA_GEN_RESULT,
                                    "schemaVersion": SCHEMA_VERSION,
                                    "id": gen_id_for_job,
                                    "state": "failed",
                                    "decode": "unsupported",
                                    "startedAt": started,
                                    "finishedAt": finished,
                                    "audio": null,
                                    "score": null,
                                    "error": err
                                });
                                atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                                return Err(err);
                            }
                            let score = json!({
                                "path": "score.abc",
                                "sha256": sha256_file(&score_path)?
                            });
                            let result = json!({
                                "schema": SCHEMA_GEN_RESULT,
                                "schemaVersion": SCHEMA_VERSION,
                                "id": gen_id_for_job,
                                "state": "score_only",
                                "decode": "unsupported",
                                "startedAt": started,
                                "finishedAt": finished,
                                "audio": null,
                                "score": score,
                                "semanticTruncated": semantic_truncated,
                                "semanticPath": if has_semantic { Some("semantic.json") } else { None },
                                "error": null
                            });
                            atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                            write_checksums(&gen_dir_for_job)?;
                            queue_ref.set_state(
                                "score_only",
                                "Partition générée (sans audio)",
                                Some(project_id_for_job.clone()),
                            );
                            return Ok(0i64);
                        }

                        let wav_bytes = match AudioCppServer::extract_wav_bytes(&response) {
                            Ok(b) => b,
                            Err(e) => {
                                let result = json!({
                                    "schema": SCHEMA_GEN_RESULT,
                                    "schemaVersion": SCHEMA_VERSION,
                                    "id": gen_id_for_job,
                                    "state": "failed",
                                    "decode": "unsupported",
                                    "startedAt": started,
                                    "finishedAt": finished,
                                    "audio": null,
                                    "score": null,
                                    "error": e
                                });
                                atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                                return Err(e);
                            }
                        };
                        std::fs::write(&out_wav, &wav_bytes).map_err(|e| e.to_string())?;
                        if !out_wav.exists() {
                            let err = "WAV de génération absent après l'appel.".to_string();
                            let result = json!({
                                "schema": SCHEMA_GEN_RESULT,
                                "schemaVersion": SCHEMA_VERSION,
                                "id": gen_id_for_job,
                                "state": "failed",
                                "decode": "unsupported",
                                "startedAt": started,
                                "finishedAt": finished,
                                "audio": null,
                                "score": null,
                                "error": err
                            });
                            atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                            return Err(err);
                        }
                        if fixed_duration {
                            let generated_duration = wav_duration_ms(&out_wav)?;
                            if let Err(err) =
                                check_requested_duration(generated_duration, expected_duration_ms)
                            {
                                record_generation_failure(
                                    &gen_dir_for_job,
                                    &gen_id_for_job,
                                    &started,
                                    &err,
                                )?;
                                return Err(err);
                            }
                        }
                        let instrumental_processing = if let Some(plan) = instrumental_separator {
                            queue_ref.set_state("generating", "Retrait des voix pour le morceau instrumental", Some(project_id_for_job.clone()));
                            Some(remove_generated_vocals(server, &server_url, &runtime_settings, plan, &gen_dir_for_job).await?)
                        } else { None };
                        if cancelled() { return Err("cancelled".into()); }
                        let duration = wav_duration_ms(&out_wav)?;
                        if fixed_duration {
                            if let Err(err) = check_requested_duration(duration, expected_duration_ms)
                            {
                                record_generation_failure(
                                    &gen_dir_for_job,
                                    &gen_id_for_job,
                                    &started,
                                    &err,
                                )?;
                                return Err(err);
                            }
                        }
                        let audio_sha = sha256_file(&out_wav)?;
                        let score = if score_path.exists() {
                            json!({
                                "path": "score.abc",
                                "sha256": sha256_file(&score_path)?
                            })
                        } else {
                            json!({ "path": "score.abc", "sha256": null })
                        };
                        let result = json!({
                            "schema": SCHEMA_GEN_RESULT,
                            "schemaVersion": SCHEMA_VERSION,
                            "id": gen_id_for_job,
                            "state": "generated",
                            "decode": "unsupported",
                            "startedAt": started,
                            "finishedAt": now_iso(),
                            "audio": {
                                "path": "audio.wav",
                                "sampleRate": SAMPLE_RATE,
                                "channels": CHANNELS,
                                "durationMs": duration,
                                "sha256": audio_sha
                            },
                            "score": score,
                            "semanticTruncated": semantic_truncated,
                            "semanticPath": if has_semantic { Some("semantic.json") } else { None },
                            "instrumentalProcessing": instrumental_processing,
                            "durationCompliance": if fixed_duration {
                                Some(json!({
                                    "expectedMs": expected_duration_ms,
                                    "actualMs": duration,
                                    "toleranceMs": REQUESTED_DURATION_TOLERANCE_MS,
                                    "matches": true
                                }))
                            } else {
                                None
                            },
                            "error": null
                        });
                        atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                        write_checksums(&gen_dir_for_job)?;
                        queue_ref.set_state(
                            "generated",
                            "Génération terminée",
                            Some(project_id_for_job.clone()),
                        );
                        Ok(duration)
                    }
                    Err(e) => {
                        let result = json!({
                            "schema": SCHEMA_GEN_RESULT,
                            "schemaVersion": SCHEMA_VERSION,
                            "id": gen_id_for_job,
                            "state": "failed",
                            "decode": "unsupported",
                            "startedAt": started,
                            "finishedAt": finished,
                            "audio": null,
                            "score": null,
                            "error": e
                        });
                        atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                        Err(e)
                    }
                }
            },
        )
        .await;

    let duration = match result {
        Ok(duration) => {
            atomic_write_json(
                &gen_dir.join("job.json"),
                &json!({
                    "id": gen_id,
                    "projectId": id,
                    "kind": job_kind,
                    "state": "completed",
                    "updatedAt": now_iso(),
                }),
            )?;
            duration
        }
        Err(error) => {
            // Validation/postprocessing errors must never leave a successful
            // result that crash recovery or the take list could reactivate.
            record_failed_generation(&gen_dir, &gen_id, &id, job_kind, &error)?;
            return Err(error);
        }
    };
    if preserve_project {
        // Publish only the new generation. Import or explicit selection owns
        // changing the latest mix; edits made while generating remain intact.
        return Ok(InstrumentalPartResult {
            project: load_project(&folder)?,
            generation_id: gen_id,
        });
    }
    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
    doc = load_project(&folder)?;
    doc.active_generation_id = Some(gen_id.clone());
    doc.active_separation_id = None;
    doc.active_mix_id = None;
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    let mut row = library_row_from_project(&folder, &doc);
    if duration > 0 {
        row.duration_ms = Some(duration);
    }
    upsert_library_row(&row)?;
    Ok(InstrumentalPartResult {
        project: doc,
        generation_id: gen_id,
    })
}

fn record_failed_generation(
    gen_dir: &Path,
    generation_id: &str,
    project_id: &str,
    job_kind: &str,
    error: &str,
) -> Result<(), String> {
    let state = if error == "cancelled" {
        "cancelled"
    } else {
        "failed"
    };
    atomic_write_json(
        &gen_dir.join("result.json"),
        &json!({
            "schema": SCHEMA_GEN_RESULT,
            "schemaVersion": SCHEMA_VERSION,
            "id": generation_id,
            "state": state,
            "finishedAt": now_iso(),
            "audio": null,
            "score": null,
            "error": error,
            "unpublishedAudioPath": if gen_dir.join("audio.wav").exists() {
                Some("audio.wav")
            } else {
                None
            }
        }),
    )?;
    atomic_write_json(
        &gen_dir.join("job.json"),
        &json!({
            "id": generation_id,
            "projectId": project_id,
            "kind": job_kind,
            "state": state,
            "error": error,
            "updatedAt": now_iso(),
        }),
    )
}

/// Render audio from an existing generation's immutable `score.abc`.
/// Sets `parentGenerationId` to the source gen; never uses `stop_after`.
#[tauri::command]
pub async fn render_from_generation(
    state: tauri::State<'_, AppState>,
    id: String,
    source_gen_id: String,
    form: FormInput,
) -> Result<ProjectDoc, String> {
    let mut form = form;
    // Rendering from a score is a fresh audio take, not a semantic continuation.
    form.continuation_generation_id = None;
    start_generation(state, id, form, None, None, Some(source_gen_id), None, None).await
}

fn resolve_lora_slot_provenance(
    path_opt: &mut Option<String>,
    scale: f32,
    slot: &str,
    warnings: &mut Vec<String>,
) -> Option<serde_json::Value> {
    let raw = path_opt.clone()?;
    let path = PathBuf::from(&raw);
    if !path.is_file() {
        warnings.push(format!(
            "Adaptateur LoRA {slot} introuvable ({raw}) — ignoré pour cette génération. Chemin standard sans LoRA."
        ));
        *path_opt = None;
        return None;
    }
    let sha = match sha256_file(&path) {
        Ok(h) => h,
        Err(e) => {
            warnings.push(format!(
                "Adaptateur LoRA {slot} illisible ({raw}) : {e} — ignoré. Génération standard sans LoRA."
            ));
            *path_opt = None;
            return None;
        }
    };
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&raw)
        .to_string();
    // Prefer catalog pack id when path is under models/lora/<packId>/…
    let pack_id = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .filter(|id| !id.is_empty() && *id != "imported" && *id != "lora")
        .map(|s| s.to_string());
    Some(json!({
        "slot": slot,
        "path": path.display().to_string(),
        "filename": filename,
        "sha256": sha,
        "scale": scale,
        "packId": pack_id,
        "version": pack_id,
    }))
}

/// Resolve LoRA adapters actually sent to audio.cpp for this generation.
/// Missing/corrupt adapters are omitted (vanilla path) with a clear warning — never blocks gen.
fn resolve_lora_provenance_for_generation(
    settings: &mut AppSettings,
) -> (serde_json::Value, Vec<String>) {
    let mut warnings: Vec<String> = Vec::new();
    let mut adapters = serde_json::Map::new();

    if let Some(entry) = resolve_lora_slot_provenance(
        &mut settings.yue2_ar_lora,
        settings.yue2_ar_lora_scale,
        "ar",
        &mut warnings,
    ) {
        adapters.insert("ar".into(), entry);
    }
    if let Some(entry) = resolve_lora_slot_provenance(
        &mut settings.yue2_nar_lora,
        settings.yue2_nar_lora_scale,
        "nar",
        &mut warnings,
    ) {
        adapters.insert("nar".into(), entry);
    }

    let provenance = if adapters.is_empty() {
        json!(null)
    } else {
        json!({
            "adapters": adapters,
            "arScale": settings.yue2_ar_lora_scale,
            "narScale": settings.yue2_nar_lora_scale
        })
    };
    (provenance, warnings)
}

fn normalize_sha256_hex(raw: &str) -> Option<String> {
    let s = raw.trim().to_ascii_lowercase();
    if s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(s)
    } else {
        None
    }
}

fn verify_cache_file_sha256(path: &Path, expected: &str) -> Result<(), String> {
    let want = normalize_sha256_hex(expected)
        .ok_or_else(|| format!("Hash SHA-256 catalogue invalide (64 hex attendus) : {expected}"))?;
    let got = sha256_file(path)?;
    if got != want {
        let _ = std::fs::remove_file(path);
        return Err(format!(
            "Fichier LoRA corrompu ou hash incorrect pour {} (attendu {want}, obtenu {got}). Le fichier a été retiré. La génération standard sans LoRA reste disponible.",
            path.display()
        ));
    }
    Ok(())
}

/// Opt-in download into the user cache (LoRA packs). Requires CC BY-NC acceptance.
/// Never called by the first-build installer. Verifies SHA-256 when the catalog provides one.
#[tauri::command]
pub async fn download_cache_file(
    state: tauri::State<'_, AppState>,
    req: DownloadCacheFileRequest,
) -> Result<String, String> {
    let _resources = super::settings::guard_model_install(&state).await?;
    let settings = load_settings()?;
    if !settings.cc_by_nc_accepted {
        return Err("Accepter CC BY-NC 4.0 avant tout téléchargement optionnel de LoRA.".into());
    }
    let rel = req.relative_cache_path.replace('\\', "/");
    if !rel.starts_with("models/lora/") || rel.contains("..") {
        return Err("Chemin cache invalide (models/lora/… uniquement).".into());
    }
    if !(req.url.starts_with("https://huggingface.co/") || req.url.starts_with("https://hf.co/")) {
        return Err("URL refusée : hôte Hugging Face uniquement.".into());
    }

    let dest = PathBuf::from(&settings.cache_dir).join(&rel);
    if let Some(parent) = dest.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    if dest.is_file() {
        if let Some(ref expected) = req.expected_sha256 {
            verify_cache_file_sha256(&dest, expected)?;
        }
        return Ok(dest.display().to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&req.url)
        .send()
        .await
        .map_err(|e| format!("Téléchargement échoué : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Téléchargement HTTP {} pour {} — pack absent ou inaccessible. La génération standard sans LoRA reste disponible.",
            resp.status(),
            req.url
        ));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Lecture réponse : {e}"))?;
    let tmp = dest.with_extension("part");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    if let Some(ref expected) = req.expected_sha256 {
        verify_cache_file_sha256(&dest, expected)?;
    }
    Ok(dest.display().to_string())
}

#[tauri::command]
pub fn list_generations(id: String) -> Result<Vec<GenerationSummary>, String> {
    let folder = project_folder(&id).join("generations");
    if !folder.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(&folder)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let req_path = entry.path().join("request.json");
        let res_path = entry.path().join("result.json");
        if !req_path.exists() {
            continue;
        }
        let req: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(req_path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        let (state, has_score, semantic_truncated) = if res_path.exists() {
            let res: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(&res_path).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            let st = res
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let score = entry.path().join("score.abc").exists();
            (
                st,
                score,
                res.get("semanticTruncated").and_then(|v| v.as_bool()),
            )
        } else {
            let job_state = serde_json::from_slice::<serde_json::Value>(
                &std::fs::read(entry.path().join("job.json")).unwrap_or_default(),
            )
            .ok()
            .and_then(|j| j.get("state").and_then(|v| v.as_str()).map(str::to_string))
            .unwrap_or_else(|| "interrupted".into());
            (job_state, false, None)
        };
        let gen_id = req
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let audio = entry.path().join("audio.wav");
        let published_audio = state == "generated" && audio.is_file();
        let semantic_frames = std::fs::read(entry.path().join("semantic.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Vec<u32>>(&bytes).ok());
        out.push(GenerationSummary {
            id: gen_id,
            created_at: req
                .get("createdAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            seed: req.get("seed").and_then(|v| v.as_u64()).unwrap_or(0),
            cot: req.get("cot").and_then(|v| v.as_str()).unwrap_or("").into(),
            state,
            has_score,
            parent_generation_id: req
                .get("parentGenerationId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            audio_path: if published_audio {
                Some(audio.display().to_string())
            } else {
                None
            },
            semantic_truncated,
            can_continue: published_audio
                && semantic_truncated == Some(true)
                && semantic_frames.as_ref().is_some_and(|frames| {
                    !frames.is_empty() && frames.iter().all(|&frame| frame < 32768)
                }),
            engine_id: engine_id_from_generation_request(&req),
        });
    }
    Ok(out)
}

/// Artefacts résolus pour une continuation mid-song (`semantic_prefix_file`).
#[derive(Debug)]
pub(crate) struct ResolvedSemanticPrefix {
    pub semantic_path: PathBuf,
    pub frame_count: usize,
    pub token_ceiling: usize,
    /// Score ABC du parent, chargé si `cot != "off"` et qu'aucun ABC n'était fourni.
    pub parent_score_abc: Option<String>,
}

/// Gate desktop pour `continuationGenerationId` : exige `result.json` +
/// `semantic.json`, `semanticTruncated=true`, et un préfixe sous le plafond YuE2.
pub(crate) fn resolve_semantic_prefix_for_continuation(
    parent_dir: &Path,
    parent_id: &str,
    cot: &str,
    existing_abc: Option<&str>,
) -> Result<ResolvedSemanticPrefix, String> {
    let suffix = parent_id.strip_prefix("gen-").unwrap_or("");
    if suffix.is_empty() || !suffix.chars().all(|c| c.is_ascii_digit()) {
        return Err("Identifiant de génération parent invalide.".into());
    }
    let semantic = parent_dir.join("semantic.json");
    if !parent_dir.join("result.json").is_file() || !semantic.is_file() {
        return Err(
            "Cette génération n’a pas d’artefact sémantique utilisable pour continuer.".into(),
        );
    }
    let parent_result: serde_json::Value = serde_json::from_slice(
        &std::fs::read(parent_dir.join("result.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if parent_result
        .get("semanticTruncated")
        .and_then(|v| v.as_bool())
        != Some(true)
    {
        return Err("La continuation est réservée aux générations tronquées.".into());
    }

    let mut parent_score_abc = None;
    if cot != "off" {
        let mut abc = existing_abc.map(str::to_string).filter(|s| !s.is_empty());
        if abc.is_none() {
            let score_path = parent_dir.join("score.abc");
            if score_path.is_file() {
                abc = Some(std::fs::read_to_string(score_path).map_err(|e| e.to_string())?);
            }
        }
        if abc.is_none() {
            return Err(
                "Cette continuation en mode mélodie nécessite le score ABC de la prise source."
                    .into(),
            );
        }
        if existing_abc
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .is_none()
        {
            parent_score_abc = abc;
        }
    }

    let prefix: Vec<u32> =
        serde_json::from_slice(&std::fs::read(&semantic).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Tokens de continuation invalides : {e}"))?;
    let frame_count = prefix.len();
    let token_ceiling = (SEMANTIC_MAX_DURATION_SEC * SEMANTIC_HZ) as usize;
    if frame_count >= token_ceiling {
        return Err("Cette prise a déjà atteint la durée maximale prévue pour YuE2.".into());
    }
    Ok(ResolvedSemanticPrefix {
        semantic_path: semantic,
        frame_count,
        token_ceiling,
        parent_score_abc,
    })
}

#[cfg(test)]
mod continuation_tests {
    use super::*;
    use std::fs;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "song-maker-continuation-{label}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn engine_id_from_request_prefers_model_metadata() {
        let req = json!({
            "generationEngine": "yue2",
            "model": { "engineId": "ace_step_1_5" }
        });
        assert_eq!(engine_id_from_generation_request(&req), "ace_step_1_5");
        assert_eq!(
            engine_id_from_generation_request(&json!({"generationEngine": "ace_step"})),
            "ace_step_1_5"
        );
        assert_eq!(
            engine_id_from_generation_request(&json!({"generationEngine": "ace_step_lego"})),
            "ace_step_1_5_base_lego"
        );
        assert_eq!(
            resolve_generation_engine(Some("ace_step"), "yue2").unwrap(),
            "ace_step"
        );
        assert_eq!(
            resolve_generation_engine(Some("ace_step_lego"), "yue2").unwrap(),
            "ace_step_lego"
        );
        let lego_settings = resolve_generation_engine(None, "ace_step_lego").unwrap_err();
        assert!(lego_settings.contains("moteur global") || lego_settings.contains("Lego"));
        assert_eq!(resolve_generation_engine(None, "yue2").unwrap(), "yue2");
        let house = resolve_generation_engine(Some("house_model"), "yue2").unwrap_err();
        assert!(house.contains("modèle maison"));
        let house_settings = resolve_generation_engine(None, "house_model").unwrap_err();
        assert!(house_settings.contains("modèle maison"));
    }

    #[test]
    fn ace_step_task_request_uses_pinned_text2music_fields() {
        let request = ace_step_task_request(
            "warm pop rock",
            "[Instrumental]",
            1234,
            20,
            AceStepTaskOptions {
                tempo_bpm: Some(120),
                key: None,
                meter: None,
                language: None,
            },
        );
        assert_eq!(request["task_route"], "text2music");
        assert_eq!(request["duration_seconds"], 20);
        assert_eq!(request["num_inference_steps"], 8);
        assert_eq!(request["guidance_scale"], 1.0);
        assert_eq!(request["bpm"], 120);
        assert!(request.get("keyscale").is_none());
        assert_eq!(request["lyrics"], "[Instrumental]");
    }

    #[test]
    fn instrumental_lyrics_use_the_selected_engine_contract() {
        let draft = "[Verse]\nParoles conservées dans le projet";

        assert_eq!(
            generation_lyrics_for_engine(draft, true, "ace_step", false),
            ("[Instrumental]", true)
        );
        assert_eq!(
            generation_lyrics_for_engine(draft, true, "yue2", true),
            ("[instrumental]", true)
        );
        assert_eq!(
            generation_lyrics_for_engine(draft, true, "yue2", false),
            ("", false)
        );
        assert_eq!(
            generation_lyrics_for_engine(draft, false, "ace_step", false),
            (draft, false)
        );
    }

    fn write_parent_gen(
        root: &Path,
        truncated: bool,
        with_semantic: bool,
        with_score: bool,
        frames: &[u32],
    ) {
        let gen = root.join("generations").join("gen-001");
        fs::create_dir_all(&gen).unwrap();
        fs::write(
            gen.join("result.json"),
            serde_json::json!({
                "state": "complete",
                "semanticTruncated": truncated
            })
            .to_string(),
        )
        .unwrap();
        if with_semantic {
            fs::write(
                gen.join("semantic.json"),
                serde_json::to_string(frames).unwrap(),
            )
            .unwrap();
        }
        if with_score {
            fs::write(gen.join("score.abc"), "X:1\nK:C\nC").unwrap();
        }
    }

    #[test]
    fn accepts_truncated_generation_with_semantic_json() {
        let root = temp_dir("ok");
        write_parent_gen(&root, true, true, true, &[1, 2, 3, 4]);
        let parent = root.join("generations").join("gen-001");
        let resolved =
            resolve_semantic_prefix_for_continuation(&parent, "gen-001", "full", None).unwrap();
        assert_eq!(resolved.frame_count, 4);
        assert_eq!(resolved.semantic_path, parent.join("semantic.json"));
        assert!(resolved.parent_score_abc.is_some());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refuses_when_semantic_json_missing() {
        let root = temp_dir("missing-semantic");
        write_parent_gen(&root, true, false, true, &[]);
        let parent = root.join("generations").join("gen-001");
        let err =
            resolve_semantic_prefix_for_continuation(&parent, "gen-001", "full", None).unwrap_err();
        assert!(err.contains("artefact sémantique"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refuses_when_source_generation_is_not_truncated() {
        let root = temp_dir("not-truncated");
        write_parent_gen(&root, false, true, true, &[10, 20]);
        let parent = root.join("generations").join("gen-001");
        let err = resolve_semantic_prefix_for_continuation(&parent, "gen-001", "melody", None)
            .unwrap_err();
        assert!(err.contains("tronquées"));
        let _ = fs::remove_dir_all(root);
    }
}

#[cfg(test)]
mod instrumental_failure_tests {
    use super::{record_failed_generation, run_generation, GenerationWorker};
    use crate::audiocpp::AudioCppServer;
    use crate::commands::AppState;
    use crate::library::{default_settings, project_folder, save_project};
    use crate::models::{FormInput, ProjectDoc};
    use crate::pins::{BIT_DEPTH, CHANNELS, SAMPLE_RATE, SCHEMA_PROJECT, SCHEMA_VERSION};
    use crate::test_docs_env::guard::TempDocs;
    use serde_json::json;
    use std::fs;
    use std::sync::Arc;

    #[test]
    fn postprocessing_failure_keeps_partial_audio_unpublished_and_preserves_project() {
        let docs = TempDocs::new("instrumental-postprocessing-failure");
        let project_id = "instrumental-postprocessing-preserves-project";
        let folder = project_folder(project_id);
        fs::create_dir_all(&folder).unwrap();
        let project: ProjectDoc = serde_json::from_value(json!({
            "schema": SCHEMA_PROJECT,
            "schemaVersion": SCHEMA_VERSION,
            "id": project_id,
            "title": "Projet source intact",
            "createdAt": "2026-10-06T00:00:00Z",
            "updatedAt": "2026-10-06T00:00:00Z",
            "sampleRate": SAMPLE_RATE,
            "channels": CHANNELS,
            "bitDepth": BIT_DEPTH,
            "style": "Style source",
            "lyrics": "Paroles conservées",
            "cot": "full",
            "targetDurationSec": 30,
            "preferFullLyrics": true,
            "instrumentalMode": false,
            "activeGenerationId": "gen-001",
            "activeSeparationId": "sep-001",
            "activeMixId": "mix-v001"
        }))
        .unwrap();
        save_project(&folder, &project).unwrap();
        let project_before = fs::read(folder.join("project.json")).unwrap();

        let separation_marker = b"existing stems stay available";
        let mix_marker = b"existing mix stays available";
        let separation_file = folder.join("separations/sep-001/stems.marker");
        let mix_file = folder.join("mixes/mix-v001/mix.marker");
        fs::create_dir_all(separation_file.parent().unwrap()).unwrap();
        fs::create_dir_all(mix_file.parent().unwrap()).unwrap();
        fs::write(&separation_file, separation_marker).unwrap();
        fs::write(&mix_file, mix_marker).unwrap();

        let generation_id = "gen-002";
        let gen_dir = folder.join("generations").join(generation_id);
        fs::create_dir_all(&gen_dir).unwrap();
        fs::write(
            gen_dir.join("audio.wav"),
            b"generated before postprocessing failed",
        )
        .unwrap();
        fs::write(
            gen_dir.join("result.json"),
            br#"{"state":"generated","audio":{"path":"audio.wav"}}"#,
        )
        .unwrap();
        fs::write(
            gen_dir.join("job.json"),
            br#"{"state":"running","kind":"lego_add_track"}"#,
        )
        .unwrap();

        record_failed_generation(
            &gen_dir,
            generation_id,
            project_id,
            "lego_add_track",
            "échec simulé pendant le post-traitement",
        )
        .unwrap();

        let failed_result: serde_json::Value =
            serde_json::from_slice(&fs::read(gen_dir.join("result.json")).unwrap()).unwrap();
        let failed_job: serde_json::Value =
            serde_json::from_slice(&fs::read(gen_dir.join("job.json")).unwrap()).unwrap();
        assert_eq!(failed_result["state"], "failed");
        assert!(failed_result["audio"].is_null());
        assert_eq!(failed_result["unpublishedAudioPath"], "audio.wav");
        assert_eq!(failed_job["state"], "failed");
        assert_eq!(failed_job["kind"], "lego_add_track");
        assert_eq!(
            fs::read(folder.join("project.json")).unwrap(),
            project_before
        );
        assert_eq!(fs::read(separation_file).unwrap(), separation_marker);
        assert_eq!(fs::read(mix_file).unwrap(), mix_marker);
        assert!(gen_dir.join("audio.wav").is_file());

        drop(docs);
    }

    #[tokio::test]
    async fn missing_vocal_separator_fails_without_touching_the_project() {
        let docs = TempDocs::new("instrumental-part-preflight-failure");
        let mut settings = default_settings();
        settings.cache_dir = docs
            .root
            .join("cache-without-audio-models")
            .display()
            .to_string();
        let project_id = "instrumental-failure-preserves-project";
        let folder = project_folder(project_id);
        fs::create_dir_all(&folder).unwrap();
        let project: ProjectDoc = serde_json::from_value(json!({
            "schema": SCHEMA_PROJECT,
            "schemaVersion": SCHEMA_VERSION,
            "id": project_id,
            "title": "Projet source intact",
            "createdAt": "2026-10-06T00:00:00Z",
            "updatedAt": "2026-10-06T00:00:00Z",
            "sampleRate": SAMPLE_RATE,
            "channels": CHANNELS,
            "bitDepth": BIT_DEPTH,
            "style": "Style source",
            "lyrics": "Paroles conservées",
            "cot": "full",
            "targetDurationSec": 30,
            "preferFullLyrics": true,
            "instrumentalMode": false,
            "activeGenerationId": "gen-001",
            "activeSeparationId": "sep-001",
            "activeMixId": "mix-v001"
        }))
        .unwrap();
        save_project(&folder, &project).unwrap();
        let project_before = fs::read(folder.join("project.json")).unwrap();

        let form = FormInput {
            title: "Tentative de partie instrumentale".into(),
            style: "Piano instrumental doux".into(),
            lyrics: String::new(),
            cot: "off".into(),
            singing_language: None,
            tempo_bpm: None,
            key: None,
            meter: None,
            seed: Some(1234),
            target_duration_sec: 30,
            prefer_full_lyrics: false,
            instrumental_mode: true,
            continuation_generation_id: None,
            audio_input_path: None,
            inpaint_start_ms: None,
            inpaint_end_ms: None,
        };
        let state = AppState::default();
        let worker = GenerationWorker {
            server: Arc::new(AudioCppServer::default()),
            queue: crate::queue::JobQueue::default(),
            settings,
            id: "preflight-failure-test".into(),
            cancelled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };
        let result = run_generation(
            &state,
            project_id.into(),
            form,
            None,
            None,
            None,
            Some("yue2".into()),
            Some("bass".into()),
            true,
            Some(&worker),
        )
        .await;
        let error = match result {
            Err(error) => error,
            Ok(_) => panic!("la génération aurait dû échouer sans le séparateur"),
        };

        assert!(error.contains("installez les composants audio"), "{error}");
        assert_eq!(
            fs::read(folder.join("project.json")).unwrap(),
            project_before
        );
        assert!(!folder.join("generations").exists());
    }
}
