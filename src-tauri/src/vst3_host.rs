//! Hôte VST3 hors ligne pour le bus master (#326).
//!
//! Le VST est chargé dans un processus enfant, lancé par la même application. Un plugin qui
//! plante ou se bloque ne peut donc pas faire tomber la fenêtre Tauri. La première tranche est
//! Windows/VST3 et ne revendique ni lecture temps réel, ni éditeur natif, ni AU.

use crate::vst3_spike::Vst3CatalogEntry;
#[cfg(windows)]
use crate::vst3_spike::{default_scan_roots, scan_roots};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[cfg(windows)]
use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::time::{Duration, Instant};

#[cfg(windows)]
const SAMPLE_BLOCK: usize = 512;
#[cfg(windows)]
const MAX_PCM_BYTES: usize = 512 * 1024 * 1024;
#[cfg(windows)]
const WORKER_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vst3ParameterInfo {
    pub id: u32,
    pub name: String,
    pub value: f64,
    pub default_value: f64,
    pub unit: String,
    pub step_count: i32,
    pub can_automate: bool,
    pub read_only: bool,
    pub bypass: bool,
    pub formatted_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vst3PluginDescription {
    pub path: String,
    pub name: String,
    pub vendor: String,
    pub version: String,
    pub category: String,
    pub audio_inputs: u32,
    pub audio_outputs: u32,
    pub parameters: Vec<Vst3ParameterInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vst3ProcessedPcm {
    /// Little-endian interleaved float32 stereo samples.
    pub pcm_le: Vec<u8>,
    /// Additional gain reduction used to keep the plugin output under the mix ceiling.
    pub peak_trim_db: f32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg(windows)]
struct WorkerRequest {
    operation: String,
    plugin_path: String,
    #[serde(default)]
    parameters: BTreeMap<u32, f64>,
    #[serde(default)]
    sample_rate: u32,
    #[serde(default)]
    peak_ceiling_db: f32,
    input_path: Option<String>,
    output_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerResponse {
    ok: bool,
    error: Option<String>,
    plugin: Option<Vst3PluginDescription>,
    peak_trim_db: Option<f32>,
}

#[cfg(windows)]
struct WorkerExecution {
    response: WorkerResponse,
    output_pcm: Option<Vec<u8>>,
}

fn error_response(error: impl Into<String>) -> WorkerResponse {
    WorkerResponse {
        ok: false,
        error: Some(error.into()),
        plugin: None,
        peak_trim_db: None,
    }
}

#[cfg(windows)]
fn plugin_path_in_scan_roots(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path.trim());
    if !path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("vst3"))
    {
        return Err("Choisissez un dossier de plugin .vst3 affiché par le scan.".into());
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Dossier VST3 inaccessible : {e}"))?;
    if !canonical.is_dir() {
        return Err("Le bundle VST3 sélectionné n’est pas un dossier.".into());
    }
    let allowed = default_scan_roots().into_iter().any(|root| {
        root.canonicalize()
            .ok()
            .is_some_and(|root| canonical.starts_with(root))
    });
    if !allowed {
        return Err("Le plugin doit se trouver dans un dossier VST3 scanné.".into());
    }
    Ok(canonical)
}

#[tauri::command]
pub fn vst3_list_plugins() -> Result<Vec<Vst3CatalogEntry>, String> {
    #[cfg(not(windows))]
    {
        Err("L’hôte VST3 est actuellement disponible dans la version Windows.".into())
    }

    #[cfg(windows)]
    {
        let mut plugins = scan_roots(&default_scan_roots());
        plugins.retain(|plugin| plugin.binary_path.is_some());
        plugins.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        plugins.dedup_by(|a, b| a.path.eq_ignore_ascii_case(&b.path));
        Ok(plugins)
    }
}

#[tauri::command]
pub fn vst3_plugin_parameters(
    path: String,
    parameters: BTreeMap<u32, f64>,
) -> Result<Vst3PluginDescription, String> {
    #[cfg(not(windows))]
    {
        let _ = (path, parameters);
        Err("L’hôte VST3 est actuellement disponible dans la version Windows.".into())
    }

    #[cfg(windows)]
    {
        if parameters.len() > 512
            || parameters
                .values()
                .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
        {
            return Err("Réglages VST3 invalides.".into());
        }
        let path = plugin_path_in_scan_roots(&path)?;
        let response = run_worker(
            WorkerRequest {
                operation: "inspect".into(),
                plugin_path: path.display().to_string(),
                parameters,
                sample_rate: 48_000,
                peak_ceiling_db: -1.0,
                input_path: None,
                output_path: None,
            },
            None,
        )?;
        response
            .response
            .plugin
            .ok_or_else(|| "Le plugin n’a fourni aucune information exploitable.".into())
    }
}

#[tauri::command]
pub fn vst3_process_pcm(
    path: String,
    parameters: BTreeMap<u32, f64>,
    sample_rate: u32,
    peak_ceiling_db: f32,
    pcm_le: Vec<u8>,
) -> Result<Vst3ProcessedPcm, String> {
    #[cfg(not(windows))]
    {
        let _ = (path, parameters, sample_rate, peak_ceiling_db, pcm_le);
        Err("L’hôte VST3 est actuellement disponible dans la version Windows.".into())
    }

    #[cfg(windows)]
    {
        let path = plugin_path_in_scan_roots(&path)?;
        if !(8_000..=192_000).contains(&sample_rate) {
            return Err("Fréquence d’échantillonnage non prise en charge.".into());
        }
        if pcm_le.is_empty() || pcm_le.len() > MAX_PCM_BYTES || !pcm_le.len().is_multiple_of(8) {
            return Err("Audio stéréo invalide ou trop volumineux pour le rendu VST3.".into());
        }
        if parameters.len() > 512
            || parameters
                .values()
                .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
        {
            return Err("Réglages VST3 invalides.".into());
        }
        let response = run_worker(
            WorkerRequest {
                operation: "process".into(),
                plugin_path: path.display().to_string(),
                parameters,
                sample_rate,
                peak_ceiling_db: peak_ceiling_db.clamp(-24.0, 0.0),
                input_path: Some("input.pcm".into()),
                output_path: Some("output.pcm".into()),
            },
            Some(&pcm_le),
        )?;
        let pcm_le = response
            .output_pcm
            .ok_or_else(|| "Le rendu VST3 n’a pas produit de résultat.".to_string())?;
        Ok(Vst3ProcessedPcm {
            pcm_le,
            peak_trim_db: response.response.peak_trim_db.unwrap_or(0.0),
        })
    }
}

#[cfg(windows)]
fn run_worker(request: WorkerRequest, input: Option<&[u8]>) -> Result<WorkerExecution, String> {
    let temp_root = std::env::temp_dir();
    let work_dir = temp_root.join(format!("song-maker-vst3-{}", uuid::Uuid::new_v4()));
    if !work_dir.starts_with(&temp_root) {
        return Err("Dossier temporaire VST3 invalide.".into());
    }
    std::fs::create_dir(&work_dir).map_err(|e| format!("Dossier temporaire VST3 : {e}"))?;
    let result = run_worker_in_dir(request, input, &work_dir);
    let _ = std::fs::remove_dir_all(&work_dir);
    result
}

#[cfg(windows)]
fn run_worker_in_dir(
    mut request: WorkerRequest,
    input: Option<&[u8]>,
    work_dir: &Path,
) -> Result<WorkerExecution, String> {
    if let Some(input) = input {
        let input_path = work_dir.join("input.pcm");
        std::fs::write(&input_path, input).map_err(|e| format!("Préparation de l’audio : {e}"))?;
        request.input_path = Some(input_path.display().to_string());
        request.output_path = Some(work_dir.join("output.pcm").display().to_string());
    }
    let request_path = work_dir.join("request.json");
    let response_path = work_dir.join("response.json");
    let request_bytes = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
    std::fs::write(&request_path, request_bytes).map_err(|e| e.to_string())?;

    let exe =
        std::env::current_exe().map_err(|e| format!("Exécutable Song Maker introuvable : {e}"))?;
    let mut command = Command::new(exe);
    command
        .arg("--vst3-host-worker")
        .arg(&request_path)
        .arg(&response_path)
        .current_dir(work_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Impossible de démarrer l’hôte VST3 isolé : {e}"))?;
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if started.elapsed() >= WORKER_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err(
                "Le plugin VST3 a dépassé le délai de rendu; Song Maker est resté actif.".into(),
            );
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let response_bytes = std::fs::read(&response_path).map_err(|_| {
        format!(
            "Le processus VST3 isolé s’est arrêté sans résultat (code {}). Song Maker est resté actif.",
            status.code().map_or_else(|| "inconnu".into(), |c| c.to_string())
        )
    })?;
    let mut response: WorkerResponse = serde_json::from_slice(&response_bytes)
        .map_err(|e| format!("Réponse de l’hôte VST3 invalide : {e}"))?;
    if !response.ok {
        return Err(response
            .error
            .take()
            .unwrap_or_else(|| "Échec du plugin VST3.".into()));
    }
    let output_pcm = input
        .map(|_| {
            std::fs::read(work_dir.join("output.pcm"))
                .map_err(|e| format!("Audio VST3 manquant : {e}"))
        })
        .transpose()?;
    Ok(WorkerExecution {
        response,
        output_pcm,
    })
}

/// Entry point called by `main` before the Tauri window is created.
pub fn worker_exit(request_path: &str, response_path: &str) -> i32 {
    #[cfg(not(windows))]
    {
        let _ = request_path;
        let response = error_response("L’hôte VST3 est uniquement compilé pour Windows.");
        let _ = std::fs::write(
            response_path,
            serde_json::to_vec(&response).unwrap_or_default(),
        );
        2
    }

    #[cfg(windows)]
    {
        let result = std::fs::read(request_path)
            .map_err(|e| format!("Lecture de la requête VST3 impossible : {e}"))
            .and_then(|bytes| {
                serde_json::from_slice::<WorkerRequest>(&bytes).map_err(|e| e.to_string())
            })
            .and_then(run_worker_request);
        let response = match result {
            Ok(response) => response,
            Err(error) => error_response(error),
        };
        if let Err(error) = std::fs::write(
            response_path,
            serde_json::to_vec(&response).unwrap_or_default(),
        ) {
            eprintln!("Réponse VST3 impossible : {error}");
            return 2;
        }
        if response.ok {
            0
        } else {
            1
        }
    }
}

#[cfg(windows)]
fn run_worker_request(request: WorkerRequest) -> Result<WorkerResponse, String> {
    let mut plugin = vst3_host::simple::load_plugin_with_settings(
        &request.plugin_path,
        f64::from(request.sample_rate.max(8_000)),
        SAMPLE_BLOCK,
    )
    .map_err(|e| format!("Chargement du plugin impossible : {e}"))?;
    let info = plugin.info().clone();
    if info.audio_inputs == 0
        || info.audio_outputs == 0
        || info.category.to_lowercase().contains("instrument")
    {
        return Err(
            "Ce premier hôte accepte les effets audio stéréo, pas les instruments VST3.".into(),
        );
    }

    let mut parameters = plugin
        .get_parameters()
        .map_err(|e| format!("Lecture des réglages du plugin impossible : {e}"))?
        .into_iter()
        .map(|p| {
            let value = request.parameters.get(&p.id).copied().unwrap_or(p.value);
            Vst3ParameterInfo {
                id: p.id,
                name: p.name,
                value,
                default_value: p.default,
                unit: p.unit,
                step_count: p.step_count,
                can_automate: p.can_automate,
                read_only: p.is_read_only,
                bypass: p.is_bypass,
                formatted_value: plugin
                    .format_parameter(p.id, value)
                    .unwrap_or_else(|_| format!("{value:.3}")),
            }
        })
        .collect::<Vec<_>>();
    if request.operation == "inspect" {
        return Ok(WorkerResponse {
            ok: true,
            error: None,
            plugin: Some(Vst3PluginDescription {
                path: info.path.display().to_string(),
                name: info.name,
                vendor: info.vendor,
                version: info.version,
                category: info.category,
                audio_inputs: info.audio_inputs,
                audio_outputs: info.audio_outputs,
                parameters,
            }),
            peak_trim_db: None,
        });
    }
    if request.operation != "process" {
        return Err("Opération VST3 inconnue.".into());
    }
    let input_path = request
        .input_path
        .as_deref()
        .ok_or("Audio source manquant.")?;
    let output_path = request
        .output_path
        .as_deref()
        .ok_or("Audio de sortie manquant.")?;
    let input = std::fs::read(input_path).map_err(|e| format!("Lecture audio impossible : {e}"))?;
    if input.is_empty() || !input.len().is_multiple_of(8) {
        return Err("Audio stéréo source invalide.".into());
    }
    let frame_count = input.len() / 8;
    if frame_count.saturating_mul(8) > MAX_PCM_BYTES {
        return Err("Audio trop long pour le rendu VST3.".into());
    }
    for (id, value) in &request.parameters {
        if !value.is_finite() || !(0.0..=1.0).contains(value) {
            return Err(format!("Valeur de paramètre invalide pour {id}."));
        }
        plugin
            .set_parameter(*id, *value)
            .map_err(|e| format!("Réglage VST3 impossible : {e}"))?;
    }
    plugin
        .start_processing()
        .map_err(|e| format!("Démarrage du traitement VST3 impossible : {e}"))?;
    let process_result = process_blocks(
        &mut plugin,
        &input,
        frame_count,
        request.sample_rate.max(8_000),
    );
    let _ = plugin.stop_processing();
    let mut output = process_result?;

    let ceiling = 10.0f32.powf(request.peak_ceiling_db.clamp(-24.0, 0.0) / 20.0);
    let peak = output
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]).abs())
        .fold(0.0f32, f32::max);
    let peak_trim_db = if peak > ceiling && peak > 0.0 {
        let trim = ceiling / peak;
        for bytes in output.chunks_exact_mut(4) {
            let sample = f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) * trim;
            bytes.copy_from_slice(&sample.to_le_bytes());
        }
        20.0 * trim.log10()
    } else {
        0.0
    };
    std::fs::write(output_path, output)
        .map_err(|e| format!("Écriture du rendu VST3 impossible : {e}"))?;
    parameters.clear();
    Ok(WorkerResponse {
        ok: true,
        error: None,
        plugin: None,
        peak_trim_db: Some(peak_trim_db),
    })
}

