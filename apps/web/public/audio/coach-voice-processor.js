class CoachVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.samples = [];
    this.frameSize = 4096;
    const cutoff = 7600;
    const omega = 2 * Math.PI * cutoff / sampleRate;
    const cosine = Math.cos(omega);
    const alpha = Math.sin(omega) / (2 * 0.70710678);
    const a0 = 1 + alpha;
    this.b0 = ((1 - cosine) / 2) / a0;
    this.b1 = (1 - cosine) / a0;
    this.b2 = this.b0;
    this.a1 = (-2 * cosine) / a0;
    this.a2 = (1 - alpha) / a0;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === "flush") { this.flush(); this.port.postMessage({ type: "flushed" }); }
    };
  }

  process(inputs, outputs) {
    const channels = inputs[0];
    const output = outputs[0];
    for (const channel of output) channel.fill(0);
    if (!channels?.length) return true;
    const frameLength = channels[0].length;
    for (let index = 0; index < frameLength; index += 1) {
      let sample = 0;
      for (const channel of channels) sample += channel[index] || 0;
      sample /= channels.length;
      const filtered = this.b0 * sample + this.b1 * this.x1 + this.b2 * this.x2
        - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1; this.x1 = sample; this.y2 = this.y1; this.y1 = filtered;
      this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        const pcm = Math.max(-1, Math.min(1, filtered));
        this.samples.push(pcm < 0 ? Math.round(pcm * 32768) : Math.round(pcm * 32767));
        if (this.samples.length >= this.frameSize) this.flush();
      }
    }
    return true;
  }

  flush() {
    if (!this.samples.length) return;
    const frame = new Int16Array(this.samples);
    this.samples.length = 0;
    this.port.postMessage({ type: "pcm", frame }, [frame.buffer]);
  }
}

registerProcessor("coach-voice-processor", CoachVoiceProcessor);
