// Sonido 100 % sintetizado con Web Audio: no hace falta ningún archivo
import { store } from './util.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // número MIDI → Hz

// Canciones: [acordes (MIDI raíz), melodía por pasos (MIDI o 0), tempo]
const SONGS = {
  menu: {
    bpm: 112,
    chords: [60, 57, 53, 55], // C Am F G
    minor: [false, true, false, false],
    melody: [72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 69, 0, 72, 0, 0, 0,
             69, 0, 72, 0, 76, 0, 74, 72, 71, 0, 67, 0, 71, 0, 74, 0],
  },
  game: {
    bpm: 140,
    chords: [62, 67, 64, 69], // D G E A
    minor: [false, false, true, false],
    melody: [74, 74, 78, 0, 81, 0, 78, 0, 79, 79, 83, 0, 79, 0, 76, 0,
             76, 0, 79, 76, 74, 0, 71, 0, 73, 0, 76, 0, 81, 0, 0, 0],
  },
  western: {
    bpm: 96,
    chords: [57, 57, 53, 52], // Am Am F E
    minor: [true, true, false, false],
    melody: [69, 0, 0, 72, 76, 0, 0, 0, 74, 0, 72, 0, 71, 0, 0, 0,
             69, 0, 0, 72, 77, 0, 76, 0, 74, 0, 71, 0, 68, 0, 0, 0],
  },
  tension: {
    bpm: 150,
    chords: [57, 58, 57, 56],
    minor: [true, false, true, false],
    melody: [69, 0, 72, 0, 69, 0, 72, 0, 70, 0, 74, 0, 70, 0, 74, 0,
             69, 0, 72, 0, 69, 0, 76, 0, 68, 0, 71, 0, 74, 0, 0, 0],
  },
  podium: {
    bpm: 120,
    chords: [60, 65, 67, 60],
    minor: [false, false, false, false],
    melody: [72, 0, 72, 76, 79, 0, 0, 0, 77, 0, 77, 81, 84, 0, 0, 0,
             83, 0, 79, 0, 81, 0, 83, 0, 84, 0, 0, 0, 0, 0, 0, 0],
  },
};

