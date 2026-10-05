import assert from "node:assert/strict";
import { it } from "node:test";
import { getLoraPack } from "@song-maker/lora-packs";
import {
  adapterActive,
  adapterFilename,
  adapterPath,
  loraPackForLocalAdapter,
  packLibraryState,
} from "./loraLibrary";

it("matches canonical Windows paths without confusing files in other folders", () => {
  const pack = getLoraPack("mothersuperior-instrumental-ar")!;
  const settings = { cacheDir: "C:\\Cache", yue2ArLora: null, yue2NarLora: null, yue2ArLoraScale: 1, yue2NarLoraScale: 1 };
  const path = `C:\\Cache\\models\\lora\\${pack.id}\\${pack.files[0].filename}`;
  assert.deepEqual(packLibraryState(pack, [], settings), { installed: false, active: false });
  assert.deepEqual(packLibraryState(pack, [{ path: `C:\\Other\\${pack.files[0].filename}`, name: "other", sizeBytes: 100 }], settings), { installed: false, active: false });
  const files = [{ path, name: "instrumental", sizeBytes: 100 }];
  assert.deepEqual(packLibraryState(pack, files, settings), { installed: true, active: false });
  assert.deepEqual(packLibraryState(pack, files, { ...settings, yue2ArLora: `\\\\?\\${path.toUpperCase()}` }), { installed: true, active: true });
  assert.deepEqual(packLibraryState(pack, files, { ...settings, yue2ArLora: path, yue2ArLoraScale: 0 }), { installed: true, active: false });
  assert.equal(adapterActive("", settings), false);
  assert.equal(adapterPath("/Models/A.safetensors"), "/Models/A.safetensors");
});

it("matches catalog LoRAs by relative filename and shortens imported filenames", () => {
  const pack = getLoraPack("mothersuperior-instrumental-ar")!;
  assert.equal(
    loraPackForLocalAdapter({ name: `${pack.id}\\${pack.files[0].filename}` }, [pack])?.id,
    pack.id,
  );
  assert.equal(
    loraPackForLocalAdapter({ name: `other\\${pack.files[0].filename}` }, [pack]),
    undefined,
  );
  assert.equal(adapterFilename("custom\\warm-piano.safetensors"), "warm-piano");
  assert.equal(adapterFilename("C:/models/custom-style.SAFETENSORS"), "custom-style");
});
