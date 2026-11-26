export const models = {
  turbo: {
    label: "Bon et lent",
    repo: "onnx-community/whisper-large-v3-turbo",
    revision: "360ebcde2559d60bb474678be3c1de9ef347d01a",
    device: "webgpu",
    dtype: { encoder_model: "fp16", decoder_model_merged: "q4" },
  },
  small: {
    label: "Moyen et moyen",
    repo: "Xenova/whisper-small",
    revision: "2d67713f236afa48a18992566e7647f6ca848e13",
    device: "wasm",
    dtype: "q8",
  },
  base: {
    label: "Moins bon et rapide",
    repo: "Xenova/whisper-base",
    revision: "64da57285918e20ea79ea5c88eed7197933abaa8",
    device: "wasm",
    dtype: "q8",
  },
};

export function adjacentModel(model, step) {
  const tiers = Object.keys(models);
  return tiers[tiers.indexOf(model) + step];
}
