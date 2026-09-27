use crate::models::{FormInput, KeySig, Meter};
use crate::pins::{
    normalize_target_duration_sec, DURATION_SEC_MAX, DURATION_SEC_MIN, DURATION_SEC_STEP,
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum FormError {
    #[error("{0}")]
    Message(String),
}

pub fn validate_title(title: &str) -> Result<(), FormError> {
    let t = title.trim();
    if t.is_empty() || t.chars().count() > 120 {
        return Err(FormError::Message(
            "Le titre est obligatoire (1 à 120 caractères).".into(),
        ));
    }
    if t.ends_with('.') {
        return Err(FormError::Message(
            "Le titre ne doit pas se terminer par un point.".into(),
        ));
    }
    for ch in t.chars() {
        if matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
            return Err(FormError::Message(format!(
                "Caractère interdit dans le titre : {ch}"
            )));
        }
    }
    Ok(())
}

pub fn validate_lyrics(lyrics: &str) -> Result<(), FormError> {
    let t = lyrics.trim();
    if t.is_empty() || t.chars().count() > 4000 {
        return Err(FormError::Message(
            "Les paroles sont obligatoires (1 à 4000 caractères).".into(),
        ));
    }
    // YuE2 n’impose pas de liste fermée de balises : [Verse], [Solo], [Breakdown]…
    // sont envoyés tels quels dans `lyrics`.
    Ok(())
}

/// Brouillon : titre obligatoire, paroles/style peuvent être vides.
pub fn validate_draft_form(input: &FormInput) -> Result<(), FormError> {
    validate_title(&input.title)?;
    validate_cot(&input.cot)?;
    validate_target_duration(input.target_duration_sec)?;
    if input.lyrics.chars().count() > 4000 {
        return Err(FormError::Message(
            "Les paroles sont limitées à 4000 caractères.".into(),
        ));
    }
    if let Some(ref lang) = input.singing_language {
        let l = lang.trim();
        if !l.is_empty() && l.chars().count() > 40 {
            return Err(FormError::Message(
                "Langue du chant : 1 à 40 caractères.".into(),
            ));
        }
    }
    if let Some(bpm) = input.tempo_bpm {
        if !(40..=220).contains(&bpm) {
            return Err(FormError::Message("Tempo : entier 40 à 220.".into()));
        }
    }
    if let Some(ref key) = input.key {
        validate_key(key)?;
    }
    if let Some(ref meter) = input.meter {
        validate_meter(meter)?;
    }
    Ok(())
}

pub fn validate_target_duration(sec: u32) -> Result<u32, FormError> {
    if !(DURATION_SEC_MIN..=DURATION_SEC_MAX).contains(&sec) || sec % DURATION_SEC_STEP != 0 {
        return Err(FormError::Message(format!(
            "Durée cible : {DURATION_SEC_MIN} à {DURATION_SEC_MAX} s, par pas de {DURATION_SEC_STEP}."
        )));
    }
    Ok(normalize_target_duration_sec(sec))
}

pub fn validate_style(style: &str) -> Result<(), FormError> {
    let t = style.trim();
    if t.is_empty() {
        return Err(FormError::Message("Le style est obligatoire.".into()));
    }
    Ok(())
}

pub fn validate_cot(cot: &str) -> Result<(), FormError> {
    match cot {
        "full" | "melody" | "off" => Ok(()),
        _ => Err(FormError::Message(
            "cot doit être full, melody ou off.".into(),
        )),
    }
}

pub fn validate_key(key: &KeySig) -> Result<(), FormError> {
    let tonics = crate::pins::TONICS;
    if !tonics.contains(&key.tonic.as_str()) {
        return Err(FormError::Message(format!(
            "Tonique invalide : {}",
            key.tonic
        )));
    }
    if key.mode != "major" && key.mode != "minor" {
        return Err(FormError::Message("Mode invalide (major|minor).".into()));
    }
    Ok(())
}

pub fn validate_meter(meter: &Meter) -> Result<(), FormError> {
    let ok = matches!(
        (meter.numerator, meter.denominator),
        (4, 4) | (3, 4) | (6, 8) | (2, 4)
    );
    if !ok {
        return Err(FormError::Message(
            "Métrique autorisée : 4/4, 3/4, 6/8, 2/4.".into(),
        ));
    }
    Ok(())
}

