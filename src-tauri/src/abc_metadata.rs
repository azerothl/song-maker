//! Align ABC Q:/K:/M: headers with the generation form request (#106).

use crate::models::{KeySig, Meter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AbcHeaderMeta {
    pub tempo_bpm: Option<u32>,
    pub key: Option<KeySig>,
    pub meter: Option<Meter>,
}

#[derive(Debug, Clone)]
pub struct AbcAlignRequest {
    pub tempo_bpm: Option<u32>,
    pub key: Option<KeySig>,
    pub meter: Option<Meter>,
}

impl AbcAlignRequest {
    pub fn from_form(
        tempo_bpm: Option<u32>,
        key: Option<KeySig>,
        meter: Option<Meter>,
    ) -> Self {
        Self {
            tempo_bpm,
            key,
            meter,
        }
    }

    fn has_request(&self) -> bool {
        self.tempo_bpm.filter(|b| *b > 0).is_some()
            || self.key.is_some()
            || self.meter.is_some()
    }
}

pub fn format_abc_key_field(key: &KeySig) -> String {
    let base = match key.tonic.as_str() {
        "C#" => "^C",
        "Db" => "_D",
        "D#" => "^D",
        "Eb" => "_E",
        "F#" => "^F",
        "Gb" => "_G",
        "G#" => "^G",
        "Ab" => "_A",
        "A#" => "^A",
        "Bb" => "_B",
        other => other,
    };
    if key.mode == "minor" {
        format!("{base}m")
    } else {
        base.to_string()
    }
}

fn parse_tempo_field(raw: &str) -> Option<u32> {
    let t = raw.trim();
    if let Some(rest) = t.strip_prefix("1/4") {
        let rest = rest.trim().trim_start_matches('=').trim();
        return rest.parse().ok();
    }
    t.split(|c: char| !c.is_ascii_digit())
        .next()
        .and_then(|s| s.parse().ok())
}

fn parse_meter_field(raw: &str) -> Option<Meter> {
    let parts: Vec<&str> = raw.trim().split('/').collect();
    if parts.len() != 2 {
        return None;
    }
    Some(Meter {
        numerator: parts[0].trim().parse().ok()?,
        denominator: parts[1].trim().parse().ok()?,
    })
}

fn parse_key_field(raw: &str) -> Option<KeySig> {
    let trimmed = raw.trim();
    let bytes = trimmed.as_bytes();
    if bytes.is_empty() {
        return None;
    }
    let (accidental, letter_idx) = match bytes[0] {
        b'^' | b'_' | b'=' => (Some(bytes[0] as char), 1),
        _ => (None, 0),
    };
    let letter = trimmed.chars().nth(letter_idx)?.to_ascii_uppercase();
    if !('A'..='G').contains(&letter) {
        return None;
    }
    let tonic = match accidental {
        Some('^') => format!("{letter}#"),
        Some('_') => match letter {
            'D' => "Db".into(),
            'E' => "Eb".into(),
            'G' => "Gb".into(),
            'A' => "Ab".into(),
            'B' => "Bb".into(),
            _ => letter.to_string(),
        },
        _ => letter.to_string(),
    };
    let mode = if trimmed.to_ascii_lowercase().ends_with('m')
        || trimmed.to_ascii_lowercase().contains("min")
    {
        "minor"
    } else {
        "major"
    };
    Some(KeySig {
        tonic,
        mode: mode.into(),
    })
}

fn header_tag(line: &str) -> Option<(char, &str)> {
    let trimmed = line.trim();
    let (tag, rest) = trimmed.split_once(':')?;
    if tag.len() != 1 {
        return None;
    }
    let ch = tag.chars().next()?;
    if !ch.is_ascii_uppercase() {
        return None;
    }
    Some((ch, rest.trim()))
}

pub fn parse_abc_headers(abc: &str) -> AbcHeaderMeta {
    let mut tempo_bpm = None;
    let mut key = None;
    let mut meter = None;
    for line in abc.lines() {
        let Some((tag, value)) = header_tag(line) else {
            continue;
        };
        match tag {
            'Q' if tempo_bpm.is_none() => tempo_bpm = parse_tempo_field(value),
            'K' if key.is_none() => key = parse_key_field(value),
            'M' if meter.is_none() => meter = parse_meter_field(value),
            _ => {}
        }
    }
    AbcHeaderMeta {
        tempo_bpm,
        key,
        meter,
    }
}

/// Rewrite Q:/K:/M: so stored take ABC matches the form request.
pub fn align_abc_headers(abc: &str, request: &AbcAlignRequest) -> String {
    if !request.has_request() {
        return abc.to_string();
    }

    let mut lines: Vec<String> = abc.lines().map(|l| l.to_string()).collect();
    let trailing_nl = abc.ends_with('\n');
    let mut saw_q = false;
    let mut saw_k = false;
    let mut saw_m = false;
    let mut insert_after: Option<usize> = None;

    for (i, line) in lines.iter_mut().enumerate() {
        let Some((tag, _)) = header_tag(line) else {
            continue;
        };
        if tag == 'X' || tag == 'T' {
            insert_after = Some(i);
        }
        if tag == 'Q' {
            if let Some(bpm) = request.tempo_bpm.filter(|b| *b > 0) {
                *line = format!("Q:1/4={bpm}");
                saw_q = true;
            }
        }
        if tag == 'K' {
            if let Some(ref key) = request.key {
                *line = format!("K:{}", format_abc_key_field(key));
                saw_k = true;
            }
        }
        if tag == 'M' {
            if let Some(ref meter) = request.meter {
                *line = format!("M:{}/{}", meter.numerator, meter.denominator);
                saw_m = true;
            }
        }
    }

    let mut to_insert = Vec::new();
    if !saw_m {
        if let Some(ref meter) = request.meter {
            to_insert.push(format!(
                "M:{}/{}",
                meter.numerator, meter.denominator
            ));
        }
    }
    if !saw_q {
        if let Some(bpm) = request.tempo_bpm.filter(|b| *b > 0) {
            to_insert.push(format!("Q:1/4={bpm}"));
        }
    }
    if !saw_k {
        if let Some(ref key) = request.key {
            to_insert.push(format!("K:{}", format_abc_key_field(key)));
        }
    }

    if !to_insert.is_empty() {
        let at = insert_after.map(|i| i + 1).unwrap_or(0);
        for (offset, line) in to_insert.into_iter().enumerate() {
            lines.insert(at + offset, line);
        }
    }

    let before = parse_abc_headers(abc);
    let mut drift_bits = Vec::new();
    if let (Some(req), Some(got)) = (request.tempo_bpm.filter(|b| *b > 0), before.tempo_bpm) {
        if req != got {
            drift_bits.push(format!("Q={got}"));
        }
    }
    if let (Some(ref req), Some(ref got)) = (&request.key, &before.key) {
        if req != got {
            drift_bits.push(format!("K={}", format_abc_key_field(got)));
        }
    }
    if let (Some(ref req), Some(ref got)) = (&request.meter, &before.meter) {
        if req != got {
            drift_bits.push(format!("M={}/{}", got.numerator, got.denominator));
        }
    }
    if !drift_bits.is_empty()
        && !lines
            .iter()
            .any(|l| l.starts_with("% song-maker-meta:"))
    {
        let note = format!(
            "% song-maker-meta: model {} (aligned to request)",
            drift_bits.join(" ")
        );
        let x_idx = lines.iter().position(|l| l.trim().starts_with("X:"));
        let at = x_idx.map(|i| i + 1).unwrap_or(0);
        lines.insert(at, note);
    }

    let mut out = lines.join("\n");
    if trailing_nl {
        out.push('\n');
    }
    out
}

/// Align then write `score.abc`.
pub fn write_aligned_score_abc(
    path: &std::path::Path,
    abc: &str,
    request: &AbcAlignRequest,
) -> Result<(), String> {
    let aligned = align_abc_headers(abc, request);
    std::fs::write(path, aligned).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aligns_tempo_and_key_like_issue_106() {
        let abc = "X:1\nT:Demo\nM:4/4\nL:1/8\nQ:1/4=119\nK:Em\nC\n";
        let out = align_abc_headers(
            abc,
            &AbcAlignRequest {
                tempo_bpm: Some(112),
                key: Some(KeySig {
                    tonic: "D".into(),
                    mode: "minor".into(),
                }),
                meter: Some(Meter {
                    numerator: 4,
                    denominator: 4,
                }),
            },
        );
        assert!(out.contains("Q:1/4=112"));
        assert!(out.contains("K:Dm"));
        assert!(out.contains("M:4/4"));
        let meta = parse_abc_headers(&out);
        assert_eq!(meta.tempo_bpm, Some(112));
        assert_eq!(
            meta.key,
            Some(KeySig {
                tonic: "D".into(),
                mode: "minor".into()
            })
        );
    }

    #[test]
    fn inserts_missing_headers() {
        let out = align_abc_headers(
            "X:1\nT:x\nC",
            &AbcAlignRequest {
                tempo_bpm: Some(100),
                key: Some(KeySig {
                    tonic: "C".into(),
                    mode: "major".into(),
                }),
                meter: None,
            },
        );
        assert!(out.contains("Q:1/4=100"));
        assert!(out.contains("K:C"));
    }

    #[test]
    fn no_op_without_request() {
        let abc = "X:1\nQ:1/4=119\nK:Em\n";
        let out = align_abc_headers(abc, &AbcAlignRequest::from_form(None, None, None));
        assert_eq!(out, abc);
    }
}
