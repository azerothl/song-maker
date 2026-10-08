import type { FormInput } from "./types";

/** Sending and saving lyrics are separate: toggling instrumental preserves the draft. */
export function generationLyrics(form: Pick<FormInput, "instrumentalMode" | "lyrics">): string {
  return form.instrumentalMode ? "" : form.lyrics;
}
