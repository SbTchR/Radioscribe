import { pipeline, env } from "@huggingface/transformers";
import { models } from "./models.js";
env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = {
  wasm: new URL(
    "../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm",
    import.meta.url,
  ).href,
  mjs: new URL(
    "../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs",
    import.meta.url,
  ).href,
};
env.backends.onnx.wasm.numThreads = 1;
let engine;
self.onmessage = async ({ data }) => {
  try {
    const t = performance.now();
    if (data.type === "load") {
      const m = models[data.model];
      if (m.device === "webgpu") {
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter?.features.has("shader-f16"))
          throw Error(
            "Turbo nécessite WebGPU et le calcul 16 bits. Essaie Chrome ou choisis Small dans les réglages de dictée.",
          );
      }
      let last = 0;
      engine = await pipeline("automatic-speech-recognition", m.repo, {
        revision: m.revision,
        device: m.device,
        dtype: m.dtype,
        progress_callback: (p) => {
          if (p.status === "progress" && performance.now() - last > 125) {
            last = performance.now();
            self.postMessage({
              type: "progress",
              file: p.file,
              loaded: p.loaded,
              total: p.total,
            });
          }
        },
      });
      self.postMessage({ type: "ready", ms: performance.now() - t });
    } else {
      const result = await engine(data.audio, {
        language: "french",
        task: "transcribe",
        return_timestamps: false,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      self.postMessage({
        type: "result",
        text: result.text.trim(),
        ms: performance.now() - t,
      });
    }
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
};
