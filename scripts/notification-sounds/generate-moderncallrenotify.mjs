#!/usr/bin/env node
// Generates apps/omni/assets/audio/moderncallrenotify.wav, the modern sound for Core's `ModernCallRenotify` push sound
// type (27): the reminder Core sends a member or unit that has not acknowledged a dispatch (Dispatch Settings → Dispatch
// Re-notification). It must get attention where the first page did not, so it is deliberately louder and more insistent
// than moderncallemergency, in the same clean, sine-based modern style:
//
// - Four quick rising E6 → A6 → C#7 bursts (1.3–2.2 kHz, the band the ear is most sensitive to and phone speakers
//   reproduce best), then a bright pulsing A6 + C#7 accent. moderncallemergency is a 700/880 Hz two-tone, so this one
//   is also clearly distinct from it.
// - About 2.6 s of sound in the 3.0 s file (emergency: about 1.5 s), at roughly -10 dBFS RMS while sounding (emergency:
//   about -18 dBFS), peaking at -0.5 dBFS through a soft limiter.
// - 44.1 kHz, 16-bit PCM, two identical channels (no detune, so a mono phone speaker loses nothing), like the other sounds.
//
// Deterministic: the same script always writes the same bytes. Usage (repo root):
//   node scripts/notification-sounds/generate-moderncallrenotify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const DURATION = 3.0;
const CHANNELS = 2;
const PEAK_CEILING_DB = -0.5;
const TARGET_ACTIVE_RMS_DB = -10;

const NOTE = { E6: 1318.51, A6: 1760.0, Cs7: 2217.46, E7: 2637.02 };

// Partials of the modern voice: a clean fundamental with enough upper harmonics to carry over noise, and an octave-down
// layer for body on larger speakers.
const PARTIALS = [
  { ratio: 1, gain: 1 },
  { ratio: 2, gain: 0.42 },
  { ratio: 3, gain: 0.22 },
  { ratio: 4, gain: 0.1 },
  { ratio: 0.5, gain: 0.28 },
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const output = path.join(root, 'apps', 'omni', 'assets', 'audio', 'moderncallrenotify.wav');

const frames = Math.round(SAMPLE_RATE * DURATION);
const signal = new Float64Array(frames);

const db = (value) => 20 * Math.log10(Math.max(value, 1e-9));

/** Adds one voiced tone: fast attack, a short plateau, then a decay toward `sustain`, and a click-free release. */
function addTone({ start, length, frequencies, level = 1, attack = 0.004, plateau = 0.05, sustain = 0.65, release = 0.012, tremolo = null }) {
  const first = Math.round(start * SAMPLE_RATE);
  const count = Math.round(length * SAMPLE_RATE);

  for (let i = 0; i < count && first + i < frames; i += 1) {
    const t = i / SAMPLE_RATE;
    let envelope;

    if (t < attack) envelope = t / attack;
    else if (t < attack + plateau) envelope = 1;
    else envelope = sustain + (1 - sustain) * Math.exp(-(t - attack - plateau) / 0.06);
    const remaining = length - t;

    if (remaining < release) envelope *= Math.max(0, remaining / release);

    if (tremolo) envelope *= 1 - tremolo.depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * tremolo.rate * t));

    let sample = 0;

    for (const frequency of frequencies) {
      for (const partial of PARTIALS) {
        sample += partial.gain * Math.sin(2 * Math.PI * frequency * partial.ratio * t);
      }
    }

    signal[first + i] += (level * envelope * sample) / frequencies.length;
  }
}

// Four rising bursts.
const NOTE_LENGTH = 0.105;
const NOTE_SPACING = 0.115;
const BURST_SPACING = 0.46;

for (let burst = 0; burst < 4; burst += 1) {
  [NOTE.E6, NOTE.A6, NOTE.Cs7].forEach((frequency, step) => {
    addTone({ start: burst * BURST_SPACING + step * NOTE_SPACING, length: NOTE_LENGTH, frequencies: [frequency], level: step === 2 ? 1 : 0.9 });
  });
}

