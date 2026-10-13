export class GameAudio {
  ctx?: AudioContext;
  engine?: OscillatorNode;
  gain?: GainNode;
  master?: GainNode;
  gravel?: GainNode;
  volume = 0.25;
  async start() {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    const c = (this.ctx = new AudioContext());
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(c.destination);
    this.engine = c.createOscillator();
    this.engine.type = "sawtooth";
    this.gain = c.createGain();
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    this.engine.connect(filter).connect(this.gain).connect(this.master);
    this.gain.gain.value = 0.015;
    this.engine.start();
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    this.gravel = c.createGain();
    this.gravel.gain.value = 0;
    const nf = c.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.value = 900;
    noise.connect(nf).connect(this.gravel).connect(this.master);
    noise.start();
  }
  update(speed: number, throttle: number, slide: number, active: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master!.gain.setTargetAtTime(this.volume, t, 0.1);
    this.engine!.frequency.setTargetAtTime(
      35 + Math.abs(speed) * 2 + throttle * 35,
      t,
      0.1,
    );
    this.gain!.gain.setTargetAtTime(
      active ? 0.012 + throttle * 0.012 : 0,
      t,
      0.1,
    );
    this.gravel!.gain.setTargetAtTime(
      active ? Math.min(0.09, Math.abs(speed) * 0.0008 + slide * 0.025) : 0,
      t,
      0.1,
    );
  }
  beep(high = false) {
    if (!this.ctx) return;
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.frequency.value = high ? 880 : 440;
    g.gain.setValueAtTime(0.1, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
    o.connect(g).connect(this.master!);
    o.start();
    o.stop(c.currentTime + 0.2);
  }
  collision() {
    this.beep(false);
  }
  stop() {
    void this.ctx?.close();
    this.ctx = undefined;
  }
}
