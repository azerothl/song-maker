/**
 * Web MIDI input helpers (#96).
 */

export type MidiInputDevice = {
  id: string;
  name: string;
};

export type MidiNoteMessage = {
  type: "noteon" | "noteoff";
  pitch: number;
  velocity: number;
  timeStamp: number;
};

export async function requestMidiAccess(): Promise<MIDIAccess | null> {
  if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
    return null;
  }
  try {
    return await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    return null;
  }
}

export function listMidiInputs(access: MIDIAccess | null): MidiInputDevice[] {
  if (!access) return [];
  const out: MidiInputDevice[] = [];
  access.inputs.forEach((input) => {
    if (input.state === "disconnected") return;
    out.push({
      id: input.id,
      name: input.name?.trim() || `MIDI ${input.id.slice(0, 6)}`,
    });
  });
  return out;
}

export function parseMidiMessage(
  data: Uint8Array,
  timeStamp: number,
): MidiNoteMessage | null {
  if (data.length < 2) return null;
  const status = data[0]! & 0xf0;
  const pitch = data[1]!;
  const velocity = data.length > 2 ? data[2]! : 0;
  if (status === 0x90) {
    if (velocity === 0) {
      return { type: "noteoff", pitch, velocity: 0, timeStamp };
    }
    return { type: "noteon", pitch, velocity, timeStamp };
  }
  if (status === 0x80) {
    return { type: "noteoff", pitch, velocity, timeStamp };
  }
  return null;
}

export type MidiInputSubscription = {
  disconnect: () => void;
};

function findInput(
  access: MIDIAccess,
  deviceId: string,
): MIDIInput | null {
  let found: MIDIInput | null = null;
  access.inputs.forEach((input) => {
    if (input.id === deviceId) found = input;
  });
  return found;
}

export function subscribeMidiInput(
  access: MIDIAccess | null,
  deviceId: string | null,
  onMessage: (msg: MidiNoteMessage) => void,
): MidiInputSubscription {
  if (!access || !deviceId) {
    return { disconnect: () => undefined };
  }
  const input = findInput(access, deviceId);
  if (!input) {
    return { disconnect: () => undefined };
  }
  const previous = input.onmidimessage;
  input.onmidimessage = (ev: MIDIMessageEvent) => {
    if (!ev.data) return;
    const msg = parseMidiMessage(new Uint8Array(ev.data), ev.timeStamp);
    if (msg) onMessage(msg);
  };
  return {
    disconnect: () => {
      input.onmidimessage = previous;
    },
  };
}
