/**
 * Minimal SF2 loader for the built-in MIDI instrument (#329).
 *
 * Plays 16-bit `smpl` data via Web Audio when a user-selected bank is loaded.
 * Not a full SoundFont modulator engine. Oscillator fallback stays in SoftSynth.
 */

export type Sf2Preset = {
  name: string;
  bank: number;
  program: number;
};

export type Sf2Zone = {
  lo: number;
  hi: number;
  sample: Float32Array;
  sampleRate: number;
  rootKey: number;
  loopStart: number;
  loopEnd: number;
  loop: boolean;
};

export type Sf2Bank = {
  presets: Sf2Preset[];
  /** Zones per preset index (same order as `presets`). */
  zones: Sf2Zone[][];
};

function u16(view: DataView, o: number): number {
  return view.getUint16(o, true);
}
function u32(view: DataView, o: number): number {
  return view.getUint32(o, true);
}
function cstr(bytes: Uint8Array, o: number, n: number): string {
  let end = o;
  while (end < o + n && bytes[end] !== 0) end += 1;
  return new TextDecoder("latin1").decode(bytes.subarray(o, end)).trim();
}
function fourcc(bytes: Uint8Array, o: number): string {
  return String.fromCharCode(
    bytes[o] ?? 0,
    bytes[o + 1] ?? 0,
    bytes[o + 2] ?? 0,
    bytes[o + 3] ?? 0,
  );
}

type Chunk = { id: string; start: number; size: number };

function walkRiff(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (fourcc(bytes, 0) !== "RIFF" || fourcc(bytes, 8) !== "sfbk") {
    throw new Error("SF2_INVALID");
  }
  const chunks: Chunk[] = [];
  const walk = (start: number, end: number) => {
    let o = start;
    while (o + 8 <= end) {
      const id = fourcc(bytes, o);
      const size = u32(view, o + 4);
      const data = o + 8;
      const next = data + size + (size & 1);
      if (id === "LIST") {
        const listType = fourcc(bytes, data);
        chunks.push({ id: listType, start: data + 4, size: size - 4 });
        walk(data + 4, data + size);
      } else {
        chunks.push({ id, start: data, size });
      }
      o = next;
    }
  };
  walk(12, bytes.byteLength);
  return chunks;
}

type Shdr = {
  name: string;
  start: number;
  end: number;
  startLoop: number;
  endLoop: number;
  sampleRate: number;
  originalPitch: number;
};

function parseShdr(bytes: Uint8Array, start: number, size: number): Shdr[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Shdr[] = [];
  for (let o = start; o + 46 <= start + size; o += 46) {
    const name = cstr(bytes, o, 20);
    if (name === "EOS") break;
    out.push({
      name,
      start: u32(view, o + 20),
      end: u32(view, o + 24),
      startLoop: u32(view, o + 28),
      endLoop: u32(view, o + 32),
      sampleRate: u32(view, o + 36),
      originalPitch: bytes[o + 40] ?? 60,
    });
  }
  return out;
}

type Phdr = { name: string; preset: number; bank: number; bag: number };

function parsePhdr(bytes: Uint8Array, start: number, size: number): Phdr[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Phdr[] = [];
  for (let o = start; o + 38 <= start + size; o += 38) {
    const name = cstr(bytes, o, 20);
    if (name === "EOP") break;
    out.push({
      name,
      preset: u16(view, o + 20),
      bank: u16(view, o + 22),
      bag: u16(view, o + 24),
    });
  }
  return out;
}

function parseBags(
  bytes: Uint8Array,
  start: number,
  size: number,
): { gen: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: { gen: number }[] = [];
  for (let o = start; o + 4 <= start + size; o += 4) {
    out.push({ gen: u16(view, o) });
  }
  return out;
}

function parseInst(
  bytes: Uint8Array,
  start: number,
  size: number,
): { name: string; bag: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: { name: string; bag: number }[] = [];
  for (let o = start; o + 22 <= start + size; o += 22) {
    const name = cstr(bytes, o, 20);
    if (name === "EOI") break;
    out.push({ name, bag: u16(view, o + 20) });
  }
  return out;
}

type Gen = { op: number; amount: number };

function parseGens(bytes: Uint8Array, start: number, size: number): Gen[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Gen[] = [];
  for (let o = start; o + 4 <= start + size; o += 4) {
    out.push({ op: u16(view, o), amount: view.getInt16(o + 2, true) });
  }
  return out;
}

function rangeHiLo(amount: number): { lo: number; hi: number } {
  const lo = amount & 0xff;
  const hi = (amount >> 8) & 0xff;
  return { lo, hi };
}

function gensInBag(bags: { gen: number }[], gens: Gen[], bagIndex: number): Gen[] {
  const start = bags[bagIndex]?.gen ?? 0;
  const end = bags[bagIndex + 1]?.gen ?? gens.length;
  return gens.slice(start, end);
}

