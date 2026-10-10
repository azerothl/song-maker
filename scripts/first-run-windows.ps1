$ErrorActionPreference = 'Stop'
$tag = 'v0.9.1'
$release = "https://github.com/0xShug0/audio.cpp/releases/download/$tag"
$yue2 = 'https://huggingface.co/audio-cpp/Yue2-3B-GGUF/resolve/eb116220931de5f373d024d48800338178c7de51'
$htdemucs = 'https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/main'
$cache = if ($env:SONG_MAKER_CACHE) { $env:SONG_MAKER_CACHE } else { Join-Path $env:LOCALAPPDATA 'song-maker' }
$binDir = Join-Path $cache "binaries\$tag"
$modelDir = Join-Path $cache 'models\Yue2-3B-GGUF'
$htDir = Join-Path $cache 'models\htdemucs'
$pack = 'q4'

Write-Host 'Song Maker utilise YuE2 sous licence CC BY-NC 4.0 (usage commercial restreint).'
Write-Host 'La configuration télécharge plusieurs gigaoctets de modèles et de moteur audio.'
Write-Host 'La génération sous Windows nécessite une carte NVIDIA et un pilote récent (551.61 ou plus).'
if ((Read-Host 'Acceptez-vous cette licence et ces téléchargements ? (y/N)') -notmatch '^(y|yes|o|oui)$') {
  Write-Host 'Téléchargement annulé.'
  exit 1
}

function Get-VerifiedFile([string]$Url, [string]$Path, [string]$Sha256) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  Write-Host "Téléchargement : $(Split-Path -Leaf $Path)"
  & curl.exe --fail --location --retry 3 --continue-at - --output $Path $Url
  if ($LASTEXITCODE -ne 0) { throw "Téléchargement interrompu : $Path. Relancez le script pour reprendre." }
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $Sha256) { Remove-Item -LiteralPath $Path -Force; throw "SHA-256 invalide : $Path" }
}

$cudaZip = 'audio-v0.9.1-bin-windows-x64-cuda12.4.zip'
$cudaSha = 'f32a40f8fb14ac4772c9c25525f97715db228979178e51654da73aa65005c0ef'
$runtimeZip = 'audio-v0.9.1-cudart-windows-x64-cuda12.4.zip'
$runtimeSha = '8bfdce7cb00b5a51560b5ab0d444344d86a2f0d7e2727bb7f18c15ef4734451b'
Get-VerifiedFile "$release/$cudaZip" (Join-Path $binDir $cudaZip) $cudaSha
Get-VerifiedFile "$release/$runtimeZip" (Join-Path $binDir $runtimeZip) $runtimeSha
$runtimeDir = Join-Path $binDir 'windows-cuda12.4'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Expand-Archive -LiteralPath (Join-Path $binDir $cudaZip) -DestinationPath $runtimeDir -Force
Expand-Archive -LiteralPath (Join-Path $binDir $runtimeZip) -DestinationPath $runtimeDir -Force

if ($pack -eq 'q4') {
  $model = 'yue2-3b-q4_0.gguf'
  $modelSha = '97af67d7f800b362faee6e6bec806bddfcccb93f25fd3f9a1012724d95af6f4a'
} else {
  $model = 'yue2-3b-q8_0.gguf'
  $modelSha = 'f3a9e3b197bfd05aa4ae6ab2d4b93f6d57c8cc0ea39a4af7d151f58697c7cfb6'
}
Get-VerifiedFile "$yue2/$model" (Join-Path $modelDir $model) $modelSha
Get-VerifiedFile "$yue2/yue2-vae-f16.gguf" (Join-Path $modelDir 'yue2-vae-f16.gguf') 'd4f4a05d8f291ae820cd1e43609da3fa91b56465810091a2b08c3350b751719d'
foreach ($sidecar in @('yue2-model-config.json','yue2-generation-config.json','yue2-qwen.tiktoken','yue2-vae-config.json')) {
  $dest = Join-Path (Join-Path $modelDir 'sidecars') $sidecar
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
  $partial = "$dest.partial"
  Write-Host "Téléchargement : $sidecar"
  & curl.exe --fail --location --retry 3 --continue-at - --output $partial "$yue2/sidecars/$sidecar"
  if ($LASTEXITCODE -ne 0) { throw "Téléchargement interrompu : $sidecar. Relancez le script pour reprendre." }
  Move-Item -LiteralPath $partial -Destination $dest -Force
}
Get-VerifiedFile "$htdemucs/HTDemucs-GGUF/htdemucs-q8_0.gguf" (Join-Path $htDir 'htdemucs-q8_0.gguf') 'b0f532ac6e5f373aeb11fa0df73253251e133832d9c8b9942dc58f50bc5b4388'
Write-Host 'Configuration terminée. Vous pouvez ouvrir Song Maker.'
