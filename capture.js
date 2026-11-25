// The recording context already runs at Whisper's 16 kHz mono sample rate.
class RadioCapture extends AudioWorkletProcessor {
  process(inputs) {
    if (inputs[0]?.[0]) this.port.postMessage(inputs[0][0].slice());
    return true;
  }
}
registerProcessor("radio-capture", RadioCapture);