/// Assemble le style envoyé au moteur, sans doubler un fragment déjà présent.
pub fn assemble_style_sent(input: &FormInput) -> Result<String, FormError> {
    validate_style(&input.style)?;
    if let Some(ref lang) = input.singing_language {
        let l = lang.trim();
        if !l.is_empty() && l.chars().count() > 40 {
            return Err(FormError::Message(
                "Langue du chant : 1 à 40 caractères.".into(),
            ));
        }
    }
    if let Some(bpm) = input.tempo_bpm {
        if !(40..=220).contains(&bpm) {
            return Err(FormError::Message("Tempo : entier 40 à 220.".into()));
        }
    }
    if let Some(ref key) = input.key {
        validate_key(key)?;
    }
    if let Some(ref meter) = input.meter {
        validate_meter(meter)?;
    }

    let mut parts: Vec<String> = Vec::new();
    let style = input.style.trim().to_string();

    let style_lower = style.to_lowercase();
    let push_unique = |parts: &mut Vec<String>, fragment: String| {
        let lower = fragment.to_lowercase();
        let already = parts.iter().any(|p| p.eq_ignore_ascii_case(&fragment))
            || style_lower.contains(&lower);
        if !already && !fragment.is_empty() {
            parts.push(fragment);
        }
    };

    if let Some(ref lang) = input.singing_language {
        let l = lang.trim();
        if !l.is_empty() {
            push_unique(&mut parts, l.to_string());
        }
    }
    parts.push(style);

    if let Some(bpm) = input.tempo_bpm {
        push_unique(&mut parts, format!("{bpm} BPM"));
    }
    if let Some(ref key) = input.key {
        push_unique(&mut parts, format!("key {} {}", key.tonic, key.mode));
    }
    if let Some(ref meter) = input.meter {
        push_unique(
            &mut parts,
            format!("{}/{}", meter.numerator, meter.denominator),
        );
    }

    let joined = parts.join(", ");
    let cleaned = joined
        .trim()
        .trim_matches(',')
        .trim()
        .to_string();
    if cleaned.is_empty() || cleaned.chars().count() > 1000 {
        return Err(FormError::Message(
            "Style assemblé invalide (1 à 1000 caractères).".into(),
        ));
    }
    Ok(cleaned)
}

pub fn validate_form(input: &FormInput) -> Result<String, FormError> {
    validate_title(&input.title)?;
    validate_lyrics(&input.lyrics)?;
    validate_cot(&input.cot)?;
    validate_target_duration(input.target_duration_sec)?;
    assemble_style_sent(input)
}

pub fn guidance_scale(cot: &str) -> f32 {
    if cot == "off" {
        1.01
    } else {
        1.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assembles_style_like_example() {
        let input = FormInput {
            title: "Midnight Signal".into(),
            style: "warm piano pop, expressive female voice".into(),
            lyrics: "[Verse]\nSoft morning light.".into(),
            cot: "full".into(),
            singing_language: Some("English".into()),
            tempo_bpm: Some(88),
            key: Some(KeySig {
                tonic: "C".into(),
                mode: "major".into(),
            }),
            meter: Some(Meter {
                numerator: 4,
                denominator: 4,
            }),
            seed: None,
            target_duration_sec: 180,
            prefer_full_lyrics: true,
        };
        let s = assemble_style_sent(&input).unwrap();
        assert_eq!(
            s,
            "English, warm piano pop, expressive female voice, 88 BPM, key C major, 4/4"
        );
    }

    #[test]
    fn accepts_freeform_section_tags() {
        validate_lyrics(
            "[Verse]\nHi\n[Breakdown]\nRiff\n[Solo]\nLead\n[Acapella]\nVoice\n[chorus 2]\nHook",
        )
        .unwrap();
    }

    #[test]
    fn draft_allows_empty_lyrics_and_style() {
        let input = FormInput {
            title: "Draft".into(),
            style: String::new(),
            lyrics: String::new(),
            cot: "full".into(),
            singing_language: None,
            tempo_bpm: None,
            key: None,
            meter: None,
            seed: None,
            target_duration_sec: 180,
            prefer_full_lyrics: true,
        };
        validate_draft_form(&input).unwrap();
    }

    #[test]
    fn accepts_duration_steps() {
        validate_target_duration(30).unwrap();
        validate_target_duration(180).unwrap();
        validate_target_duration(360).unwrap();
        assert!(validate_target_duration(45).is_err());
        assert!(validate_target_duration(0).is_err());
    }
}
