export const YUE2_MODELS = [
  { id: 'q4', file: 'yue2-3b-q4_0.gguf', bytes: 2_665_632_320 },
  { id: 'q8', file: 'yue2-3b-q8_0.gguf', bytes: 4_264_186_432 },
];

export const YUE2_COMMON = [
  { id: 'vae', file: 'yue2-vae-f16.gguf', bytes: 265_218_656 },
  { id: 'sidecar:yue2-model-config.json', file: 'sidecars/yue2-model-config.json', bytes: 959 },
  { id: 'sidecar:yue2-generation-config.json', file: 'sidecars/yue2-generation-config.json', bytes: 466 },
  { id: 'sidecar:yue2-qwen.tiktoken', file: 'sidecars/yue2-qwen.tiktoken', bytes: 2_561_218 },
  { id: 'sidecar:yue2-vae-config.json', file: 'sidecars/yue2-vae-config.json', bytes: 1_378 },
];

export function expectedYue2ModelBytes(modelId) {
  return YUE2_MODELS.find(model => model.id === modelId)?.bytes ?? null;
}
