import { useEffect, useState } from "react";
import { models } from "./models.js";
let worker,
  recording,
  request = 0,
  tick;
let state = {
  model: localStorage.getItem("radio.model") || "turbo",
  phase: "idle",
  message: "",
  seconds: 0,
};
const subs = new Set();
function update(fields) {
  state = { ...state, ...fields };
  subs.forEach((f) => f(state));
}
function disposeMic() {
  clearInterval(tick);
  if (!recording) return;
  recording.stream?.getTracks().forEach((t) => t.stop());
  recording.node?.disconnect();
  recording.source?.disconnect();
  if (recording.ctx && recording.ctx.state !== "closed")
    recording.ctx.close().catch(() => {});
  recording = null;
}
export function loadModel(model = state.model) {
  cancelSpeech(false);
  worker?.terminate();
  worker = null;
  localStorage.setItem("radio.model", model);
  update({
    model,
    phase: "loading",
    message: "Préparation de " + models[model].label,
    seconds: 0,
    result: null,
    target: null,
  });
  try {
    worker = new Worker(new URL("./speech.worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data: d }) => {
      if (d.type === "progress")
        update({
          message:
            (d.file || "Modèle") +
            " · " +
            Math.round(d.loaded / 1e6) +
            " Mo" +
            (d.total ? " / " + Math.round(d.total / 1e6) + " Mo" : ""),
        });
      if (d.type === "ready")
        update({ phase: "ready", message: "Prêt à dicter", loadMs: d.ms });
      if (d.type === "error") update({ phase: "error", message: d.message });
      if (d.type === "result")
        update({
          phase: "preview",
          result: d.text,
          message: "Transcription à vérifier",
          inferenceMs: d.ms,
        });
    };
    worker.onerror = (e) =>
      update({
        phase: "error",
        message: e.message || "Le moteur de dictée a été interrompu.",
      });
    worker.postMessage({ type: "load", model });
  } catch (e) {
    update({ phase: "error", message: e.message });
  }
}
export function preload() {
  if (state.phase === "idle") loadModel();
}
export async function startSpeech(target) {
  if (state.phase !== "ready") return;
  const token = ++request;
  update({
    phase: "permission",
    target,
    result: null,
    message: "Autorise le microphone dans ton navigateur.",
  });
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error(
        "Microphone indisponible. Ouvre le site en HTTPS dans Chrome.",
      );
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1 },
      video: false,
    });
    if (token !== request) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    recording = { stream, chunks: [] };
    const ctx = new AudioContext({ sampleRate: 16000 });
    recording.ctx = ctx;
    await ctx.audioWorklet.addModule(import.meta.env.BASE_URL + "capture.js");
    if (token !== request) return;
    const node = new AudioWorkletNode(ctx, "radio-capture"),
      source = ctx.createMediaStreamSource(stream);
    Object.assign(recording, { node, source });
    node.port.onmessage = (e) => {
      if (recording?.node === node) recording.chunks.push(e.data);
    };
    source.connect(node);
    node.connect(ctx.destination);
    await ctx.resume();
    if (token !== request) return;
    const started = Date.now();
    update({ phase: "recording", seconds: 0, message: "Enregistrement" });
    tick = setInterval(
      () => update({ seconds: Math.floor((Date.now() - started) / 1000) }),
      250,
    );
  } catch (e) {
    if (token !== request) return;
    disposeMic();
    update({
      phase: "ready",
      message: "Microphone indisponible. " + e.message,
    });
  }
}
export function stopSpeech() {
  if (state.phase !== "recording") return;
  const chunks = recording.chunks;
  disposeMic();
  const audio = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let i = 0;
  for (const c of chunks) {
    audio.set(c, i);
    i += c.length;
  }
  if (!audio.length) {
    update({ phase: "ready", message: "Aucun son capturé. Réessaie." });
    return;
  }
  update({ phase: "processing", message: "Transcription sur cet appareil…" });
  worker.postMessage({ type: "transcribe", audio }, [audio.buffer]);
}
export function cancelSpeech(reload = true) {
  request++;
  disposeMic();
  if (state.phase === "processing" && reload) {
    loadModel(state.model);
    return;
  }
  if (
    ["permission", "recording", "preview", "processing"].includes(state.phase)
  )
    update({
      phase: "ready",
      target: null,
      result: null,
      message: "Prêt à dicter",
    });
}
export function useSpeech() {
  const [s, set] = useState(state);
  useEffect(() => {
    subs.add(set);
    set(state);
    return () => subs.delete(set);
  }, []);
  return s;
}
