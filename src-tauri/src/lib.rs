use tauri::Manager;

mod audiocpp;
mod commands;
mod demucs_onnx;
mod form;
mod hashutil;
mod health;
mod installer;
mod library;
mod mix;
mod models;
mod paths;
mod pins;
mod queue;
mod resample;

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
            commands::save_mix_version,
            commands::render_preview,
            commands::playback_sources,
            commands::read_preview_audio,
            commands::export_audio,
            commands::export_pcm_audio,
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
            commands::undo_mix,
            commands::redo_mix,
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
