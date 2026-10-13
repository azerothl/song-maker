//! Persistent native VST3 playback graph. The device stream stays open while the Studio
//! transport is mounted; project inserts are hosted by `RealtimePluginRunner` on its audio
//! callback instead of spawning an offline worker for each playback bake.

use serde::{Deserialize, Serialize};
use std::sync::{mpsc, Mutex};

const REALTIME_BLOCK_SIZE: usize = 512;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeClip {
    pub start_ms: i64,
    pub offset_ms: i64,
    pub duration_ms: i64,
    pub fade_in_ms: i64,
    pub fade_out_ms: i64,
    pub gain_db: f32,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeMidiNote {
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub pitch: u8,
    pub velocity: u8,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeInstrument {
    pub plugin_path: String,
    pub plugin_name: String,
    #[serde(default)]
    pub parameters: std::collections::BTreeMap<u32, f64>,
    pub state_b64: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeEffect {
    pub id: String,
    pub plugin_path: String,
    pub plugin_name: String,
    pub enabled: bool,
    #[serde(default)]
    pub parameters: std::collections::BTreeMap<u32, f64>,
    pub state_b64: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeTrack {
    pub id: String,
    pub name: String,
    pub role: String,
    pub path: Option<String>,
    pub gain_db: f32,
    pub pan: f32,
    pub mute: bool,
    pub solo: bool,
    #[serde(default)]
    pub clips: Vec<RealtimeClip>,
    #[serde(default)]
    pub effects: Vec<RealtimeEffect>,
    pub instrument: Option<RealtimeInstrument>,
    #[serde(default)]
    pub notes: Vec<RealtimeMidiNote>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimePlaybackConfig {
    pub master_gain_db: f32,
    #[serde(default)]
    pub any_solo: bool,
    #[serde(default)]
    pub tracks: Vec<RealtimeTrack>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimePlaybackStatus {
    pub active_track_ids: Vec<String>,
    pub active_midi_track_ids: Vec<String>,
    pub sample_rate: u32,
    pub duration_seconds: f64,
    pub render_error: bool,
    pub current_seconds: f64,
    pub playing: bool,
}

enum WorkerCommand {
    Configure(
        RealtimePlaybackConfig,
        mpsc::SyncSender<Result<RealtimePlaybackStatus, String>>,
    ),
    Play(f64),
    Pause,
    Seek(f64),
    Stop,
    Status(mpsc::SyncSender<Option<RealtimePlaybackStatus>>),
}

#[derive(Default)]
pub struct NativeVst3RealtimeState {
    sender: Mutex<Option<mpsc::Sender<WorkerCommand>>>,
}

impl NativeVst3RealtimeState {
    fn sender(&self) -> Result<mpsc::Sender<WorkerCommand>, String> {
        let mut slot = self
            .sender
            .lock()
            .map_err(|_| "Moteur VST3 indisponible.".to_string())?;
        if let Some(sender) = slot.as_ref() {
            return Ok(sender.clone());
        }
        let (sender, receiver) = mpsc::channel();
        std::thread::Builder::new()
            .name("song-maker-vst3-realtime".into())
            .spawn(move || worker_loop(receiver))
            .map_err(|error| format!("Impossible de démarrer le moteur audio natif : {error}"))?;
        *slot = Some(sender.clone());
        Ok(sender)
    }
}

fn worker_loop(receiver: mpsc::Receiver<WorkerCommand>) {
    #[cfg(windows)]
    let mut runtime: Option<WindowsRuntime> = None;

    while let Ok(command) = receiver.recv() {
        match command {
            WorkerCommand::Configure(config, reply) => {
                #[cfg(windows)]
                {
                    if let Some(active) = runtime.as_mut() {
                        if active.update_controls_if_same(&config) {
                            let _ = reply.send(Ok(active.snapshot()));
                            continue;
                        }
                    }
                    match WindowsRuntime::create(config) {
                        Ok(next) => {
                            let status = next.status.clone();
                            runtime = Some(next);
                            let _ = reply.send(Ok(status));
                        }
                        Err(error) => {
                            let _ = reply.send(Err(error));
                        }
                    }
                }
                #[cfg(not(windows))]
                {
                    let _ = config;
                    let _ = reply.send(Err(
                        "Le moteur VST3 temps réel est disponible dans la version Windows.".into(),
                    ));
                }
            }
            WorkerCommand::Play(offset) => {
                #[cfg(windows)]
                if let Some(active) = runtime.as_ref() {
                    active.transport.seek(offset);
                    active
                        .transport
                        .playing
                        .store(true, std::sync::atomic::Ordering::Release);
                }
                let _ = offset;
            }
            WorkerCommand::Pause =>
            {
                #[cfg(windows)]
                if let Some(active) = runtime.as_ref() {
                    active
                        .transport
                        .playing
                        .store(false, std::sync::atomic::Ordering::Release);
                }
            }
            WorkerCommand::Seek(offset) => {
                #[cfg(windows)]
                if let Some(active) = runtime.as_ref() {
                    active.transport.seek(offset);
                }
                let _ = offset;
            }
            WorkerCommand::Stop => {
                #[cfg(windows)]
                {
                    runtime = None;
                }
            }
            WorkerCommand::Status(reply) => {
                #[cfg(windows)]
                let status = runtime.as_ref().map(|active| {
                    let mut status = active.status.clone();
                    status.render_error = active
                        .transport
                        .render_error
                        .load(std::sync::atomic::Ordering::Acquire);
                    status.current_seconds = active
                        .transport
                        .position_frames
                        .load(std::sync::atomic::Ordering::Acquire)
                        as f64
                        / f64::from(active.transport.sample_rate);
                    status.playing = active
                        .transport
                        .playing
                        .load(std::sync::atomic::Ordering::Acquire);
                    status
                });
                #[cfg(not(windows))]
                let status: Option<RealtimePlaybackStatus> = None;
                let _ = reply.send(status);
            }
        }
    }
}

#[tauri::command]
pub async fn vst3_realtime_configure(
    state: tauri::State<'_, NativeVst3RealtimeState>,
    config: RealtimePlaybackConfig,
) -> Result<RealtimePlaybackStatus, String> {
    let sender = state.sender()?;
    tokio::task::spawn_blocking(move || {
        let (reply, response) = mpsc::sync_channel(1);
        sender
            .send(WorkerCommand::Configure(config, reply))
            .map_err(|_| "Le moteur audio natif s’est arrêté.".to_string())?;
        response
            .recv()
            .map_err(|_| "Le moteur audio natif n’a pas répondu.".to_string())?
    })
    .await
    .map_err(|error| format!("Configuration VST3 interrompue : {error}"))?
}

#[tauri::command]
pub fn vst3_realtime_play(
    state: tauri::State<'_, NativeVst3RealtimeState>,
    offset_seconds: f64,
) -> Result<(), String> {
    let sender = state.sender()?;
    sender
        .send(WorkerCommand::Play(offset_seconds.max(0.0)))
        .map_err(|_| "Le moteur audio natif s’est arrêté.".into())
}

#[tauri::command]
pub fn vst3_realtime_pause(state: tauri::State<'_, NativeVst3RealtimeState>) -> Result<(), String> {
    let sender = state.sender()?;
    sender
        .send(WorkerCommand::Pause)
        .map_err(|_| "Le moteur audio natif s’est arrêté.".into())
}

#[tauri::command]
pub fn vst3_realtime_seek(
    state: tauri::State<'_, NativeVst3RealtimeState>,
    offset_seconds: f64,
) -> Result<(), String> {
    let sender = state.sender()?;
    sender
        .send(WorkerCommand::Seek(offset_seconds.max(0.0)))
        .map_err(|_| "Le moteur audio natif s’est arrêté.".into())
}

#[tauri::command]
pub fn vst3_realtime_stop(state: tauri::State<'_, NativeVst3RealtimeState>) -> Result<(), String> {
    let sender = state.sender()?;
    sender
        .send(WorkerCommand::Stop)
        .map_err(|_| "Le moteur audio natif s’est arrêté.".into())
}

#[tauri::command]
pub fn vst3_realtime_status(
    state: tauri::State<'_, NativeVst3RealtimeState>,
) -> Result<Option<RealtimePlaybackStatus>, String> {
    let sender = state.sender()?;
    let (reply, response) = mpsc::sync_channel(1);
    sender
        .send(WorkerCommand::Status(reply))
        .map_err(|_| "Le moteur audio natif s’est arrêté.".to_string())?;
    response
        .recv()
        .map_err(|_| "Le moteur audio natif n’a pas répondu.".into())
}

#[cfg(windows)]
mod windows_engine {
    use super::*;
    use base64::Engine as _;
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::{FromSample, Sample, SampleFormat, StreamConfig};
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
    use vst3_host::{
        audio::AudioBuffers,
        midi::{MidiChannel, MidiEvent},
        realtime::{RealtimePluginRunner, RtControl},
        Vst3Host,
    };

    pub(super) struct WindowsRuntime {
        pub(super) status: RealtimePlaybackStatus,
        pub(super) transport: std::sync::Arc<Transport>,
        config: RealtimePlaybackConfig,
        controls: std::sync::Arc<LiveMixControls>,
        _stream: cpal::Stream,
    }

    pub(super) struct Transport {
        pub(super) position_frames: AtomicU64,
        pub(super) seek_generation: AtomicU64,
        pub(super) playing: AtomicBool,
        pub(super) sample_rate: u32,
        pub(super) duration_frames: u64,
        pub(super) render_error: AtomicBool,
    }

    impl Transport {
        pub(super) fn seek(&self, seconds: f64) {
            let frame = (seconds.max(0.0) * f64::from(self.sample_rate)) as u64;
            self.position_frames
                .store(frame.min(self.duration_frames), Ordering::Release);
            self.seek_generation.fetch_add(1, Ordering::AcqRel);
        }
    }

    #[derive(Clone)]
    struct ClipFrames {
        start: u64,
        source_offset: u64,
        duration: u64,
        fade_in: u64,
        fade_out: u64,
        gain: f32,
    }

    struct ParameterSlot {
        id: u32,
        value_bits: AtomicU64,
    }

    struct TrackMixControls {
        gain_bits: AtomicU32,
        pan_bits: AtomicU32,
        mute: AtomicBool,
        solo: AtomicBool,
    }

    struct LiveMixControls {
        master_gain_bits: AtomicU32,
        any_solo: AtomicBool,
        tracks: std::collections::HashMap<String, std::sync::Arc<TrackMixControls>>,
        plugins: std::collections::HashMap<String, std::sync::Arc<Vec<ParameterSlot>>>,
    }

    impl LiveMixControls {
        fn update(&self, config: &RealtimePlaybackConfig) {
            self.master_gain_bits.store(
                db_to_gain(config.master_gain_db).to_bits(),
                Ordering::Release,
            );
            self.any_solo.store(config.any_solo, Ordering::Release);
            for track in &config.tracks {
                if let Some(control) = self.tracks.get(&track.id) {
                    control
                        .gain_bits
                        .store(db_to_gain(track.gain_db).to_bits(), Ordering::Release);
                    control
                        .pan_bits
                        .store(track.pan.clamp(-1.0, 1.0).to_bits(), Ordering::Release);
                    control.mute.store(track.mute, Ordering::Release);
                    control.solo.store(track.solo, Ordering::Release);
                }
                if let Some(instrument) = track.instrument.as_ref() {
                    update_plugin_parameters(
                        &self.plugins,
                        &plugin_key(&track.id, "instrument"),
                        &instrument.parameters,
                    );
                }
                for effect in &track.effects {
                    update_plugin_parameters(
                        &self.plugins,
                        &plugin_key(&track.id, &effect.id),
                        &effect.parameters,
                    );
                }
            }
        }
    }

    fn update_plugin_parameters(
        plugins: &std::collections::HashMap<String, std::sync::Arc<Vec<ParameterSlot>>>,
        key: &str,
        parameters: &std::collections::BTreeMap<u32, f64>,
    ) {
        let Some(slots) = plugins.get(key) else {
            return;
        };
        for slot in slots.iter() {
            if let Some(value) = parameters.get(&slot.id) {
                if value.is_finite() && (0.0..=1.0).contains(value) {
                    slot.value_bits.store(value.to_bits(), Ordering::Release);
                }
            }
        }
    }

    fn plugin_key(track_id: &str, insert_id: &str) -> String {
        format!("{track_id}::{insert_id}")
    }

    struct Processor {
        runner: Option<RealtimePluginRunner>,
        control: Option<RtControl>,
        buffers: AudioBuffers,
        parameters: std::sync::Arc<Vec<ParameterSlot>>,
        applied_parameters: Vec<u64>,
    }

    impl Processor {
        fn new(
            plugin: vst3_host::Plugin,
            input_channels: usize,
            sample_rate: u32,
            parameters: &std::collections::BTreeMap<u32, f64>,
        ) -> Result<Self, String> {
            let (mut runner, control) = RealtimePluginRunner::new(plugin, 4096);
            runner
                .start()
                .map_err(|error| format!("Impossible de démarrer le plugin VST3 : {error}"))?;
            Ok(Self {
                runner: Some(runner),
                control: Some(control),
                buffers: AudioBuffers::new(
                    input_channels,
                    2,
                    REALTIME_BLOCK_SIZE,
                    f64::from(sample_rate),
                ),
                parameters: std::sync::Arc::new(
                    parameters
                        .iter()
                        .map(|(id, value)| ParameterSlot {
                            id: *id,
                            value_bits: AtomicU64::new(value.to_bits()),
                        })
                        .collect(),
                ),
                applied_parameters: parameters.values().map(|value| value.to_bits()).collect(),
            })
        }

        fn apply_parameter_updates(&mut self) {
            let Some(control) = self.control.as_mut() else {
                return;
            };
            for (index, slot) in self.parameters.iter().enumerate() {
                let value = slot.value_bits.load(Ordering::Acquire);
                if self.applied_parameters[index] == value {
                    continue;
                }
                let _ = control.set_parameter(slot.id, f64::from_bits(value));
                self.applied_parameters[index] = value;
            }
        }

        fn apply(&mut self, audio: &mut [[f32; 2]], frames: usize) -> bool {
            self.apply_parameter_updates();
            let buffers = &mut self.buffers;
            if !buffers.inputs.is_empty() {
                for frame in 0..frames {
                    buffers.inputs[0][frame] = audio[frame][0];
                    buffers.inputs[1][frame] = audio[frame][1];
                }
            }
            for channel in &mut buffers.outputs {
                channel[..frames].fill(0.0);
            }
            buffers.block_size = frames;
            let Some(runner) = self.runner.as_mut() else {
                return false;
            };
            if runner.process(buffers).is_err() {
                return false;
            }
            for frame in 0..frames {
                audio[frame][0] = buffers.outputs[0][frame];
                audio[frame][1] = buffers.outputs[1][frame];
            }
            true
        }

        fn send_midi(&mut self, offset: usize, on: bool, pitch: u8, velocity: u8) -> bool {
            let Some(control) = self.control.as_mut() else {
                return false;
            };
            let event = if on {
                MidiEvent::NoteOn {
                    channel: MidiChannel::Ch1,
                    note: pitch,
                    velocity,
                }
            } else {
                MidiEvent::NoteOff {
                    channel: MidiChannel::Ch1,
                    note: pitch,
                    velocity: 0,
                }
            };
            control.send_midi_at(event, offset as i32)
        }

        fn render_instrument(&mut self, frames: usize) -> bool {
            self.apply_parameter_updates();
            let Some(runner) = self.runner.as_mut() else {
                return false;
            };
            for channel in &mut self.buffers.outputs {
                channel[..frames].fill(0.0);
            }
            self.buffers.block_size = frames;
            if runner.process(&mut self.buffers).is_err() {
                return false;
            }
            true
        }
    }

    impl Drop for Processor {
        fn drop(&mut self) {
            if let Some(mut runner) = self.runner.take() {
                let _ = runner.stop();
                drop(runner);
            }
            if let Some(mut control) = self.control.take() {
                while control.service_teardown() {}
            }
        }
    }

    struct MidiEventFrame {
        frame: u64,
        end_frame: u64,
        on: bool,
        pitch: u8,
        velocity: u8,
    }

    struct TrackRuntime {
        is_midi: bool,
        pcm: Vec<[f32; 2]>,
        clips: Vec<ClipFrames>,
        controls: std::sync::Arc<TrackMixControls>,
        instrument: Option<Processor>,
        effects: Vec<Processor>,
        notes: Vec<RealtimeMidiNote>,
        midi_events: Vec<MidiEventFrame>,
        active_notes: [bool; 128],
        active_velocity: [u8; 128],
        active_start_frames: [u64; 128],
        active_end_frames: [u64; 128],
        midi_phase_steps: [f64; 128],
        midi_phases: [f64; 128],
        event_cursor: usize,
        last_seek_generation: u64,
    }

    impl TrackRuntime {
        fn render(
            &mut self,
            start: u64,
            frames: usize,
            sample_rate: u32,
            seek_generation: u64,
            any_solo: bool,
            out: &mut [[f32; 2]],
        ) -> bool {
            out[..frames].fill([0.0, 0.0]);
            let solo_gate = self.controls.solo.load(Ordering::Acquire);
            let muted = self.controls.mute.load(Ordering::Acquire) || (any_solo && !solo_gate);
            if muted {
                return true;
            }
            if self.is_midi {
                if let Some(instrument) = self.instrument.as_mut() {
                    if self.last_seek_generation != seek_generation {
                        for pitch in 0..128 {
                            if self.active_notes[pitch] {
                                let _ = instrument.send_midi(0, false, pitch as u8, 0);
                                self.active_notes[pitch] = false;
                            }
                        }
                        self.event_cursor = self
                            .midi_events
                            .partition_point(|event| event.frame < start);
                        for note in &self.notes {
                            let on = (note.start_seconds.max(0.0) * f64::from(sample_rate)) as u64;
                            let off = (note.end_seconds.max(0.0) * f64::from(sample_rate)) as u64;
                            if on < start && off > start {
                                let _ = instrument.send_midi(0, true, note.pitch, note.velocity);
                                self.active_notes[usize::from(note.pitch)] = true;
                            }
                        }
                        self.last_seek_generation = seek_generation;
                    }
                    let end = start.saturating_add(frames as u64);
                    while let Some(event) = self.midi_events.get(self.event_cursor) {
                        if event.frame >= end {
                            break;
                        }
                        if event.frame >= start {
                            if !instrument.send_midi(
                                (event.frame - start) as usize,
                                event.on,
                                event.pitch,
                                event.velocity,
                            ) {
                                return false;
                            }
                            self.active_notes[usize::from(event.pitch)] = event.on;
                        }
                        self.event_cursor += 1;
                    }
                    if !instrument.render_instrument(frames) {
                        return false;
                    }
                    for frame in 0..frames {
                        out[frame][0] = instrument.buffers.outputs[0][frame];
                        out[frame][1] = instrument.buffers.outputs[1][frame];
                    }
                } else {
                    self.render_basic_midi(start, frames, sample_rate, seek_generation, out);
                }
            } else {
                for clip in &self.clips {
                    let clip_end = clip.start.saturating_add(clip.duration);
                    for frame in 0..frames {
                        let timeline = start.saturating_add(frame as u64);
                        if timeline < clip.start || timeline >= clip_end {
                            continue;
                        }
                        let within = timeline - clip.start;
                        let source = clip.source_offset.saturating_add(within) as usize;
                        let Some(sample) = self.pcm.get(source) else {
                            continue;
                        };
                        let mut gain = clip.gain;
                        if clip.fade_in > 0 && within < clip.fade_in {
                            gain *= within as f32 / clip.fade_in as f32;
                        }
                        if clip.fade_out > 0 && clip.duration.saturating_sub(within) < clip.fade_out
                        {
                            gain *=
                                clip.duration.saturating_sub(within) as f32 / clip.fade_out as f32;
                        }
                        out[frame][0] += sample[0] * gain;
                        out[frame][1] += sample[1] * gain;
                    }
                }
            }

            if self.is_midi {
                // The native MIDI instrument is the track's source. Its insert chain starts here.
            }
            for effect in &mut self.effects {
                if !effect.apply(out, frames) {
                    return false;
                }
            }
            let gain = f32::from_bits(self.controls.gain_bits.load(Ordering::Acquire));
            let pan = f32::from_bits(self.controls.pan_bits.load(Ordering::Acquire));
            let (pan_l, pan_r) = equal_power_pan(pan);
            for frame in &mut out[..frames] {
                frame[0] *= gain * pan_l;
                frame[1] *= gain * pan_r;
            }
            true
        }

        fn render_basic_midi(
            &mut self,
            start: u64,
            frames: usize,
            sample_rate: u32,
            seek_generation: u64,
            out: &mut [[f32; 2]],
        ) {
            if self.last_seek_generation != seek_generation {
                self.active_velocity.fill(0);
                self.midi_phases.fill(0.0);
                self.event_cursor = self
                    .midi_events
                    .partition_point(|event| event.frame < start);
                for note in &self.notes {
                    let on = (note.start_seconds.max(0.0) * f64::from(sample_rate)) as u64;
                    let off = (note.end_seconds.max(0.0) * f64::from(sample_rate)) as u64;
                    if on < start && off > start {
                        let pitch = usize::from(note.pitch);
                        self.active_velocity[pitch] = note.velocity;
                        self.active_start_frames[pitch] = on;
                        self.active_end_frames[pitch] = off;
                    }
                }
                self.last_seek_generation = seek_generation;
            }

            for (index, sample) in out[..frames].iter_mut().enumerate() {
                let frame = start + index as u64;
                while let Some(event) = self.midi_events.get(self.event_cursor) {
                    if event.frame > frame {
                        break;
                    }
                    let pitch = usize::from(event.pitch);
                    if event.on {
                        self.active_velocity[pitch] = event.velocity;
                        self.active_start_frames[pitch] = event.frame;
                        self.active_end_frames[pitch] = event.end_frame;
                        self.midi_phases[pitch] = 0.0;
                    } else {
                        self.active_velocity[pitch] = 0;
                    }
                    self.event_cursor += 1;
                }

                let mut value = 0.0f32;
                for pitch in 0..128 {
                    let velocity = self.active_velocity[pitch];
                    let end = self.active_end_frames[pitch];
                    if velocity == 0 || frame >= end {
                        self.active_velocity[pitch] = 0;
                        continue;
                    }
                    let local = frame.saturating_sub(self.active_start_frames[pitch]) as f64
                        / f64::from(sample_rate);
                    let remaining = end.saturating_sub(frame) as f64 / f64::from(sample_rate);
                    let envelope = (local / 0.012).min(1.0).min((remaining / 0.045).max(0.0));
                    value += (self.midi_phases[pitch].sin() as f32)
                        * envelope as f32
                        * (f32::from(velocity) / 127.0)
                        * 0.18;
                    self.midi_phases[pitch] += self.midi_phase_steps[pitch];
                    if self.midi_phases[pitch] >= std::f64::consts::TAU {
                        self.midi_phases[pitch] -= std::f64::consts::TAU;
                    }
                }
                *sample = [value, value];
            }
        }
    }

    fn equal_power_pan(pan: f32) -> (f32, f32) {
        let angle = (pan.clamp(-1.0, 1.0) + 1.0) * std::f32::consts::FRAC_PI_4;
        (angle.cos(), angle.sin())
    }

    struct AudioGraph {
        tracks: Vec<TrackRuntime>,
        controls: std::sync::Arc<LiveMixControls>,
        transport: std::sync::Arc<Transport>,
        scratch: [[f32; 2]; REALTIME_BLOCK_SIZE],
        track_scratch: [[f32; 2]; REALTIME_BLOCK_SIZE],
    }

    impl AudioGraph {
        fn render(&mut self, output: &mut [f32], channels: usize) {
            output.fill(0.0);
            let frames = output.len() / channels.max(1);
            if channels == 0 || !self.transport.playing.load(Ordering::Acquire) {
                return;
            }
            let mut processed = 0usize;
            while processed < frames {
                let count = (frames - processed).min(REALTIME_BLOCK_SIZE);
                let start = self.transport.position_frames.load(Ordering::Acquire);
                if start >= self.transport.duration_frames {
                    self.transport.playing.store(false, Ordering::Release);
                    break;
                }
                let count = count.min((self.transport.duration_frames - start) as usize);
                if count == 0 {
                    self.transport.playing.store(false, Ordering::Release);
                    break;
                }
                self.scratch[..count].fill([0.0, 0.0]);
                let seek_generation = self.transport.seek_generation.load(Ordering::Acquire);
                let mut any_failed = false;
                for track in &mut self.tracks {
                    if !track.render(
                        start,
                        count,
                        self.transport.sample_rate,
                        seek_generation,
                        self.controls.any_solo.load(Ordering::Acquire),
                        &mut self.track_scratch,
                    ) {
                        any_failed = true;
                        continue;
                    }
                    for frame in 0..count {
                        self.scratch[frame][0] += self.track_scratch[frame][0];
                        self.scratch[frame][1] += self.track_scratch[frame][1];
                    }
                }
                if any_failed {
                    self.transport.render_error.store(true, Ordering::Release);
                }
                let master_gain =
                    f32::from_bits(self.controls.master_gain_bits.load(Ordering::Acquire));
                for frame in 0..count {
                    let dest = (processed + frame) * channels;
                    if channels == 1 {
                        output[dest] =
                            (self.scratch[frame][0] + self.scratch[frame][1]) * 0.5 * master_gain;
                    } else {
                        output[dest] = self.scratch[frame][0] * master_gain;
                        output[dest + 1] = self.scratch[frame][1] * master_gain;
                    }
                }
                self.transport
                    .position_frames
                    .store(start + count as u64, Ordering::Release);
                processed += count;
            }
        }
    }

    fn load_processor(
        path: &str,
        params: &std::collections::BTreeMap<u32, f64>,
        state_b64: Option<&str>,
        input_channels: usize,
        rate: u32,
    ) -> Result<Processor, String> {
        let path = validated_plugin_path(path)?;
        let mut host = Vst3Host::builder()
            .sample_rate(f64::from(rate))
            .block_size(REALTIME_BLOCK_SIZE)
            .input_channels(input_channels)
            .output_channels(2)
            .build()
            .map_err(|error| format!("Configuration de l’hôte VST3 impossible : {error}"))?;
        let mut plugin = host
            .load_plugin(path)
            .map_err(|error| format!("Chargement VST3 impossible : {error}"))?;
        if let Some(encoded) = state_b64.filter(|value| !value.is_empty()) {
            let state = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .map_err(|error| format!("État VST3 invalide : {error}"))?;
            if state.len() > 24 * 1024 * 1024 {
                return Err("L’état du plugin VST3 dépasse 24 Mio.".into());
            }
            plugin
                .load_state(&state)
                .map_err(|error| format!("Restauration du plugin VST3 impossible : {error}"))?;
        }
        for (id, value) in params {
            if !value.is_finite() || !(0.0..=1.0).contains(value) {
                return Err("Valeur de paramètre VST3 invalide.".into());
            }
            plugin
                .set_parameter(*id, *value)
                .map_err(|error| format!("Réglage VST3 impossible : {error}"))?;
        }
        Processor::new(plugin, input_channels, rate, params)
    }

    fn validated_plugin_path(path: &str) -> Result<PathBuf, String> {
        let candidate = Path::new(path.trim());
        if candidate
            .extension()
            .and_then(|ext| ext.to_str())
            .is_none_or(|ext| !ext.eq_ignore_ascii_case("vst3"))
        {
            return Err("Le plugin doit être un module .vst3.".into());
        }
        let resolved = candidate
            .canonicalize()
            .map_err(|error| format!("Plugin VST3 inaccessible : {error}"))?;
        let allowed = crate::vst3_spike::default_scan_roots()
            .into_iter()
            .any(|root| {
                root.canonicalize()
                    .ok()
                    .is_some_and(|root| resolved.starts_with(root))
            });
        if !allowed {
            return Err("Le plugin VST3 doit se trouver dans un dossier scanné.".into());
        }
        Ok(resolved)
    }

    fn read_stereo(path: &str, target_rate: u32) -> Result<Vec<[f32; 2]>, String> {
        let mut reader = hound::WavReader::open(path)
            .map_err(|error| format!("Lecture de la piste audio impossible : {error}"))?;
        let spec = reader.spec();
        let mut samples: Vec<f32> = match spec.sample_format {
            hound::SampleFormat::Float => reader
                .samples::<f32>()
                .collect::<Result<_, _>>()
                .map_err(|error| error.to_string())?,
            hound::SampleFormat::Int => {
                let scale = (1i64 << spec.bits_per_sample.saturating_sub(1)) as f32;
                reader
                    .samples::<i32>()
                    .map(|sample| sample.map(|value| value as f32 / scale))
                    .collect::<Result<_, _>>()
                    .map_err(|error| error.to_string())?
            }
        };
        let peak = samples
            .iter()
            .fold(0.0f32, |max, sample| max.max(sample.abs()));
        if peak > 2.0 {
            let scale = if peak > 16_000.0 { 32_768.0 } else { peak };
            for sample in &mut samples {
                *sample /= scale;
            }
        }
        let channels = usize::from(spec.channels.max(1));
        let mut stereo: Vec<[f32; 2]> = samples
            .chunks(channels)
            .map(|frame| {
                let left = *frame.first().unwrap_or(&0.0);
                [left, *frame.get(1).unwrap_or(&left)]
            })
            .collect();
        if spec.sample_rate != target_rate && !stereo.is_empty() {
            let ratio = f64::from(target_rate) / f64::from(spec.sample_rate);
            let output_len = (stereo.len() as f64 * ratio).ceil() as usize;
            let source = stereo;
            stereo = Vec::with_capacity(output_len);
            for index in 0..output_len {
                let position = index as f64 / ratio;
                let base = position.floor() as usize;
                let frac = (position - base as f64) as f32;
                let a = source.get(base).copied().unwrap_or([0.0; 2]);
                let b = source.get(base + 1).copied().unwrap_or(a);
                stereo.push([a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]);
            }
        }
        Ok(stereo)
    }

    impl WindowsRuntime {
        pub(super) fn update_controls_if_same(&mut self, config: &RealtimePlaybackConfig) -> bool {
            if !same_graph_structure(&self.config, config) {
                return false;
            }
            self.controls.update(config);
            self.config = config.clone();
            true
        }

        pub(super) fn snapshot(&self) -> RealtimePlaybackStatus {
            let mut status = self.status.clone();
            status.render_error = self.transport.render_error.load(Ordering::Acquire);
            status.current_seconds = self.transport.position_frames.load(Ordering::Acquire) as f64
                / f64::from(self.transport.sample_rate);
            status.playing = self.transport.playing.load(Ordering::Acquire);
            status
        }

        pub(super) fn create(config: RealtimePlaybackConfig) -> Result<Self, String> {
            let host = cpal::default_host();
            let device = host.default_output_device().ok_or_else(|| {
                "Aucune sortie audio native n’est disponible pour le moteur VST3.".to_string()
            })?;
            let supported = device.default_output_config().map_err(|error| {
                format!("Lecture de la configuration de sortie impossible : {error}")
            })?;
            let sample_rate = supported.sample_rate().0;
            let channels = usize::from(supported.channels());
            if channels == 0 || channels > 8 {
                return Err(format!(
                    "La sortie audio expose un nombre de canaux non pris en charge : {channels}."
                ));
            }
            let stream_config: StreamConfig = supported.clone().into();
            let eligible: Vec<_> = config
                .tracks
                .iter()
                .cloned()
                .filter(|track| {
                    track.effects.iter().any(|effect| effect.enabled) || track.instrument.is_some()
                })
                .collect();
            if eligible.is_empty() {
                return Err("Aucune piste MIDI ou audio ne possède d’insert VST3 actif.".into());
            }
            let any_solo = config.any_solo;
            let mut duration_frames = 0u64;
            let mut active_track_ids = Vec::new();
            let mut active_midi_track_ids = Vec::new();
            let mut tracks = Vec::with_capacity(eligible.len());
            let mut track_controls = std::collections::HashMap::new();
            let mut plugin_parameters = std::collections::HashMap::new();
            for track in eligible {
                let track_control = std::sync::Arc::new(TrackMixControls {
                    gain_bits: AtomicU32::new(db_to_gain(track.gain_db).to_bits()),
                    pan_bits: AtomicU32::new(track.pan.clamp(-1.0, 1.0).to_bits()),
                    mute: AtomicBool::new(track.mute),
                    solo: AtomicBool::new(track.solo),
                });
                track_controls.insert(track.id.clone(), track_control.clone());
                let is_midi = track.role.eq_ignore_ascii_case("midi")
                    || track.instrument.is_some()
                    || !track.notes.is_empty();
                let mut pcm = Vec::new();
                let mut clips = Vec::new();
                if !is_midi {
                    let path = track.path.as_deref().ok_or_else(|| {
                        format!("Fichier audio manquant pour la piste {}.", track.name)
                    })?;
                    pcm = read_stereo(path, sample_rate)?;
                    let clip_source = if track.clips.is_empty() {
                        vec![RealtimeClip {
                            start_ms: 0,
                            offset_ms: 0,
                            duration_ms: (pcm.len() as f64 * 1000.0 / f64::from(sample_rate))
                                .round() as i64,
                            fade_in_ms: 0,
                            fade_out_ms: 0,
                            gain_db: 0.0,
                        }]
                    } else {
                        track.clips.clone()
                    };
                    for clip in clip_source {
                        let start = ms_to_frames(clip.start_ms, sample_rate);
                        let offset = ms_to_frames(clip.offset_ms, sample_rate);
                        let duration = ms_to_frames(clip.duration_ms, sample_rate);
                        clips.push(ClipFrames {
                            start,
                            source_offset: offset,
                            duration,
                            fade_in: ms_to_frames(clip.fade_in_ms, sample_rate),
                            fade_out: ms_to_frames(clip.fade_out_ms, sample_rate),
                            gain: db_to_gain(clip.gain_db),
                        });
                        duration_frames = duration_frames.max(start.saturating_add(duration));
                    }
                    active_track_ids.push(track.id.clone());
                } else {
                    for note in &track.notes {
                        if !note.start_seconds.is_finite()
                            || !note.end_seconds.is_finite()
                            || note.start_seconds < 0.0
                            || note.end_seconds <= note.start_seconds
                            || note.pitch > 127
                            || note.velocity > 127
                        {
                            return Err(format!(
                                "Partition MIDI invalide sur la piste {}.",
                                track.name
                            ));
                        }
                        duration_frames =
                            duration_frames.max((note.end_seconds * f64::from(sample_rate)) as u64);
                    }
                    active_midi_track_ids.push(track.id.clone());
                }
                let instrument = track
                    .instrument
                    .as_ref()
                    .map(|plugin| {
                        let processor = load_processor(
                            &plugin.plugin_path,
                            &plugin.parameters,
                            plugin.state_b64.as_deref(),
                            0,
                            sample_rate,
                        )?;
                        plugin_parameters.insert(
                            plugin_key(&track.id, "instrument"),
                            processor.parameters.clone(),
                        );
                        Ok::<Processor, String>(processor)
                    })
                    .transpose()
                    .map_err(|error| {
                        let name = track
                            .instrument
                            .as_ref()
                            .map(|plugin| plugin.plugin_name.as_str())
                            .unwrap_or("instrument");
                        format!("Piste MIDI {} · {name} : {error}", track.name)
                    })?;
                let mut effects = Vec::new();
                for effect in track.effects.into_iter().filter(|effect| effect.enabled) {
                    let processor = load_processor(
                        &effect.plugin_path,
                        &effect.parameters,
                        effect.state_b64.as_deref(),
                        2,
                        sample_rate,
                    )
                    .map_err(|error| {
                        format!(
                            "Piste {} · {} ({}) : {error}",
                            track.name, effect.plugin_name, effect.id
                        )
                    })?;
                    plugin_parameters.insert(
                        plugin_key(&track.id, &effect.id),
                        processor.parameters.clone(),
                    );
                    effects.push(processor);
                }
                let mut midi_events = Vec::with_capacity(track.notes.len().saturating_mul(2));
                for note in &track.notes {
                    let start_frame = (note.start_seconds * f64::from(sample_rate)) as u64;
                    let end_frame = (note.end_seconds * f64::from(sample_rate)) as u64;
                    midi_events.push(MidiEventFrame {
                        frame: start_frame,
                        end_frame,
                        on: true,
                        pitch: note.pitch,
                        velocity: note.velocity,
                    });
                    midi_events.push(MidiEventFrame {
                        frame: end_frame,
                        end_frame,
                        on: false,
                        pitch: note.pitch,
                        velocity: 0,
                    });
                }
                midi_events.sort_by_key(|event| (event.frame, event.on));
                tracks.push(TrackRuntime {
                    is_midi,
                    pcm,
                    clips,
                    controls: track_control,
                    instrument,
                    effects,
                    notes: track.notes,
                    midi_events,
                    active_notes: [false; 128],
                    active_velocity: [0; 128],
                    active_start_frames: [0; 128],
                    active_end_frames: [0; 128],
                    midi_phase_steps: std::array::from_fn(|pitch| {
                        let frequency = 440.0 * 2.0_f64.powf((pitch as f64 - 69.0) / 12.0);
                        std::f64::consts::TAU * frequency / f64::from(sample_rate)
                    }),
                    midi_phases: [0.0; 128],
                    event_cursor: 0,
                    last_seek_generation: u64::MAX,
                });
            }
            if duration_frames == 0 {
                duration_frames = u64::from(sample_rate) * 60 * 3;
            }
            let transport = std::sync::Arc::new(Transport {
                position_frames: AtomicU64::new(0),
                seek_generation: AtomicU64::new(0),
                playing: AtomicBool::new(false),
                sample_rate,
                duration_frames,
                render_error: AtomicBool::new(false),
            });
            let controls = std::sync::Arc::new(LiveMixControls {
                master_gain_bits: AtomicU32::new(db_to_gain(config.master_gain_db).to_bits()),
                any_solo: AtomicBool::new(any_solo),
                tracks: track_controls,
                plugins: plugin_parameters,
            });
            let graph = AudioGraph {
                tracks,
                controls: controls.clone(),
                transport: transport.clone(),
                scratch: [[0.0; 2]; REALTIME_BLOCK_SIZE],
                track_scratch: [[0.0; 2]; REALTIME_BLOCK_SIZE],
            };
            let format = supported.sample_format();
            let stream = match format {
                SampleFormat::F32 => {
                    build_output_stream::<f32>(&device, &stream_config, format, channels, graph)?
                }
                SampleFormat::F64 => {
                    build_output_stream::<f64>(&device, &stream_config, format, channels, graph)?
                }
                SampleFormat::I8 => {
                    build_output_stream::<i8>(&device, &stream_config, format, channels, graph)?
                }
                SampleFormat::I16 => {
                    build_output_stream::<i16>(&device, &stream_config, format, channels, graph)?
                }
                SampleFormat::I32 => {
                    build_output_stream::<i32>(&device, &stream_config, format, channels, graph)?
                }
                SampleFormat::I64 => {
                    build_output_stream::<i64>(&device, &stream_config, format, channels, graph)?
                }
                SampleFormat::U8 => {
                    build_output_stream::<u8>(&device, &stream_config, format, channels, graph)?
                }
                SampleFormat::U16 => {
                    build_output_stream::<u16>(&device, &stream_config, format, channels, graph)?
                }
                SampleFormat::U32 => {
                    build_output_stream::<u32>(&device, &stream_config, format, channels, graph)?
                }
                other => {
                    return Err(format!(
                        "Format de sortie natif non pris en charge : {other}."
                    ))
                }
            };
            stream.play().map_err(|error| {
                format!("Impossible de démarrer la sortie audio VST3 : {error}")
            })?;
            Ok(Self {
                status: RealtimePlaybackStatus {
                    active_track_ids,
                    active_midi_track_ids,
                    sample_rate,
                    duration_seconds: duration_frames as f64 / f64::from(sample_rate),
                    render_error: false,
                    current_seconds: 0.0,
                    playing: false,
                },
                transport,
                config,
                controls,
                _stream: stream,
            })
        }
    }

    fn same_graph_structure(
        current: &RealtimePlaybackConfig,
        next: &RealtimePlaybackConfig,
    ) -> bool {
        if current.tracks.len() != next.tracks.len() {
            return false;
        }
        current.tracks.iter().zip(&next.tracks).all(|(a, b)| {
            let same_instrument = match (&a.instrument, &b.instrument) {
                (None, None) => true,
                (Some(a), Some(b)) => {
                    a.plugin_path == b.plugin_path
                        && a.plugin_name == b.plugin_name
                        && a.state_b64 == b.state_b64
                }
                _ => false,
            };
            let same_effects = a.effects.len() == b.effects.len()
                && a.effects.iter().zip(&b.effects).all(|(a, b)| {
                    a.id == b.id
                        && a.plugin_path == b.plugin_path
                        && a.plugin_name == b.plugin_name
                        && a.enabled == b.enabled
                        && a.state_b64 == b.state_b64
                });
            a.id == b.id
                && a.role == b.role
                && a.path == b.path
                && a.clips == b.clips
                && a.notes == b.notes
                && same_instrument
                && same_effects
        })
    }

    fn ms_to_frames(ms: i64, sample_rate: u32) -> u64 {
        ((ms.max(0) as u128 * u128::from(sample_rate)) / 1000).min(u64::MAX as u128) as u64
    }
    fn db_to_gain(db: f32) -> f32 {
        if db.is_finite() {
            10.0f32.powf(db.clamp(-96.0, 24.0) / 20.0)
        } else {
            1.0
        }
    }

    fn build_output_stream<T>(
        device: &cpal::Device,
        config: &StreamConfig,
        _format: SampleFormat,
        channels: usize,
        mut graph: AudioGraph,
    ) -> Result<cpal::Stream, String>
    where
        T: Sample + cpal::SizedSample + FromSample<f32> + Send + 'static,
    {
        let errors = graph.transport.clone();
        let mut float_output = vec![0.0f32; channels.saturating_mul(8192)];
        device
            .build_output_stream(
                config,
                move |data: &mut [T], _| {
                    if data.len() > float_output.len() {
                        data.fill(T::from_sample(0.0));
                        graph.transport.render_error.store(true, Ordering::Release);
                        return;
                    }
                    let scratch = &mut float_output[..data.len()];
                    graph.render(scratch, channels);
                    for (target, value) in data.iter_mut().zip(scratch.iter().copied()) {
                        *target = T::from_sample(value);
                    }
                },
                move |_error| {
                    errors.render_error.store(true, Ordering::Release);
                },
                None,
            )
            .map_err(|error| format!("Impossible d’ouvrir la sortie audio native : {error}"))
    }
}

#[cfg(windows)]
use windows_engine::WindowsRuntime;
