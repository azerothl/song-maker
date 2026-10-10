use tauri::Manager;

mod abc_metadata;
mod ace_step;
mod ace_step_lego;
mod audiocpp;
mod basicpitch;
mod batch;
mod batch_admission;
mod batch_workers;
mod bs_roformer;
mod commands;
mod declui_host;
mod demucs_onnx;
mod device_admission;
mod form;
mod hashutil;
mod health;
mod house_model;
mod installer;
mod library;
mod lora_train;
mod mel_band_roformer;
mod mix;
mod models;
mod native_capture;
mod paths;
mod pins;
mod profile_switch;
mod profiles;
mod project_sync;
mod project_transaction;
mod queue;
mod rbitnet;
mod resample;
mod sheetsage;
mod vst3_host;
mod vst3_spike;

#[cfg(test)]
mod test_docs_env;

use commands::AppState;

/// Entrée CLI `song-maker --vst3-spike-probe <binaire>` (isolation crash, spike #326).
pub fn vst3_spike_probe_exit(binary: &str) -> i32 {
    vst3_spike::probe_exit(binary)
}

/// Entry point for the isolated offline VST3 processing worker.
pub fn vst3_host_worker_exit(request: &str, response: &str) -> i32 {
    vst3_host::worker_exit(request, response)
}

/// Entry point for the isolated native VST3 editor process.
pub fn vst3_editor_worker_exit(request: &str, response: &str) -> i32 {
    vst3_host::editor_worker_exit(request, response)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = profiles::init_profile_system();
    let _ = library::recover_generation_jobs();
    let _ = batch::recover_batches();
    let state = AppState::default();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .manage(commands::midi_output::MidiOutputState::default())
        .manage(native_capture::NativeCaptureState::default())
        .manage(declui_host::EmbeddedDeclUiState::default())
        .invoke_handler(tauri::generate_handler![
            commands::midi_output::list_midi_outputs,
            commands::midi_output::midi_output_support,
            commands::midi_output::connect_midi_output,
            commands::midi_output::play_midi_output,
            commands::midi_output::panic_midi_output,
            commands::midi_output::disconnect_midi_output,
            commands::mix_assistant::propose_qwen_mix,
            commands::rbitnet_cmds::rbitnet_status,
            commands::rbitnet_cmds::rbitnet_install_info,
            commands::rbitnet_cmds::install_rbitnet_binary,
            commands::rbitnet_cmds::install_rbitnet_model,
            commands::rbitnet_cmds::cancel_rbitnet_install,
            commands::rbitnet_cmds::ensure_rbitnet_sidecar,
            // Réglages, santé, installation des modèles
            commands::settings::get_health,
            commands::settings::restart_audio_runtime,
            commands::settings::get_setup_gpu_info,
            commands::settings::get_install_plan,
            commands::settings::install_required_assets,
            commands::settings::install_mix_only_assets,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_phase3_status,
            commands::settings::install_htdemucs_6s_runtime,
            commands::settings::install_bs_roformer,
            commands::settings::cancel_bs_roformer_install,
            commands::settings::bs_roformer_install_info,
            commands::settings::install_mel_band_roformer,
            commands::settings::cancel_mel_band_roformer_install,
            commands::settings::mel_band_roformer_install_info,
            commands::ace_step_cmds::install_ace_step,
            commands::ace_step_cmds::cancel_ace_step_install,
            commands::ace_step_cmds::ace_step_install_info,
            commands::ace_step_lego_cmds::ace_step_lego_status,
            commands::ace_step_lego_cmds::ace_step_lego_install_info,
            commands::ace_step_lego_cmds::install_ace_step_lego,
            commands::ace_step_lego_cmds::cancel_ace_step_lego_install,
            commands::ace_step_lego_cmds::ensure_ace_step_lego_sidecar,
            commands::settings::list_lora_adapters,
            commands::settings::import_lora_adapters,
            commands::settings::confirm_model_pack,
            declui_host::embedded_declui_status,
            declui_host::start_embedded_declui_host,
            declui_host::stop_embedded_declui_host,
            vst3_spike::vst3_spike_status,
            vst3_spike::vst3_spike_scan,
            vst3_spike::vst3_spike_load,
            vst3_spike::vst3_spike_attach,
            vst3_host::vst3_list_plugins,
            vst3_host::vst3_plugin_parameters,
            vst3_host::vst3_process_pcm,
            vst3_host::vst3_open_plugin_editor,
            commands::capture::vst3_render_midi_preview,
            commands::capture::vst3_render_midi_to_mix_track,
            // Profils (#201)
            commands::profiles::get_profiles_state,
            commands::profiles::create_profile,
            commands::profiles::rename_profile,
            commands::profiles::activate_profile,
            commands::profiles::dismiss_profile_migration_banner,
            commands::profiles::accept_engine_contract,
            // Projets
            commands::projects::list_projects,
            commands::projects::create_project,
            commands::projects::open_project,
            commands::projects::save_project_form,
            commands::projects::rename_project,
            commands::projects::duplicate_project,
            commands::projects::delete_project,
            commands::projects::reveal_project,
            commands::user_library::get_user_library,
            commands::user_library::save_user_library,
            // File de jobs GPU
            commands::jobs::get_job_status,
            commands::jobs::cancel_job,
            // Génération
            commands::generation::start_generation,
            commands::generation::generate_instrumental_part,
            commands::generation::generate_comparison_take,
            commands::batch_cmds::validate_batch_import,
            commands::batch_cmds::update_batch_preview,
            commands::batch_cmds::start_batch,
            commands::batch_capacity::verify_batch_parallelism,
            commands::batch_cmds::list_batches,
            commands::batch_cmds::get_batch_status,
            commands::batch_cmds::pause_batch,
            commands::batch_cmds::resume_batch,
            commands::batch_cmds::cancel_batch,
            commands::batch_cmds::cancel_batch_task,
            commands::batch_cmds::retry_batch_tasks,
            commands::batch_cmds::export_batch_results,
            commands::batch_cmds::download_batch_example,
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
            commands::mix::add_empty_midi_track,
            commands::mix::update_mix,
            commands::mix::undo_mix,
            commands::mix::redo_mix,
            commands::mix::save_mix_version,
            commands::mix::list_mix_versions,
            commands::mix::render_preview,
            commands::mix::playback_sources,
            commands::mix::read_preview_audio,
            commands::mix::export_audio,
            commands::mix::export_pcm_audio,
            // Capture et import audio utilisateur
            commands::capture::import_user_audio_track,
            commands::capture::import_generation_as_user_track,
            commands::capture::begin_user_audio_capture,
            commands::capture::append_user_audio_chunk,
            commands::capture::discard_user_audio_capture,
            commands::capture::finalize_user_audio_capture,
            commands::capture::finalize_user_audio_capture_takes,
            native_capture::native_capture_backend,
            native_capture::list_native_capture_devices,
            native_capture::start_native_capture,
            native_capture::poll_native_capture,
            native_capture::pause_native_capture,
            native_capture::stop_native_capture,
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
            commands::basicpitch_cmds::transcribe_basicpitch,
            // Versions
            commands::versions::use_generation,
            commands::versions::rename_generation,
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
                state.rbitnet.shutdown();
                state.ace_step_lego.shutdown();
                let declui = app.state::<declui_host::EmbeddedDeclUiState>();
                declui_host::shutdown_embedded_declui_host_on_exit(&declui);
            }
        });
}
