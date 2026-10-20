export class AudioBus {
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;

  resume() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) this.ctx = new Ctx();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), now + dur);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(amp);
    amp.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private noise(dur: number, gain: number) {
    if (!this.ctx) return;
    if (!this.noiseBuf) {
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(amp);
    amp.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  slash() {
    this.tone(240, 0.08, "square", 0.045, 80);
    this.noise(0.05, 0.03);
  }
  heavy() {
    this.tone(120, 0.16, "sawtooth", 0.05, 48);
    this.noise(0.1, 0.045);
  }
  hit() {
    this.tone(180, 0.07, "square", 0.05, 70);
  }
  clink() {
    this.tone(620, 0.08, "square", 0.04, 280);
  }
  block() {
    this.tone(200, 0.09, "square", 0.04, 120);
  }
  perfect() {
    this.tone(520, 0.12, "square", 0.05, 880);
  }
  pain() {
    this.tone(96, 0.18, "sawtooth", 0.05, 42);
  }
  fall() {
    this.tone(220, 0.28, "triangle", 0.045, 50);
  }
  whiff() {
    this.noise(0.04, 0.018);
  }
  warn(low: boolean) {
    this.tone(low ? 130 : 360, 0.14, "square", 0.035, low ? 70 : 160);
  }
  shot() {
    this.noise(0.09, 0.07);
    this.tone(180, 0.06, "square", 0.04, 60);
  }
  mark() {
    this.tone(420, 0.08, "square", 0.04, 640);
  }
  fail() {
    this.tone(200, 0.2, "square", 0.04, 80);
  }
  solve() {
    this.tone(330, 0.12, "square", 0.04, 494);
    this.tone(494, 0.2, "square", 0.04, 660);
  }
  secret() {
    this.tone(500, 0.16, "triangle", 0.04, 760);
  }
  heal() {
    this.tone(460, 0.1, "triangle", 0.04, 700);
  }
  gate() {
    this.tone(90, 0.28, "square", 0.04, 48);
    this.noise(0.16, 0.03);
  }
  foot() {
    this.noise(0.035, 0.016);
  }
}
