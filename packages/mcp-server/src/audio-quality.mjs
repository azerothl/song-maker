import { open } from 'node:fs/promises';

const NEAR_SILENCE_RMS = 0.001778279; // -55 dBFS
const CLIPPING_THRESHOLD = 0.999;
const SAMPLE_WINDOW_SEC = 0.25;
const SAMPLE_STEP_SEC = 0.5;
const REPORTED_QUIET_REGION_SEC = 1.5;
const DROPOUT_WARNING_SEC = 3;

async function readExactly(file, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, position + offset);
    if (bytesRead === 0) throw new Error('WAV tronqué : données inattendues en fin de fichier.');
    offset += bytesRead;
  }
}

function parseFormat(fmt) {
  if (fmt.length < 16) throw new Error('WAV invalide : bloc fmt trop court.');
  let format = fmt.readUInt16LE(0);
  const channels = fmt.readUInt16LE(2);
  const sampleRate = fmt.readUInt32LE(4);
  const blockAlign = fmt.readUInt16LE(12);
  const bitsPerSample = fmt.readUInt16LE(14);

  if (format === 0xfffe) {
    if (fmt.length < 40) throw new Error('WAV invalide : format extensible incomplet.');
    format = fmt.readUInt16LE(24);
  }

  const bytesPerSample = bitsPerSample / 8;
  const supportedPcm = format === 1 && [8, 16, 24, 32].includes(bitsPerSample);
  const supportedFloat = format === 3 && [32, 64].includes(bitsPerSample);
  if (!supportedPcm && !supportedFloat) {
    throw new Error(`WAV non pris en charge : format ${format}, ${bitsPerSample} bits.`);
  }
  if (!channels || !sampleRate || !Number.isInteger(bytesPerSample) || blockAlign !== channels * bytesPerSample) {
    throw new Error('WAV invalide : paramètres audio incohérents.');
  }
  return { format, channels, sampleRate, blockAlign, bitsPerSample, bytesPerSample };
}

function readSample(buffer, offset, format) {
  if (format.format === 3) {
    return format.bitsPerSample === 32 ? buffer.readFloatLE(offset) : buffer.readDoubleLE(offset);
  }
  switch (format.bitsPerSample) {
    case 8: return (buffer.readUInt8(offset) - 128) / 128;
    case 16: return buffer.readInt16LE(offset) / 32768;
    case 24: {
      let value = buffer.readUIntLE(offset, 3);
      if (value & 0x800000) value -= 0x1000000;
      return value / 8388608;
    }
    case 32: return buffer.readInt32LE(offset) / 2147483648;
    default: throw new Error('Profondeur WAV non prise en charge.');
  }
}

async function inspectFrameRange(file, dataChunks, format, startFrame, frameCount) {
  let sampleCount = 0;
  let clippedSamples = 0;
  let sumSquares = 0;
  let peak = 0;
  let chunkStartFrame = 0;
  const endFrame = startFrame + frameCount;

  for (const chunk of dataChunks) {
    const chunkFrames = chunk.size / format.blockAlign;
    const firstFrame = Math.max(startFrame, chunkStartFrame);
    const afterFrame = Math.min(endFrame, chunkStartFrame + chunkFrames);
    if (afterFrame > firstFrame) {
      const byteOffset = (firstFrame - chunkStartFrame) * format.blockAlign;
      const byteLength = (afterFrame - firstFrame) * format.blockAlign;
      const samples = Buffer.allocUnsafe(byteLength);
      await readExactly(file, samples, chunk.offset + byteOffset);
      for (let sampleOffset = 0; sampleOffset < samples.length; sampleOffset += format.bytesPerSample) {
        const value = readSample(samples, sampleOffset, format);
        if (!Number.isFinite(value)) throw new Error('WAV invalide : échantillon non fini.');
        const magnitude = Math.abs(value);
        peak = Math.max(peak, magnitude);
        sumSquares += value * value;
        if (magnitude >= CLIPPING_THRESHOLD) clippedSamples++;
        sampleCount++;
      }
    }
    chunkStartFrame += chunkFrames;
  }
  return { sampleCount, clippedSamples, sumSquares, peak };
}

