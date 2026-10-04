// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let mut args = std::env::args();
    let _exe = args.next();
    if args.next().as_deref() == Some("--vst3-spike-probe") {
        let path = args.next().unwrap_or_default();
        std::process::exit(song_maker_lib::vst3_spike_probe_exit(&path));
    }
    song_maker_lib::run();
}
