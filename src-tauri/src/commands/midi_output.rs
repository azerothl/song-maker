//! Native MIDI output, independent of Web MIDI availability (#170).
use midir::{MidiOutput, MidiOutputConnection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Default)]
struct Session {
    connection: Option<MidiOutputConnection>,
    generation: u64,
}

#[derive(Default)]
pub struct MidiOutputState(Mutex<Session>);

#[derive(Serialize)]
pub struct OutputPort {
    id: String,
    name: String,
}

fn output() -> Result<MidiOutput, String> {
    MidiOutput::new("Song Maker").map_err(|_| "MIDI_UNAVAILABLE".into())
}

fn port_key(driver_id: &str, name: &str) -> String {
    // WinMM's built-in GS synth has an empty interface ID.
    serde_json::to_string(&(driver_id, name)).expect("strings serialize")
}

#[tauri::command]
pub fn list_midi_outputs() -> Result<Vec<OutputPort>, String> {
    let midi = output()?;
    midi.ports()
        .iter()
        .map(|port| {
            let name = midi.port_name(port).map_err(|_| "MIDI_DISCONNECTED")?;
            Ok(OutputPort {
                id: port_key(&port.id(), &name),
                name,
            })
        })
        .collect()
}

fn panic_messages(mut send: impl FnMut(&[u8]) -> Result<(), String>) -> Result<(), String> {
    let mut failed = false;
    for channel in 0..16 {
        // Sustain off, All Notes Off and All Sound Off, then explicit Note Off
        // for instruments that do not implement the channel mode controllers.
        for controller in [64, 123, 120] {
            failed |= send(&[0xb0 | channel, controller, 0]).is_err();
        }
        for pitch in 0..128 {
            failed |= send(&[0x80 | channel, pitch, 0]).is_err();
        }
    }
    if failed {
        Err("MIDI_DISCONNECTED".into())
    } else {
        Ok(())
    }
}

fn stop(session: &mut Session) -> Result<(), String> {
    session.generation = session.generation.wrapping_add(1);
    if let Some(connection) = session.connection.as_mut() {
        panic_messages(|bytes| {
            connection
                .send(bytes)
                .map_err(|_| "MIDI_DISCONNECTED".into())
        })?;
    }
    Ok(())
}

#[tauri::command]
pub fn connect_midi_output(
    state: tauri::State<MidiOutputState>,
    port_id: String,
) -> Result<(), String> {
    let mut session = state.0.lock().map_err(|_| "MIDI_UNAVAILABLE")?;
    stop(&mut session)?;
    session.connection = None;
    let midi = output()?;
    let matches: Vec<_> = midi
        .ports()
        .into_iter()
        .filter(|port| {
            midi.port_name(port)
                .is_ok_and(|name| port_key(&port.id(), &name) == port_id)
        })
        .collect();
    if matches.len() != 1 {
        return Err("MIDI_DISCONNECTED".into());
    }
    let port = &matches[0];
    // Some drivers expose the same raw ID for multiple endpoints. The midir
    // backend resolves by raw ID, so refuse instead of opening another port.
    if midi
        .ports()
        .iter()
        .filter(|other| other.id() == port.id())
        .count()
        != 1
    {
        return Err("MIDI_DISCONNECTED".into());
    }
    session.connection = Some(
        midi.connect(port, "Song Maker output")
            .map_err(|_| "MIDI_DISCONNECTED")?,
    );
    Ok(())
}

#[tauri::command]
pub fn panic_midi_output(state: tauri::State<MidiOutputState>) -> Result<(), String> {
    let mut session = state.0.lock().map_err(|_| "MIDI_UNAVAILABLE")?;
    stop(&mut session)
}