export async function inspectWav(filePath) {
  const file = await open(filePath, 'r');
  try {
    const { size: fileSize } = await file.stat();
    const header = Buffer.alloc(12);
    await readExactly(file, header, 0);
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('Fichier audio invalide : signature RIFF/WAVE absente.');
    }

    const riffEnd = header.readUInt32LE(4) + 8;
    if (riffEnd < 12 || riffEnd > fileSize) throw new Error('WAV tronqué : taille RIFF incohérente.');
    let offset = 12;
    let fmt = null;
    const dataChunks = [];
    while (offset + 8 <= riffEnd) {
      const chunkHeader = Buffer.alloc(8);
      await readExactly(file, chunkHeader, offset);
      const chunkId = chunkHeader.toString('ascii', 0, 4);
      const chunkSize = chunkHeader.readUInt32LE(4);
      const dataOffset = offset + 8;
      const nextOffset = dataOffset + chunkSize + (chunkSize & 1);
      if (nextOffset > riffEnd) throw new Error(`WAV tronqué : bloc ${chunkId} incomplet.`);

      if (chunkId === 'fmt ') {
        const fmtBytes = Buffer.alloc(Math.min(chunkSize, 40));
        if (fmtBytes.length) await readExactly(file, fmtBytes, dataOffset);
        fmt = parseFormat(fmtBytes);
      } else if (chunkId === 'data') {
        dataChunks.push({ offset: dataOffset, size: chunkSize });
      }
      offset = nextOffset;
    }

    if (!fmt || !dataChunks.length) throw new Error('WAV invalide : bloc fmt ou données audio absents.');
    const dataBytes = dataChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    if (!dataBytes || dataChunks.some(chunk => chunk.size % fmt.blockAlign !== 0)) {
      throw new Error('WAV invalide : bloc audio vide ou incomplet.');
    }

    const frames = dataBytes / fmt.blockAlign;
    const windowFrames = Math.max(1, Math.round(fmt.sampleRate * SAMPLE_WINDOW_SEC));
    const stepFrames = Math.max(1, Math.round(fmt.sampleRate * SAMPLE_STEP_SEC));
    let sampleCount = 0;
    let clippedSamples = 0;
    let sumSquares = 0;
    let peak = 0;
    let quietWindowCount = 0;
    let quietStart = null;
    const quietRegions = [];
    const closeQuietRegion = (endFrame) => {
      if (quietStart === null) return;
      const startSec = quietStart / fmt.sampleRate;
      const endSec = Math.min(frames, endFrame) / fmt.sampleRate;
      const durationSec = Math.max(0, endSec - startSec);
      if (durationSec >= REPORTED_QUIET_REGION_SEC) {
        quietRegions.push({
          startSec: Math.round(startSec * 10) / 10,
          endSec: Math.round(endSec * 10) / 10,
          durationSec: Math.round(durationSec * 10) / 10,
        });
      }
      quietStart = null;
    };

    for (let startFrame = 0; startFrame < frames; startFrame += stepFrames) {
      const sample = await inspectFrameRange(file, dataChunks, fmt, startFrame, Math.min(windowFrames, frames - startFrame));
      sampleCount += sample.sampleCount;
      clippedSamples += sample.clippedSamples;
      sumSquares += sample.sumSquares;
      peak = Math.max(peak, sample.peak);
      const windowRms = Math.sqrt(sample.sumSquares / sample.sampleCount);
      if (windowRms <= NEAR_SILENCE_RMS) {
        if (quietStart === null) quietStart = startFrame;
        quietWindowCount++;
      } else {
        closeQuietRegion(startFrame);
      }
    }
    closeQuietRegion(frames);
    const rms = Math.sqrt(sumSquares / sampleCount);
    const dbfs = value => value > 0 ? 20 * Math.log10(value) : null;
    const clippingPercent = clippedSamples / sampleCount * 100;
    const warnings = [];
    if (rms <= NEAR_SILENCE_RMS) warnings.push('near_silence');
    if (quietRegions.some(region => region.durationSec >= DROPOUT_WARNING_SEC)) warnings.push('dropout_suspected');
    if (clippingPercent >= 0.1) warnings.push('clipping');

    return {
      durationSec: Math.round(frames / fmt.sampleRate * 100) / 100,
      sampledAudioSec: Math.round(sampleCount / fmt.channels / fmt.sampleRate * 100) / 100,
      sampleRateHz: fmt.sampleRate,
      channels: fmt.channels,
      bitDepth: fmt.bitsPerSample,
      sampledPeakDbfs: dbfs(peak) === null ? null : Math.round(dbfs(peak) * 10) / 10,
      sampledRmsDbfs: dbfs(rms) === null ? null : Math.round(dbfs(rms) * 10) / 10,
      sampledClippedSamples: clippedSamples,
      sampledClippedPercent: Math.round(clippingPercent * 1000) / 1000,
      sampledNearSilencePercent: Math.round(quietWindowCount * SAMPLE_STEP_SEC / (frames / fmt.sampleRate) * 1000) / 10,
      quietRegions,
      warnings,
    };
  } finally {
    await file.close();
  }
}
