//! Native input capture via cpal (#330).
//!
//! Windows: WASAPI **shared** (cpal default). Not exclusive WASAPI, not ASIO.
//! macOS: Core Audio. Linux: ALSA (often via PipeWire/Pulse compatibility).
//! Round-trip figures are buffer-size estimates, not a speaker→mic loopback.

use crate::commands::capture::{capture_session_id_ok, ensure_user_audio_dirs};
use crate::library::{load_project, project_folder};
use crate::models::UserAudioCaptureSession;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, StreamConfig};
use hound::{SampleFormat as WavSampleFormat, WavSpec, WavWriter};
use serde::Serialize;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use uuid::Uuid;

const MAX_RECORD_MS: u64 = 10 * 60 * 1000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeCaptureBackend {
    pub host_api: String,
    pub exclusive: bool,
    pub asio: bool,
    pub platform: String,
    pub round_trip_measured: bool,
    pub notes_fr: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeInputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub buffer_frames: Option<u32>,
    pub estimated_round_trip_ms: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeCapturePoll {
    pub session_id: String,
    pub peak: f32,
    pub frames: u64,
    pub sample_rate: u32,
    pub channels: u16,
    pub buffer_frames: u32,
    pub estimated_round_trip_ms: u32,
    pub paused: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeCaptureStopResult {
    pub session_id: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub duration_ms: i64,
    pub sample_rate: u32,
    pub estimated_round_trip_ms: u32,
}

pub fn host_api_id() -> &'static str {
    #[cfg(windows)]
    {
        "wasapi-shared"
    }
    #[cfg(target_os = "macos")]
    {
        "coreaudio"
    }
    #[cfg(target_os = "linux")]
    {
        "alsa"
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        "unknown"
    }
}

pub fn backend_info() -> NativeCaptureBackend {
    NativeCaptureBackend {
        host_api: host_api_id().into(),
        exclusive: false,
        asio: false,
        platform: std::env::consts::OS.into(),
        round_trip_measured: false,
        notes_fr: "Capture native cpal : WASAPI partagé sous Windows, Core Audio sous macOS, ALSA sous Linux. WASAPI exclusif et ASIO ne sont pas livrés. Latence = estimation taille de tampon, pas une boucle haut-parleur → micro.".into(),
    }
}

pub fn estimated_round_trip_ms(sample_rate: u32, buffer_frames: u32) -> u32 {
    if sample_rate == 0 || buffer_frames == 0 {
        return 0;
    }
    let one_way_ms = f64::from(buffer_frames) * 1000.0 / f64::from(sample_rate);
    (one_way_ms * 2.0).round() as u32
}

fn buffer_frames_from_supported(cfg: &cpal::SupportedStreamConfig) -> u32 {
    match cfg.buffer_size() {
        cpal::SupportedBufferSize::Range { min, max } => {
            if *min > 0 {
                *min
            } else if *max > 0 {
                *max
            } else {
                0
            }
        }
        cpal::SupportedBufferSize::Unknown => 0,
    }
}

fn device_id(index: usize, name: &str) -> String {
    format!("{index}:{name}")
}

pub fn list_input_devices() -> Result<Vec<NativeInputDevice>, String> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());
    let iter = host
        .input_devices()
        .map_err(|e| format!("Périphériques d’entrée natifs inaccessibles : {e}"))?;
    let mut out = Vec::new();
    for (index, dev) in iter.enumerate() {
        let name = match dev.name() {
            Ok(n) if !n.trim().is_empty() => n,
            _ => format!("Entrée {index}"),
        };
        let cfg = dev.default_input_config().ok();
        let sample_rate = cfg.as_ref().map(|c| c.sample_rate().0);
        let channels = cfg.as_ref().map(|c| c.channels());
        let buffer_frames = cfg.as_ref().map(buffer_frames_from_supported);
        let estimated = match (sample_rate, buffer_frames) {
            (Some(sr), Some(bf)) => {
                let ms = estimated_round_trip_ms(sr, bf);
                if ms == 0 {
                    None
                } else {
                    Some(ms)
                }
            }
            _ => None,
        };
        let is_default = default_name.as_ref().is_some_and(|d| d == &name);
        out.push(NativeInputDevice {
            id: device_id(index, &name),
            name,
            is_default,
            sample_rate,
            channels,
            buffer_frames,
            estimated_round_trip_ms: estimated,
        });
    }
    Ok(out)
}

