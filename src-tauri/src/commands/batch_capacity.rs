//! Capacity is measured for one exact workload, never extrapolated to longer takes.
use super::{
    batch_cmds::batch_generation_settings,
    generation::{generate_worker_take, GenerationWorker},
    AppState,
};
use crate::{
    batch::{task_to_form, BatchPreview},
    library::{load_settings, project_folder},
    models::CreateProjectInput,
};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::Manager;

fn weights(settings: &crate::models::AppSettings) -> Vec<std::path::PathBuf> {
    let cache = std::path::Path::new(&settings.cache_dir);
    let mut files: Vec<_> = if settings.generation_engine == "ace_step" {
        vec![crate::paths::ace_step_weights_path(cache)]
    } else {
        walkdir::WalkDir::new(crate::paths::yue2_dir(cache))
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.file_type().is_file() && entry.path().extension().is_some_and(|s| s == "gguf")
            })
            .map(|entry| entry.into_path())
            .collect()
    };
    for path in [&settings.yue2_ar_lora, &settings.yue2_nar_lora]
        .into_iter()
        .flatten()
    {
        files.push(path.into());
    }
    // Instrumental takes also run vocal removal on the same worker.
    files.push(crate::paths::htdemucs_path(cache));
    if let Ok(bin) = crate::audiocpp::AudioCppServer::find_server_binary(cache) {
        files.push(bin);
    }
    files.sort();
    files
}

pub(super) fn capacity_key(preview: &BatchPreview) -> Result<Value, String> {
    let settings = load_settings()?;
    let first = preview.tasks.first().ok_or("Lot vide")?;
    let workload = workload(first);
    // Exact content/options are deliberately conservative. Different songs can
    // still run together after a future measurement covering their workloads.
    if preview
        .tasks
        .iter()
        .any(|task| self::workload(task) != workload)
    {
        return Err("La vérification simultanée couvre actuellement plusieurs prises aux mêmes style, paroles et réglages. Ce lot contient des réglages différents : il sera généré une prise à la fois.".into());
    }
    let files = asset_fingerprints(&settings);
    Ok(
        json!({"settings":batch_generation_settings(&settings), "profile":crate::profiles::active_profile_id(),
        "gpu":crate::health::detect_gpu(), "files":files, "workload":workload}),
    )
}

pub(super) fn asset_fingerprints(settings: &crate::models::AppSettings) -> Value {
    json!(weights(settings).iter().map(|path| {
        let metadata = std::fs::metadata(path).ok();
        json!({"path":path, "bytes":metadata.as_ref().map(|m|m.len()),
            "modified":metadata.and_then(|m|m.modified().ok()).and_then(|d|d.duration_since(std::time::UNIX_EPOCH).ok()).map(|d|d.as_nanos().to_string())})
    }).collect::<Vec<_>>())
}

fn proof_matches_settings(proof: &Value, settings: &crate::models::AppSettings) -> bool {
    proof["key"]["settings"] == batch_generation_settings(settings)
        && proof["key"]["profile"] == json!(crate::profiles::active_profile_id())
        && proof["key"]["files"] == asset_fingerprints(settings)
}

pub(super) async fn verify_attempt_assets(state: &AppState, batch_id: &str) -> bool {
    let proof = state
        .batch_workers
        .proof
        .lock()
        .expect("capacity proof")
        .clone();
    if !verified_for_plan(state, batch_id) {
        return false;
    }
    let actual = tokio::task::spawn_blocking(hashes).await;
    let verified = matches!(actual, Ok(Ok(ref hashes)) if proof.as_ref().is_some_and(|p| p["hashes"] == *hashes));
    if !verified {
        *state.batch_workers.proof.lock().expect("capacity proof") = None;
    }
    verified
}

