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

pub fn verify_sha256(path: &Path, expected: &str) -> Result<(), String> {
    let got = sha256_file(path)?;
    if got != expected {
        return Err(format!(
            "Hash invalide pour {}.\n  attendu: {}\n  obtenu:  {}",
            path.display(),
            expected,
            got
        ));
    }
    Ok(())
}

pub fn random_seed() -> u64 {
    let mut bytes = [0u8; 8];
    getrandom::getrandom(&mut bytes).expect("CSPRNG");
    u64::from_le_bytes(bytes) & (u64::MAX >> 1)
}