#[cfg(windows)]
fn process_blocks(
    plugin: &mut vst3_host::Plugin,
    input: &[u8],
    frame_count: usize,
    sample_rate: u32,
) -> Result<Vec<u8>, String> {
    let mut audio = vst3_host::audio::AudioBuffers::new(2, 2, SAMPLE_BLOCK, f64::from(sample_rate));
    let mut output = vec![0u8; input.len()];
    let mut frame_offset = 0usize;
    while frame_offset < frame_count {
        let frames = (frame_count - frame_offset).min(SAMPLE_BLOCK);
        audio.clear();
        for i in 0..frames {
            let base = (frame_offset + i) * 8;
            audio.inputs[0][i] = f32::from_le_bytes(input[base..base + 4].try_into().unwrap());
            audio.inputs[1][i] = f32::from_le_bytes(input[base + 4..base + 8].try_into().unwrap());
        }
        plugin
            .process_audio(&mut audio)
            .map_err(|e| format!("Plugin VST3 en erreur : {e}"))?;
        for i in 0..frames {
            let base = (frame_offset + i) * 8;
            let left = audio.outputs[0][i];
            let right = audio.outputs[1][i];
            if !left.is_finite() || !right.is_finite() {
                return Err("Le plugin VST3 a produit un échantillon invalide.".into());
            }
            output[base..base + 4].copy_from_slice(&left.to_le_bytes());
            output[base + 4..base + 8].copy_from_slice(&right.to_le_bytes());
        }
        frame_offset += frames;
    }
    Ok(output)
}
