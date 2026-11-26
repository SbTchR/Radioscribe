export const models = {
  turbo: {
    label: "Large v3 Turbo (par défaut)",
    repo: "onnx-community/whisper-large-v3-turbo",
    revision: "360ebcde2559d60bb474678be3c1de9ef347d01a",
    device: "webgpu",
    dtype: { encoder_model: "fp16", decoder_model_merged: "q4" },
  },
  small: {
    label: "Small multilingue (plus léger)",
    repo: "Xenova/whisper-small",
    revision: "2d67713f236afa48a18992566e7647f6ca848e13",
    device: "wasm",
    dtype: "q8",
  },
  base: {
    label: "Base multilingue (le plus léger)",
    repo: "Xenova/whisper-base",
    revision: "64da57285918e20ea79ea5c88eed7197933abaa8",
    device: "wasm",
    dtype: "q8",
  },
};

export function lighterModel(model) {
  const tiers = Object.keys(models);
  return tiers[tiers.indexOf(model) + 1];
}