class Audio {
  constructor() {
    this.ctx = null;
    const saved = store('volumen') || {};
    this.musicVol = saved.music ?? 0.5;
    this.sfxVol = saved.sfx ?? 0.8;
    this.song = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVol * 0.35;
    this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);
    // ruido blanco reutilizable
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.pendingSong) this.music(this.pendingSong);
  }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    store('volumen', { music, sfx });
    if (this.ctx) {
      this.musicBus.gain.value = music * 0.35;
      this.sfxBus.gain.value = sfx;
    }
  }

  tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0, bus = null, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.3, freq = 1200, q = 1, type = 'lowpass', delay = 0, sweep = 0, bus = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx) return;
    const r = 1 + (Math.random() - 0.5) * 0.08;
    switch (name) {
      case 'click': this.tone(880 * r, 0.06, { type: 'triangle', vol: 0.25 }); break;
      case 'hover': this.tone(1200, 0.03, { type: 'sine', vol: 0.08 }); break;
      case 'join':
        [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(72 + n), 0.12, { type: 'triangle', vol: 0.2, delay: i * 0.06 }));
        break;
      case 'leave': this.tone(500, 0.25, { type: 'triangle', vol: 0.2, slide: -300 }); break;
      case 'jump': this.tone(330 * r, 0.15, { type: 'square', vol: 0.08, slide: 400 }); break;
      case 'land': this.noise(0.06, { vol: 0.12, freq: 600 }); break;
      case 'boing': this.tone(180 * r, 0.3, { type: 'sine', vol: 0.35, slide: 500 }); break;
      case 'pop': this.tone(900 * r, 0.08, { type: 'sine', vol: 0.3, slide: -600 }); this.noise(0.05, { vol: 0.15, freq: 3000 }); break;
      case 'hit':
        this.noise(0.18, { vol: 0.5, freq: 1800, sweep: -1500 });
        this.tone(160, 0.2, { type: 'square', vol: 0.15, slide: -100 });
        break;
      case 'whoosh': this.noise(0.35, { vol: 0.25, freq: 400, type: 'bandpass', q: 2, sweep: 2500 }); break;
      case 'fall': this.tone(800, 0.9, { type: 'triangle', vol: 0.18, slide: -700 }); break;
      case 'explode':
        this.noise(1.2, { vol: 0.9, freq: 900, sweep: -800 });
        this.tone(90, 0.8, { type: 'sine', vol: 0.6, slide: -60 });
        break;
      case 'shot':
        this.noise(0.45, { vol: 0.9, freq: 2500, sweep: -2300 });
        this.tone(140, 0.25, { type: 'square', vol: 0.3, slide: -90 });
        break;
      case 'coin':
        this.tone(NOTE(83), 0.07, { type: 'square', vol: 0.12 });
        this.tone(NOTE(88), 0.25, { type: 'square', vol: 0.12, delay: 0.07 });
        break;
      case 'tick': this.tone(1400, 0.03, { type: 'square', vol: 0.08 }); break;
      case 'beep': this.tone(1000, 0.08, { type: 'square', vol: 0.12 }); break;
      case 'count': this.tone(NOTE(72), 0.15, { type: 'square', vol: 0.18 }); break;
      case 'go':
        this.tone(NOTE(84), 0.35, { type: 'square', vol: 0.2 });
        this.tone(NOTE(79), 0.35, { type: 'square', vol: 0.12 });
        break;
      case 'paint': this.noise(0.08, { vol: 0.08, freq: 2000, type: 'bandpass', q: 3 }); break;
      case 'crack': this.noise(0.12, { vol: 0.2, freq: 3500, type: 'highpass' }); break;
      case 'rumble': this.noise(0.6, { vol: 0.3, freq: 200 }); break;
      case 'whistle': this.tone(NOTE(88), 0.5, { type: 'sine', vol: 0.25, slide: 200 }); break;
      case 'win':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(NOTE(67 + n), 0.18, { type: 'square', vol: 0.12, delay: i * 0.08 }));
        break;
      case 'lose':
        [7, 6, 5, 0].forEach((n, i) => this.tone(NOTE(60 + n), i === 3 ? 0.6 : 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.25 }));
        break;
      case 'drum': this.tone(120, 0.12, { type: 'sine', vol: 0.4, slide: -60 }); break;
      case 'fanfare':
        [[72, 0], [72, 0.12], [72, 0.24], [76, 0.36], [79, 0.6], [76, 0.84], [84, 1.0]].forEach(([n, d]) =>
          this.tone(NOTE(n), 0.3, { type: 'square', vol: 0.14, delay: d }));
        break;
      case 'wind': this.noise(2.5, { vol: 0.12, freq: 500, type: 'bandpass', q: 0.7, sweep: 300 }); break;
      case 'crow':
        this.tone(700, 0.15, { type: 'sawtooth', vol: 0.1, slide: -250 });
        this.tone(650, 0.15, { type: 'sawtooth', vol: 0.1, slide: -250, delay: 0.2 });
        break;
      case 'splash': this.noise(0.5, { vol: 0.35, freq: 1500, sweep: -1200 }); break;
    }
  }

  // ---------- música ----------
  music(name) {
    this.pendingSong = name;
    if (!this.ctx) return;
    if (this.song === SONGS[name]) return;
    this.stopMusic();
    if (!name || !SONGS[name]) return;
    this.song = SONGS[name];
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.song = null;
  }

  schedule() {
    const s = this.song;
    if (!s || !this.ctx) return;
    const stepDur = 60 / s.bpm / 2; // corcheas
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const t = this.nextTime - this.ctx.currentTime;
      const bar = Math.floor(this.step / 8) % s.chords.length;
      const root = s.chords[bar];
      const third = s.minor[bar] ? 3 : 4;
      const inBar = this.step % 8;
      // bajo
      if (inBar % 2 === 0) {
        const bn = inBar === 4 ? root - 12 + 7 : root - 12;
        this.tone(NOTE(bn), stepDur * 1.6, { type: 'triangle', vol: 0.45, delay: t, bus: this.musicBus });
      }
      // acordes en contratiempo
      if (inBar % 2 === 1) {
        [0, third, 7].forEach((n) =>
          this.tone(NOTE(root + n), stepDur * 0.7, { type: 'square', vol: 0.05, delay: t, bus: this.musicBus }));
      }
      // melodía
      const m = s.melody[this.step % s.melody.length];
      if (m) this.tone(NOTE(m), stepDur * 1.5, { type: 'square', vol: 0.09, delay: t, bus: this.musicBus });
      // percusión
      if (inBar === 0 || inBar === 4) this.tone(110, 0.1, { type: 'sine', vol: 0.5, slide: -60, delay: t, bus: this.musicBus });
      if (inBar === 2 || inBar === 6) this.noise(0.08, { vol: 0.25, freq: 4000, type: 'highpass', delay: t, bus: this.musicBus });
      this.step++;
      this.nextTime += stepDur;
    }
  }
}

export const sfx = new Audio();
