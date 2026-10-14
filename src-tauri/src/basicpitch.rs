//! BasicPitch ONNX audio → MIDI (product path, issue #346). Apache-2.0 weights.

use crate::library::{load_project, load_settings, project_folder};
use crate::models::MixDoc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

static RUNTIME_PREPARATION: Mutex<()> = Mutex::new(());

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BasicPitchResult {
    pub midi_bytes: Vec<u8>,
    pub note_count: usize,
    pub backend: String,
    pub tensorflow_installed: bool,
    pub model: String,
    pub preview_id: String,
    pub source_audio_path: String,
    pub notes: Vec<DetectedNote>,
    pub tempo_bpm: u32,
    pub tempo_map: Vec<crate::models::MixTempoEvent>,
    pub time_signatures: Vec<crate::models::MixMeterEvent>,
    pub options: ExtractionOptions,
    pub duration_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedNote {
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub pitch: u8,
    pub velocity: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionOptions {
    pub mode: String,
    pub sensitivity: String,
    pub minimum_pitch: u8,
    pub maximum_pitch: u8,
    pub minimum_note_ms: f64,
    #[serde(default)]
    pub clip_id: Option<String>,
}

impl ExtractionOptions {
    fn for_role(role: &str) -> Self {
        let (mode, low, high) = match role {
            "vocal" | "vocals" | "voix" => ("voice", 36, 96),
            "bass" | "basse" => ("bass", 23, 72),
            _ => ("polyphonic", 21, 108),
        };
        Self {
            mode: mode.into(),
            sensitivity: "balanced".into(),
            minimum_pitch: low,
            maximum_pitch: high,
            minimum_note_ms: 127.7,
            clip_id: None,
        }
    }

    fn validate(&self) -> Result<(), String> {
        if !["voice", "bass", "polyphonic"].contains(&self.mode.as_str())
            || !["conservative", "balanced", "detailed"].contains(&self.sensitivity.as_str())
            || self.minimum_pitch < 21
            || self.maximum_pitch > 108
            || self.minimum_pitch >= self.maximum_pitch
            || !self.minimum_note_ms.is_finite()
            || !(30.0..=1000.0).contains(&self.minimum_note_ms)
        {
            return Err("Les réglages de détection de notes sont invalides.".into());
        }
        Ok(())
    }
}

pub fn discard_preview(project_id: &str, preview_id: &str) -> Result<(), String> {
    let uuid = uuid::Uuid::parse_str(preview_id)
        .map_err(|_| "Identifiant d’aperçu invalide.".to_string())?;
    let root = project_folder(project_id).join("transcriptions");
    // Only exact app-owned UUID filenames, never a caller-provided file path.
    for extension in ["json", "mid", "wav"] {
        let path = root.join(format!("detection-{uuid}.{extension}"));
        if path.exists() {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn python_cmd() -> Result<(PathBuf, Vec<String>), String> {
    if let Some(configured) = std::env::var_os("SONG_MAKER_PYTHON") {
        let path = PathBuf::from(configured);
        if path.is_file() {
            return Ok((path, Vec::new()));
        }
        return Err(format!(
            "SONG_MAKER_PYTHON pointe vers un fichier absent : {}",
            path.display()
        ));
    }
    let candidates = vec![
        (PathBuf::from("python3"), Vec::<String>::new()),
        (PathBuf::from("python"), Vec::new()),
        (PathBuf::from("py"), vec!["-3".into()]),
    ];
    #[cfg(target_os = "windows")]
    let candidates = {
        let mut candidates = candidates;
        if let Some(home) = dirs::home_dir() {
            for folder in ["anaconda3", "miniconda3"] {
                candidates.push((home.join(folder).join("python.exe"), Vec::new()));
            }
            if let Ok(entries) = std::fs::read_dir(home.join("AppData/Local/Programs/Python")) {
                candidates.extend(
                    entries
                        .flatten()
                        .map(|entry| (entry.path().join("python.exe"), Vec::new())),
                );
            }
        }
        candidates
    };
    for (program, prefix) in candidates {
        let mut command = Command::new(&program);
        crate::process_utils::configure_no_window(&mut command);
        if command
            .args(&prefix)
            .arg("-c")
            .arg("import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Ok((program, prefix));
        }
    }
    Err("Python 3.10+ requis pour BasicPitch ONNX. Installez Python ou définissez SONG_MAKER_PYTHON.".into())
}

const TRANSCRIBE_SCRIPT: &str = include_str!("../../scripts/basicpitch-product/transcribe.py");
const PREPARE_SCRIPT: &str = include_str!("../../scripts/basicpitch-product/prepare.py");
const RUNTIME_REQUIREMENTS: &str =
    include_str!("../../scripts/basicpitch-product/requirements.txt");

fn runtime_python(root: &Path) -> PathBuf {
    root.join(if cfg!(target_os = "windows") {
        "Scripts/python.exe"
    } else {
        "bin/python"
    })
}

fn ensure_runtime(cache: &Path) -> Result<PathBuf, String> {
    let _guard = RUNTIME_PREPARATION
        .lock()
        .map_err(|_| "Préparation BasicPitch interrompue.".to_string())?;
    let root = cache.join("tools").join("basicpitch-onnx-v1");
    let python = runtime_python(&root);
    if python.is_file() {
        let mut check = Command::new(&python);
        crate::process_utils::configure_no_window(&mut check);
        if check
            .args(["-I", "-c", PREPARE_SCRIPT, "--check"])
            .arg(&root)
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
        {
            return Ok(python);
        }
    }
    let (bootstrap, prefix) = python_cmd()?;
    let mut install = Command::new(&bootstrap);
    crate::process_utils::configure_no_window(&mut install);
    let output = install
        .args(prefix)
        .args(["-I", "-c", PREPARE_SCRIPT])
        .arg(&root)
        .arg(RUNTIME_REQUIREMENTS)
        .output()
        .map_err(|error| format!("Préparation de la détection de notes : {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let details = serde_json::from_str::<serde_json::Value>(stderr.trim()).ok()
            .and_then(|value| value.get("error").and_then(|message| message.as_str()).map(str::to_owned))
            .unwrap_or_else(|| "La préparation de la détection de notes a échoué. Vérifiez la connexion Internet puis réessayez.".into());
        return Err(format!(
            "{details} Journal : {}",
            root.join("installation.log").display()
        ));
    }
    if !python.is_file() {
        return Err("Le moteur de détection de notes n’a pas été installé correctement.".into());
    }
    Ok(python)
}

pub fn transcribe_track(
    project_id: &str,
    track_id: &str,
    options: Option<ExtractionOptions>,
    mix_snapshot: Option<MixDoc>,
) -> Result<BasicPitchResult, String> {
    let folder = project_folder(project_id);
    let project = load_project(&folder)?;
    let mix_id = project
        .active_mix_id
        .ok_or_else(|| "Aucun mix à transcrire.".to_string())?;
    let text = std::fs::read_to_string(folder.join("mixes").join(format!("{mix_id}.json")))
        .map_err(|e| e.to_string())?;
    let saved_mix: MixDoc = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let mix = mix_snapshot.unwrap_or(saved_mix);
    if mix.id != mix_id {
        return Err("Le mix actif a changé. Rouvrez la détection de notes.".into());
    }
    let track = mix
        .tracks
        .iter()
        .find(|t| t.id == track_id)
        .ok_or_else(|| "Piste introuvable.".to_string())?;
    let options = options.unwrap_or_else(|| ExtractionOptions::for_role(&track.role));
    options.validate()?;
    let tempo_bpm = mix
        .tempo_map
        .iter()
        .find(|event| event.start_ms == 0)
        .map(|event| event.quarter_bpm)
        .or(project.tempo_bpm)
        .unwrap_or(120)
        .max(1);
    let mut clips = Vec::new();
    for clip in &track.clips {
        if !clip.take_active
            || clip.source_path.is_empty()
            || clip.duration_ms <= 0
            || options.clip_id.as_ref().is_some_and(|id| id != &clip.id)
        {
            continue;
        }
        let audio = if Path::new(&clip.source_path).is_absolute() {
            PathBuf::from(&clip.source_path)
        } else {
            folder.join(&clip.source_path)
        };
        if !audio.is_file() {
            return Err(format!("Fichier audio absent : {}", audio.display()));
        }
        if clip.start_ms < 0
            || clip.offset_ms < 0
            || !clip.gain_db.is_finite()
            || !clip.time_stretch_ratio.is_finite()
            || !clip.pitch_semitones.is_finite()
        {
            return Err("Ce clip contient un réglage audio invalide.".into());
        }
        let ratio = if !clip.processing_enabled {
            1.0
        } else if clip.follow_project_tempo {
            clip.source_tempo_bpm
                .filter(|bpm| bpm.is_finite() && *bpm > 0.0)
                .map(|bpm| bpm / tempo_bpm as f32)
                .unwrap_or(clip.time_stretch_ratio)
        } else {
            clip.time_stretch_ratio
        }
        .clamp(0.25, 4.0);
        clips.push(serde_json::json!({
            "audioPath": audio, "startMs": clip.start_ms, "offsetMs": clip.offset_ms,
            "durationMs": clip.duration_ms, "gainDb": clip.gain_db.clamp(-60.0, 24.0),
            "fadeInMs": clip.fade_in_ms, "fadeOutMs": clip.fade_out_ms, "stretchRatio": ratio,
            "pitchSemitones": if clip.processing_enabled { clip.pitch_semitones.clamp(-12.0, 12.0) } else { 0.0 }
        }));
    }
    if clips.is_empty() {
        return Err("Cette piste ou ce clip n’a pas d’audio actif à transcrire.".into());
    }
    let settings = load_settings()?;
    let python = ensure_runtime(Path::new(&settings.cache_dir))?;
    let preview_id = uuid::Uuid::new_v4().to_string();
    let root = folder.join("transcriptions");
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let request_path = root.join(format!("detection-{preview_id}.json"));
    let dest = root.join(format!("detection-{preview_id}.mid"));
    let source_audio = root.join(format!("detection-{preview_id}.wav"));
    crate::paths::atomic_write_json(
        &request_path,
        &serde_json::json!({
            "clips": clips, "options": options, "tempoBpm": tempo_bpm
        }),
    )?;
    let mut command = Command::new(&python);
    crate::process_utils::configure_no_window(&mut command);
    let result = (|| {
        let output = command
            .arg("-I")
            .arg("-c")
            .arg(TRANSCRIBE_SCRIPT)
            .arg(&request_path)
            .arg(&dest)
            .arg(&source_audio)
            .output()
            .map_err(|e| format!("Lancement BasicPitch : {e}"))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            let message = err
                .lines()
                .rev()
                .find_map(|line| {
                    serde_json::from_str::<serde_json::Value>(line)
                        .ok()
                        .and_then(|value| value["error"].as_str().map(str::to_owned))
                })
                .unwrap_or_else(|| {
                    "L’analyse audio a échoué. Vérifiez le fichier source et les réglages.".into()
                });
            return Err(message);
        }
        let meta: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|_| "La détection a renvoyé une réponse illisible.".to_string())?;
        let midi = std::fs::read(&dest).map_err(|e| format!("Lecture MIDI : {e}"))?;
        let notes: Vec<DetectedNote> = serde_json::from_value(meta["notes"].clone())
            .map_err(|_| "Les notes détectées sont illisibles.".to_string())?;
        let note_count = notes.len();
        Ok(BasicPitchResult {
            midi_bytes: midi,
            note_count,
            backend: meta
                .get("backend")
                .and_then(|v| v.as_str())
                .unwrap_or("onnx")
                .into(),
            tensorflow_installed: meta
                .get("tensorflowInstalled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            model: meta
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("nmp.onnx")
                .into(),
            preview_id: preview_id.clone(),
            source_audio_path: source_audio.to_string_lossy().into(),
            notes,
            tempo_bpm,
            tempo_map: mix.tempo_map,
            time_signatures: if mix.time_signatures.is_empty() {
                project
                    .meter
                    .map(|meter| {
                        vec![crate::models::MixMeterEvent {
                            start_ms: 0,
                            numerator: meter.numerator as u32,
                            denominator: meter.denominator as u32,
                        }]
                    })
                    .unwrap_or_default()
            } else {
                mix.time_signatures
            },
            options,
            duration_seconds: meta["durationSeconds"].as_f64().unwrap_or(0.0),
        })
    })();
    let _ = std::fs::remove_file(request_path);
    let _ = std::fs::remove_file(dest);
    if result.is_err() {
        let _ = std::fs::remove_file(source_audio);
    }
    result
}

#[cfg(test)]
fn count_midi_notes(bytes: &[u8]) -> usize {
    // Rough SMF note-on count (status 0x9n with velocity > 0). Good enough for UI.
    bytes
        .windows(3)
        .filter(|w| w[0] & 0xF0 == 0x90 && w[2] > 0)
        .count()
}

#[cfg(test)]
mod tests {
    use super::count_midi_notes;

    #[test]
    fn empty_buffer_has_no_notes() {
        assert_eq!(count_midi_notes(&[]), 0);
    }
}
