/**
 * Converts the browser's float32 mic stream into 16-bit PCM frames of ~100 ms,
 * which is the payload the streaming API expects. Runs on the audio thread so
 * a busy UI never stutters the capture.
 */
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = 1600; // 100 ms at 16 kHz
    this.buffer = new Int16Array(this.frameSize);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      const clamped = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.offset++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

      if (this.offset === this.frameSize) {
        const copy = new Int16Array(this.buffer);
        this.port.postMessage(copy.buffer, [copy.buffer]);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-worklet", PcmWorklet);
