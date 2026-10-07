//! Hôte VST3 hors ligne pour le bus master (#326).
//!
//! Le VST est chargé dans un processus enfant, lancé par la même application. Un plugin qui
//! plante ou se bloque ne peut donc pas faire tomber la fenêtre Tauri. La première tranche est
//! Windows/VST3, rendu hors ligne et éditeur natif isolé. Le traitement temps réel et AU ne sont
//! pas pris en charge.

use crate::vst3_spike::Vst3CatalogEntry;
#[cfg(windows)]
use crate::vst3_spike::{default_scan_roots, scan_roots};
#[cfg(windows)]
use base64::Engine as _;
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
#[cfg(windows)]
const EDITOR_START_TIMEOUT: Duration = Duration::from_secs(45);
#[cfg(windows)]
const EDITOR_MAX_DURATION: Duration = Duration::from_secs(60 * 60 * 8);
#[cfg(windows)]
const MAX_PLUGIN_STATE_BYTES: usize = 24 * 1024 * 1024;
#[cfg(windows)]
const MAX_PLUGIN_PARAMETER_COUNT: usize = 16_384;

#[cfg(windows)]
fn validate_plugin_parameters(parameters: &BTreeMap<u32, f64>) -> Result<(), String> {
    if parameters.len() > MAX_PLUGIN_PARAMETER_COUNT {
        return Err(format!(
            "Ce plugin expose plus de {MAX_PLUGIN_PARAMETER_COUNT} réglages VST3 pris en charge."
        ));
    }
    if parameters
        .values()
        .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
    {
        return Err("Une valeur de réglage VST3 est invalide.".into());
    }
    Ok(())
}

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
    #[serde(default)]
    plugin_state_b64: Option<String>,
    input_path: Option<String>,
    output_path: Option<String>,
    #[serde(default)]
    render_frames: usize,
    #[serde(default)]
    midi_notes: Vec<Vst3MidiNote>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerResponse {
    ok: bool,
    error: Option<String>,
    plugin: Option<Vst3PluginDescription>,
    peak_trim_db: Option<f32>,
    #[serde(default)]
    plugin_state_b64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vst3MidiNote {
    pub start_frame: u64,
    pub end_frame: u64,
    pub pitch: u8,
    pub velocity: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vst3EditorResult {
    pub parameters: BTreeMap<u32, f64>,
    pub plugin_state_b64: Option<String>,
}

#[cfg(windows)]
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorWorkerRequest {
    plugin_path: String,
    #[serde(default)]
    parameters: BTreeMap<u32, f64>,
    #[serde(default)]
    plugin_state_b64: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorWorkerResponse {
    ok: bool,
    error: Option<String>,
    #[serde(default)]
    parameters: BTreeMap<u32, f64>,
    #[serde(default)]
    plugin_state_b64: Option<String>,
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
        plugin_state_b64: None,
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
        .map_err(|e| format!("Plugin VST3 inaccessible : {e}"))?;
    if !canonical.is_dir() && !canonical.is_file() {
        return Err("Le module VST3 sélectionné n’est ni un fichier ni un dossier.".into());
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
    plugin_state_b64: Option<String>,
) -> Result<Vst3PluginDescription, String> {
    #[cfg(not(windows))]
    {
        let _ = (path, parameters, plugin_state_b64);
        Err("L’hôte VST3 est actuellement disponible dans la version Windows.".into())
    }

    #[cfg(windows)]
    {
        validate_plugin_parameters(&parameters)?;
        let path = plugin_path_in_scan_roots(&path)?;
        let response = run_worker(
            WorkerRequest {
                operation: "inspect".into(),
                plugin_path: path.display().to_string(),
                parameters,
                sample_rate: 48_000,
                peak_ceiling_db: -1.0,
                plugin_state_b64,
                input_path: None,
                output_path: None,
                render_frames: 0,
                midi_notes: Vec::new(),
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
    plugin_state_b64: Option<String>,
    sample_rate: u32,
    peak_ceiling_db: f32,
    pcm_le: Vec<u8>,
) -> Result<Vst3ProcessedPcm, String> {
    #[cfg(not(windows))]
    {
        let _ = (
            path,
            parameters,
            plugin_state_b64,
            sample_rate,
            peak_ceiling_db,
            pcm_le,
        );
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
        validate_plugin_parameters(&parameters)?;
        let response = run_worker(
            WorkerRequest {
                operation: "process".into(),
                plugin_path: path.display().to_string(),
                parameters,
                sample_rate,
                peak_ceiling_db: peak_ceiling_db.clamp(-24.0, 0.0),
                plugin_state_b64,
                input_path: Some("input.pcm".into()),
                output_path: Some("output.pcm".into()),
                render_frames: 0,
                midi_notes: Vec::new(),
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

/// Render a score voice through an isolated VST3 instrument.
pub fn render_midi_pcm(
    path: String,
    parameters: BTreeMap<u32, f64>,
    plugin_state_b64: Option<String>,
    sample_rate: u32,
    render_frames: usize,
    midi_notes: Vec<Vst3MidiNote>,
) -> Result<Vec<u8>, String> {
    #[cfg(not(windows))]
    {
        let _ = (
            path,
            parameters,
            plugin_state_b64,
            sample_rate,
            render_frames,
            midi_notes,
        );
        Err("L’hôte VST3 est actuellement disponible dans la version Windows.".into())
    }

    #[cfg(windows)]
    {
        let path = plugin_path_in_scan_roots(&path)?;
        if !(8_000..=192_000).contains(&sample_rate) {
            return Err("Fréquence d’échantillonnage non prise en charge.".into());
        }
        if render_frames == 0 || render_frames.saturating_mul(8) > MAX_PCM_BYTES {
            return Err("Durée de rendu VST3 invalide ou trop longue.".into());
        }
        if midi_notes.is_empty() || midi_notes.len() > 100_000 {
            return Err("La partition doit contenir entre 1 et 100 000 notes.".into());
        }
        if midi_notes.iter().any(|note| {
            note.pitch > 127
                || note.velocity > 127
                || note.start_frame >= note.end_frame
                || note.end_frame > render_frames as u64
        }) {
            return Err("La partition MIDI contient une note invalide.".into());
        }
        validate_plugin_parameters(&parameters)?;
        let response = run_worker(
            WorkerRequest {
                operation: "render_midi".into(),
                plugin_path: path.display().to_string(),
                parameters,
                sample_rate,
                peak_ceiling_db: -1.0,
                plugin_state_b64,
                input_path: None,
                output_path: Some("output.pcm".into()),
                render_frames,
                midi_notes,
            },
            None,
        )?;
        response
            .output_pcm
            .ok_or_else(|| "Le rendu de l’instrument VST3 n’a produit aucun audio.".into())
    }
}

#[tauri::command]
pub async fn vst3_open_plugin_editor(
    path: String,
    parameters: BTreeMap<u32, f64>,
    plugin_state_b64: Option<String>,
) -> Result<Vst3EditorResult, String> {
    #[cfg(not(windows))]
    {
        let _ = (path, parameters, plugin_state_b64);
        Err("L’éditeur VST3 natif est actuellement disponible dans la version Windows.".into())
    }

    #[cfg(windows)]
    {
        tokio::task::spawn_blocking(move || run_editor_worker(path, parameters, plugin_state_b64))
            .await
            .map_err(|e| format!("L’hôte de l’éditeur VST3 s’est arrêté : {e}"))?
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
    }
    if input.is_some() || request.operation == "render_midi" {
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
    let output_pcm = (input.is_some() || request.operation == "render_midi")
        .then(|| {
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

/// Entry point for the isolated native plugin-editor process.
pub fn editor_worker_exit(request_path: &str, response_path: &str) -> i32 {
    #[cfg(not(windows))]
    {
        let _ = request_path;
        let response = EditorWorkerResponse {
            ok: false,
            error: Some("L’éditeur VST3 natif est uniquement compilé pour Windows.".into()),
            parameters: BTreeMap::new(),
            plugin_state_b64: None,
        };
        let _ = std::fs::write(
            response_path,
            serde_json::to_vec(&response).unwrap_or_default(),
        );
        2
    }

    #[cfg(windows)]
    {
        let result = std::fs::read(request_path)
            .map_err(|e| format!("Lecture de la requête éditeur impossible : {e}"))
            .and_then(|bytes| {
                serde_json::from_slice::<EditorWorkerRequest>(&bytes).map_err(|e| e.to_string())
            })
            .and_then(|request| {
                run_editor_window(request, || {
                    println!("{{\"ok\":true}}");
                    let _ = std::io::Write::flush(&mut std::io::stdout());
                })
            });
        let response = match result {
            Ok(response) => response,
            Err(error) => EditorWorkerResponse {
                ok: false,
                error: Some(error),
                parameters: BTreeMap::new(),
                plugin_state_b64: None,
            },
        };
        let bytes = serde_json::to_vec(&response).unwrap_or_default();
        if let Err(error) = std::fs::write(response_path, bytes) {
            eprintln!("État de l’éditeur VST3 impossible à sauvegarder : {error}");
            return 2;
        }
        if !response.ok {
            println!("{}", serde_json::to_string(&response).unwrap_or_default());
            let _ = std::io::Write::flush(&mut std::io::stdout());
        }
        if response.ok {
            0
        } else {
            1
        }
    }
}

#[cfg(windows)]
fn run_editor_worker(
    path: String,
    parameters: BTreeMap<u32, f64>,
    plugin_state_b64: Option<String>,
) -> Result<Vst3EditorResult, String> {
    validate_plugin_parameters(&parameters)?;
    if let Some(state_b64) = plugin_state_b64.as_deref() {
        let state = base64::engine::general_purpose::STANDARD
            .decode(state_b64)
            .map_err(|e| format!("État du plugin VST3 illisible : {e}"))?;
        if state.len() > MAX_PLUGIN_STATE_BYTES {
            return Err("L’état du plugin VST3 dépasse la taille maximale autorisée.".into());
        }
    }
    let plugin_path = plugin_path_in_scan_roots(&path)?;
    let temp_root = std::env::temp_dir();
    let work_dir = temp_root.join(format!("song-maker-vst3-editor-{}", uuid::Uuid::new_v4()));
    if !work_dir.starts_with(&temp_root) {
        return Err("Dossier temporaire VST3 invalide.".into());
    }
    std::fs::create_dir(&work_dir).map_err(|e| format!("Dossier temporaire VST3 : {e}"))?;
    let result = run_editor_worker_in_dir(
        EditorWorkerRequest {
            plugin_path: plugin_path.display().to_string(),
            parameters,
            plugin_state_b64,
        },
        &work_dir,
    );
    let _ = std::fs::remove_dir_all(&work_dir);
    result
}

#[cfg(windows)]
fn run_editor_worker_in_dir(
    request: EditorWorkerRequest,
    work_dir: &Path,
) -> Result<Vst3EditorResult, String> {
    use std::io::BufRead;

    let request_path = work_dir.join("request.json");
    let response_path = work_dir.join("response.json");
    std::fs::write(
        &request_path,
        serde_json::to_vec(&request).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Écriture de la requête éditeur impossible : {e}"))?;

    let exe =
        std::env::current_exe().map_err(|e| format!("Exécutable Song Maker introuvable : {e}"))?;
    let mut command = Command::new(exe);
    command
        .arg("--vst3-editor-worker")
        .arg(&request_path)
        .arg(&response_path)
        .current_dir(work_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Impossible de démarrer l’éditeur VST3 isolé : {e}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or("La sortie de l’éditeur VST3 est indisponible.")?;
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = std::io::BufReader::new(stdout)
            .read_line(&mut line)
            .map(|_| line);
        let _ = ready_tx.send(result);
    });
    let startup = match ready_rx.recv_timeout(EDITOR_START_TIMEOUT) {
        Ok(Ok(line)) if line.trim().is_empty() => {
            let status = child.wait().ok();
            let exit_code = status
                .as_ref()
                .and_then(std::process::ExitStatus::code)
                .map_or_else(|| "inconnu".to_string(), |code| code.to_string());
            eprintln!("L’éditeur VST3 s’est fermé avant son ouverture (code {exit_code}).");
            return Err("Le plugin VST3 s’est fermé avant l’ouverture de son interface. Vérifiez qu’il est compatible et correctement installé. Song Maker est resté ouvert.".into());
        }
        Ok(Ok(line)) => match serde_json::from_str::<EditorWorkerResponse>(line.trim()) {
            Ok(response) => response,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Le plugin VST3 a renvoyé une réponse invalide avant l’ouverture de son interface. Song Maker est resté actif.".into());
            }
        },
        Ok(Err(error)) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "Lecture de l’état de l’éditeur impossible : {error}"
            ));
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(
                "Le plugin VST3 n’a pas ouvert son interface dans le délai prévu; Song Maker est resté actif."
                    .into(),
            );
        }
    };
    if !startup.ok {
        let _ = child.wait();
        return Err(startup
            .error
            .unwrap_or_else(|| "Impossible d’ouvrir l’interface du plugin VST3.".into()));
    }

    let started = Instant::now();
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| format!("Surveillance de l’éditeur VST3 impossible : {e}"))?
        {
            if !status.success() && !response_path.exists() {
                return Err(format!(
                    "L’éditeur VST3 s’est fermé sans sauvegarder son état (code {}). Song Maker est resté actif.",
                    status.code().map_or_else(|| "inconnu".into(), |c| c.to_string())
                ));
            }
            break;
        }
        if started.elapsed() >= EDITOR_MAX_DURATION {
            let _ = child.kill();
            let _ = child.wait();
            return Err(
                "La fenêtre de l’éditeur VST3 a dépassé la durée maximale et a été fermée.".into(),
            );
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let bytes = std::fs::read(response_path)
        .map_err(|e| format!("État de l’éditeur VST3 manquant : {e}"))?;
    let mut response: EditorWorkerResponse =
        serde_json::from_slice(&bytes).map_err(|e| format!("État VST3 invalide : {e}"))?;
    if !response.ok {
        return Err(response
            .error
            .take()
            .unwrap_or_else(|| "Échec de l’éditeur VST3.".into()));
    }
    if let Some(state_b64) = response.plugin_state_b64.as_deref() {
        let state = base64::engine::general_purpose::STANDARD
            .decode(state_b64)
            .map_err(|e| format!("État du plugin VST3 illisible : {e}"))?;
        if state.len() > MAX_PLUGIN_STATE_BYTES {
            return Err("L’état du plugin VST3 dépasse la taille maximale autorisée.".into());
        }
    }
    Ok(Vst3EditorResult {
        parameters: response.parameters,
        plugin_state_b64: response.plugin_state_b64,
    })
}

#[cfg(windows)]
fn run_editor_window(
    request: EditorWorkerRequest,
    mut on_ready: impl FnMut(),
) -> Result<EditorWorkerResponse, String> {
    use std::sync::{Arc, Mutex};
    use vst3_host::PluginWindow;

    validate_plugin_parameters(&request.parameters)?;
    let plugin_path = plugin_path_in_scan_roots(&request.plugin_path)?;
    let mut plugin =
        vst3_host::simple::load_plugin_with_settings(&plugin_path, 48_000.0, SAMPLE_BLOCK)
            .map_err(|e| format!("Chargement du plugin impossible : {e}"))?;
    if let Some(state_b64) = request.plugin_state_b64.as_deref() {
        let state = base64::engine::general_purpose::STANDARD
            .decode(state_b64)
            .map_err(|e| format!("État du plugin VST3 illisible : {e}"))?;
        if state.len() > MAX_PLUGIN_STATE_BYTES {
            return Err("L’état du plugin VST3 dépasse la taille maximale autorisée.".into());
        }
        plugin
            .load_state(&state)
            .map_err(|e| format!("Restauration de l’état du plugin impossible : {e}"))?;
    }
    for (id, value) in &request.parameters {
        plugin
            .set_parameter(*id, *value)
            .map_err(|e| format!("Réglage VST3 impossible : {e}"))?;
    }

    let plugin = Arc::new(Mutex::new(plugin));
    let mut window = PluginWindow::new(Arc::clone(&plugin));
    window
        .open()
        .map_err(|e| format!("Ouverture de l’interface du plugin impossible : {e}"))?;
    on_ready();

    while !window.closed_by_user() {
        pump_plugin_editor_messages();
        window
            .service_platform_events()
            .map_err(|e| format!("Gestion de la fenêtre du plugin impossible : {e}"))?;
        std::thread::sleep(Duration::from_millis(10));
    }
    window.close();

    let plugin = plugin.lock().unwrap_or_else(|poison| poison.into_inner());
    let parameters = plugin
        .get_parameters()
        .map_err(|e| format!("Lecture des réglages du plugin impossible : {e}"))?
        .into_iter()
        .map(|parameter| (parameter.id, parameter.value))
        .collect();
    let state = plugin
        .save_state()
        .map_err(|e| format!("Sauvegarde de l’état du plugin impossible : {e}"))?;
    if state.len() > MAX_PLUGIN_STATE_BYTES {
        return Err("L’état du plugin VST3 dépasse la taille maximale autorisée.".into());
    }
    Ok(EditorWorkerResponse {
        ok: true,
        error: None,
        parameters,
        plugin_state_b64: Some(base64::engine::general_purpose::STANDARD.encode(state)),
    })
}

#[cfg(windows)]
fn pump_plugin_editor_messages() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE,
    };

    unsafe {
        let mut message: MSG = std::mem::zeroed();
        while PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}

#[cfg(windows)]
fn run_worker_request(request: WorkerRequest) -> Result<WorkerResponse, String> {
    validate_plugin_parameters(&request.parameters)?;
    let mut plugin = vst3_host::simple::load_plugin_with_settings(
        &request.plugin_path,
        f64::from(request.sample_rate.max(8_000)),
        SAMPLE_BLOCK,
    )
    .map_err(|e| format!("Chargement du plugin impossible : {e}"))?;
    let info = plugin.info().clone();

    if let Some(state_b64) = request.plugin_state_b64.as_deref() {
        let state = base64::engine::general_purpose::STANDARD
            .decode(state_b64)
            .map_err(|e| format!("État du plugin VST3 illisible : {e}"))?;
        if state.len() > MAX_PLUGIN_STATE_BYTES {
            return Err("L’état du plugin VST3 dépasse la taille maximale autorisée.".into());
        }
        plugin
            .load_state(&state)
            .map_err(|e| format!("Restauration de l’état du plugin impossible : {e}"))?;
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
    if parameters.len() > MAX_PLUGIN_PARAMETER_COUNT {
        return Err(format!(
            "Ce plugin expose plus de {MAX_PLUGIN_PARAMETER_COUNT} réglages VST3 pris en charge."
        ));
    }
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
            plugin_state_b64: None,
        });
    }
    if request.operation == "render_midi" {
        if info.audio_inputs != 0
            || info.audio_outputs == 0
            || !info.category.to_lowercase().contains("instrument")
        {
            return Err(
                "Ce plugin n’est pas un instrument VST3 compatible avec une partition MIDI.".into(),
            );
        }
        if request.render_frames == 0
            || request.render_frames.saturating_mul(8) > MAX_PCM_BYTES
            || request.midi_notes.is_empty()
            || request.midi_notes.len() > 100_000
        {
            return Err("Durée ou partition invalide pour le rendu VST3.".into());
        }
        for (id, value) in &request.parameters {
            if !value.is_finite() || !(0.0..=1.0).contains(value) {
                return Err(format!("Valeur de paramètre invalide pour {id}."));
            }
            plugin
                .set_parameter(*id, *value)
                .map_err(|e| format!("Réglage VST3 impossible : {e}"))?;
        }
        let output_path = request
            .output_path
            .as_deref()
            .ok_or("Audio de sortie manquant.")?;
        plugin
            .start_processing()
            .map_err(|e| format!("Démarrage de l’instrument VST3 impossible : {e}"))?;
        let process_result = render_midi_blocks(
            &mut plugin,
            &request.midi_notes,
            request.render_frames,
            request.sample_rate.max(8_000),
        );
        let _ = plugin.stop_processing();
        let output = process_result?;
        std::fs::write(output_path, output)
            .map_err(|e| format!("Écriture du rendu VST3 impossible : {e}"))?;
        return Ok(WorkerResponse {
            ok: true,
            error: None,
            plugin: None,
            peak_trim_db: Some(0.0),
            plugin_state_b64: None,
        });
    }
    if request.operation != "process" {
        return Err("Opération VST3 inconnue.".into());
    }
    if info.audio_inputs == 0
        || info.audio_outputs == 0
        || info.category.to_lowercase().contains("instrument")
    {
        return Err("Sélectionnez un effet audio VST3 avec une entrée audio.".into());
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
        plugin_state_b64: None,
    })
}

#[cfg(windows)]
fn render_midi_blocks(
    plugin: &mut vst3_host::Plugin,
    notes: &[Vst3MidiNote],
    frame_count: usize,
    sample_rate: u32,
) -> Result<Vec<u8>, String> {
    use vst3_host::midi::{MidiChannel, MidiEvent};

    let mut events = Vec::with_capacity(notes.len() * 2);
    for note in notes {
        events.push((note.start_frame, 1u8, note.pitch, note.velocity));
        events.push((note.end_frame, 0u8, note.pitch, 0u8));
    }
    events.sort_by_key(|(frame, order, pitch, _)| (*frame, *order, *pitch));

    let mut audio = vst3_host::audio::AudioBuffers::new(0, 2, SAMPLE_BLOCK, f64::from(sample_rate));
    let mut output = vec![0u8; frame_count * 8];
    let mut event_index = 0usize;
    let mut frame_offset = 0usize;
    while frame_offset < frame_count {
        let frames = (frame_count - frame_offset).min(SAMPLE_BLOCK);
        let block_end = frame_offset + frames;
        audio.clear();
        while let Some((event_frame, order, pitch, velocity)) = events.get(event_index).copied() {
            if event_frame >= block_end as u64 {
                break;
            }
            if event_frame < frame_offset as u64 {
                event_index += 1;
                continue;
            }
            let event = if order == 0 {
                MidiEvent::NoteOff {
                    channel: MidiChannel::Ch1,
                    note: pitch,
                    velocity: 0,
                }
            } else {
                MidiEvent::NoteOn {
                    channel: MidiChannel::Ch1,
                    note: pitch,
                    velocity,
                }
            };
            plugin
                .send_midi_event_at(event, (event_frame - frame_offset as u64) as i32)
                .map_err(|e| format!("Envoi MIDI au plugin VST3 impossible : {e}"))?;
            event_index += 1;
        }
        plugin
            .process_audio(&mut audio)
            .map_err(|e| format!("Instrument VST3 en erreur : {e}"))?;
        for i in 0..frames {
            let base = (frame_offset + i) * 8;
            let left = audio.outputs[0][i];
            let right = audio.outputs[1][i];
            if !left.is_finite() || !right.is_finite() {
                return Err("L’instrument VST3 a produit un échantillon invalide.".into());
            }
            output[base..base + 4].copy_from_slice(&left.to_le_bytes());
            output[base + 4..base + 8].copy_from_slice(&right.to_le_bytes());
        }
        frame_offset = block_end;
    }
    Ok(output)
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