function pcmFromSmpl(
  smpl: Int16Array,
  start: number,
  end: number,
): Float32Array {
  const lo = Math.max(0, start);
  const hi = Math.min(smpl.length, Math.max(lo + 1, end));
  const out = new Float32Array(hi - lo);
  for (let i = 0; i < out.length; i++) {
    out[i] = (smpl[lo + i] ?? 0) / 32768;
  }
  return out;
}

export function parseSf2(buffer: ArrayBuffer): Sf2Bank {
  const bytes = new Uint8Array(buffer);
  const chunks = walkRiff(bytes);
  const find = (id: string) => chunks.find((c) => c.id === id);
  const smpl = find("smpl");
  const shdrC = find("shdr");
  const phdrC = find("phdr");
  const pbagC = find("pbag");
  const pgenC = find("pgen");
  const instC = find("inst");
  const ibagC = find("ibag");
  const igenC = find("igen");
  if (!smpl || !shdrC || !phdrC || !pbagC || !pgenC || !instC || !ibagC || !igenC) {
    throw new Error("SF2_INVALID");
  }
  const sampleCount = Math.floor(smpl.size / 2);
  const smplI16 = new Int16Array(buffer, smpl.start, sampleCount);
  const shdrs = parseShdr(bytes, shdrC.start, shdrC.size);
  const phdrs = parsePhdr(bytes, phdrC.start, phdrC.size);
  const pbags = parseBags(bytes, pbagC.start, pbagC.size);
  const pgens = parseGens(bytes, pgenC.start, pgenC.size);
  const insts = parseInst(bytes, instC.start, instC.size);
  const ibags = parseBags(bytes, ibagC.start, ibagC.size);
  const igens = parseGens(bytes, igenC.start, igenC.size);

  const presets: Sf2Preset[] = [];
  const zones: Sf2Zone[][] = [];

  for (let p = 0; p < phdrs.length; p++) {
    const ph = phdrs[p]!;
    const nextBag = phdrs[p + 1]?.bag ?? pbags.length;
    const presetGens: Gen[] = [];
    for (let b = ph.bag; b < nextBag; b++) {
      presetGens.push(...gensInBag(pbags, pgens, b));
    }
    const instGen = presetGens.find((g) => g.op === 41);
    const instIndex = instGen ? instGen.amount : 0;
    const inst = insts[instIndex];
    if (!inst) continue;
    const instNext = insts[instIndex + 1]?.bag ?? ibags.length;
    const presetZones: Sf2Zone[] = [];
    for (let b = inst.bag; b < instNext; b++) {
      const gens = gensInBag(ibags, igens, b);
      const sampleGen = gens.find((g) => g.op === 53);
      if (!sampleGen) continue;
      const sh = shdrs[sampleGen.amount];
      if (!sh) continue;
      const kr = gens.find((g) => g.op === 43);
      const { lo, hi } = kr ? rangeHiLo(kr.amount) : { lo: 0, hi: 127 };
      const rootGen = gens.find((g) => g.op === 58);
      const mode = gens.find((g) => g.op === 54);
      presetZones.push({
        lo,
        hi,
        sample: pcmFromSmpl(smplI16, sh.start, sh.end),
        sampleRate: sh.sampleRate || 22050,
        rootKey: rootGen ? rootGen.amount : sh.originalPitch,
        loopStart: Math.max(0, sh.startLoop - sh.start),
        loopEnd: Math.max(0, sh.endLoop - sh.start),
        loop: ((mode?.amount ?? 0) & 1) === 1,
      });
    }
    if (presetZones.length === 0) continue;
    presets.push({ name: ph.name || `preset ${ph.preset}`, bank: ph.bank, program: ph.preset });
    zones.push(presetZones);
  }
  if (presets.length === 0) {
    throw new Error("SF2_EMPTY");
  }
  return { presets, zones };
}

export function pickSf2Zone(
  bank: Sf2Bank,
  presetIndex: number,
  pitch: number,
): Sf2Zone | null {
  const list = bank.zones[presetIndex];
  if (!list || list.length === 0) return null;
  const p = Math.max(0, Math.min(127, Math.round(pitch)));
  return list.find((z) => p >= z.lo && p <= z.hi) ?? list[0] ?? null;
}