fn pick_device(wanted_id: Option<&str>) -> Result<(cpal::Device, String), String> {
    let host = cpal::default_host();
    if let Some(id) = wanted_id.map(str::trim).filter(|s| !s.is_empty()) {
        let devices: Vec<cpal::Device> = host
            .input_devices()
            .map_err(|e| format!("Périphériques d’entrée natifs inaccessibles : {e}"))?
            .collect();
        for (index, dev) in devices.into_iter().enumerate() {
            let name = dev.name().unwrap_or_default();
            if device_id(index, &name) == id {
                return Ok((dev, name));
            }
        }
        return Err("Périphérique d’entrée natif introuvable.".into());
    }
    let dev = host.default_input_device().ok_or_else(|| {
        "Aucun périphérique d’entrée natif. Repli WebView (getUserMedia).".to_string()
    })?;
    let name = dev.name().unwrap_or_else(|_| "Entrée par défaut".into());
    Ok((dev, name))
}

struct ActiveNativeCapture {
    session_id: String,
    relative_path: String,
    abs_path: PathBuf,
    stop: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    peak: Arc<AtomicU32>,
    frames: Arc<AtomicU64>,
    rates: Arc<Mutex<(u32, u16, u32)>>,
    join: Option<JoinHandle<Result<(), String>>>,
}

#[derive(Default)]
pub struct NativeCaptureState {
    inner: Mutex<Option<ActiveNativeCapture>>,
}

impl Drop for NativeCaptureState {
    fn drop(&mut self) {
        if let Ok(mut g) = self.inner.lock() {
            if let Some(mut active) = g.take() {
                active.stop.store(true, Ordering::SeqCst);
                if let Some(join) = active.join.take() {
                    let _ = join.join();
                }
            }
        }
    }
}

fn open_wav_writer(
    path: &std::path::Path,
    sample_rate: u32,
    channels: u16,
) -> Result<WavWriter<BufWriter<File>>, String> {
    let spec = WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: WavSampleFormat::Int,
    };
    WavWriter::create(path, spec).map_err(|e| format!("Création WAV capture : {e}"))
}

struct InputStreamSink {
    writer: Arc<Mutex<Option<WavWriter<BufWriter<File>>>>>,
    stop: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    peak: Arc<AtomicU32>,
    frames: Arc<AtomicU64>,
    channels: u16,
}

fn run_input_stream<T>(
    device: &cpal::Device,
    config: &StreamConfig,
    sink: InputStreamSink,
) -> Result<(), String>
where
    T: Sample + cpal::SizedSample + Send + 'static,
    i16: FromSample<T>,
    f32: FromSample<T>,
{
    let InputStreamSink {
        writer,
        stop,
        paused,
        peak,
        frames,
        channels,
    } = sink;
    let err_flag = Arc::new(Mutex::new(None::<String>));
    let err_cb = {
        let err_flag = Arc::clone(&err_flag);
        move |err: cpal::StreamError| {
            if let Ok(mut g) = err_flag.lock() {
                *g = Some(format!("Flux d’entrée natif interrompu : {err}"));
            }
        }
    };
    let stop_cb = Arc::clone(&stop);
    let paused_cb = Arc::clone(&paused);
    let peak_cb = Arc::clone(&peak);
    let frames_cb = Arc::clone(&frames);
    let writer_cb = Arc::clone(&writer);
    let stream = device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                if stop_cb.load(Ordering::Relaxed) {
                    return;
                }
                if paused_cb.load(Ordering::Relaxed) {
                    return;
                }
                let mut local_peak = 0.0f32;
                let mut pcm = Vec::with_capacity(data.len());
                for &sample in data {
                    let f = f32::from_sample(sample);
                    local_peak = local_peak.max(f.abs());
                    pcm.push(i16::from_sample(sample));
                }
                let milli = (local_peak.clamp(0.0, 1.0) * 1000.0).round() as u32;
                peak_cb.store(milli, Ordering::Relaxed);
                let nch = u64::from(channels.max(1));
                frames_cb.fetch_add((pcm.len() as u64) / nch, Ordering::Relaxed);
                if let Ok(mut g) = writer_cb.lock() {
                    if let Some(w) = g.as_mut() {
                        for s in pcm {
                            if w.write_sample(s).is_err() {
                                stop_cb.store(true, Ordering::SeqCst);
                                break;
                            }
                        }
                    }
                }
            },
            err_cb,
            None,
        )
        .map_err(|e| format!("Ouverture du flux d’entrée : {e}"))?;
    stream
        .play()
        .map_err(|e| format!("Démarrage du flux d’entrée : {e}"))?;
    while !stop.load(Ordering::Relaxed) {
        if let Ok(g) = err_flag.lock() {
            if let Some(msg) = g.as_ref() {
                return Err(msg.clone());
            }
        }
        let recorded_frames = frames.load(Ordering::Relaxed);
        let sr = config.sample_rate.0.max(1);
        let elapsed_ms = recorded_frames.saturating_mul(1000) / u64::from(sr);
        if elapsed_ms >= MAX_RECORD_MS {
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }
    drop(stream);
    Ok(())
}

