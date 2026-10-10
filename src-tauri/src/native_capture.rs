//! Native input capture via cpal (#330).
//!
//! Windows: WASAPI shared (cpal default) or exclusive. Not ASIO.
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
use std::sync::mpsc::{self, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use uuid::Uuid;

const MAX_RECORD_MS: u64 = 10 * 60 * 1000;
const AUDIO_WRITE_QUEUE_BUFFERS: usize = 16;

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
    pub wasapi_device_id: Option<String>,
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
    pub warning: Option<String>,
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
        notes_fr: backend_notes(),
    }
}

fn backend_notes() -> String {
    #[cfg(windows)]
    {
        "Windows : WASAPI partagé ou exclusif. ASIO n’est pas livré. Le délai affiché est une estimation de tampon, pas une mesure entrée-sortie.".into()
    }
    #[cfg(target_os = "macos")]
    {
        "macOS : Core Audio. Le délai affiché est une estimation de tampon, pas une mesure entrée-sortie.".into()
    }
    #[cfg(target_os = "linux")]
    {
        "Linux : ALSA, souvent via PipeWire ou PulseAudio. Le délai affiché est une estimation de tampon, pas une mesure entrée-sortie.".into()
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        "Capture audio native indisponible sur cette plateforme.".into()
    }
}

pub fn estimated_round_trip_ms(sample_rate: u32, buffer_frames: u32) -> u32 {
    if sample_rate == 0 || buffer_frames == 0 {
        return 0;
    }
    let one_way_ms = f64::from(buffer_frames) * 1000.0 / f64::from(sample_rate);
    (one_way_ms * 2.0).round() as u32
}

fn preferred_buffer_frames(size: &cpal::SupportedBufferSize) -> u32 {
    match size {
        // A supported range is not the active buffer size. In particular,
        // Windows drivers may report 0..u32::MAX when the host chooses the
        // actual size. Treat that as unknown and keep CPAL's default instead
        // of forcing the (possibly enormous) maximum as a fixed buffer.
        cpal::SupportedBufferSize::Range { min, .. } => *min,
        cpal::SupportedBufferSize::Unknown => 0,
    }
}

fn buffer_frames_from_supported(cfg: &cpal::SupportedStreamConfig) -> u32 {
    preferred_buffer_frames(cfg.buffer_size())
}

fn device_id(index: usize, name: &str) -> String {
    format!("{index}:{name}")
}

