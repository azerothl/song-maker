use tauri::Manager;

mod audiocpp;
mod commands;
mod form;
mod hashutil;
mod health;
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
    let state = AppState::default();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::get_health,
            commands::get_settings,
            commands::update_settings,
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
            commands::start_separation,
            commands::load_mix,
            commands::update_mix,
            commands::save_mix_version,
            commands::render_preview,
            commands::export_audio,
            commands::list_generations,
            commands::read_score_abc,
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
