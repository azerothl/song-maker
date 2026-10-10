use crate::models::{SavedLibraryTrack, UserLibraryDoc, UserPlaylist};
use crate::paths::{atomic_write_json, ensure_dir, now_iso, user_library_path};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime};

static USER_LIBRARY_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

struct CrossProcessLock(PathBuf);

impl Drop for CrossProcessLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn lock_file(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(".lock");
    PathBuf::from(name)
}

fn acquire_cross_process_lock(path: &Path) -> Result<CrossProcessLock, String> {
    let lock = lock_file(path);
    for attempt in 0..2 {
        match OpenOptions::new().write(true).create_new(true).open(&lock) {
            Ok(mut file) => {
                let _ = writeln!(file, "pid={} time={}", std::process::id(), now_iso());
                return Ok(CrossProcessLock(lock));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists && attempt == 0 => {
                let stale = fs::metadata(&lock)
                    .and_then(|metadata| metadata.modified())
                    .ok()
                    .and_then(|modified| SystemTime::now().duration_since(modified).ok())
                    .is_some_and(|age| age > Duration::from_secs(300));
                if stale {
                    let _ = fs::remove_file(&lock);
                    continue;
                }
                return Err(
                    "La Bibliothèque est en cours de modification. Réessaie dans un instant."
                        .into(),
                );
            }
            Err(error) => {
                return Err(format!(
                    "Verrouillage de la Bibliothèque impossible : {error}"
                ))
            }
        }
    }
    Err("La Bibliothèque est en cours de modification. Réessaie dans un instant.".into())
}

fn read_library(path: &Path) -> Result<Option<UserLibraryDoc>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Lecture de la Bibliothèque impossible : {error}")),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(
            "Le fichier de Bibliothèque doit être un fichier local au profil actif.".into(),
        );
    }
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) => return Err(format!("Lecture de la Bibliothèque impossible : {error}")),
    };
    let library: UserLibraryDoc = serde_json::from_str(&text)
        .map_err(|error| format!("Le fichier de Bibliothèque est invalide : {error}"))?;
    validate_library(&library)?;
    Ok(Some(library))
}

fn safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn validate_title(title: &str, label: &str) -> Result<(), String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 120 {
        return Err(format!("{label} : 1 à 120 caractères."));
    }
    Ok(())
}

fn validate_library(library: &UserLibraryDoc) -> Result<(), String> {
    if library.version != 1 {
        return Err("Version de Bibliothèque non prise en charge.".into());
    }
    if library.tracks.len() > 10_000 || library.playlists.len() > 1_000 {
        return Err("La Bibliothèque dépasse les limites autorisées.".into());
    }
    let mut playlist_ids = HashSet::new();
    for playlist in &library.playlists {
        validate_playlist(playlist)?;
        if !playlist_ids.insert(playlist.id.as_str()) {
            return Err("La Bibliothèque contient des identifiants de playlist en double.".into());
        }
    }
    let mut track_keys = HashSet::new();
    for track in &library.tracks {
        validate_track(track, &playlist_ids)?;
        if !track_keys.insert((track.project_id.as_str(), track.generation_id.as_str())) {
            return Err("La Bibliothèque contient le même titre plusieurs fois.".into());
        }
    }
    Ok(())
}

fn validate_playlist(playlist: &UserPlaylist) -> Result<(), String> {
    if !safe_id(&playlist.id) {
        return Err("Identifiant de playlist invalide.".into());
    }
    if playlist.created_at.len() > 80 {
        return Err("Date de création de playlist invalide.".into());
    }
    validate_title(&playlist.title, "Nom de playlist")
}

fn validate_track(track: &SavedLibraryTrack, playlist_ids: &HashSet<&str>) -> Result<(), String> {
    if !safe_id(&track.project_id) || !safe_id(&track.generation_id) {
        return Err("Identifiant de morceau invalide dans la Bibliothèque.".into());
    }
    validate_title(&track.title, "Titre de morceau")?;
    if track.added_at.len() > 80 {
        return Err("Date d’ajout invalide dans la Bibliothèque.".into());
    }
    let mut seen = HashSet::new();
    for id in &track.playlist_ids {
        if !playlist_ids.contains(id.as_str()) || !seen.insert(id.as_str()) {
            return Err("La Bibliothèque contient une playlist inconnue ou en double.".into());
        }
    }
    Ok(())
}

