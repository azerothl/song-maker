//! Rendu offline du mix (formule §10.5) + export WAV PCM 24 / FLAC 24 / MP3 livraison.

use crate::hashutil::sha256_file;
use crate::models::{Clip, MixDoc, MixTrack};
use crate::paths::{atomic_write_json, ensure_dir};
use crate::pins::{BIT_DEPTH, CHANNELS, SAMPLE_RATE};
use hound::{SampleFormat, WavReader, WavSpec, WavWriter};
use std::path::{Path, PathBuf};
use uuid::Uuid;

const TRACK_ROLES: &[(&str, &str)] = &[
    ("vocals", "Voix"),
    ("drums", "Batterie"),
    ("bass", "Basse"),
    ("other", "Accompagnement"),
    ("guitar", "Guitare"),
    ("piano", "Piano"),
];

/// Empty mix used when the first user track is imported/recorded before separation.
pub fn empty_mix(mix_id: &str) -> MixDoc {
    MixDoc {
        schema: crate::pins::SCHEMA_MIX.into(),
        schema_version: crate::pins::SCHEMA_VERSION,
        id: mix_id.into(),
        separation_id: String::new(),
        sample_rate: SAMPLE_RATE,
        master_gain_db: 0.0,
        peak_ceiling_db: -1.0,
        tracks: Vec::new(),
        tempo_map: Vec::new(),
        time_signatures: Vec::new(),
        markers: Vec::new(),
    }
}

/// Append a user/custom track (never touches AI stems). Role is `user`.
pub fn append_user_audio_track(
    mix: &mut MixDoc,
    relative_wav: &str,
    sha256: &str,
    duration_ms: i64,
    display_name: &str,
    start_ms: i64,
) -> MixTrack {
    append_user_audio_takes(
        mix,
        &[(relative_wav, sha256, duration_ms, "Prise 1")],
        display_name,
        start_ms,
        None,
    )
}

fn unique_user_track_name(mix: &MixDoc, display_name: &str) -> String {
    let base = display_name.trim();
    let base = if base.is_empty() {
        "Piste personnalisée"
    } else {
        base
    };
    let mut candidate = base.to_string();
    let mut n = 2;
    while mix.tracks.iter().any(|t| t.name == candidate) {
        candidate = format!("{base} ({n})");
        n += 1;
    }
    candidate
}

/// Valeurs par défaut des champs optionnels d'un `Clip` importé.
#[derive(Clone)]
struct DefaultClipFields {
    source_tempo_bpm: Option<f32>,
    follow_project_tempo: bool,
    time_stretch_ratio: f32,
    pitch_semitones: f32,
    processing_enabled: bool,
    transient_markers_ms: Option<Vec<i64>>,
}

impl DefaultClipFields {
    fn new() -> Self {
        Self {
            source_tempo_bpm: None,
            follow_project_tempo: false,
            time_stretch_ratio: 1.0,
            pitch_semitones: 0.0,
            processing_enabled: true,
            transient_markers_ms: None,
        }
    }
}

/// Append one user track with one or more takes (same start, take lane).
/// `takes`: (relative_wav, sha256, duration_ms, take_label).
pub fn append_user_audio_takes(
    mix: &mut MixDoc,
    takes: &[(&str, &str, i64, &str)],
    display_name: &str,
    start_ms: i64,
    take_group_id: Option<&str>,
) -> MixTrack {
    assert!(!takes.is_empty(), "au moins une prise");
    let track_id = format!("trk-user-{}", Uuid::new_v4());
    let name = unique_user_track_name(mix, display_name);
    let group = take_group_id.map(|s| s.to_string()).or_else(|| {
        if takes.len() > 1 {
            Some(format!("takes-{}", Uuid::new_v4()))
        } else {
            None
        }
    });
    let mut clips = Vec::with_capacity(takes.len());
    for (i, (rel, sha, dur, label)) in takes.iter().enumerate() {
        let fields = DefaultClipFields::new();
        clips.push(Clip {
            id: format!("clip-{}", Uuid::new_v4()),
            track_id: track_id.clone(),
            source_path: (*rel).to_string(),
            source_sha256: (*sha).to_string(),
            start_ms: start_ms.max(0),
            offset_ms: 0,
            duration_ms: (*dur).max(0),
            gain_db: 0.0,
            fade_in_ms: 0,
            fade_out_ms: 0,
            source_tempo_bpm: fields.source_tempo_bpm,
            follow_project_tempo: fields.follow_project_tempo,
            time_stretch_ratio: fields.time_stretch_ratio,
            pitch_semitones: fields.pitch_semitones,
            processing_enabled: fields.processing_enabled,
            transient_markers_ms: fields.transient_markers_ms,
            take_group_id: group.clone(),
            take_index: Some(i as i32),
            take_label: Some((*label).to_string()),
            // Last take active by default (most recent loop pass).
            take_active: i + 1 == takes.len(),
        });
    }
    // Single take without a group: always audible.
    if takes.len() == 1 {
        if let Some(c) = clips.first_mut() {
            c.take_group_id = None;
            c.take_index = None;
            c.take_label = None;
            c.take_active = true;
        }
    }
    let track = MixTrack {
        id: track_id,
        role: "user".into(),
        name,
        gain_db: 0.0,
        pan: 0.0,
        mute: false,
        solo: false,
        locked: false,
        ai_separated: false,
        clips,
        experimental_vst3_insert: None,
    };
    mix.tracks.push(track.clone());
    track
}

