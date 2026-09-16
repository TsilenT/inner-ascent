// All sound is synthesized locally. One looping noise buffer, no audio assets.
export class NoseAudio {
  constructor() { this.enabled = true; this.ctx = null; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    this.ctx = new Audio();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.enabled ? .45 : 0; this.master.connect(c.destination);
    const buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) { last = (last + (Math.random() * 2 - 1) * .025) / 1.025; data[i] = last * 7; }
    this.noiseBuffer = buffer;
    const noise = c.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    this.filter = c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 500;
    this.breathGain = c.createGain(); this.breathGain.gain.value = 0;
    this.panner = c.createPanner(); this.panner.panningModel = 'HRTF'; this.panner.distanceModel = 'inverse'; this.panner.refDistance = 8;
    noise.connect(this.filter).connect(this.breathGain).connect(this.panner).connect(this.master); noise.start();
    [65.41, 98, 130.81].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.value = .018 / (i + 1); o.connect(g).connect(this.master); o.start();
    });
  }
  toggle() { this.enabled = !this.enabled; if (this.master) this.master.gain.setTargetAtTime(this.enabled ? .45 : 0, this.ctx.currentTime, .1); return this.enabled; }
  update(breath, camera, active) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    this.breathGain.gain.setTargetAtTime(active ? .025 + Math.abs(breath.flow) * .16 : .012, t, .15);
    this.filter.frequency.setTargetAtTime(220 + Math.abs(breath.flow) * 600, t, .2);
    // The giant lungs sit above and behind the tiny player, in world space.
    const p = camera.position, listener = c.listener;
    if (listener.positionX) {
      listener.positionX.value = p.x; listener.positionY.value = p.y; listener.positionZ.value = p.z;
      const e = camera.matrixWorld.elements;
      listener.forwardX.value = -e[8]; listener.forwardY.value = -e[9]; listener.forwardZ.value = -e[10];
      listener.upX.value = e[4]; listener.upY.value = e[5]; listener.upZ.value = e[6];
      this.panner.positionX.value = 0; this.panner.positionY.value = p.y + 10; this.panner.positionZ.value = -4;
    }
  }
  tone(f, duration = .2, volume = .15, type = 'sine', end = f) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(volume, t + .015); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g).connect(this.master); o.start(); o.stop(t + duration + .03);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  grab() { this.tone(390, .16, .19, 'sine', 75); this.tone(120, .11, .06, 'triangle', 48); }
  release(stretch = 0) { this.tone(80, .2, .12, 'sine', 210 + stretch * 300); }
  pollen() { this.tone(660, .22, .12, 'sine', 880); setTimeout(() => this.tone(990, .3, .07), 85); }
  checkpoint() { [262, 330, 392, 523].forEach((f, i) => setTimeout(() => this.tone(f, 1, .08), i * 110)); }
  jump() { this.tone(100, .18, .1, 'sine', 260); }
  rumble() { this.tone(45, 3.5, .2, 'triangle', 80); }
  sneeze() { this.tone(170, .65, .25, 'sawtooth', 28); this.burst(.75, .6); }
  burst(duration, volume) {
    if (!this.ctx) return;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = this.noiseBuffer; f.type = 'lowpass'; f.frequency.value = 1700;
    g.gain.setValueAtTime(volume, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + duration);
    s.connect(f).connect(g).connect(this.master); s.start(); s.stop(c.currentTime + duration);
    s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  }
  win() { [0, .35, .7, 1.1, 1.6].forEach((delay, i) => setTimeout(() => [261.63, 329.63, 392, 523.25].forEach(f => this.tone(f * (i === 4 ? 2 : 1), 3.5, .065)), delay * 1000)); }
}
