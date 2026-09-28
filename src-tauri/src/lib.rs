use tauri::Manager;

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
            commands::get_health,
            commands::install_required_assets,
            commands::get_settings,
            commands::update_settings,
            commands::get_phase3_status,
            commands::install_htdemucs_6s_runtime,
            commands::install_bs_roformer,
            commands::cancel_bs_roformer_install,
            commands::bs_roformer_install_info,
            commands::list_lora_adapters,
            commands::import_lora_adapters,
            commands::confirm_model_pack,
            commands::list_projects,
            commands::create_project,
            commands::open_project,
            commands::save_project_form,
            commands::rename_project,
            commands::duplicate_project,
            commands::delete_project,
            commands::reveal_project,
            commands::get_job_status,
            commands::cancel_job,
            commands::start_generation,
            commands::render_from_generation,
            commands::start_separation,
            commands::load_mix,
            commands::load_separation_info,
            commands::update_mix,
            commands::import_user_audio_track,
            commands::begin_user_audio_capture,
            commands::append_user_audio_chunk,
            commands::discard_user_audio_capture,
            commands::finalize_user_audio_capture,
            commands::finalize_user_audio_capture_takes,
            commands::save_mix_version,
            commands::render_preview,
            commands::playback_sources,
            commands::read_preview_audio,
            commands::export_audio,
            commands::export_pcm_audio,
            commands::save_production_overlay,
            commands::load_production_overlay,
            commands::list_project_package_inventory,
            commands::export_project_package,
            commands::download_cache_file,
            commands::list_generations,
            commands::read_score_abc,
            commands::save_score,
            commands::load_score,
            commands::clear_score,
            commands::list_scores,
            commands::load_score_version,
            commands::set_active_score,
            commands::use_generation,
            commands::import_remote_generation,
            commands::undo_mix,
            commands::redo_mix,
            commands::install_sheetsage2,
            commands::cancel_sheetsage2_install,
            commands::sheetsage2_install_info,
            commands::sheetsage_probe,
            commands::sheetsage_transcribe,
            commands::sheetsage_cancel,
            commands::lora_train_probe,
            commands::lora_train_probe_audio,
            commands::lora_train_jobs_root,
            commands::lora_train_write_text,
            commands::lora_train_read_text,
            commands::lora_train_path_exists,
            commands::lora_train_mkdir,
            commands::lora_train_remove,
            commands::lora_train_launch,
            commands::lora_train_poll,
            commands::lora_train_cancel_process,
            commands::project_sync_list_artifacts,
            commands::project_sync_read_bytes,
            commands::project_sync_write_bytes,
            commands::project_sync_fs_root,
            commands::project_sync_fs_write,
            commands::project_sync_fs_read,
            commands::project_sync_fs_list,
            commands::project_sync_fs_delete,
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
