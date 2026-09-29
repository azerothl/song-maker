use tauri::Manager;

mod abc_metadata;
mod audiocpp;
mod bs_roformer;
mod commands;
mod demucs_onnx;
mod form;
mod hashutil;
mod health;
mod installer;
mod library;
mod lora_train;
mod mix;
mod models;
mod paths;
mod pins;
mod project_sync;
mod queue;
mod resample;
mod sheetsage;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = library::recover_generation_jobs();
    let state = AppState::default();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            // Réglages, santé, installation des modèles
            commands::settings::get_health,
            commands::settings::get_setup_gpu_info,
            commands::settings::get_install_plan,
            commands::settings::install_required_assets,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_phase3_status,
            commands::settings::install_htdemucs_6s_runtime,
            commands::settings::install_bs_roformer,
            commands::settings::cancel_bs_roformer_install,
            commands::settings::bs_roformer_install_info,
            commands::settings::list_lora_adapters,
            commands::settings::import_lora_adapters,
            commands::settings::confirm_model_pack,
            // Projets
            commands::projects::list_projects,
            commands::projects::create_project,
            commands::projects::open_project,
            commands::projects::save_project_form,
            commands::projects::rename_project,
            commands::projects::duplicate_project,
            commands::projects::delete_project,
            commands::projects::reveal_project,
            // File de jobs GPU
            commands::jobs::get_job_status,
            commands::jobs::cancel_job,
            // Génération
            commands::generation::start_generation,
            commands::generation::render_from_generation,
            commands::generation::download_cache_file,
            commands::generation::list_generations,
            // Séparation de stems
            commands::separation::start_separation,
            commands::separation::load_separation_info,
            commands::separation::list_separation_versions_cmd,
            commands::separation::activate_separation_version,
            commands::separation::export_separation_stems,
            // Mixage, rendu, export
            commands::mix::load_mix,
            commands::mix::update_mix,
            commands::mix::undo_mix,
            commands::mix::redo_mix,
            commands::mix::save_mix_version,
            commands::mix::render_preview,
            commands::mix::playback_sources,
            commands::mix::read_preview_audio,
            commands::mix::export_audio,
            commands::mix::export_pcm_audio,
            // Capture et import audio utilisateur
            commands::capture::import_user_audio_track,
            commands::capture::begin_user_audio_capture,
            commands::capture::append_user_audio_chunk,
            commands::capture::discard_user_audio_capture,
            commands::capture::finalize_user_audio_capture,
            commands::capture::finalize_user_audio_capture_takes,
            // Paquet portable de projet
            commands::package::save_production_overlay,
            commands::package::load_production_overlay,
            commands::package::list_project_package_inventory,
            commands::package::export_project_package,
            // Partition
            commands::score::read_score_abc,
            commands::score::save_score,
            commands::score::load_score,
            commands::score::clear_score,
            commands::score::list_scores,
            commands::score::load_score_version,
            commands::score::set_active_score,
            // Versions
            commands::versions::use_generation,
            commands::versions::import_remote_generation,
            // SheetSage2
            commands::sheetsage_cmds::install_sheetsage2,
            commands::sheetsage_cmds::cancel_sheetsage2_install,
            commands::sheetsage_cmds::sheetsage2_install_info,
            commands::sheetsage_cmds::sheetsage_probe,
            commands::sheetsage_cmds::sheetsage_transcribe,
            commands::sheetsage_cmds::sheetsage_cancel,
            // Entraînement LoRA NAR
            commands::lora_training::lora_train_probe,
            commands::lora_training::lora_train_probe_audio,
            commands::lora_training::lora_train_jobs_root,
            commands::lora_training::lora_train_write_text,
            commands::lora_training::lora_train_read_text,
            commands::lora_training::lora_train_path_exists,
            commands::lora_training::lora_train_mkdir,
            commands::lora_training::lora_train_remove,
            commands::lora_training::lora_train_launch,
            commands::lora_training::lora_train_poll,
            commands::lora_training::lora_train_cancel_process,
            // Synchronisation de projet
            commands::sync::project_sync_list_artifacts,
            commands::sync::project_sync_read_bytes,
            commands::sync::project_sync_write_bytes,
            commands::sync::project_sync_fs_root,
            commands::sync::project_sync_fs_write,
            commands::sync::project_sync_fs_read,
            commands::sync::project_sync_fs_list,
            commands::sync::project_sync_fs_delete,
        ])
        .build(tauri::generate_context!())
        .expect("erreur au démarrage de Song Maker")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<AppState>();
                state.server.shutdown();
            }
        });
}