fn next_library_revision(
    previous: Option<chrono::DateTime<chrono::Utc>>,
    now: chrono::DateTime<chrono::Utc>,
) -> chrono::DateTime<chrono::Utc> {
    match previous {
        // The on-disk format keeps milliseconds, so compare at that precision
        // or two writes in the same millisecond can publish the same revision.
        Some(previous) if previous.timestamp_millis() >= now.timestamp_millis() => {
            previous + chrono::Duration::milliseconds(1)
        }
        _ => now,
    }
}

#[tauri::command]
pub fn get_user_library() -> Result<Option<UserLibraryDoc>, String> {
    read_library(&user_library_path())
}

fn save_library_at(
    path: &Path,
    mut library: UserLibraryDoc,
    expected_updated_at: Option<String>,
) -> Result<UserLibraryDoc, String> {
    validate_library(&library)?;
    if let Some(parent) = path.parent() {
        ensure_dir(parent).map_err(|error| error.to_string())?;
    }
    let process_lock = USER_LIBRARY_LOCK.get_or_init(|| Mutex::new(()));
    let _process_guard = process_lock
        .lock()
        .map_err(|_| "Verrou de Bibliothèque indisponible.".to_string())?;
    let _cross_process_guard = acquire_cross_process_lock(path)?;
    let current = read_library(path)?;
    match (&current, expected_updated_at.as_deref()) {
        (None, None) => {}
        (Some(current), Some(expected)) if current.updated_at == expected => {}
        (None, Some(_)) => {
            return Err("La Bibliothèque a changé. Recharge-la avant de réessayer.".into())
        }
        (Some(_), None) => {
            return Err("La Bibliothèque a changé. Recharge-la avant de réessayer.".into())
        }
        (Some(_), Some(_)) => {
            return Err("La Bibliothèque a changé. Recharge-la avant de réessayer.".into())
        }
    }
    let now = chrono::Utc::now();
    let previous = current
        .as_ref()
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(&value.updated_at).ok())
        .map(|value| value.with_timezone(&chrono::Utc));
    let timestamp = next_library_revision(previous, now);
    library.updated_at = timestamp.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    atomic_write_json(path, &library)?;
    Ok(library)
}

#[tauri::command]
pub fn save_user_library(
    library: UserLibraryDoc,
    expected_updated_at: Option<String>,
) -> Result<UserLibraryDoc, String> {
    save_library_at(&user_library_path(), library, expected_updated_at)
}

#[cfg(test)]
mod tests {
    use super::{next_library_revision, read_library, save_library_at};
    use crate::models::UserLibraryDoc;
    use std::fs;
    use std::path::PathBuf;

    fn temp_library_path() -> PathBuf {
        std::env::temp_dir()
            .join(format!("song-maker-user-library-{}", uuid::Uuid::new_v4()))
            .join("user-library.json")
    }

    #[test]
    fn library_saves_atomically_and_rejects_stale_revisions() {
        let path = temp_library_path();
        let initial = UserLibraryDoc {
            version: 1,
            tracks: vec![],
            playlists: vec![],
            updated_at: String::new(),
        };
        let first = save_library_at(&path, initial, None).unwrap();
        let mut changed = first.clone();
        changed.playlists.push(crate::models::UserPlaylist {
            id: "playlist-1".into(),
            title: "Night drive".into(),
            created_at: "2026-10-10T00:00:00Z".into(),
        });
        let second = save_library_at(&path, changed, Some(first.updated_at.clone())).unwrap();
        assert_ne!(second.updated_at, first.updated_at);

        let mut stale = first;
        stale.playlists.push(crate::models::UserPlaylist {
            id: "playlist-2".into(),
            title: "Stale write".into(),
            created_at: "2026-10-10T00:00:00Z".into(),
        });
        let stale_revision = stale.updated_at.clone();
        let error = save_library_at(&path, stale, Some(stale_revision)).unwrap_err();
        assert!(error.contains("Bibliothèque a changé"));
        assert_eq!(read_library(&path).unwrap().unwrap().playlists.len(), 1);
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn library_revision_advances_when_writes_share_one_millisecond() {
        let previous = chrono::DateTime::parse_from_rfc3339("2026-10-10T01:02:03.635Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        let now = chrono::DateTime::parse_from_rfc3339("2026-10-10T01:02:03.635400Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        let next = next_library_revision(Some(previous), now);

        assert_eq!(next.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "2026-10-10T01:02:03.636Z");
    }
}
