// Gera os efeitos sonoros e a trilha de fundo como tons sintetizados (sem
// depender de nenhum arquivo de áudio de terceiros/licenciado) e grava como
// WAV PCM simples em assets/sounds/. Rodar de novo só se quiser regenerar.
import { writeFileSync, mkdirSync } from "node:fs";

function writeWav(path, samples, sampleRate) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buf.writeUInt16LE(bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

// Envelope attack-decay simples (sem sustain longo — são blips curtos).
const env = (t, dur, attack, release) => {
  if (t < attack) return t / attack;
  if (t > dur - release) return Math.max(0, (dur - t) / release);
  return 1;
};
const tone = (freq, dur, sampleRate, { attack = 0.01, release = dur * 0.6, wave = "sine", gain = 1, glideTo } = {}) => {
  const n = Math.round(dur * sampleRate);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const f = glideTo ? freq + (glideTo - freq) * (t / dur) : freq;
    const phase = 2 * Math.PI * f * t;
    const raw = wave === "triangle" ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase);
    out[i] = raw * env(t, dur, attack, release) * gain;
  }
  return out;
};
const mix = (...layers) => {
  const n = Math.max(...layers.map((l) => l.offset + l.samples.length));
  const out = new Array(n).fill(0);
  for (const { samples, offset } of layers)
    for (let i = 0; i < samples.length; i++) out[offset + i] += samples[i];
  return out;
};

mkdirSync("assets/sounds", { recursive: true });

// Toque neutro de interface — confirma que o toque registrou, sem indicar
// certo/errado (jogos de múltipla escolha não revelam a resposta no cliente).
writeWav("assets/sounds/tap.wav", tone(880, 0.07, 44100, { attack: 0.003, release: 0.05, gain: 0.5 }), 44100);

// Resultado bom (>= CLEAR_SCORE) — arpejo maior ascendente, curto e alegre.
const successSr = 44100;
writeWav(
  "assets/sounds/success.wav",
  mix(
    { samples: tone(523.25, 0.14, successSr, { attack: 0.005, release: 0.09, gain: 0.45 }), offset: 0 },
    { samples: tone(659.25, 0.14, successSr, { attack: 0.005, release: 0.09, gain: 0.45 }), offset: Math.round(0.09 * successSr) },
    { samples: tone(783.99, 0.22, successSr, { attack: 0.005, release: 0.16, gain: 0.5 }), offset: Math.round(0.18 * successSr) },
  ),
  successSr,
);

// Resultado fraco/alvo perdido — glide curto pra baixo, neutro (não é punitivo).
writeWav(
  "assets/sounds/fail.wav",
  tone(300, 0.2, 44100, { attack: 0.005, release: 0.14, wave: "triangle", gain: 0.4, glideTo: 190 }),
  44100,
);

// Trilha de fundo: progressão de 4 acordes (Am–F–C–G) com um arpejo leve tipo
// kalimba por cima — gerada por síntese, então é deliberadamente simples; não
// substitui uma faixa composta/licenciada de verdade.
const musicSr = 22050;
const chords = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [130.81, 164.81, 196.0], // C
  [196.0, 246.94, 293.66], // G
];
const noteDur = 0.5,
  notesPerChord = 8,
  chordDur = noteDur * notesPerChord;
const layers = [];
chords.forEach((chord, ci) => {
  for (let i = 0; i < notesPerChord; i++) {
    const freq = chord[i % chord.length] * (i % 6 === 3 ? 2 : 1); // sobe uma oitava de vez em quando
    const offset = Math.round((ci * chordDur + i * noteDur) * musicSr);
    layers.push({
      samples: tone(freq, noteDur * 1.15, musicSr, { attack: 0.01, release: noteDur * 0.9, wave: "triangle", gain: 0.16 }),
      offset,
    });
  }
});
let music = mix(...layers);
// Fade-in/out nas pontas do laço inteiro pra não estalar quando repetir.
const fadeN = Math.round(0.03 * musicSr);
for (let i = 0; i < fadeN; i++) {
  music[i] *= i / fadeN;
  music[music.length - 1 - i] *= i / fadeN;
}
writeWav("assets/sounds/music.wav", music, musicSr);

console.log("Gerado: assets/sounds/{tap,success,fail,music}.wav");
