const assert = require('assert');
const { BlinkDetector, blinkScore, encodeWav, makeDefaultSampleData, makeTomSampleData, makeSnareSampleData, makeCymbalSampleData, gazeScores, GazeCenter, eyesOpenIgnoringLookDown } = require('./clindoeil-core.js');

// Un clignement = un seul déclenchement
let d = new BlinkDetector({ high: 0.5, low: 0.3, refractoryMs: 150 });
let hits = 0, t = 0;
for (const s of [0, 0.1, 0.6, 0.9, 0.7, 0.4, 0.45, 0.2, 0.1]) { if (d.update(s, t) === 'close') hits++; t += 33; }
assert.strictEqual(hits, 1, 'un clignement = 1 déclenchement');
// Deuxième clignement après réarmement
for (const s of [0.8, 0.9, 0.1]) { if (d.update(s, t) === 'close') hits++; t += 100; }
assert.strictEqual(hits, 2, 'deuxième clignement');
// Œil mi-fermé en continu (0.4) ne déclenche pas
d = new BlinkDetector({ high: 0.5, low: 0.3 }); hits = 0;
for (let i = 0; i < 50; i++) if (d.update(0.4, i * 33) === 'close') hits++;
assert.strictEqual(hits, 0);
// Modes
assert.strictEqual(blinkScore(0.9, 0.1, 'both'), 0.1);
assert.strictEqual(blinkScore(0.9, 0.1, 'either'), 0.9);
assert.strictEqual(blinkScore(0.9, 0.1, 'left'), 0.9);
assert.strictEqual(blinkScore(0.9, 0.1, 'right'), 0.1);
// WAV
const data = makeDefaultSampleData(44100);
const wav = Buffer.from(encodeWav([data], 44100));
assert.strictEqual(wav.toString('ascii', 0, 4), 'RIFF');
assert.strictEqual(wav.toString('ascii', 8, 12), 'WAVE');
assert.strictEqual(wav.readUInt32LE(24), 44100);
assert.strictEqual(wav.length, 44 + data.length * 2);
assert.ok(data.some(v => Math.abs(v) > 0.3), 'sample non silencieux');
const st = Buffer.from(encodeWav([new Float32Array([1, -1]), new Float32Array([0, 0])], 48000));
assert.strictEqual(st.readInt16LE(44), 32767); assert.strictEqual(st.readInt16LE(48), -32768);
// open renvoyé au réarmement
d = new BlinkDetector({ high: 0.5, low: 0.3 });
const ev = [0, 0.8, 0.6, 0.2, 0.1].map((v, i) => d.update(v, i * 200));
assert.deepStrictEqual(ev, [null, 'close', null, 'open', null]);
const tom = makeTomSampleData(44100);
assert.ok(tom.some(v => Math.abs(v) > 0.3) && !tom.some(Number.isNaN));
for (const [nom, f, dur] of [['snare', makeSnareSampleData, 1.0], ['cymbale', makeCymbalSampleData, 2.0]]) {
  const x = f(44100);
  assert.ok(Math.abs(x.length / 44100 - dur) < 0.01, nom + ' durée');
  assert.ok(!x.some(Number.isNaN), nom + ' NaN');
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  assert.ok(pk > 0.5 && pk <= 1, nom + ' niveau ' + pk);
}
const bsv = { eyeLookOutLeft: 0.8, eyeLookInRight: 0.6, eyeLookInLeft: 0.0, eyeLookOutRight: 0.1 };
const gs = gazeScores(n => bsv[n] || 0);
assert.ok(gs.left > 0.6 && gs.right < 0.1);
// Centrage : un regard au repos décalé (0.25 à gauche, 0.05 à droite) est ramené à 0
const gc = new GazeCenter(5);
let fini = false; for (let i = 0; i < 5; i++) fini = gc.add(0.25, 0.05);
assert.ok(fini && gc.ready);
const rep = gc.apply(0.25, 0.05); assert.ok(rep.left < 1e-9 && rep.right < 1e-9);
const haut = gc.apply(1, 1); assert.ok(Math.abs(haut.left - 1) < 1e-9 && Math.abs(haut.right - 1) < 1e-9);
const mid = gc.apply(0.625, 0.525); assert.ok(Math.abs(mid.left - 0.5) < 1e-9 && Math.abs(mid.right - 0.5) < 1e-9);
assert.ok(gc.apply(0.1, 0).left === 0, 'jamais négatif');
gc.reset(); assert.ok(!gc.ready && gc.n === 0);
const gp = new GazeCenter(3); gp.add(0.9, 0.9); gp.add(0.9, 0.9); gp.add(0.9, 0.9); assert.ok(gp.bl <= 0.8, 'repos plafonné');
// Regard vers le bas : paupières à 0.6 mais regard bas à 0.8 → compte comme ouvert ; vrai clignement → fermé
assert.ok(eyesOpenIgnoringLookDown(0.6, 0.6, 0.8, 0.8, 0.5));
assert.ok(!eyesOpenIgnoringLookDown(0.6, 0.6, 0.0, 0.0, 0.5));
assert.ok(!eyesOpenIgnoringLookDown(0.95, 0.95, 0.3, 0.3, 0.5), 'yeux vraiment fermés');
console.log('OK');
