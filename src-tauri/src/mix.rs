//! Rendu offline du mix (formule §10.5) + export WAV PCM 24 / FLAC 24.

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
];

pub fn new_mix_from_separation(
    mix_id: &str,
    sep_id: &str,
    stem_paths: &[(String, PathBuf, String, i64)],
) -> MixDoc {
    let mut tracks = Vec::new();
    for (role, name) in TRACK_ROLES {
        let (path, sha, dur) = stem_paths
            .iter()
            .find(|(r, _, _, _)| r == role)
            .map(|(_, p, s, d)| (p.display().to_string(), s.clone(), *d))
            .unwrap_or_else(|| (String::new(), String::new(), 0));
        let track_id = format!("trk-{role}");
        let clip = Clip {
            id: format!("clip-{}", Uuid::new_v4()),
            track_id: track_id.clone(),
            source_path: path,
            source_sha256: sha,
            start_ms: 0,
            offset_ms: 0,
            duration_ms: dur,
            gain_db: 0.0,
            fade_in_ms: 0,
            fade_out_ms: 0,
        };
        tracks.push(MixTrack {
            id: track_id,
            role: (*role).into(),
            name: (*name).into(),
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
    let samples = samples.map_err(|e| e.to_string())?;
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

pub fn render_mix(mix: &MixDoc, project_root: &Path, out_wav: &Path) -> Result<f32, String> {
    let any_solo = mix.tracks.iter().any(|t| t.solo);
    let mut max_len = 0usize;
    let mut buffers: Vec<(bool, f32, f32, f32, Vec<f32>, Vec<f32>)> = Vec::new();

    for track in &mix.tracks {
        let silent = track.mute || (any_solo && !track.solo);
        let clip = track.clips.first();
        let (left, right) = if let Some(clip) = clip {
            if clip.source_path.is_empty() {
                (Vec::new(), Vec::new())
            } else {
                let path = if Path::new(&clip.source_path).is_absolute() {
                    PathBuf::from(&clip.source_path)
                } else {
                    project_root.join(&clip.source_path)
                };
                let (l, r, rate) = read_stereo_f32(&path)?;
                if rate != SAMPLE_RATE {
                    return Err(format!(
                        "Sample rate inattendu {} (projet 48000) pour {}",
                        rate,
                        path.display()
                    ));
                }
                (l, r)
            }
        } else {
            (Vec::new(), Vec::new())
        };
        max_len = max_len.max(left.len()).max(right.len());
        let (pan_l, pan_r) = pan_gains(track.pan);
        let track_lin = db_to_linear(track.gain_db);
        let clip_lin = clip.map(|c| db_to_linear(c.gain_db)).unwrap_or(1.0);
        buffers.push((silent, track_lin * clip_lin, pan_l, pan_r, left, right));
    }

    let master = db_to_linear(mix.master_gain_db);
    let mut out_l = vec![0f32; max_len];
    let mut out_r = vec![0f32; max_len];
    for (silent, lin, pan_l, pan_r, left, right) in &buffers {
        if *silent {
            continue;
        }
        for i in 0..max_len {
            let l = left.get(i).copied().unwrap_or(0.0);
            let r = right.get(i).copied().unwrap_or(0.0);
            out_l[i] += master * lin * pan_l * l;
            out_r[i] += master * lin * pan_r * r;
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
    let status = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            &wav_path.display().to_string(),
            "-c:a",
            "flac",
            "-sample_fmt",
            "s32",
            &flac_path.display().to_string(),
        ])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Export FLAC échoué (ffmpeg).".into());
    }
    Ok(())
}

pub fn write_export_json(
    path: &Path,
    format: &str,
    audio_path: &Path,
    peak_trim_db: f32,
) -> Result<(), String> {
    let sha = sha256_file(audio_path)?;
    let doc = serde_json::json!({
        "schema": "songmaker.export",
        "schemaVersion": 1,
        "format": format,
        "path": audio_path.file_name().and_then(|s| s.to_str()).unwrap_or(""),
        "sampleRate": SAMPLE_RATE,
        "channels": CHANNELS,
        "bitDepth": BIT_DEPTH,
        "peakTrimDb": peak_trim_db,
        "sha256": sha
    });
    atomic_write_json(path, &doc)
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
