import { ScoreEngineError } from "../types/errors.js";

/**
 * Instrumental via Vocal → Ins conversion on the YuE2 ABC dialect (§7).
 * No instrumental LoRA. Distinct from lyrics tag [Instrumental].
 * @see docs/yue2-ameliorations.md item 5 / skill yue2-music 1.2.0
 */
export type VocalToInsOptions = {
  /** When true, clear Vocal after move (instrumental cover). Default true. */
  clearVocal?: boolean;
};

export type VocalToInsResult = {
  abc: string;
  movedNoteCount: number;
};

/**
 * Convert a YuE2-dialect ABC string: move Vocal notes onto Ins.
 * Scaffold implementation — parses only the simple dialect used in fixtures.
 */
export function convertVocalToIns(
  abc: string,
  options: VocalToInsOptions = {},
): VocalToInsResult {
  const clearVocal = options.clearVocal !== false;
  if (!abc.includes("V: Vocal") || !abc.includes("V: Ins")) {
    throw new ScoreEngineError(
      "dialect_forbidden",
      "hors dialecte YuE2: voix Vocal/Ins requises pour la conversion instrumentale",
    );
  }

  const lines = abc.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let mode: "none" | "vocal" | "ins" = "none";
  let pendingVocalMusic: string | null = null;
  let moved = 0;

  for (const line of lines) {
    if (line.startsWith("V: Vocal") && !line.includes("clef=")) {
      mode = "vocal";
      out.push(line);
      continue;
    }
    if (line.startsWith("V: Ins") && !line.includes("clef=")) {
      mode = "ins";
      out.push(line);
      continue;
    }
    if (line.startsWith("V:") || line.startsWith("%") || line.startsWith("X:") ||
        line.startsWith("T:") || line.startsWith("M:") || line.startsWith("L:") ||
        line.startsWith("Q:") || line.startsWith("K:")) {
      mode = "none";
      out.push(line);
      continue;
    }

    if (mode === "vocal") {
      pendingVocalMusic = line;
      moved += countNotes(line);
      if (clearVocal) {
        const bars = Math.max(1, (line.match(/\|/g) ?? []).length);
        out.push(`Z${bars}|`);
      } else {
        out.push(line);
      }
      continue;
    }

    if (mode === "ins") {
      if (pendingVocalMusic) {
        // Strip chord symbols when moving to Ins (instrumental melody)
        out.push(stripChords(pendingVocalMusic));
        pendingVocalMusic = null;
      } else {
        out.push(line);
      }
      continue;
    }

    out.push(line);
  }

  return { abc: out.join("\n") + (out[out.length - 1] === "" ? "" : "\n"), movedNoteCount: moved };
}

function stripChords(music: string): string {
  return music.replace(/"[^"]*"/g, "");
}

function countNotes(music: string): number {
  const stripped = stripChords(music).replace(/\|/g, "");
  return (stripped.match(/[A-Ga-g]/g) ?? []).length;
}
