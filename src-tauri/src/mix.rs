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
    ((ms as i64) * SAMPLE_RATE as i64 / 1000) as usize
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

/// Place un clip sur la timeline (start / offset / durée / fondus).
fn render_clip_onto(
    out_l: &mut [f32],
    out_r: &mut [f32],
    src_l: &[f32],
    src_r: &[f32],
    clip: &Clip,
    track_lin: f32,
    pan_l: f32,
    pan_r: f32,
    master: f32,
) {
    let start = ms_to_samples(clip.start_ms);
    let offset = ms_to_samples(clip.offset_ms);
    let dur = ms_to_samples(clip.duration_ms).max(1);
    let fade_in = ms_to_samples(clip.fade_in_ms).min(dur);
    let fade_out = ms_to_samples(clip.fade_out_ms).min(dur.saturating_sub(fade_in));
    let clip_lin = db_to_linear(clip.gain_db);
    let lin = master * track_lin * clip_lin;

    for i in 0..dur {
        let out_idx = start + i;
        if out_idx >= out_l.len() {
            break;
        }
        let src_idx = offset + i;
        let l = src_l.get(src_idx).copied().unwrap_or(0.0);
        let r = src_r.get(src_idx).copied().unwrap_or(0.0);
        let fade = fade_gain(i, dur, fade_in, fade_out);
        out_l[out_idx] += lin * pan_l * l * fade;
        out_r[out_idx] += lin * pan_r * r * fade;
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
                track_lin,
                pan_l,
                pan_r,
                master,
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

pub fn export_flac(wav_path: &Path, flac_path: &Path) -> Result<(), String> {
    crate::resample::run_ffmpeg(&[
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        &wav_path.display().to_string(),
        "-c:a",
        "flac",
        "-sample_fmt",
        "s32",
        &flac_path.display().to_string(),
    ])
    .map_err(|e| format!("Export FLAC échoué ({e})."))
}

/// Conversion de livraison MP3 (320 kbps CBR) à partir du WAV primaire.
pub fn export_mp3(wav_path: &Path, mp3_path: &Path) -> Result<(), String> {
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
        "320k",
        &mp3_path.display().to_string(),
    ])
    .map_err(|e| format!("Export MP3 échoué ({e}). Conversion de livraison uniquement."))
}

pub fn write_export_json(
    path: &Path,
    format: &str,
    audio_path: &Path,
    peak_trim_db: f32,
) -> Result<(), String> {
    write_export_json_ex(path, format, audio_path, peak_trim_db, None, None)
}

pub fn write_export_json_ex(
    path: &Path,
    format: &str,
    audio_path: &Path,
    peak_trim_db: f32,
    render_path: Option<&str>,
    match_mode: Option<&str>,
) -> Result<(), String> {
    let sha = sha256_file(audio_path)?;
    let bit_depth = if format == "mp3" {
        serde_json::Value::Null
    } else {
        serde_json::json!(BIT_DEPTH)
    };
    let mut doc = serde_json::json!({
        "schema": "songmaker.export",
        "schemaVersion": 1,
        "format": format,
        "path": audio_path.file_name().and_then(|s| s.to_str()).unwrap_or(""),
        "sampleRate": SAMPLE_RATE,
        "channels": CHANNELS,
        "bitDepth": bit_depth,
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
    atomic_write_json(path, &doc)
}

/// Write interleaved little-endian f32 PCM as 24-bit WAV (same quantize as render_mix).
pub fn write_interleaved_f32_wav(
    pcm_le: &[u8],
    sample_rate: u32,
    channels: u16,
    out_wav: &Path,
) -> Result<(), String> {
    if channels == 0 || pcm_le.len() % (4 * channels as usize) != 0 {
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
        for ch in 0..channels.min(2) as usize {
            let o = base + ch * 4;
            let bits = u32::from_le_bytes([
                pcm_le[o],
                pcm_le[o + 1],
                pcm_le[o + 2],
                pcm_le[o + 3],
            ]);
            samples[ch] = f32::from_bits(bits);
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
}
