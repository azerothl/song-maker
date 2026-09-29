use crate::library::{load_project, project_folder};
use crate::paths::{atomic_write_json, ensure_dir, now_iso};
use serde_json::json;
use std::path::PathBuf;

fn portable_should_include(rel: &str) -> bool {
    let norm = rel.replace('\\', "/");
    let exclude_parts = [
        "/models/",
        "models/",
        "lora/",
        ".gguf",
        "cache/",
        "settings.json",
        "tokens",
        "credentials",
    ];
    for part in exclude_parts {
        if norm.contains(part) {
            return false;
        }
    }
    if norm == "project.json" {
        return true;
    }
    norm.starts_with("scores/")
        || norm.starts_with("generations/")
        || norm.starts_with("separations/")
        || norm.starts_with("mixes/")
        || norm.starts_with("user-audio/")
        || norm.starts_with("exports/")
}

fn portable_classify(rel: &str) -> &'static str {
    let p = rel.replace('\\', "/");
    if p == "project.json" {
        return "project";
    }
    if p.starts_with("scores/") && p.ends_with(".json") {
        return "score";
    }
    if p.ends_with(".mid") || p.ends_with(".midi") {
        return "midi";
    }
    if p.starts_with("mixes/") && p.ends_with(".production.json") {
        return "production";
    }
    if p.starts_with("mixes/") {
        return "mix";
    }
    if p.starts_with("exports/") && p.ends_with(".json") {
        return "export-meta";
    }
    if p.starts_with("generations/")
        || p.starts_with("separations/")
        || p.starts_with("user-audio/")
        || p.ends_with(".wav")
        || p.ends_with(".flac")
        || p.ends_with(".mp3")
    {
        return "media";
    }
    "other"
}

#[tauri::command]
pub fn save_production_overlay(
    id: String,
    mix_id: String,
    overlay: serde_json::Value,
) -> Result<(), String> {
    let folder = project_folder(&id);
    let mixes = folder.join("mixes");
    ensure_dir(&mixes).map_err(|e| e.to_string())?;
    let path = mixes.join(format!("{mix_id}.production.json"));
    atomic_write_json(&path, &overlay)
}

#[tauri::command]
pub fn load_production_overlay(
    id: String,
    mix_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let path = project_folder(&id)
        .join("mixes")
        .join(format!("{mix_id}.production.json"));
    if !path.is_file() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(Some(v))
}

#[tauri::command]
pub fn list_project_package_inventory(id: String) -> Result<Vec<serde_json::Value>, String> {
    let folder = project_folder(&id);
    if !folder.is_dir() {
        return Err("Projet introuvable.".into());
    }
    let mut out = Vec::new();
    for entry in walkdir::WalkDir::new(&folder).follow_links(false) {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() {
            continue;
        }
        let abs = entry.path();
        let rel = abs
            .strip_prefix(&folder)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if rel.contains("..") {
            continue;
        }
        let meta = std::fs::metadata(abs).ok();
        let byte_length = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        out.push(json!({
            "relativePath": rel,
            "byteLength": byte_length,
            "exists": true,
        }));
    }
    Ok(out)
}