#[tauri::command]
pub fn disconnect_midi_output(state: tauri::State<MidiOutputState>) -> Result<(), String> {
    let mut session = state.0.lock().map_err(|_| "MIDI_UNAVAILABLE")?;
    let result = stop(&mut session);
    session.connection = None;
    result
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Note {
    start_ms: f64,
    end_ms: f64,
    pitch: u8,
    velocity: u8,
}

fn events(notes: &[Note], channel: u8) -> Result<Vec<(Duration, [u8; 3])>, String> {
    if channel > 15 || notes.len() > 50_000 {
        return Err("MIDI_INVALID_SCORE".into());
    }
    let mut events = Vec::with_capacity(notes.len() * 2);
    for note in notes {
        if !note.start_ms.is_finite()
            || !note.end_ms.is_finite()
            || note.start_ms < 0.0
            || note.end_ms <= note.start_ms
            || note.end_ms > 3_600_000.0
            || note.pitch > 127
            || note.velocity == 0
            || note.velocity > 127
        {
            return Err("MIDI_INVALID_SCORE".into());
        }
        events.push((
            Duration::from_secs_f64(note.start_ms / 1000.0),
            [0x90 | channel, note.pitch, note.velocity],
        ));
        events.push((
            Duration::from_secs_f64(note.end_ms / 1000.0),
            [0x80 | channel, note.pitch, 0],
        ));
    }
    // Stop a repeated pitch before starting it again at the same timestamp.
    events.sort_by_key(|(time, bytes)| (*time, bytes[0] & 0xf0));
    Ok(events)
}

#[tauri::command]
pub async fn play_midi_output(
    state: tauri::State<'_, MidiOutputState>,
    notes: Vec<Note>,
    channel: u8,
    program: u8,
) -> Result<(), String> {
    if program > 127 {
        return Err("MIDI_INVALID_SCORE".into());
    }
    let events = events(&notes, channel)?;
    let generation = {
        let mut session = state.0.lock().map_err(|_| "MIDI_UNAVAILABLE")?;
        stop(&mut session)?;
        session
            .connection
            .as_mut()
            .ok_or("MIDI_DISCONNECTED")?
            .send(&[0xc0 | channel, program])
            .map_err(|_| "MIDI_DISCONNECTED")?;
        session.generation
    };
    let started = Instant::now();
    for (when, bytes) in events {
        loop {
            {
                let mut session = state.0.lock().map_err(|_| "MIDI_UNAVAILABLE")?;
                if session.generation != generation {
                    return Ok(());
                }
                if started.elapsed() >= when {
                    let result = session
                        .connection
                        .as_mut()
                        .ok_or("MIDI_DISCONNECTED")?
                        .send(&bytes)
                        .map_err(|_| "MIDI_DISCONNECTED".to_string());
                    if result.is_err() {
                        let _ = stop(&mut session);
                    }
                    result?;
                    break;
                }
            }
            tokio::time::sleep(
                when.saturating_sub(started.elapsed())
                    .min(Duration::from_millis(10)),
            )
            .await;
        }
    }
    let mut session = state.0.lock().map_err(|_| "MIDI_UNAVAILABLE")?;
    if session.generation == generation {
        stop(&mut session)?;
    }
    Ok(())
}

impl Drop for MidiOutputState {
    fn drop(&mut self) {
        if let Ok(session) = self.0.get_mut() {
            let _ = stop(session);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_empty_driver_id_is_not_the_empty_ui_selection() {
        let key = port_key("", "Microsoft GS Wavetable Synth");
        assert!(!key.is_empty());
        assert_ne!(key, port_key("", "Other synth"));
        assert_eq!(
            serde_json::from_str::<(String, String)>(&key).unwrap(),
            (String::new(), "Microsoft GS Wavetable Synth".into())
        );
    }
    #[test]
    #[ignore = "Requires an installed MIDI endpoint; diagnostic only"]
    fn installed_output_metadata() {
        for port in list_midi_outputs().unwrap() {
            println!("{}: id={:?}", port.name, port.id);
        }
    }
    #[test]
    fn panic_covers_every_channel_and_pitch_even_after_send_failure() {
        let mut sent = Vec::new();
        assert!(panic_messages(|bytes| {
            sent.push(bytes.to_vec());
            if sent.len() == 1 {
                Err("failure".into())
            } else {
                Ok(())
            }
        })
        .is_err());
        assert_eq!(sent.len(), 16 * 131);
        for channel in 0..16 {
            assert!(sent.contains(&vec![0xb0 | channel, 64, 0]));
            assert!(sent.contains(&vec![0xb0 | channel, 123, 0]));
            assert!(sent.contains(&vec![0xb0 | channel, 120, 0]));
            for pitch in 0..128 {
                assert!(sent.contains(&vec![0x80 | channel, pitch, 0]));
            }
        }
    }
    #[test]
    fn score_validates_before_output_and_orders_repeated_notes() {
        let note = |start_ms, end_ms| Note {
            start_ms,
            end_ms,
            pitch: 60,
            velocity: 90,
        };
        let ordered = events(&[note(0.0, 100.0), note(100.0, 200.0)], 2).unwrap();
        assert_eq!(ordered[1].1, [0x82, 60, 0]);
        assert_eq!(ordered[2].1, [0x92, 60, 90]);
        for bad in [
            note(f64::NAN, 10.0),
            note(-1.0, 10.0),
            note(2.0, 1.0),
            note(0.0, 3_600_001.0),
        ] {
            assert!(events(&[bad], 0).is_err());
        }
        assert!(events(&[], 16).is_err());
    }
}