/** Build a tiny in-memory SF2 (one sine sample, one preset) for tests. */
export function buildTestSf2(opts?: {
  sampleRate?: number;
  rootKey?: number;
}): ArrayBuffer {
  const sr = opts?.sampleRate ?? 22050;
  const root = opts?.rootKey ?? 60;
  const n = 256;
  const smpl = new Int16Array(n + 46);
  for (let i = 0; i < n; i++) {
    smpl[i] = Math.round(Math.sin((2 * Math.PI * i) / n) * 16000);
  }

  const infoBody = (() => {
    const payload = new Uint8Array(4);
    new DataView(payload.buffer).setUint16(0, 2, true);
    new DataView(payload.buffer).setUint16(2, 1, true);
    const out = new Uint8Array(8 + 4);
    out.set([0x69, 0x66, 0x69, 0x6c]);
    new DataView(out.buffer).setUint32(4, 4, true);
    out.set(payload, 8);
    return out;
  })();

  const smplBytes = new Uint8Array(smpl.buffer);
  const sdtaInner = new Uint8Array(8 + smplBytes.length);
  sdtaInner.set([0x73, 0x6d, 0x70, 0x6c]);
  new DataView(sdtaInner.buffer).setUint32(4, smplBytes.length, true);
  sdtaInner.set(smplBytes, 8);

  const rec = (nBytes: number) => new Uint8Array(nBytes);
  const phdr = rec(38 * 2);
  const name = new TextEncoder().encode("TestSine");
  phdr.set(name, 0);
  new DataView(phdr.buffer).setUint16(20, 0, true);
  new DataView(phdr.buffer).setUint16(22, 0, true);
  new DataView(phdr.buffer).setUint16(24, 0, true);
  const eop = new TextEncoder().encode("EOP");
  phdr.set(eop, 38);
  new DataView(phdr.buffer).setUint16(38 + 24, 1, true);

  const pbag = rec(4 * 2);
  const pmod = rec(10);
  const pgen = rec(4 * 2);
  new DataView(pgen.buffer).setUint16(0, 41, true);
  new DataView(pgen.buffer).setInt16(2, 0, true);

  const inst = rec(22 * 2);
  const iname = new TextEncoder().encode("sine");
  inst.set(iname, 0);
  new DataView(inst.buffer).setUint16(20, 0, true);
  inst.set(new TextEncoder().encode("EOI"), 22);
  new DataView(inst.buffer).setUint16(22 + 20, 1, true);

  const ibag = rec(4 * 2);
  const imod = rec(10);
  const igen = rec(4 * 2);
  new DataView(igen.buffer).setUint16(0, 53, true);
  new DataView(igen.buffer).setInt16(2, 0, true);

  const shdr = rec(46 * 2);
  const sname = new TextEncoder().encode("sine");
  shdr.set(sname, 0);
  const sv = new DataView(shdr.buffer);
  sv.setUint32(20, 0, true);
  sv.setUint32(24, n, true);
  sv.setUint32(28, 0, true);
  sv.setUint32(32, n, true);
    sv.setUint32(36, sr, true);
    shdr[40] = root;
    shdr.set(new TextEncoder().encode("EOS"), 46);
  shdr.set(new TextEncoder().encode("EOS"), 46);

  const pdtaChunks: { id: string; data: Uint8Array }[] = [
    { id: "phdr", data: phdr },
    { id: "pbag", data: pbag },
    { id: "pmod", data: pmod },
    { id: "pgen", data: pgen },
    { id: "inst", data: inst },
    { id: "ibag", data: ibag },
    { id: "imod", data: imod },
    { id: "igen", data: igen },
    { id: "shdr", data: shdr },
  ];
  let pdtaSize = 0;
  for (const c of pdtaChunks) {
    pdtaSize += 8 + c.data.length + (c.data.length & 1);
  }

  const list = (type: string, inner: Uint8Array) => {
    const out = new Uint8Array(12 + inner.length);
    out.set([0x4c, 0x49, 0x53, 0x54]);
    new DataView(out.buffer).setUint32(4, 4 + inner.length, true);
    for (let i = 0; i < 4; i++) out[8 + i] = type.charCodeAt(i);
    out.set(inner, 12);
    return out;
  };

  const infoList = list("INFO", infoBody);
  const sdtaList = list("sdta", sdtaInner);
  const pdtaInner = new Uint8Array(pdtaSize);
  let po = 0;
  for (const c of pdtaChunks) {
    for (let i = 0; i < 4; i++) pdtaInner[po + i] = c.id.charCodeAt(i);
    new DataView(pdtaInner.buffer).setUint32(po + 4, c.data.length, true);
    pdtaInner.set(c.data, po + 8);
    po += 8 + c.data.length + (c.data.length & 1);
  }
  const pdtaList = list("pdta", pdtaInner);

  const bodyLen = infoList.length + sdtaList.length + pdtaList.length;
  const file = new Uint8Array(12 + bodyLen);
  file.set([0x52, 0x49, 0x46, 0x46]);
  new DataView(file.buffer).setUint32(4, 4 + bodyLen, true);
  file.set([0x73, 0x66, 0x62, 0x6b], 8);
  file.set(infoList, 12);
  file.set(sdtaList, 12 + infoList.length);
  file.set(pdtaList, 12 + infoList.length + sdtaList.length);
  return file.buffer;
}