pub fn list_input_devices() -> Result<Vec<NativeInputDevice>, String> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());
    #[cfg(windows)]
    let mut wasapi_ids_by_name = wasapi_capture_ids_by_name();
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
        #[cfg(windows)]
        let wasapi_device_id = wasapi_ids_by_name
            .get_mut(&name)
            .and_then(|ids| ids.pop_front());
        #[cfg(not(windows))]
        let wasapi_device_id = None;
        out.push(NativeInputDevice {
            id: device_id(index, &name),
            name,
            is_default,
            sample_rate,
            channels,
            buffer_frames,
            estimated_round_trip_ms: estimated,
            wasapi_device_id,
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
    capture_sync: CaptureSync,
    peak: Arc<AtomicU32>,
    frames: Arc<AtomicU64>,
    rates: Arc<Mutex<(u32, u16, u32)>>,
    join: Option<JoinHandle<Result<(), String>>>,
}

#[derive(Clone)]
struct CaptureSync {
    paused: Arc<AtomicBool>,
    gate: Arc<Mutex<()>>,
}

#[derive(Default)]
pub struct NativeCaptureState {
    inner: Mutex<Option<ActiveNativeCapture>>,
}

impl Drop for NativeCaptureState {
    fn drop(&mut self) {
        if let Ok(mut g) = self.inner.lock() {
            if let Some(mut active) = g.take() {
                transition_capture_state(&active.capture_sync.gate, &active.stop, true);
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
    writer: SyncSender<Vec<i16>>,
    stop: Arc<AtomicBool>,
    capture_sync: CaptureSync,
    peak: Arc<AtomicU32>,
    frames: Arc<AtomicU64>,
    queue_overflow: Arc<AtomicBool>,
    channels: u16,
}

/// Serializes accepted sample blocks with pause/stop transitions so no block can
/// be appended after a completed pause or stop command.
fn with_active_capture<T>(
    gate: &Mutex<()>,
    stop: &AtomicBool,
    paused: &AtomicBool,
    capture: impl FnOnce() -> T,
) -> Option<T> {
    let _guard = gate.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if stop.load(Ordering::Relaxed) || paused.load(Ordering::Relaxed) {
        return None;
    }
    Some(capture())
}

fn transition_capture_state(gate: &Mutex<()>, state: &AtomicBool, value: bool) {
    let _guard = gate.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    state.store(value, Ordering::SeqCst);
}

fn enqueue_capture_samples(
    writer: &SyncSender<Vec<i16>>,
    pcm: Vec<i16>,
    channels: u16,
    frames: &AtomicU64,
    stop: &AtomicBool,
    queue_overflow: &AtomicBool,
) {
    let captured_frames = (pcm.len() as u64) / u64::from(channels.max(1));
    match writer.try_send(pcm) {
        Ok(()) => {
            frames.fetch_add(captured_frames, Ordering::Relaxed);
        }
        Err(TrySendError::Full(_)) => {
            queue_overflow.store(true, Ordering::SeqCst);
            stop.store(true, Ordering::SeqCst);
        }
        Err(TrySendError::Disconnected(_)) => {
            stop.store(true, Ordering::SeqCst);
        }
    }
}

fn write_capture_samples(
    path: PathBuf,
    sample_rate: u32,
    channels: u16,
    samples: mpsc::Receiver<Vec<i16>>,
    stop: Arc<AtomicBool>,
    write_error: Arc<Mutex<Option<String>>>,
) -> Result<(), String> {
    let mut writer = match open_wav_writer(&path, sample_rate, channels) {
        Ok(writer) => writer,
        Err(error) => {
            if let Ok(mut stored) = write_error.lock() {
                *stored = Some(error.clone());
            }
            stop.store(true, Ordering::SeqCst);
            return Err(error);
        }
    };

    for chunk in samples {
        for sample in chunk {
            if let Err(error) = writer.write_sample(sample) {
                let message = format!("Écriture du fichier de capture native : {error}");
                if let Ok(mut stored) = write_error.lock() {
                    *stored = Some(message.clone());
                }
                stop.store(true, Ordering::SeqCst);
                return Err(message);
            }
        }
    }

    writer.finalize().map_err(|error| {
        let message = format!("Finalisation du fichier de capture native : {error}");
        if let Ok(mut stored) = write_error.lock() {
            *stored = Some(message.clone());
        }
        stop.store(true, Ordering::SeqCst);
        message
    })
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
        capture_sync,
        peak,
        frames,
        queue_overflow,
        channels,
    } = sink;
    let CaptureSync { paused, gate } = capture_sync;
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
    let capture_gate_cb = Arc::clone(&gate);
    let peak_cb = Arc::clone(&peak);
    let frames_cb = Arc::clone(&frames);
    let writer_cb = writer.clone();
    let queue_overflow_cb = Arc::clone(&queue_overflow);
    let stream = device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                if stop_cb.load(Ordering::Relaxed) {
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
                with_active_capture(&capture_gate_cb, &stop_cb, &paused_cb, || {
                    peak_cb.store(milli, Ordering::Relaxed);
                    enqueue_capture_samples(
                        &writer_cb,
                        pcm,
                        channels,
                        &frames_cb,
                        &stop_cb,
                        &queue_overflow_cb,
                    );
                });
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
    if queue_overflow.load(Ordering::SeqCst) {
        return Err(
            "Le disque ne suit pas le débit de capture ; la prise a été arrêtée pour éviter un fichier incomplet."
                .into(),
        );
    }
    Ok(())
}

fn spawn_capture_thread(
    device: cpal::Device,
    stop: Arc<AtomicBool>,
    capture_sync: CaptureSync,
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
        let (writer, samples) = mpsc::sync_channel(AUDIO_WRITE_QUEUE_BUFFERS);
        let write_error = Arc::new(Mutex::new(None::<String>));
        let write_error_thread = Arc::clone(&write_error);
        let stop_writer = Arc::clone(&stop);
        let writer_path = abs_path.clone();
        let writer_join = thread::spawn(move || {
            write_capture_samples(
                writer_path,
                sr,
                channels,
                samples,
                stop_writer,
                write_error_thread,
            )
        });
        let queue_overflow = Arc::new(AtomicBool::new(false));
        let result = {
            let make_sink = || InputStreamSink {
                writer: writer.clone(),
                stop: Arc::clone(&stop),
                capture_sync: capture_sync.clone(),
                peak: Arc::clone(&peak),
                frames: Arc::clone(&frames),
                queue_overflow: Arc::clone(&queue_overflow),
                channels,
            };
            let run = |cfg: &StreamConfig| match sample_format {
                SampleFormat::F32 => run_input_stream::<f32>(&device, cfg, make_sink()),
                SampleFormat::I16 => run_input_stream::<i16>(&device, cfg, make_sink()),
                SampleFormat::U16 => run_input_stream::<u16>(&device, cfg, make_sink()),
                other => Err(format!("Format d’échantillon natif non géré : {other:?}")),
            };
            match run(&config) {
                Err(_e) if matches!(config.buffer_size, cpal::BufferSize::Fixed(_)) => {
                    config.buffer_size = cpal::BufferSize::Default;
                    run(&config)
                }
                other => other,
            }
        };
        drop(writer);
        let writer_result = match writer_join.join() {
            Ok(result) => result,
            Err(_) => Err("Le thread d’écriture de la capture native a planté.".into()),
        };
        match result {
            Err(error) => Err(error),
            Ok(()) => match writer_result {
                Err(error) => Err(error),
                Ok(()) => write_error
                    .lock()
                    .map_err(|_| "État d’écriture de capture inaccessible.".to_string())?
                    .clone()
                    .map_or(Ok(()), Err),
            },
        }
    })
}

#[cfg(windows)]
fn wasapi_capture_ids_by_name(
) -> std::collections::HashMap<String, std::collections::VecDeque<String>> {
    std::thread::spawn(|| {
        use wasapi::{DeviceEnumerator, Direction};

        if wasapi::initialize_mta().ok().is_err() {
            return Vec::new();
        }
        let devices = (|| {
            let enumerator = DeviceEnumerator::new().map_err(|e| e.to_string())?;
            let collection = enumerator
                .get_device_collection(&Direction::Capture)
                .map_err(|e| e.to_string())?;
            let mut devices = Vec::new();
            for index in 0..collection.get_nbr_devices().map_err(|e| e.to_string())? {
                let device = collection
                    .get_device_at_index(index)
                    .map_err(|e| e.to_string())?;
                devices.push((
                    device.get_friendlyname().map_err(|e| e.to_string())?,
                    device.get_id().map_err(|e| e.to_string())?,
                ));
            }
            Ok::<_, String>(devices)
        })();
        wasapi::deinitialize();
        devices.unwrap_or_default()
    })
    .join()
    .unwrap_or_default()
    .into_iter()
    .fold(
        std::collections::HashMap::new(),
        |mut by_name, (name, id)| {
            by_name
                .entry(name)
                .or_insert_with(std::collections::VecDeque::new)
                .push_back(id);
            by_name
        },
    )
}

#[cfg(windows)]
fn spawn_wasapi_exclusive_capture_thread(
    endpoint_id: String,
    stop: Arc<AtomicBool>,
    capture_sync: CaptureSync,
    peak: Arc<AtomicU32>,
    frames: Arc<AtomicU64>,
    abs_path: PathBuf,
    sample_rate: Arc<Mutex<(u32, u16, u32)>>,
) -> JoinHandle<Result<(), String>> {
    thread::spawn(move || {
        use wasapi::{DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};

        if wasapi::initialize_mta().ok().is_err() {
            return Err("Impossible d’initialiser le moteur audio Windows.".into());
        }
        let result = (|| {
            let enumerator =
                DeviceEnumerator::new().map_err(|e| format!("Ouverture WASAPI : {e}"))?;
            let device = enumerator
                .get_device(&endpoint_id)
                .map_err(|e| format!("Entrée WASAPI introuvable : {e}"))?;
            let mut client = device
                .get_iaudioclient()
                .map_err(|e| format!("Ouverture de l’entrée WASAPI : {e}"))?;

            let mut supported_format = None;
            for (rate, channels) in [
                (48_000usize, 2usize),
                (44_100, 2),
                (48_000, 1),
                (44_100, 1),
                (96_000, 2),
                (96_000, 1),
                (32_000, 1),
                (16_000, 1),
            ] {
                let requested = WaveFormat::new(16, 16, &SampleType::Int, rate, channels, None);
                if let Ok(format) = client.is_supported_exclusive_with_quirks(&requested) {
                    supported_format = Some(format);
                    break;
                }
            }
            let format = supported_format.ok_or_else(|| {
                "Cette entrée ne propose pas de format PCM 16 bits compatible en mode exclusif. Essayez le mode partagé.".to_string()
            })?;
            let actual_sample_rate = format.get_samplespersec();
            let channels = format.get_nchannels();
            let block_align = format.get_blockalign() as usize;
            let (default_period, minimum_period) = client
                .get_device_period()
                .map_err(|e| format!("Lecture de la période WASAPI : {e}"))?;
            let period_hns = default_period.max(minimum_period).max(1);
            let mode = StreamMode::PollingExclusive {
                buffer_duration_hns: period_hns.saturating_mul(2),
                period_hns,
            };
            client
                .initialize_client(&format, &Direction::Capture, &mode)
                .map_err(|e| format!("L’entrée audio est occupée ou refuse le mode exclusif : {e}. Fermez les autres applications audio ou revenez au mode partagé."))?;
            let buffer_frames = client
                .get_buffer_size()
                .map_err(|e| format!("Lecture du tampon WASAPI : {e}"))?;
            if let Ok(mut current) = sample_rate.lock() {
                *current = (actual_sample_rate, channels, buffer_frames);
            }
            let writer = Arc::new(Mutex::new(Some(open_wav_writer(
                &abs_path,
                actual_sample_rate,
                channels,
            )?)));
            let capture = client
                .get_audiocaptureclient()
                .map_err(|e| format!("Ouverture du flux de capture WASAPI : {e}"))?;
            client
                .start_stream()
                .map_err(|e| format!("Démarrage de la capture WASAPI exclusive : {e}"))?;

            let capture_result = (|| {
                while !stop.load(Ordering::Relaxed) {
                    let available = client
                        .get_current_padding()
                        .map_err(|e| format!("Lecture du tampon de capture WASAPI : {e}"))?;
                    if available > 0 {
                        let byte_count = (available as usize)
                            .checked_mul(block_align)
                            .ok_or_else(|| "Tampon WASAPI trop grand.".to_string())?;
                        let mut raw = vec![0u8; byte_count];
                        let (read_frames, info) = capture
                            .read_from_device(&mut raw)
                            .map_err(|e| format!("Lecture de l’entrée WASAPI : {e}"))?;
                        if info.flags.silent {
                            raw.fill(0);
                        }
                        if read_frames > 0 {
                            let sample_count = (read_frames as usize)
                                .checked_mul(channels as usize)
                                .ok_or_else(|| "Paquet audio WASAPI trop grand.".to_string())?;
                            let mut pcm = Vec::with_capacity(sample_count);
                            let mut local_peak = 0.0f32;
                            for bytes in raw[..sample_count * 2].chunks_exact(2) {
                                let sample = i16::from_le_bytes([bytes[0], bytes[1]]);
                                local_peak = local_peak.max((sample as f32 / 32768.0).abs());
                                pcm.push(sample);
                            }
                            if let Some(write_result) = with_active_capture(
                                &capture_sync.gate,
                                &stop,
                                &capture_sync.paused,
                                || {
                                    let write = (|| {
                                        let mut output = writer.lock().map_err(|_| {
                                            "Écriture WAV WASAPI inaccessible.".to_string()
                                        })?;
                                        let output = output.as_mut().ok_or_else(|| {
                                            "Écriture WAV WASAPI déjà finalisée.".to_string()
                                        })?;
                                        for sample in pcm {
                                            output
                                                .write_sample(sample)
                                                .map_err(|e| e.to_string())?;
                                        }
                                        Ok::<(), String>(())
                                    })();
                                    if write.is_ok() {
                                        peak.store(
                                            (local_peak.clamp(0.0, 1.0) * 1000.0).round() as u32,
                                            Ordering::Relaxed,
                                        );
                                        frames.fetch_add(read_frames as u64, Ordering::Relaxed);
                                    }
                                    write
                                },
                            ) {
                                write_result?;
                            }
                        }
                    }
                    let elapsed_ms = frames.load(Ordering::Relaxed).saturating_mul(1000)
                        / u64::from(actual_sample_rate.max(1));
                    if elapsed_ms >= MAX_RECORD_MS {
                        break;
                    }
                    thread::sleep(Duration::from_millis(2));
                }
                Ok::<(), String>(())
            })();
            let stop_result = client
                .stop_stream()
                .map_err(|e| format!("Arrêt de la capture WASAPI : {e}"));
            if let Ok(mut output) = writer.lock() {
                if let Some(output) = output.take() {
                    output.finalize().map_err(|e| e.to_string())?;
                }
            }
            capture_result?;
            stop_result
        })();
        wasapi::deinitialize();
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
    backend: Option<String>,
) -> Result<UserAudioCaptureSession, String> {
    let mut g = state
        .inner
        .lock()
        .map_err(|_| "Capture native occupée.".to_string())?;
    if g.is_some() {
        return Err("Une capture native est déjà en cours.".into());
    }
    let selected_backend = backend.as_deref().unwrap_or("shared");
    if !matches!(selected_backend, "shared" | "exclusive") {
        return Err("Mode d’enregistrement natif inconnu.".into());
    }
    let folder = project_folder(&id);
    let _ = load_project(&folder)?;
    ensure_user_audio_dirs(&folder)?;
    #[cfg(windows)]
    let exclusive_endpoint = if selected_backend == "exclusive" {
        let devices = list_input_devices()?;
        let selected = match device_id.as_deref() {
            Some(wanted) => devices
                .iter()
                .find(|device| device.id == wanted)
                .ok_or_else(|| "Le périphérique sélectionné n’est plus disponible.".to_string())?,
            None => devices
                .iter()
                .find(|device| device.is_default)
                .or_else(|| devices.first())
                .ok_or_else(|| "Aucun périphérique d’entrée natif.".to_string())?,
        };
        Some(selected.wasapi_device_id.clone().ok_or_else(|| {
            "Le mode exclusif n’est pas disponible pour cette entrée. Choisissez le mode partagé.".to_string()
        })?)
    } else {
        None
    };
    #[cfg(not(windows))]
    if selected_backend == "exclusive" {
        return Err("Le mode exclusif WASAPI est disponible uniquement sous Windows.".into());
    }
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
    let capture_sync = CaptureSync {
        paused: Arc::new(AtomicBool::new(false)),
        gate: Arc::new(Mutex::new(())),
    };
    let peak = Arc::new(AtomicU32::new(0));
    let frames = Arc::new(AtomicU64::new(0));
    let rates = Arc::new(Mutex::new((48_000u32, 1u16, 0u32)));
    #[cfg(windows)]
    let join = if let Some(endpoint_id) = exclusive_endpoint {
        spawn_wasapi_exclusive_capture_thread(
            endpoint_id,
            Arc::clone(&stop),
            capture_sync.clone(),
            Arc::clone(&peak),
            Arc::clone(&frames),
            abs_path.clone(),
            Arc::clone(&rates),
        )
    } else {
        let (device, _name) = pick_device(device_id.as_deref())?;
        spawn_capture_thread(
            device,
            Arc::clone(&stop),
            capture_sync.clone(),
            Arc::clone(&peak),
            Arc::clone(&frames),
            abs_path.clone(),
            Arc::clone(&rates),
        )
    };
    #[cfg(not(windows))]
    let join = {
        let (device, _name) = pick_device(device_id.as_deref())?;
        spawn_capture_thread(
            device,
            Arc::clone(&stop),
            capture_sync.clone(),
            Arc::clone(&peak),
            Arc::clone(&frames),
            abs_path.clone(),
            Arc::clone(&rates),
        )
    };
    // Give the audio thread a moment to open the device.
    thread::sleep(Duration::from_millis(80));
    if join.is_finished() {
        match join.join() {
            Ok(Ok(())) => {
                return Err("Le flux d’entrée natif s’est arrêté immédiatement.".into());
            }
            Ok(Err(e)) => {
                let _ = std::fs::remove_file(&abs_path);
                return Err(e);
            }
            Err(_) => {
                let _ = std::fs::remove_file(&abs_path);
                return Err("Le flux d’entrée natif a planté au démarrage.".into());
            }
        }
    }
    *g = Some(ActiveNativeCapture {
        session_id: session_id.clone(),
        relative_path: relative_path.clone(),
        abs_path,
        stop,
        capture_sync,
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
        paused: active.capture_sync.paused.load(Ordering::Relaxed),
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
    transition_capture_state(
        &active.capture_sync.gate,
        &active.capture_sync.paused,
        paused,
    );
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
    transition_capture_state(&active.capture_sync.gate, &active.stop, true);
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
    let warning = match join_err {
        Some(error) if duration_ms <= 0 => {
            let _ = std::fs::remove_file(&active.abs_path);
            return Err(error);
        }
        Some(error) => Some(error),
        None => None,
    };
    Ok(NativeCaptureStopResult {
        session_id: active.session_id,
        relative_path: active.relative_path,
        absolute_path: active.abs_path.display().to_string(),
        duration_ms,
        sample_rate,
        estimated_round_trip_ms: estimated_round_trip_ms(sample_rate, buffer_frames),
        warning,
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
        #[cfg(windows)]
        assert!(info.notes_fr.contains("WASAPI"));
        #[cfg(target_os = "macos")]
        assert!(info.notes_fr.contains("Core Audio"));
        #[cfg(target_os = "linux")]
        assert!(info.notes_fr.contains("ALSA"));
        #[cfg(windows)]
        assert!(info.notes_fr.contains("ASIO"));
    }

    #[test]
    fn round_trip_is_double_one_way_buffer() {
        assert_eq!(estimated_round_trip_ms(48_000, 480), 20);
        assert_eq!(estimated_round_trip_ms(0, 480), 0);
        assert_eq!(estimated_round_trip_ms(48_000, 0), 0);
    }

    #[test]
    fn unknown_buffer_range_does_not_become_the_maximum() {
        let range = cpal::SupportedBufferSize::Range {
            min: 0,
            max: u32::MAX,
        };
        assert_eq!(preferred_buffer_frames(&range), 0);

        let range = cpal::SupportedBufferSize::Range {
            min: 128,
            max: 2048,
        };
        assert_eq!(preferred_buffer_frames(&range), 128);
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
    fn queued_writer_drains_samples_and_finalizes_wav() {
        let dir = std::env::temp_dir().join(format!("song-maker-native-queue-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("queued.wav");
        let (sender, receiver) = mpsc::sync_channel(1);
        let stop = Arc::new(AtomicBool::new(false));
        let write_error = Arc::new(Mutex::new(None));
        let writer_stop = Arc::clone(&stop);
        let writer_error = Arc::clone(&write_error);
        let writer = thread::spawn(move || {
            write_capture_samples(path, 48_000, 1, receiver, writer_stop, writer_error)
        });
        sender.send(vec![0i16, 1234, -1234, 0]).unwrap();
        drop(sender);

        writer.join().unwrap().unwrap();
        let mut reader = WavReader::open(dir.join("queued.wav")).unwrap();
        let samples: Vec<i16> = reader.samples::<i16>().map(|s| s.unwrap()).collect();
        drop(reader);
        assert_eq!(samples, vec![0, 1234, -1234, 0]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn full_audio_queue_stops_capture_instead_of_blocking() {
        let (sender, _receiver) = mpsc::sync_channel(1);
        let frames = AtomicU64::new(0);
        let stop = AtomicBool::new(false);
        let queue_overflow = AtomicBool::new(false);

        enqueue_capture_samples(&sender, vec![0i16; 64], 2, &frames, &stop, &queue_overflow);
        enqueue_capture_samples(&sender, vec![0i16; 64], 2, &frames, &stop, &queue_overflow);

        assert_eq!(frames.load(Ordering::Relaxed), 32);
        assert!(stop.load(Ordering::SeqCst));
        assert!(queue_overflow.load(Ordering::SeqCst));
    }

    #[test]
    fn pause_waits_for_in_flight_chunk_and_rejects_later_chunks() {
        let gate = Arc::new(Mutex::new(()));
        let stop = Arc::new(AtomicBool::new(false));
        let paused = Arc::new(AtomicBool::new(false));
        let captured_frames = Arc::new(AtomicU64::new(0));
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();

        let callback_gate = Arc::clone(&gate);
        let callback_stop = Arc::clone(&stop);
        let callback_paused = Arc::clone(&paused);
        let callback_frames = Arc::clone(&captured_frames);
        let callback = thread::spawn(move || {
            with_active_capture(&callback_gate, &callback_stop, &callback_paused, || {
                entered_tx.send(()).unwrap();
                release_rx.recv().unwrap();
                callback_frames.fetch_add(480, Ordering::Relaxed);
            });
        });
        entered_rx.recv().unwrap();

        let pause_gate = Arc::clone(&gate);
        let pause_state = Arc::clone(&paused);
        let (pause_started_tx, pause_started_rx) = mpsc::channel();
        let (pause_finished_tx, pause_finished_rx) = mpsc::channel();
        let pause = thread::spawn(move || {
            pause_started_tx.send(()).unwrap();
            transition_capture_state(&pause_gate, &pause_state, true);
            pause_finished_tx.send(()).unwrap();
        });
        pause_started_rx.recv().unwrap();
        assert!(pause_finished_rx
            .recv_timeout(Duration::from_millis(50))
            .is_err());

        release_tx.send(()).unwrap();
        callback.join().unwrap();
        pause_finished_rx
            .recv_timeout(Duration::from_secs(1))
            .unwrap();
        pause.join().unwrap();

        assert_eq!(captured_frames.load(Ordering::Relaxed), 480);
        assert!(with_active_capture(&gate, &stop, &paused, || {
            captured_frames.fetch_add(480, Ordering::Relaxed);
        })
        .is_none());
        assert_eq!(captured_frames.load(Ordering::Relaxed), 480);
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