pub fn new_mix_from_separation(
    mix_id: &str,
    sep_id: &str,
    stem_paths: &[(String, PathBuf, String, i64)],
) -> MixDoc {
    let mut tracks = Vec::new();
    // Only materialize tracks for stems that were actually produced.
    for (role, path, sha, dur) in stem_paths {
        if path.as_os_str().is_empty() {
            continue;
        }
        let name = TRACK_ROLES
            .iter()
            .find(|(r, _)| r == role)
            .map(|(_, n)| (*n).to_string())
            .unwrap_or_else(|| role.clone());
        let track_id = format!("trk-{role}");
        let (
            source_tempo_bpm,
            follow_project_tempo,
            time_stretch_ratio,
            pitch_semitones,
            processing_enabled,
            transient_markers_ms,
            take_group_id,
            take_index,
            take_label,
            take_active,
        ) = (
            None, false, 1.0_f32, 0.0_f32, true, None, None, None, None, true,
        );
        let clip = Clip {
            id: format!("clip-{}", Uuid::new_v4()),
            track_id: track_id.clone(),
            source_path: path.display().to_string(),
            source_sha256: sha.clone(),
            start_ms: 0,
            offset_ms: 0,
            duration_ms: *dur,
            gain_db: 0.0,
            fade_in_ms: 0,
            fade_out_ms: 0,
            source_tempo_bpm,
            follow_project_tempo,
            time_stretch_ratio,
            pitch_semitones,
            processing_enabled,
            transient_markers_ms,
            take_group_id,
            take_index,
            take_label,
            take_active,
        };
        tracks.push(MixTrack {
            id: track_id,
            role: role.clone(),
            name,
            gain_db: 0.0,
            pan: 0.0,
            mute: false,
            solo: false,
            locked: false,
            ai_separated: true,
            clips: vec![clip],
            experimental_vst3_insert: None,
        });
    }
    MixDoc {
        schema: crate::pins::SCHEMA_MIX.into(),
        schema_version: crate::pins::SCHEMA_VERSION,
        id: mix_id.into(),
        separation_id: sep_id.into(),
        sample_rate: SAMPLE_RATE,
        master_gain_db: 0.0,
        peak_ceiling_db: -1.0,
        tracks,
        tempo_map: Vec::new(),
        time_signatures: Vec::new(),
        markers: Vec::new(),
    }
}