// The pulsing accent: A6 + C#7 with a little E7 shimmer, a 12 Hz pulse, fading out before the end of the file.
addTone({
  start: 4 * BURST_SPACING,
  length: 0.95,
  frequencies: [NOTE.A6, NOTE.Cs7, NOTE.E7],
  level: 1.15,
  plateau: 0.4,
  sustain: 0.6,
  release: 0.2,
  tremolo: { rate: 12, depth: 0.4 },
});

/** RMS over 50 ms windows louder than -40 dBFS: the level while the sound is actually sounding. */
function measure(samples) {
  const window = Math.round(SAMPLE_RATE * 0.05);
  let peak = 0;
  let activeSum = 0;
  let activeWindows = 0;

  for (const value of samples) peak = Math.max(peak, Math.abs(value));

  for (let start = 0; start + window <= samples.length; start += window) {
    let sum = 0;

    for (let i = start; i < start + window; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / window);

    if (rms > 0.01) {
      activeSum += rms * rms;
      activeWindows += 1;
    }
  }

  return { peak, activeRms: Math.sqrt(activeSum / Math.max(activeWindows, 1)), activeSeconds: activeWindows * 0.05 };
}

/** Soft limiter: linear below the knee, a tanh curve above it, never past 1.0. */
const KNEE = 0.72;

const limit = (value) => {
  const magnitude = Math.abs(value);

  if (magnitude <= KNEE) return value;

  return Math.sign(value) * (KNEE + (1 - KNEE) * Math.tanh((magnitude - KNEE) / (1 - KNEE)));
};

const ceiling = 10 ** (PEAK_CEILING_DB / 20);

function render(drive) {
  const rawPeak = measure(signal).peak;
  const out = new Float64Array(frames);

  for (let i = 0; i < frames; i += 1) out[i] = limit((signal[i] / rawPeak) * drive) * ceiling;

  return out;
}

// Find the drive into the limiter that reaches the target level (bisection; the level rises with drive).
let low = 0.5;
let high = 4;

for (let step = 0; step < 40; step += 1) {
  const middle = (low + high) / 2;

  if (db(measure(render(middle)).activeRms) < TARGET_ACTIVE_RMS_DB) low = middle;
  else high = middle;
}

const rendered = render((low + high) / 2);

// Whole-file 5 ms fades so nothing clicks at either end.
const fade = Math.round(SAMPLE_RATE * 0.005);

for (let i = 0; i < fade; i += 1) {
  rendered[i] *= i / fade;
  rendered[frames - 1 - i] *= i / fade;
}

// 16-bit PCM WAV, identical channels.
const dataBytes = frames * CHANNELS * 2;
const wav = Buffer.alloc(44 + dataBytes);

wav.write('RIFF', 0, 'ascii');

wav.writeUInt32LE(36 + dataBytes, 4);

wav.write('WAVE', 8, 'ascii');

wav.write('fmt ', 12, 'ascii');

wav.writeUInt32LE(16, 16);

wav.writeUInt16LE(1, 20);

wav.writeUInt16LE(CHANNELS, 22);

wav.writeUInt32LE(SAMPLE_RATE, 24);

wav.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);

wav.writeUInt16LE(CHANNELS * 2, 32);

wav.writeUInt16LE(16, 34);

wav.write('data', 36, 'ascii');

wav.writeUInt32LE(dataBytes, 40);

for (let i = 0; i < frames; i += 1) {
  const value = Math.max(-32768, Math.min(32767, Math.round(rendered[i] * 32767)));

  for (let channel = 0; channel < CHANNELS; channel += 1) wav.writeInt16LE(value, 44 + (i * CHANNELS + channel) * 2);
}

fs.writeFileSync(output, wav);

const stats = measure(rendered);

console.log(`Wrote ${path.relative(root, output)}: ${DURATION.toFixed(1)} s, peak ${db(stats.peak).toFixed(1)} dBFS, ` + `${db(stats.activeRms).toFixed(1)} dBFS RMS over ${stats.activeSeconds.toFixed(2)} s of sound.`);