fn workload(task: &crate::batch::PlannedTask) -> Value {
    let mut value = serde_json::to_value(task_to_form(task)).expect("form JSON");
    value.as_object_mut().unwrap().remove("title");
    value.as_object_mut().unwrap().remove("seed");
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generation_asset_fingerprints_detect_replaced_and_removed_weights() {
        let _docs = crate::test_docs_env::guard::TempDocs::new("batch-asset-stamp");
        let root =
            std::env::temp_dir().join(format!("song-maker-asset-stamp-{}", uuid::Uuid::new_v4()));
        let mut settings = crate::library::default_settings();
        settings.cache_dir = root.display().to_string();
        let folder = crate::paths::yue2_dir(&root);
        std::fs::create_dir_all(&folder).unwrap();
        let model = folder.join("test.gguf");
        std::fs::write(&model, b"first").unwrap();
        let first = asset_fingerprints(&settings);
        std::fs::write(&model, b"second replacement").unwrap();
        assert_ne!(first, asset_fingerprints(&settings));
        std::fs::remove_file(&model).unwrap();
        assert_ne!(first, asset_fingerprints(&settings));
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn capacity_measurements_do_not_extrapolate_to_other_content_or_duration() {
        let file =
            crate::batch::parse_batch_bytes(crate::batch::EXAMPLE_JSON.as_bytes(), "example")
                .unwrap();
        let preview = crate::batch::plan_batch(&file, None, None).unwrap();
        let first = preview.tasks[0].clone();
        let mut variant = first.clone();
        variant.seed = variant.seed.wrapping_add(1);
        variant.title = "Another title".into();
        assert_eq!(workload(&first), workload(&variant));
        variant.target_duration_sec += 30;
        assert_ne!(workload(&first), workload(&variant));
        variant = first.clone();
        variant.lyrics.push_str(" different lyrics");
        assert_ne!(workload(&first), workload(&variant));
        variant = first.clone();
        variant.cot = "none".into();
        assert_ne!(workload(&first), workload(&variant));
    }
}

fn hashes() -> Result<Value, String> {
    let settings = load_settings()?;
    let mut result = Vec::new();
    for path in weights(&settings) {
        result.push(json!({"path":path,"sha256":crate::hashutil::sha256_file(&path)?}));
    }
    if result.is_empty() {
        return Err("Modèle absent.".into());
    }
    Ok(json!(result))
}

pub(super) fn apply_capacity(state: &AppState, mut preview: BatchPreview) -> BatchPreview {
    let proof = state.batch_workers.proof.lock().expect("capacity proof");
    if let Ok(key) = capacity_key(&preview) {
        if proof.as_ref().is_some_and(|proof| proof["key"] == key) {
            preview.admitted_parallel = 2;
            preview.effective_parallel = preview.requested_parallel.min(2);
            preview.can_launch =
                preview.parallelism_policy != "requireRequested" || preview.requested_parallel <= 2;
            preview.launch_block_fr = (!preview.can_launch).then(|| "Deux générations simultanées vérifiées ; réduisez la demande à deux pour lancer ce lot.".into());
            preview.capacity_reason_fr = "Deux prises simultanées vérifiées pour ces morceaux et ces réglages pendant cette session.".into();
        }
    }
    preview
}

pub(super) fn verified_for_plan(state: &AppState, batch_id: &str) -> bool {
    let Ok(plan) = crate::batch::load_plan(batch_id) else {
        return false;
    };
    let Ok(settings) = load_settings() else {
        return false;
    };
    let mut proof = state.batch_workers.proof.lock().expect("capacity proof");
    if proof
        .as_ref()
        .is_some_and(|p| !proof_matches_settings(p, &settings))
    {
        *proof = None;
    }
    proof
        .as_ref()
        .is_some_and(|proof| plan["capacityKey"] == proof["key"])
}

pub(super) fn verify_before_start(state: &AppState, preview: &BatchPreview) -> Result<(), String> {
    if preview.effective_parallel <= 1 {
        return Ok(());
    }
    let proof = state
        .batch_workers
        .proof
        .lock()
        .expect("capacity proof")
        .clone();
    if !proof
        .as_ref()
        .is_some_and(|proof| capacity_key(preview).ok().as_ref() == Some(&proof["key"]))
        || proof.as_ref().unwrap()["hashes"] != hashes()?
    {
        *state.batch_workers.proof.lock().expect("capacity proof") = None;
        return Err(
            "La configuration a changé. Recalculez l’aperçu et vérifiez à nouveau la simultanéité."
                .into(),
        );
    }
    Ok(())
}

fn free_vram_mib() -> Option<u64> {
    let mut command = std::process::Command::new("nvidia-smi");
    command.args([
        "--query-gpu=memory.free",
        "--format=csv,noheader,nounits",
        "--id=0",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout).trim().parse().ok()
}

#[tauri::command]
pub async fn verify_batch_parallelism(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    start_token: String,
) -> Result<Value, String> {
    let _configuration = super::settings::guard_model_snapshot(&state)?;
    let pending = state
        .pending_batches
        .lock()
        .expect("pending batch")
        .get(&start_token)
        .cloned()
        .ok_or("Aperçu périmé.")?;
    let key = capacity_key(&pending.preview)?;
    if pending.preview.tasks.len() < 2 {
        return Err("Prévoyez au moins deux prises avant la vérification.".into());
    }
    // Acquiring all admission permits also excludes other lots during the probe.
    let _permit = state.batch_workers.acquire_probe().await?;
    let _device = state.queue.try_acquire_runtime_restart().await?;
    let settings = load_settings()?;
    state.server.shutdown();
    *state.batch_workers.proof.lock().expect("capacity proof") = None;
    let pinned_hashes = hashes()?;
    let probe_id = format!("capacity-{}", uuid::Uuid::new_v4());
    let probe_root = crate::batch::batches_root()
        .join("capacity-checks")
        .join(&probe_id);
    let mut workers = Vec::new();
    let mut forms = Vec::new();
    let mut projects = Vec::new();
    for index in 0..2 {
        let mut form = task_to_form(&pending.preview.tasks[index]);
        form.title = format!(
            "Vérification simultanéité {} prise {}",
            crate::paths::now_iso().replace(':', "-"),
            index + 1
        );
        let doc = super::projects::create_project(CreateProjectInput {
            title: form.title.clone(),
        })?;
        super::projects::save_project_form(doc.id.clone(), form.clone())?;
        projects.push(doc.id);
        forms.push(form);
        let mut worker_settings = settings.clone();
        worker_settings.server_port = 18100 + index as u16 * 20;
        workers.push(GenerationWorker {
            server: Arc::new(crate::audiocpp::AudioCppServer::isolated(
                probe_root.join(format!("worker-{index}")),
            )),
            queue: crate::queue::JobQueue::default(),
            settings: worker_settings,
            id: format!("{probe_id}-{index}"),
            cancelled: Arc::new(AtomicBool::new(false)),
        });
    }
    let stop = Arc::new(AtomicBool::new(false));
    let sampling_stop = stop.clone();
    let sampler = std::thread::spawn(move || {
        let mut minimum = None;
        let mut samples = 0;
        while !sampling_stop.load(Ordering::Acquire) {
            if let Some(free) = free_vram_mib() {
                minimum = Some(minimum.unwrap_or(free).min(free));
                samples += 1;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        (minimum, samples)
    });
    let (a, b) = tokio::join!(
        generate_worker_take(
            app.state::<AppState>(),
            projects[0].clone(),
            forms[0].clone(),
            &workers[0]
        ),
        generate_worker_take(
            app.state::<AppState>(),
            projects[1].clone(),
            forms[1].clone(),
            &workers[1]
        )
    );
    stop.store(true, Ordering::Release);
    let (free_min, samples) = sampler.join().map_err(|_| "Mesure mémoire interrompue")?;
    for worker in &workers {
        worker.server.shutdown();
    }
    let read_result = |index: usize,
                       result: &Result<super::generation::InstrumentalPartResult, String>|
     -> Option<Value> {
        let take = result.as_ref().ok()?;
        serde_json::from_str(
            &std::fs::read_to_string(
                project_folder(&projects[index])
                    .join("generations")
                    .join(&take.generation_id)
                    .join("result.json"),
            )
            .ok()?,
        )
        .ok()
    };
    let ra = read_result(0, &a);
    let rb = read_result(1, &b);
    for (index, result) in [&a, &b].into_iter().enumerate() {
        if let Ok(result) = result {
            super::versions::use_generation(projects[index].clone(), result.generation_id.clone())?;
        }
    }
    let overlap = ra.as_ref().zip(rb.as_ref()).is_some_and(|(a, b)| {
        a["state"] == "generated"
            && b["state"] == "generated"
            && a["startedAt"].as_str() < b["finishedAt"].as_str()
            && b["startedAt"].as_str() < a["finishedAt"].as_str()
    });
    let verified = overlap
        && samples >= 2
        && free_min.is_some_and(|free| free >= 2048)
        && capacity_key(&pending.preview)? == key
        && hashes()? == pinned_hashes;
    let report = json!({"key":key,"hashes":pinned_hashes,"verified":verified,"freeVramMinMib":free_min,"samples":samples,"overlap":overlap,"projects":projects,"results":[ra,rb],"errors":[a.err(),b.err()],"recordedAt":crate::paths::now_iso()});
    crate::paths::atomic_write_json(&probe_root.join("measurement.json"), &report)?;
    if verified {
        *state.batch_workers.proof.lock().expect("capacity proof") = Some(report);
    }
    let mut preview = apply_capacity(&state, pending.preview);
    preview.revision += 1;
    state
        .pending_batches
        .lock()
        .expect("pending batches")
        .get_mut(&start_token)
        .ok_or("Aperçu périmé")?
        .preview = preview.clone();
    Ok(
        json!({"ok":true,"preview":preview,"messageFr":if verified {"Deux prises simultanées vérifiées. Les prises de vérification sont disponibles dans la bibliothèque."} else {"Vérification non concluante : une prise à la fois est conservée. Les résultats et le rapport restent disponibles."}}),
    )
}