#[tauri::command]
pub fn export_project_package(id: String) -> Result<serde_json::Value, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let exports = folder.join("exports");
    ensure_dir(&exports).map_err(|e| e.to_string())?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    let zip_path = exports.join(format!("portable-{id}-{stamp}.zip"));

    let file = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut artifacts = Vec::new();
    let mut estimated_bytes: u64 = 0;
    let mut excluded_bytes: u64 = 0;
    let missing: Vec<String> = Vec::new();

    // Rewrite absolute clip sourcePath values to project-relative when packing mixes.
    let mixes_dir = folder.join("mixes");
    if mixes_dir.is_dir() {
        for entry in std::fs::read_dir(&mixes_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            if path
                .file_name()
                .and_then(|s| s.to_str())
                .map(|n| n.ends_with(".production.json"))
                .unwrap_or(false)
            {
                continue;
            }
            let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            if let Ok(mut mix_val) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(tracks) = mix_val.get_mut("tracks").and_then(|t| t.as_array_mut()) {
                    for track in tracks {
                        if let Some(clips) = track.get_mut("clips").and_then(|c| c.as_array_mut()) {
                            for clip in clips {
                                if let Some(src) = clip.get("sourcePath").and_then(|s| s.as_str()) {
                                    let src_path = PathBuf::from(src);
                                    if src_path.is_absolute() {
                                        if let Ok(rel) = src_path.strip_prefix(&folder) {
                                            clip["sourcePath"] =
                                                json!(rel.to_string_lossy().replace('\\', "/"));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                let rel = path
                    .strip_prefix(&folder)
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .replace('\\', "/");
                let bytes = serde_json::to_vec_pretty(&mix_val).map_err(|e| e.to_string())?;
                zip.start_file(&rel, options).map_err(|e| e.to_string())?;
                use std::io::Write;
                zip.write_all(&bytes).map_err(|e| e.to_string())?;
                estimated_bytes += bytes.len() as u64;
                artifacts.push(json!({
                    "relativePath": rel,
                    "kind": "mix",
                    "byteLength": bytes.len(),
                    "included": true,
                }));
            }
        }
    }

    for entry in walkdir::WalkDir::new(&folder).follow_links(false) {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() {
            continue;
        }
        let abs = entry.path();
        let rel = abs
            .strip_prefix(&folder)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if rel.contains("..") {
            continue;
        }
        // Mix JSON already written with rewritten paths.
        if rel.starts_with("mixes/") && rel.ends_with(".json") && !rel.ends_with(".production.json")
        {
            continue;
        }
        let meta = std::fs::metadata(abs).map_err(|e| e.to_string())?;
        let len = meta.len();
        let include = portable_should_include(&rel);
        if include {
            zip.start_file(&rel, options).map_err(|e| e.to_string())?;
            let bytes = std::fs::read(abs).map_err(|e| e.to_string())?;
            use std::io::Write;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
            estimated_bytes += len;
        } else {
            excluded_bytes += len;
        }
        artifacts.push(json!({
            "relativePath": rel,
            "kind": portable_classify(&rel),
            "byteLength": len,
            "included": include,
            "reason": if include { serde_json::Value::Null } else {
                json!("Poids / cache / secrets exclus (pas de chemins absolus ni modèles).")
            },
        }));
    }

    let manifest = json!({
        "schema": "song-maker.portable-package",
        "schemaVersion": 1,
        "projectId": doc.id,
        "title": doc.title,
        "createdAt": now_iso(),
        "artifacts": artifacts,
        "estimatedBytes": estimated_bytes,
        "excludedBytes": excluded_bytes,
        "missing": missing,
        "licenses": [
            {
                "id": "yue2",
                "label": "YuE2",
                "summary": "Modèle CC BY-NC 4.0 — poids non inclus ; usage commercial interdit sans droits séparés."
            },
            {
                "id": "htdemucs",
                "label": "HTDemucs",
                "summary": "Séparateur de stems — poids ONNX/cache exclus du paquet portable."
            },
            {
                "id": "bs-roformer",
                "label": "BS-RoFormer (optionnel)",
                "summary": "Pack optionnel non commercial possible — jamais embarqué dans l’archive projet."
            }
        ],
        "notes": [
            "Chemins relatifs uniquement — réouverture sans dépendre des chemins absolus source.",
            "Export non destructif : le projet ouvert n’est pas modifié.",
            "Les poids de modèles et le cache LoRA ne sont jamais inclus."
        ]
    });
    zip.start_file("portable-manifest.json", options)
        .map_err(|e| e.to_string())?;
    {
        use std::io::Write;
        let bytes = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    zip.finish().map_err(|e| e.to_string())?;

    Ok(json!({
        "path": zip_path.display().to_string(),
        "plan": manifest,
    }))
}
