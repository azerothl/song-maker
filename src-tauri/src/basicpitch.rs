//! BasicPitch ONNX audio → MIDI (product path, issue #346). Apache-2.0 weights.

use crate::library::{load_project, project_folder};
use crate::models::MixDoc;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BasicPitchResult {
    pub midi_bytes: Vec<u8>,
    pub note_count: usize,
    pub backend: String,
    pub tensorflow_installed: bool,
    pub model: String,
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
    for (program, prefix) in [
        (PathBuf::from("python3"), Vec::<String>::new()),
        (PathBuf::from("python"), Vec::new()),
    ] {
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

fn script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../scripts/basicpitch-product/transcribe.py")
}

pub fn transcribe_track(project_id: &str, track_id: &str) -> Result<BasicPitchResult, String> {
    let folder = project_folder(project_id);
    let project = load_project(&folder)?;
    let mix_id = project
        .active_mix_id
        .ok_or_else(|| "Aucun mix à transcrire.".to_string())?;
    let text = std::fs::read_to_string(folder.join("mixes").join(format!("{mix_id}.json")))
        .map_err(|e| e.to_string())?;
    let mix: MixDoc = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let track = mix
        .tracks
        .iter()
        .find(|t| t.id == track_id)
        .ok_or_else(|| "Piste introuvable.".to_string())?;
    let clip = track
        .clips
        .iter()
        .find(|c| !c.source_path.is_empty())
        .ok_or_else(|| "Cette piste n’a pas d’audio à transcrire.".to_string())?;
    let audio = if Path::new(&clip.source_path).is_absolute() {
        PathBuf::from(&clip.source_path)
    } else {
        folder.join(&clip.source_path)
    };
    if !audio.is_file() {
        return Err(format!("Fichier audio absent : {}", audio.display()));
    }
    let (python, prefix) = python_cmd()?;
    let script = script_path();
    if !script.is_file() {
        return Err(format!("Script BasicPitch absent : {}", script.display()));
    }
    let dest = std::env::temp_dir().join(format!(
        "song-maker-bp-{}-{}.mid",
        project_id,
        track_id.replace('/', "_")
    ));
    let mut command = Command::new(&python);
    crate::process_utils::configure_no_window(&mut command);
    let output = command
        .args(&prefix)
        .arg(&script)
        .arg(&audio)
        .arg(&dest)
        .output()
        .map_err(|e| format!("Lancement BasicPitch : {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "BasicPitch ONNX a échoué (runtime sans TensorFlow requis) : {}",
            err.trim()
        ));
    }
    let meta: serde_json::Value =
        serde_json::from_slice(&output.stdout).unwrap_or_else(|_| serde_json::json!({}));
    let midi = std::fs::read(&dest).map_err(|e| format!("Lecture MIDI : {e}"))?;
    let _ = std::fs::remove_file(&dest);
    let note_count = count_midi_notes(&midi);
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
    })
}

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