fn spawn_capture_thread(
    device: cpal::Device,
    stop: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    peak: Arc<AtomicU32>,
    frames: Arc<AtomicU64>,
    abs_path: PathBuf,
    sample_rate: Arc<Mutex<(u32, u16, u32)>>,
) -> JoinHandle<Result<(), String>> {
    thread::spawn(move || {
        let supported = device
            .default_input_config()
            .map_err(|e| format!("Configuration d’entrée indisponible : {e}"))?;
        let sample_format = supported.sample_format();
        let mut config: StreamConfig = supported.clone().into();
        let buffer_frames = buffer_frames_from_supported(&supported);
        if buffer_frames > 0 {
            config.buffer_size = cpal::BufferSize::Fixed(buffer_frames);
        }
        let channels = config.channels;
        let sr = config.sample_rate.0;
        if let Ok(mut g) = sample_rate.lock() {
            *g = (sr, channels, buffer_frames);
        }
        let writer = Arc::new(Mutex::new(Some(open_wav_writer(&abs_path, sr, channels)?)));
        let make_sink = || InputStreamSink {
            writer: Arc::clone(&writer),
            stop: Arc::clone(&stop),
            paused: Arc::clone(&paused),
            peak: Arc::clone(&peak),
            frames: Arc::clone(&frames),
            channels,
        };
        let run = |cfg: &StreamConfig| match sample_format {
            SampleFormat::F32 => run_input_stream::<f32>(&device, cfg, make_sink()),
            SampleFormat::I16 => run_input_stream::<i16>(&device, cfg, make_sink()),
            SampleFormat::U16 => run_input_stream::<u16>(&device, cfg, make_sink()),
            other => Err(format!("Format d’échantillon natif non géré : {other:?}")),
        };
        let result = match run(&config) {
            Err(_e) if matches!(config.buffer_size, cpal::BufferSize::Fixed(_)) => {
                config.buffer_size = cpal::BufferSize::Default;
                run(&config)
            }
            other => other,
        };
        if let Ok(mut g) = writer.lock() {
            if let Some(w) = g.take() {
                let _ = w.finalize();
            }
        }
        result
    })
}

#[tauri::command]
pub fn native_capture_backend() -> NativeCaptureBackend {
    backend_info()
}

#[tauri::command]
pub fn list_native_capture_devices() -> Result<Vec<NativeInputDevice>, String> {
    list_input_devices()
}

