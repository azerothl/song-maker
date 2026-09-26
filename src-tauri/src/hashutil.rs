use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 1024 * 64];
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

pub fn random_seed() -> u64 {
    // audio.cpp parse le seed via JSON (double) ; au-delà de 2^53 ce n'est plus
    // un entier exact → "seed must be an unsigned integer". La WebUI borne à u32.
    let mut bytes = [0u8; 4];
    getrandom::getrandom(&mut bytes).expect("CSPRNG");
    u32::from_le_bytes(bytes) as u64
}

/// Borne un seed utilisateur pour qu'il reste un entier JSON exact (et u32 côté UI).
pub fn normalize_seed(seed: u64) -> u64 {
    seed.min(u32::MAX as u64)
}