fn db_to_linear(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

fn pan_gains(pan: f32) -> (f32, f32) {
    let pan = pan.clamp(-1.0, 1.0);
    let angle = (pan + 1.0) * std::f32::consts::FRAC_PI_4;
    (angle.cos(), angle.sin())
}

fn ms_to_samples(ms: i64) -> usize {
    if ms <= 0 {
        return 0;
    }
    (ms * SAMPLE_RATE as i64 / 1000) as usize
}

fn fade_gain(pos_in_clip: usize, duration_samples: usize, fade_in: usize, fade_out: usize) -> f32 {
    if duration_samples == 0 {
        return 0.0;
    }
    let mut g = 1.0f32;
    if fade_in > 0 && pos_in_clip < fade_in {
        g *= pos_in_clip as f32 / fade_in as f32;
    }
    if fade_out > 0 && pos_in_clip + fade_out >= duration_samples {
        let remaining = duration_samples.saturating_sub(pos_in_clip);
        g *= remaining as f32 / fade_out as f32;
    }
    g.clamp(0.0, 1.0)
}

fn resolve_clip_path(project_root: &Path, clip: &Clip) -> PathBuf {
    if Path::new(&clip.source_path).is_absolute() {
        PathBuf::from(&clip.source_path)
    } else {
        project_root.join(&clip.source_path)
    }
}

fn read_stereo_f32(path: &Path) -> Result<(Vec<f32>, Vec<f32>, u32), String> {
    let mut reader = WavReader::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let spec = reader.spec();
    let samples: Result<Vec<f32>, _> = match spec.sample_format {
        SampleFormat::Float => reader.samples::<f32>().collect(),
        SampleFormat::Int => {
            let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
            reader
                .samples::<i32>()
                .map(|s| s.map(|v| v as f32 / max))
                .collect()
        }
    };
    let mut samples = samples.map_err(|e| e.to_string())?;
    // Certains WAV « float » stockent encore l’échelle PCM16 (±32768). On ramène
    // en [-1, 1] pour éviter un carré après clamp à l’export 24 bits.
    let mut peak = 0f32;
    for s in &samples {
        peak = peak.max(s.abs());
    }
    if peak > 2.0 {
        let scale = if peak > 16_000.0 { 32768.0 } else { peak };
        for s in &mut samples {
            *s /= scale;
        }
    }
    let mut left = Vec::new();
    let mut right = Vec::new();
    if spec.channels == 1 {
        for s in samples {
            left.push(s);
            right.push(s);
        }
    } else {
        for chunk in samples.chunks(spec.channels as usize) {
            left.push(*chunk.first().unwrap_or(&0.0));
            right.push(*chunk.get(1).unwrap_or(chunk.first().unwrap_or(&0.0)));
        }
    }
    Ok((left, right, spec.sample_rate))
}

/// Niveaux de gain et de panoramique appliqués à un clip lors du rendu.
struct ClipLevels {
    track_lin: f32,
    pan_l: f32,
    pan_r: f32,
    master: f32,
}

/// Place un clip sur la timeline (start / offset / durée / fondus).
fn render_clip_onto(
    out_l: &mut [f32],
    out_r: &mut [f32],
    src_l: &[f32],
    src_r: &[f32],
    clip: &Clip,
    levels: ClipLevels,
) {
    let start = ms_to_samples(clip.start_ms);
    let offset = ms_to_samples(clip.offset_ms);
    let dur = ms_to_samples(clip.duration_ms).max(1);
    let fade_in = ms_to_samples(clip.fade_in_ms).min(dur);
    let fade_out = ms_to_samples(clip.fade_out_ms).min(dur.saturating_sub(fade_in));
    let clip_lin = db_to_linear(clip.gain_db);
    let lin = levels.master * levels.track_lin * clip_lin;

    for i in 0..dur {
        let out_idx = start + i;
        if out_idx >= out_l.len() {
            break;
        }
        let src_idx = offset + i;
        let l = src_l.get(src_idx).copied().unwrap_or(0.0);
        let r = src_r.get(src_idx).copied().unwrap_or(0.0);
        let fade = fade_gain(i, dur, fade_in, fade_out);
        out_l[out_idx] += lin * levels.pan_l * l * fade;
        out_r[out_idx] += lin * levels.pan_r * r * fade;
    }
}

fn timeline_len_samples(mix: &MixDoc) -> usize {
    let mut max_end = 0usize;
    for track in &mix.tracks {
        for clip in &track.clips {
            let end = ms_to_samples(clip.start_ms.saturating_add(clip.duration_ms));
            max_end = max_end.max(end);
        }
    }
    max_end.max(1)
}

pub fn render_mix(mix: &MixDoc, project_root: &Path, out_wav: &Path) -> Result<f32, String> {
    let any_solo = mix.tracks.iter().any(|t| t.solo);
    let max_len = timeline_len_samples(mix);
    let master = db_to_linear(mix.master_gain_db);
    let mut out_l = vec![0f32; max_len];
    let mut out_r = vec![0f32; max_len];

    for track in &mix.tracks {
        let silent = track.mute || (any_solo && !track.solo);
        if silent {
            continue;
        }
        let (pan_l, pan_r) = pan_gains(track.pan);
        let track_lin = db_to_linear(track.gain_db);
        for clip in &track.clips {
            if clip.source_path.is_empty() || clip.duration_ms <= 0 {
                continue;
            }
            let path = resolve_clip_path(project_root, clip);
            let (src_l, src_r, rate) = read_stereo_f32(&path)?;
            if rate != SAMPLE_RATE {
                return Err(format!(
                    "Sample rate inattendu {} (projet 48000) pour {}",
                    rate,
                    path.display()
                ));
            }
            render_clip_onto(
                &mut out_l,
                &mut out_r,
                &src_l,
                &src_r,
                clip,
                ClipLevels {
                    track_lin,
                    pan_l,
                    pan_r,
                    master,
                },
            );
        }
    }

    let mut peak = 0f32;
    for i in 0..max_len {
        peak = peak.max(out_l[i].abs()).max(out_r[i].abs());
    }
    let ceiling = db_to_linear(mix.peak_ceiling_db);
    let mut peak_trim_db = 0f32;
    if peak > ceiling && peak > 0.0 {
        let trim = ceiling / peak;
        peak_trim_db = 20.0 * trim.log10();
        for i in 0..max_len {
            out_l[i] *= trim;
            out_r[i] *= trim;
        }
    }

    if let Some(parent) = out_wav.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    let spec = WavSpec {
        channels: CHANNELS,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: BIT_DEPTH,
        sample_format: SampleFormat::Int,
    };
    let mut writer = WavWriter::create(out_wav, spec).map_err(|e| e.to_string())?;
    let max_i = (1i32 << 23) - 1;
    for i in 0..max_len {
        let l = (out_l[i].clamp(-1.0, 1.0) * max_i as f32).round() as i32;
        let r = (out_r[i].clamp(-1.0, 1.0) * max_i as f32).round() as i32;
        writer.write_sample(l).map_err(|e| e.to_string())?;
        writer.write_sample(r).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(peak_trim_db)
}

/// TPDF (triangular) dither — mastering practice for 16-bit delivery (#168).
/// Applied only when quantizing to 16 bits; never on 24-bit paths.
pub const TPDF_DITHER_FILTER: &str = "aresample=dither_method=triangular";

/// True only for the 16-bit delivery path (never 24-bit).
pub fn bit_depth_uses_tpdf_dither(bit_depth: u16) -> bool {
    bit_depth == 16
}

/// FFmpeg argv for 16-bit WAV with TPDF dither (no process spawn — unit-testable).
pub fn wav_16bit_tpdf_ffmpeg_args<'a>(src: &'a str, dest: &'a str) -> Vec<&'a str> {
    vec![
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        src,
        "-af",
        TPDF_DITHER_FILTER,
        "-c:a",
        "pcm_s16le",
        dest,
    ]
}

/// FFmpeg argv for FLAC at `bit_depth`. Includes TPDF dither only for 16 bits.
pub fn flac_bit_depth_ffmpeg_args<'a>(wav: &'a str, flac: &'a str, bit_depth: u16) -> Vec<&'a str> {
    let sample_fmt = if bit_depth == 16 { "s16" } else { "s32" };
    if bit_depth_uses_tpdf_dither(bit_depth) {
        vec![
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            wav,
            "-af",
            TPDF_DITHER_FILTER,
            "-c:a",
            "flac",
            "-sample_fmt",
            sample_fmt,
            flac,
        ]
    } else {
        vec![
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            wav,
            "-c:a",
            "flac",
            "-sample_fmt",
            sample_fmt,
            flac,
        ]
    }
}

pub fn export_flac_with_bit_depth(
    wav_path: &Path,
    flac_path: &Path,
    bit_depth: u16,
) -> Result<(), String> {
    let wav = wav_path.display().to_string();
    let flac = flac_path.display().to_string();
    let args = flac_bit_depth_ffmpeg_args(&wav, &flac, bit_depth);
    crate::resample::run_ffmpeg(&args).map_err(|e| format!("Export FLAC échoué ({e})."))
}

/// Conversion de livraison MP3 (bitrate CBR configurable) à partir du WAV primaire.
pub fn export_mp3_with_bitrate(
    wav_path: &Path,
    mp3_path: &Path,
    bitrate_kbps: u16,
) -> Result<(), String> {
    let rate = match bitrate_kbps {
        128 | 192 | 320 => bitrate_kbps,
        _ => 320,
    };
    let bitrate = format!("{rate}k");
    crate::resample::run_ffmpeg(&[
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        &wav_path.display().to_string(),
        "-codec:a",
        "libmp3lame",
        "-b:a",
        &bitrate,
        &mp3_path.display().to_string(),
    ])
    .map_err(|e| format!("Export MP3 échoué ({e}). Conversion de livraison uniquement."))
}

/// Re-encode a 24-bit WAV to 16-bit PCM when the user picks profondeur 16 (#168).
/// Uses triangular (TPDF) dither — never applied when keeping 24 bits.
pub fn downsample_wav_bit_depth(src: &Path, dest: &Path, bit_depth: u16) -> Result<(), String> {
    if bit_depth == 24 || bit_depth == 0 {
        if src != dest {
            std::fs::copy(src, dest).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    if bit_depth != 16 {
        return Err("Profondeur de bits : 16 ou 24.".into());
    }
    let src_s = src.display().to_string();
    let dest_s = dest.display().to_string();
    let args = wav_16bit_tpdf_ffmpeg_args(&src_s, &dest_s);
    crate::resample::run_ffmpeg(&args).map_err(|e| format!("Conversion 16 bits échouée ({e})."))
}

/// Naive 24→16 without dither (test oracle / contrast with TPDF).
#[cfg(test)]
fn downsample_wav_bit_depth_naive(src: &Path, dest: &Path) -> Result<(), String> {
    crate::resample::run_ffmpeg(&[
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        &src.display().to_string(),
        "-c:a",
        "pcm_s16le",
        &dest.display().to_string(),
    ])
    .map_err(|e| format!("Conversion 16 bits naïve échouée ({e})."))
}

#[allow(clippy::too_many_arguments)]
pub fn write_export_json_with_warnings(
    path: &Path,
    format: &str,
    audio_path: &Path,
    peak_trim_db: f32,
    bit_depth: u16,
    render_path: Option<&str>,
    match_mode: Option<&str>,
    warnings: &[String],
) -> Result<(), String> {
    let sha = sha256_file(audio_path)?;
    let bit_depth_json = if format == "mp3" {
        serde_json::Value::Null
    } else {
        serde_json::json!(bit_depth)
    };
    let mut doc = serde_json::json!({
        "schema": "songmaker.export",
        "schemaVersion": 1,
        "format": format,
        "path": audio_path.file_name().and_then(|s| s.to_str()).unwrap_or(""),
        "sampleRate": SAMPLE_RATE,
        "channels": CHANNELS,
        "bitDepth": bit_depth_json,
        "peakTrimDb": peak_trim_db,
        "sha256": sha,
        "role": if format == "mp3" { "delivery" } else { "primary" }
    });
    if let Some(rp) = render_path {
        doc["renderPath"] = serde_json::json!(rp);
    }
    if let Some(mm) = match_mode {
        doc["matchMode"] = serde_json::json!(mm);
    }
    if !warnings.is_empty() {
        doc["warnings"] = serde_json::json!(warnings);
    }
    atomic_write_json(path, &doc)
}

/// Write interleaved little-endian f32 PCM as 24-bit WAV (same quantize as render_mix).
pub fn write_interleaved_f32_wav(
    pcm_le: &[u8],
    sample_rate: u32,
    channels: u16,
    out_wav: &Path,
) -> Result<(), String> {
    if channels == 0 || !pcm_le.len().is_multiple_of(4 * channels as usize) {
        return Err("Tampon PCM invalide (attendu f32 LE entrelacé).".into());
    }
    if sample_rate != SAMPLE_RATE {
        return Err(format!(
            "Sample rate inattendu {sample_rate} (projet {SAMPLE_RATE})."
        ));
    }
    let frame_bytes = 4 * channels as usize;
    let frames = pcm_le.len() / frame_bytes;
    if let Some(parent) = out_wav.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    let spec = WavSpec {
        channels: CHANNELS,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: BIT_DEPTH,
        sample_format: SampleFormat::Int,
    };
    let mut writer = WavWriter::create(out_wav, spec).map_err(|e| e.to_string())?;
    let max_i = (1i32 << 23) - 1;
    for i in 0..frames {
        let base = i * frame_bytes;
        let mut samples = [0f32; 2];
        for (ch, slot) in samples
            .iter_mut()
            .enumerate()
            .take(channels.min(2) as usize)
        {
            let o = base + ch * 4;
            let bits = u32::from_le_bytes([pcm_le[o], pcm_le[o + 1], pcm_le[o + 2], pcm_le[o + 3]]);
            *slot = f32::from_bits(bits);
        }
        if channels == 1 {
            samples[1] = samples[0];
        }
        let l = (samples[0].clamp(-1.0, 1.0) * max_i as f32).round() as i32;
        let r = (samples[1].clamp(-1.0, 1.0) * max_i as f32).round() as i32;
        writer.write_sample(l).map_err(|e| e.to_string())?;
        writer.write_sample(r).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn wav_duration_ms(path: &Path) -> Result<i64, String> {
    let reader = WavReader::open(path).map_err(|e| e.to_string())?;
    let len = reader.duration() as i64;
    let rate = reader.spec().sample_rate as i64;
    if rate == 0 {
        return Ok(0);
    }
    Ok(len * 1000 / rate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fade_rampe_debut_et_fin() {
        assert!((fade_gain(0, 1000, 100, 100) - 0.0).abs() < 1e-5);
        assert!((fade_gain(50, 1000, 100, 100) - 0.5).abs() < 1e-5);
        assert!((fade_gain(500, 1000, 100, 100) - 1.0).abs() < 1e-5);
        assert!((fade_gain(950, 1000, 100, 100) - 0.5).abs() < 1e-5);
    }

    #[test]
    fn append_user_track_does_not_touch_ai_stems() {
        let mut mix = new_mix_from_separation(
            "mix-v1",
            "sep-1",
            &[(
                "vocals".into(),
                PathBuf::from("stems/vocals.wav"),
                "abc".into(),
                1000,
            )],
        );
        assert_eq!(mix.tracks.len(), 1);
        assert!(mix.tracks[0].ai_separated);
        let user = append_user_audio_track(
            &mut mix,
            "user-audio/normalized/u1.wav",
            "def",
            2000,
            "Ma voix",
            0,
        );
        assert_eq!(mix.tracks.len(), 2);
        assert!(!user.ai_separated);
        assert_eq!(user.role, "user");
        assert_eq!(user.clips[0].start_ms, 0);
        assert_eq!(user.clips[0].duration_ms, 2000);
        let punched = append_user_audio_track(
            &mut mix,
            "user-audio/normalized/u2.wav",
            "ghi",
            500,
            "Punch",
            1500,
        );
        assert_eq!(punched.clips[0].start_ms, 1500);
        assert!(mix.tracks[0].ai_separated);
        assert_eq!(mix.tracks[0].role, "vocals");
    }

    #[test]
    fn append_user_track_dedupes_names() {
        let mut mix = empty_mix("mix-v1");
        append_user_audio_track(&mut mix, "a.wav", "1", 100, "Custom", 0);
        append_user_audio_track(&mut mix, "b.wav", "2", 100, "Custom", 0);
        assert_eq!(mix.tracks[0].name, "Custom");
        assert_eq!(mix.tracks[1].name, "Custom (2)");
    }

    /// Very quiet stereo 24-bit WAV: amplitude sits between 16-bit LSB levels so
    /// TPDF dither must differ from simple truncation (#168).
    fn write_quiet_24bit_wav(path: &Path) -> Result<(), String> {
        let spec = WavSpec {
            channels: CHANNELS,
            sample_rate: SAMPLE_RATE,
            bits_per_sample: BIT_DEPTH,
            sample_format: SampleFormat::Int,
        };
        let mut writer = WavWriter::create(path, spec).map_err(|e| e.to_string())?;
        let max_i = (1i32 << 23) - 1;
        let frames = (SAMPLE_RATE / 10) as usize; // 100 ms
        for i in 0..frames {
            let phase = std::f32::consts::TAU * 440.0 * (i as f32) / SAMPLE_RATE as f32;
            // ~1.5 / 32768 full-scale → below one 16-bit LSB after naive round.
            let sample = (1.5 / 32768.0) * phase.sin();
            let q = (sample.clamp(-1.0, 1.0) * max_i as f32).round() as i32;
            writer.write_sample(q).map_err(|e| e.to_string())?;
            writer.write_sample(q).map_err(|e| e.to_string())?;
        }
        writer.finalize().map_err(|e| e.to_string())?;
        Ok(())
    }

    fn read_pcm16_payload(path: &Path) -> Result<Vec<u8>, String> {
        let reader = WavReader::open(path).map_err(|e| e.to_string())?;
        assert_eq!(reader.spec().bits_per_sample, 16);
        let mut out = Vec::new();
        for sample in reader.into_samples::<i16>() {
            let s = sample.map_err(|e| e.to_string())?;
            out.extend_from_slice(&s.to_le_bytes());
        }
        Ok(out)
    }

    #[test]
    fn tpdf_dither_args_are_16bit_only_without_ffmpeg() {
        assert!(bit_depth_uses_tpdf_dither(16));
        assert!(!bit_depth_uses_tpdf_dither(24));
        assert_eq!(TPDF_DITHER_FILTER, "aresample=dither_method=triangular");
        let wav_args = wav_16bit_tpdf_ffmpeg_args("in.wav", "out.wav");
        assert!(wav_args.contains(&"-af"));
        assert!(wav_args.contains(&TPDF_DITHER_FILTER));
        assert!(wav_args.contains(&"pcm_s16le"));
        let flac16 = flac_bit_depth_ffmpeg_args("in.wav", "out.flac", 16);
        assert!(flac16.contains(&TPDF_DITHER_FILTER));
        let flac24 = flac_bit_depth_ffmpeg_args("in.wav", "out.flac", 24);
        assert!(!flac24.contains(&TPDF_DITHER_FILTER));
        assert!(!flac24.contains(&"-af"));
    }

    #[test]
    fn tpdf_16bit_differs_from_naive_round_on_quiet_signal() {
        if crate::resample::resolve_ffmpeg().is_err() {
            eprintln!(
                "skip tpdf_16bit_differs_from_naive_round_on_quiet_signal: ffmpeg introuvable"
            );
            return;
        }
        let dir = std::env::temp_dir().join(format!(
            "song-maker-dither-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("quiet24.wav");
        let dithered = dir.join("out16-tpdf.wav");
        let naive = dir.join("out16-naive.wav");
        write_quiet_24bit_wav(&src).expect("write quiet wav");
        downsample_wav_bit_depth(&src, &dithered, 16).expect("tpdf 16-bit");
        downsample_wav_bit_depth_naive(&src, &naive).expect("naive 16-bit");
        let a = read_pcm16_payload(&dithered).unwrap();
        let b = read_pcm16_payload(&naive).unwrap();
        assert_eq!(a.len(), b.len());
        assert_ne!(
            a, b,
            "TPDF dither output must differ from simple truncation on a sub-LSB signal"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn downsample_24bit_leaves_wav_unchanged() {
        // 24-bit path is a filesystem copy — no ffmpeg required.
        let dir = std::env::temp_dir().join(format!(
            "song-maker-bit24-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("in24.wav");
        let dest = dir.join("out24.wav");
        write_quiet_24bit_wav(&src).unwrap();
        downsample_wav_bit_depth(&src, &dest, 24).unwrap();
        let a = std::fs::read(&src).unwrap();
        let b = std::fs::read(&dest).unwrap();
        assert_eq!(a, b, "24-bit path must not alter samples (no dither)");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn export_json_records_requested_bit_depth() {
        let dir = std::env::temp_dir().join(format!(
            "song-maker-export-json-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let wav = dir.join("x.wav");
        write_quiet_24bit_wav(&wav).unwrap();
        let json_path = dir.join("x.json");
        write_export_json_with_warnings(
            &json_path,
            "wav",
            &wav,
            0.0,
            16,
            Some("test"),
            Some("approximate"),
            &[],
        )
        .unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&json_path).unwrap()).unwrap();
        assert_eq!(v["bitDepth"], 16);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