#[tauri::command]
pub fn start_native_capture(
    state: tauri::State<NativeCaptureState>,
    id: String,
    device_id: Option<String>,
) -> Result<UserAudioCaptureSession, String> {
    let mut g = state
        .inner
        .lock()
        .map_err(|_| "Capture native occupée.".to_string())?;
    if g.is_some() {
        return Err("Une capture native est déjà en cours.".into());
    }
    let folder = project_folder(&id);
    let _ = load_project(&folder)?;
    ensure_user_audio_dirs(&folder)?;
    let (device, _name) = pick_device(device_id.as_deref())?;
    let session_id = Uuid::new_v4().to_string();
    if !capture_session_id_ok(&session_id) {
        return Err("Identifiant de session de capture invalide.".into());
    }
    let relative_path = format!("user-audio/capture/{session_id}.wav");
    let abs_path = folder.join(&relative_path);
    if let Some(parent) = abs_path.parent() {
        crate::paths::ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    let stop = Arc::new(AtomicBool::new(false));
    let paused = Arc::new(AtomicBool::new(false));
    let peak = Arc::new(AtomicU32::new(0));
    let frames = Arc::new(AtomicU64::new(0));
    let rates = Arc::new(Mutex::new((48_000u32, 1u16, 0u32)));
    let join = spawn_capture_thread(
        device,
        Arc::clone(&stop),
        Arc::clone(&paused),
        Arc::clone(&peak),
        Arc::clone(&frames),
        abs_path.clone(),
        Arc::clone(&rates),
    );
    // Give the audio thread a moment to open the device.
    thread::sleep(Duration::from_millis(80));
    if join.is_finished() {
        match join.join() {
            Ok(Ok(())) => {
                return Err("Le flux d’entrée natif s’est arrêté immédiatement.".into());
            }
            Ok(Err(e)) => return Err(e),
            Err(_) => return Err("Le flux d’entrée natif a planté au démarrage.".into()),
        }
    }
    *g = Some(ActiveNativeCapture {
        session_id: session_id.clone(),
        relative_path: relative_path.clone(),
        abs_path,
        stop,
        paused,
        peak,
        frames,
        rates,
        join: Some(join),
    });
    Ok(UserAudioCaptureSession {
        session_id,
        relative_path,
    })
}

#[tauri::command]
pub fn poll_native_capture(
    state: tauri::State<NativeCaptureState>,
) -> Result<Option<NativeCapturePoll>, String> {
    let g = state
        .inner
        .lock()
        .map_err(|_| "Capture native occupée.".to_string())?;
    let Some(active) = g.as_ref() else {
        return Ok(None);
    };
    let (sample_rate, channels, buffer_frames) =
        active.rates.lock().map(|g| *g).unwrap_or((48_000, 1, 0));
    Ok(Some(NativeCapturePoll {
        session_id: active.session_id.clone(),
        peak: active.peak.load(Ordering::Relaxed) as f32 / 1000.0,
        frames: active.frames.load(Ordering::Relaxed),
        sample_rate,
        channels,
        buffer_frames,
        estimated_round_trip_ms: estimated_round_trip_ms(sample_rate, buffer_frames),
        paused: active.paused.load(Ordering::Relaxed),
    }))
}

#[tauri::command]
pub fn pause_native_capture(
    state: tauri::State<NativeCaptureState>,
    paused: bool,
) -> Result<(), String> {
    let g = state
        .inner
        .lock()
        .map_err(|_| "Capture native occupée.".to_string())?;
    let Some(active) = g.as_ref() else {
        return Err("Aucune capture native en cours.".into());
    };
    active.paused.store(paused, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn stop_native_capture(
    state: tauri::State<NativeCaptureState>,
) -> Result<NativeCaptureStopResult, String> {
    let mut g = state
        .inner
        .lock()
        .map_err(|_| "Capture native occupée.".to_string())?;
    let Some(mut active) = g.take() else {
        return Err("Aucune capture native en cours.".into());
    };
    active.stop.store(true, Ordering::SeqCst);
    let join_err = if let Some(join) = active.join.take() {
        match join.join() {
            Ok(Ok(())) => None,
            Ok(Err(e)) => Some(e),
            Err(_) => Some("Le flux d’entrée natif a planté.".into()),
        }
    } else {
        None
    };
    let (sample_rate, _channels, buffer_frames) =
        active.rates.lock().map(|g| *g).unwrap_or((48_000, 1, 0));
    let frames = active.frames.load(Ordering::Relaxed);
    let sr = sample_rate.max(1);
    let duration_ms = (frames.saturating_mul(1000) / u64::from(sr)) as i64;
    if !active.abs_path.is_file() {
        return Err(join_err.unwrap_or_else(|| "Fichier de capture native absent.".into()));
    }
    let meta = std::fs::metadata(&active.abs_path).map_err(|e| e.to_string())?;
    if meta.len() < 64 {
        let _ = std::fs::remove_file(&active.abs_path);
        return Err(join_err.unwrap_or_else(|| "Enregistrement natif vide.".into()));
    }
    if let Some(e) = join_err {
        // Keep the file if we got samples; still report the stream error after stop.
        if duration_ms <= 0 {
            let _ = std::fs::remove_file(&active.abs_path);
            return Err(e);
        }
    }
    Ok(NativeCaptureStopResult {
        session_id: active.session_id,
        relative_path: active.relative_path,
        absolute_path: active.abs_path.display().to_string(),
        duration_ms,
        sample_rate,
        estimated_round_trip_ms: estimated_round_trip_ms(sample_rate, buffer_frames),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use hound::WavReader;

    #[test]
    fn backend_is_shared_mode_not_asio() {
        let info = backend_info();
        assert!(!info.exclusive);
        assert!(!info.asio);
        assert!(!info.round_trip_measured);
        assert!(
            info.host_api == "wasapi-shared"
                || info.host_api == "alsa"
                || info.host_api == "coreaudio"
                || info.host_api == "unknown"
        );
        assert!(info.notes_fr.contains("WASAPI"));
        assert!(info.notes_fr.contains("ASIO"));
    }

    #[test]
    fn round_trip_is_double_one_way_buffer() {
        assert_eq!(estimated_round_trip_ms(48_000, 480), 20);
        assert_eq!(estimated_round_trip_ms(0, 480), 0);
        assert_eq!(estimated_round_trip_ms(48_000, 0), 0);
    }

    #[test]
    fn wav_writer_roundtrip_pcm16() {
        let dir = std::env::temp_dir().join(format!("song-maker-native-cap-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.wav");
        {
            let mut w = open_wav_writer(&path, 48_000, 1).unwrap();
            for s in [0i16, 1234, -1234, 0] {
                w.write_sample(s).unwrap();
            }
            w.finalize().unwrap();
        }
        let mut r = WavReader::open(&path).unwrap();
        let samples: Vec<i16> = r.samples::<i16>().map(|s| s.unwrap()).collect();
        assert_eq!(samples, vec![0, 1234, -1234, 0]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_devices_does_not_panic() {
        match list_input_devices() {
            Ok(devs) => {
                for d in &devs {
                    assert!(!d.id.is_empty());
                    assert!(!d.name.is_empty());
                }
            }
            Err(e) => assert!(e.contains("inaccessibles")),
        }
    }
}
