use crate::models::{FormInput, KeySig, Meter};
use crate::pins::{
    normalize_target_duration_sec, DURATION_SEC_MAX, DURATION_SEC_MIN, DURATION_SEC_STEP,
};
use regex::Regex;
use std::sync::OnceLock;
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

/// Keep draft lyrics in the project, but never send them for an instrumental take.
pub fn generation_lyrics(input: &FormInput) -> &str {
    if input.instrumental_mode {
        ""
    } else {
        &input.lyrics
    }
}

pub fn validate_lyrics(lyrics: &str, instrumental_mode: bool) -> Result<(), FormError> {
    let t = lyrics.trim();
    if t.chars().count() > 4000 {
        return Err(FormError::Message(if instrumental_mode {
            "Les paroles sont limitées à 4000 caractères.".into()
        } else {
            "Les paroles sont obligatoires (1 à 4000 caractères).".into()
        }));
    }
    if t.is_empty() && !instrumental_mode {
        return Err(FormError::Message(
            "Les paroles sont obligatoires (1 à 4000 caractères).".into(),
        ));
    }
    // YuE2 n’impose pas de liste fermée de balises : [Verse], [Solo], [Breakdown]…
    // sont envoyés tels quels dans `lyrics`. En mode instrumental, une chaîne vide
    // est acceptée (audio.cpp v0.8.2+ : paroles facultatives pour l’instrumental).
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
    if let Some(lang) = input
        .singing_language
        .as_ref()
        .filter(|_| !input.instrumental_mode)
    {
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
    if !(DURATION_SEC_MIN..=DURATION_SEC_MAX).contains(&sec)
        || !sec.is_multiple_of(DURATION_SEC_STEP)
    {
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

/// Remove explicit voice/chant directions from the effective prompt of an
/// instrumental take. The project keeps the user's original style text.
fn instrumental_style_without_vocal_cues(style: &str) -> String {
    static VOCAL_CUES: OnceLock<Regex> = OnceLock::new();
    let cues = VOCAL_CUES.get_or_init(|| {
        Regex::new(
            r"(?iux)
            (?:\b(?:with|and|no|not|without|avoiding?|excluding?|removed?|sans|avec|pas(?:\s+de)?|aucun(?:e)?|non|éviter|retirer)\s+)?
            (?:\b(?:a|an|the|some|any|un|une|la|le|les|des|du|de|male|female|masculin(?:e)?|féminin(?:e)?|lead|backing|background|spoken|word|human|choral|layered|powerful|soft|gentle|whispered|raspy|sung|singing|vocal)\s+){0,4}
            (?:
                vocal(?:s|ist|ists)?|voices?|sing(?:ing|er|ers)?|sung|growl(?:s|ing|ed)?|
                spoken(?:\s+word)?|choir|rapping|rapper(?:s)?|ad[\s-]?libs?|
                chant(?:er|é|ée|eur|euse)?|voix|paroles|chanteur|chanteuse
            )
            (?:\s+(?:female|male|féminin(?:e)?|masculin(?:e)?))?\b",
        )
        .expect("instrumental vocal-cue expression is valid")
    });

    let filtered = cues.replace_all(style, "");
    let mut cleaned = filtered.split_whitespace().collect::<Vec<_>>().join(" ");
    for (repeated, single) in [(", ,", ","), ("; ;", ";"), ("/ /", "/")] {
        while cleaned.contains(repeated) {
            cleaned = cleaned.replace(repeated, single);
        }
    }
    cleaned = cleaned
        .replace(" ,", ",")
        .replace(" ;", ";")
        .replace(" /", "/");
    cleaned
        .trim_matches(|ch: char| ch.is_whitespace() || matches!(ch, ',' | ';' | '/'))
        .to_string()
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
    if let Some(lang) = input
        .singing_language
        .as_ref()
        .filter(|_| !input.instrumental_mode)
    {
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
    let style = if input.instrumental_mode {
        instrumental_style_without_vocal_cues(input.style.trim())
    } else {
        input.style.trim().to_string()
    };

    let style_lower = style.to_lowercase();
    let push_unique = |parts: &mut Vec<String>, fragment: String| {
        let lower = fragment.to_lowercase();
        let already =
            parts.iter().any(|p| p.eq_ignore_ascii_case(&fragment)) || style_lower.contains(&lower);
        if !already && !fragment.is_empty() {
            parts.push(fragment);
        }
    };

    if let Some(lang) = input
        .singing_language
        .as_ref()
        .filter(|_| !input.instrumental_mode)
    {
        let l = lang.trim();
        if !l.is_empty() {
            push_unique(&mut parts, l.to_string());
        }
    }
    if !style.is_empty() {
        parts.push(style);
    }

    if input.instrumental_mode {
        push_unique(&mut parts, "instrumental".into());
        push_unique(&mut parts, "no vocals".into());
    }

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
    let cleaned = joined.trim().trim_matches(',').trim().to_string();
    if cleaned.is_empty() || cleaned.chars().count() > 1000 {
        return Err(FormError::Message(
            "Style assemblé invalide (1 à 1000 caractères).".into(),
        ));
    }
    Ok(cleaned)
}

pub fn audio_input_requested(input: &FormInput) -> bool {
    let path = input
        .audio_input_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    path.is_some() || input.inpaint_start_ms.is_some() || input.inpaint_end_ms.is_some()
}

pub fn refuse_unsupported_audio_input(input: &FormInput) -> Result<(), FormError> {
    if !audio_input_requested(input) {
        return Ok(());
    }
    Err(FormError::Message(
        "YuE2 / ACE-Step épinglés n’acceptent pas audio_input : pas de référence waveform ni d’inpainting d’une phrase. Ce n’est pas une reprise SheetSage2. Retirez la référence ou le masque.".into(),
    ))
}

#[cfg(test)]
pub fn validate_form(input: &FormInput) -> Result<String, FormError> {
    validate_form_for_engine(input, "yue2")
}

/// YuE2 / ACE-Step Turbo refuse audio_input. Lego (Base Python) accepts a source WAV
/// for mix/stems add-track only — not YuE2 waveform inpainting (#324).
pub fn validate_form_for_engine(input: &FormInput, engine: &str) -> Result<String, FormError> {
    validate_title(&input.title)?;
    validate_lyrics(&input.lyrics, input.instrumental_mode)?;
    validate_cot(&input.cot)?;
    validate_target_duration(input.target_duration_sec)?;
    if engine == "ace_step_lego" {
        if input.inpaint_start_ms.is_some() || input.inpaint_end_ms.is_some() {
            return Err(FormError::Message(
                "Lego n’est pas de l’inpainting YuE2 : retirez la fenêtre de masque.".into(),
            ));
        }
    } else {
        refuse_unsupported_audio_input(input)?;
    }
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
            instrumental_mode: false,
            continuation_generation_id: None,
            audio_input_path: None,
            inpaint_start_ms: None,
            inpaint_end_ms: None,
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
            false,
        )
        .unwrap();
    }

    #[test]
    fn rejects_empty_lyrics_outside_instrumental_mode() {
        assert!(validate_lyrics("", false).is_err());
        assert!(validate_lyrics("   ", false).is_err());
    }

    #[test]
    fn accepts_empty_lyrics_in_instrumental_mode() {
        validate_lyrics("", true).unwrap();
        validate_lyrics("   ", true).unwrap();
        let mut input = FormInput {
            title: "Night Drive".into(),
            style: "synthwave instrumental, no vocals".into(),
            lyrics: String::new(),
            cot: "full".into(),
            singing_language: None,
            tempo_bpm: None,
            key: None,
            meter: None,
            seed: None,
            target_duration_sec: 180,
            prefer_full_lyrics: true,
            instrumental_mode: true,
            continuation_generation_id: None,
            audio_input_path: None,
            inpaint_start_ms: None,
            inpaint_end_ms: None,
        };
        assemble_style_sent(&input).unwrap();
        validate_form(&input).unwrap();
        input.lyrics = "[Verse]\nParoles conservées".into();
        input.singing_language = Some("French".into());
        assert_eq!(generation_lyrics(&input), "");
        let style = assemble_style_sent(&input).unwrap();
        assert!(style.contains("no vocals"));
        assert!(!style.contains("French"));
        input.instrumental_mode = false;
        assert_eq!(generation_lyrics(&input), "[Verse]\nParoles conservées");
    }

    #[test]
    fn instrumental_prompt_ignores_vocal_cues_without_changing_saved_style() {
        let style = "indie rock with a female singer, warm analogue synths, no choir";
        let input = FormInput {
            title: "Night Drive".into(),
            style: style.into(),
            lyrics: "Draft lyrics remain in the project".into(),
            cot: "full".into(),
            singing_language: Some("French".into()),
            tempo_bpm: None,
            key: None,
            meter: None,
            seed: None,
            target_duration_sec: 180,
            prefer_full_lyrics: true,
            instrumental_mode: true,
            continuation_generation_id: None,
            audio_input_path: None,
            inpaint_start_ms: None,
            inpaint_end_ms: None,
        };

        let prompt = assemble_style_sent(&input).unwrap();
        assert!(prompt.contains("indie rock"));
        assert!(prompt.contains("warm analogue synths"));
        assert!(prompt.contains("instrumental"));
        assert!(prompt.contains("no vocals"));
        assert!(!prompt.contains("female"));
        assert!(!prompt.contains("singer"));
        assert!(!prompt.contains("choir"));
        assert!(!prompt.contains("French"));
        assert_eq!(input.style, style);
        assert_eq!(input.lyrics, "Draft lyrics remain in the project");
    }

    #[test]
    fn instrumental_rap_style_keeps_the_genre_and_removes_only_singing_cues() {
        let input = FormInput {
            title: "Instrumental beat".into(),
            style: "rap beat, rapping, deep bass".into(),
            lyrics: String::new(),
            cot: "full".into(),
            singing_language: None,
            tempo_bpm: None,
            key: None,
            meter: None,
            seed: None,
            target_duration_sec: 180,
            prefer_full_lyrics: true,
            instrumental_mode: true,
            continuation_generation_id: None,
            audio_input_path: None,
            inpaint_start_ms: None,
            inpaint_end_ms: None,
        };

        let prompt = assemble_style_sent(&input).unwrap();
        assert!(prompt.contains("rap beat"));
        assert!(prompt.contains("deep bass"));
        assert!(!prompt.contains("rapping"));
    }

    #[test]
    fn rejects_audio_input_on_pinned_engines() {
        let mut input = FormInput {
            title: "Phrase".into(),
            style: "pop".into(),
            lyrics: "un vers".into(),
            cot: "full".into(),
            singing_language: None,
            tempo_bpm: None,
            key: None,
            meter: None,
            seed: None,
            target_duration_sec: 180,
            prefer_full_lyrics: true,
            instrumental_mode: false,
            continuation_generation_id: None,
            audio_input_path: Some("/tmp/ref.wav".into()),
            inpaint_start_ms: Some(1000),
            inpaint_end_ms: Some(4000),
        };
        let err = validate_form(&input).unwrap_err().to_string();
        assert!(err.contains("audio_input"));
        assert!(err.contains("SheetSage2"));
        input.audio_input_path = None;
        input.inpaint_start_ms = None;
        input.inpaint_end_ms = None;
        validate_form(&input).unwrap();
        input.audio_input_path = Some("/tmp/mix.wav".into());
        validate_form_for_engine(&input, "ace_step_lego").unwrap();
        input.inpaint_start_ms = Some(0);
        assert!(validate_form_for_engine(&input, "ace_step_lego").is_err());
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
            instrumental_mode: false,
            continuation_generation_id: None,
            audio_input_path: None,
            inpaint_start_ms: None,
            inpaint_end_ms: None,
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
