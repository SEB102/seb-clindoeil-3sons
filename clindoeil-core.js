// SEB-CLINDOEIL — logique pure (détection de clignement, WAV, sample par défaut)
(function (root) {

  // Détecteur à hystérésis : renvoie 'close' quand le score dépasse `high`,
  // 'open' quand il redescend sous `low`, sinon null.
  function BlinkDetector(opts) {
    this.high = 0.5;
    this.low = 0.3;
    this.refractoryMs = 150;
    this.closed = false;
    this.lastTrigger = -Infinity;
    if (opts) Object.assign(this, opts);
  }
  BlinkDetector.prototype.update = function (score, tMs) {
    if (!this.closed) {
      if (score >= this.high && tMs - this.lastTrigger >= this.refractoryMs) {
        this.closed = true;
        this.lastTrigger = tMs;
        return 'close';
      }
    } else if (score <= this.low) {
      this.closed = false;
      return 'open';
    }
    return null;
  };
  BlinkDetector.prototype.reset = function () { this.closed = false; };

  // Score selon le mode : both = les deux yeux, either = l'un ou l'autre,
  // left / right = un seul œil (clin d'œil).
  function blinkScore(left, right, mode) {
    switch (mode) {
      case 'either': return Math.max(left, right);
      case 'left':   return left;
      case 'right':  return right;
      default:       return Math.min(left, right);
    }
  }

  // Encodage WAV PCM 16 bits. channels = [Float32Array, ...]
  function encodeWav(channels, sampleRate) {
    const nCh = channels.length;
    const n = channels[0].length;
    const dataLen = n * nCh * 2;
    const buf = new ArrayBuffer(44 + dataLen);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, nCh, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * nCh * 2, true); v.setUint16(32, nCh * 2, true);
    v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, dataLen, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < nCh; c++) {
        const s = Math.max(-1, Math.min(1, channels[c][i]));
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        o += 2;
      }
    }
    return buf;
  }

  // Réverb de Schroeder (4 peignes + 2 passe-tout), intégrée au sample
  function applyReverb(dry, sampleRate, mix) {
    const n = dry.length;
    const out = new Float32Array(n);
    const combs = [0.0297, 0.0371, 0.0411, 0.0437].map(sec => ({
      buf: new Float32Array(Math.floor(sec * sampleRate)), i: 0, lp: 0
    }));
    const aps = [0.005, 0.0017].map(sec => ({ buf: new Float32Array(Math.floor(sec * sampleRate)), i: 0 }));
    const fb = 0.84, damp = 0.35;
    for (let k = 0; k < n; k++) {
      const x = dry[k];
      let y = 0;
      for (const c of combs) {
        const o = c.buf[c.i];
        c.lp = o * (1 - damp) + c.lp * damp;
        c.buf[c.i] = x * 0.3 + c.lp * fb;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      y *= 0.25;
      for (const ap of aps) {
        const o = ap.buf[ap.i];
        const v = y + o * 0.5;
        ap.buf[ap.i] = v;
        ap.i = (ap.i + 1) % ap.buf.length;
        y = o - v * 0.5;
      }
      out[k] = x + y * mix;
    }
    return out;
  }

  // Sample par défaut : kick gras (sub profond, saturé) avec un peu de réverb
  function makeDefaultSampleData(sampleRate) {
    const dur = 1.4;
    const n = Math.floor(sampleRate * dur);
    const d = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const f = 42 + 150 * Math.exp(-t * 32);
      phase += 2 * Math.PI * f / sampleRate;
      const amp = Math.min(1, t * 1500) * (0.75 * Math.exp(-t * 4.2) + 0.25 * Math.exp(-t * 14));
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 400) * 0.2;
      d[i] = Math.tanh(Math.sin(phase) * amp * 2.6) * 0.85 + click;
    }
    const wet = applyReverb(d, sampleRate, 0.55);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(wet[i]));
    const g = peak > 0 ? 0.92 / peak : 1;
    for (let i = 0; i < n; i++) wet[i] *= g;
    const fade = Math.floor(0.05 * sampleRate);
    for (let i = 0; i < fade; i++) wet[n - 1 - i] *= i / fade;
    return wet;
  }

  // Sample tom : sinus à chute de hauteur moyenne, avec réverb
  function makeTomSampleData(sampleRate) {
    const dur = 1.2;
    const n = Math.floor(sampleRate * dur);
    const d = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const f = 200 + 160 * Math.exp(-t * 24);
      phase += 2 * Math.PI * f / sampleRate;
      const amp = Math.min(1, t * 1500) * (0.8 * Math.exp(-t * 7) + 0.2 * Math.exp(-t * 20));
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 300) * 0.3;
      d[i] = Math.tanh(Math.sin(phase) * amp * 2.0) * 0.8 + click;
    }
    const wet = applyReverb(d, sampleRate, 0.5);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(wet[i]));
    const g = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < n; i++) wet[i] *= g;
    const fade = Math.floor(0.05 * sampleRate);
    for (let i = 0; i < fade; i++) wet[n - 1 - i] *= i / fade;
    return wet;
  }

  // Normalisation + fondu de fin
  function finalize(d, sampleRate, peakTarget) {
    const n = d.length;
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    const g = peak > 0 ? peakTarget / peak : 1;
    for (let i = 0; i < n; i++) d[i] *= g;
    const fade = Math.floor(0.05 * sampleRate);
    for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
    return d;
  }

  // Caisse claire : corps ~190 Hz + bruit filtré (timbre de timbre), avec réverb
  function makeSnareSampleData(sampleRate) {
    const n = Math.floor(sampleRate * 1.0);
    const d = new Float32Array(n);
    let phase = 0, lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      phase += 2 * Math.PI * (185 + 70 * Math.exp(-t * 40)) / sampleRate;
      const body = Math.sin(phase) * Math.exp(-t * 22) * 0.7;
      const white = Math.random() * 2 - 1;
      lp += 0.55 * (white - lp);                // bruit passe-haut léger
      const noise = (white - lp * 0.5) * Math.exp(-t * 14) * 0.9;
      d[i] = Math.tanh((body + noise) * 1.6) * Math.min(1, t * 2500);
    }
    return finalize(applyReverb(d, sampleRate, 0.45), sampleRate, 0.9);
  }

  // Cymbale : bruit brillant + partiels métalliques inharmoniques, longue chute
  function makeCymbalSampleData(sampleRate) {
    const n = Math.floor(sampleRate * 2.0);
    const d = new Float32Array(n);
    const partials = [3170, 4210, 5230, 6180, 7410, 8630, 9870].map(f => ({ f, ph: Math.random() * 6.28 }));
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const white = Math.random() * 2 - 1;
      const hp = white - prev; prev = white;     // passe-haut (différence)
      let metal = 0;
      for (const p of partials) metal += Math.sin(2 * Math.PI * p.f * t + p.ph);
      const env = Math.min(1, t * 3000) * (0.6 * Math.exp(-t * 2.6) + 0.4 * Math.exp(-t * 9));
      d[i] = (hp * 0.55 + metal * 0.09) * env;
    }
    return finalize(applyReverb(d, sampleRate, 0.3), sampleRate, 0.85);
  }

  // Regard : renvoie { left, right } (0..1) à partir de la table de blendshapes.
  // Regard à gauche = œil gauche vers l'extérieur + œil droit vers l'intérieur.
  function gazeScores(get) {
    const left  = (get('eyeLookOutLeft') + get('eyeLookInRight')) / 2;
    const right = (get('eyeLookInLeft') + get('eyeLookOutRight')) / 2;
    return { left, right };
  }

  // Centrage du regard : mesure le regard au repos (moyenne de `frames` images, yeux ouverts)
  // puis le retire des scores (rééchelonné pour garder toute la plage 0..1).
  function GazeCenter(frames) { this.frames = frames || 30; this.reset(); }
  GazeCenter.prototype.reset = function () { this.n = 0; this.sl = 0; this.sr = 0; this.bl = 0; this.br = 0; this.ready = false; };
  GazeCenter.prototype.add = function (l, r) {
    if (this.ready) return false;
    this.sl += l; this.sr += r; this.n++;
    if (this.n >= this.frames) {
      this.bl = Math.min(0.8, this.sl / this.n); this.br = Math.min(0.8, this.sr / this.n);
      this.ready = true; return true;
    }
    return false;
  };
  GazeCenter.prototype.apply = function (l, r) {
    const f = (v, b) => Math.max(0, Math.min(1, (v - b) / (1 - b)));
    return { left: f(l, this.bl), right: f(r, this.br) };
  };

  const api = { BlinkDetector, blinkScore, encodeWav, makeDefaultSampleData, makeTomSampleData, makeSnareSampleData, makeCymbalSampleData, gazeScores, GazeCenter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Clindoeil = api;
})(typeof window !== 'undefined' ? window : globalThis);
