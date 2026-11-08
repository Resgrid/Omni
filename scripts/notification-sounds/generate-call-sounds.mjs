#!/usr/bin/env node
// Generates the call alert sounds in apps/omni/assets/audio: moderncallemergency, moderncallhigh, moderncallmedium and
// moderncalllow (a dispatch, by call priority) and moderncallrenotify (Core's `ModernCallRenotify` push sound type 27,
// the reminder Core sends a member or unit that has not acknowledged a dispatch). These are the sounds nobody may miss,
// so each file:
//
// - plays its tone PLAYS (4) times with a short gap. The OS plays a push sound once, so the repeats live in the file.
//   iOS plays the default sound instead of a notification sound of 30 s or more; Android plays a channel sound to the
//   end. The longest file here is about 12 s.
// - is loud without clipping: the four priority tones are levelled to the same loudness (CALL_TARGET_LUFS, the loudest
//   400 ms), re-notify about 3 dB above them, through a look-ahead limiter that turns gain down smoothly (never more
//   than MAX_GAIN_REDUCTION_DB, so the tones keep their shape and nothing distorts) with true peak at or below
//   TRUE_PEAK_CEILING_DB, so nothing clips even after the phone resamples to 48 kHz.
// - is mono, 44.1 kHz 16-bit PCM WAV (what iOS, Android, web and Electron all play): both phone speakers play the
//   whole tone, at half the size of stereo.
//
// The priority tones come from the single-play files the apps shipped before (sources/, unchanged originals); the
// re-notify tone is synthesised here: four quick rising E6 → A6 → C#7 bursts, then a bright pulsing A6 + C#7 accent.
// The other notification sounds (messages, call updated/closed, statuses…) are not generated or changed.
//
// Deterministic: the same script always writes the same bytes. Usage (repo root):
//   node scripts/notification-sounds/generate-call-sounds.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db, downmix, fadeIn, fadeOut, fromDb, limit, maxMomentaryLoudness, readWav, SAMPLE_RATE, samplePeak, truePeak, truePeakEnvelope, writeWav } from './audio.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const AUDIO_DIR = path.join(root, 'apps', 'omni', 'assets', 'audio');

/** How many times each file plays its tone. */
const PLAYS = 4;

/** Silence between two plays. */
const GAP_SECONDS = 0.3;

/** iOS replaces a notification sound of 30 s or more with the default sound. */
const IOS_MAX_SECONDS = 30;

/** Loudness of the loudest 400 ms (EBU R128 momentary, LUFS as played on two speakers). */
const CALL_TARGET_LUFS = -6;
const RENOTIFY_TARGET_LUFS = -3;

/** The limiter never turns the gain down further than this; a tone that would need more stays a little quieter. */
const MAX_GAIN_REDUCTION_DB = 4;

/** True-peak ceiling of every file, and the limiter's own ceiling just below it. */
const TRUE_PEAK_CEILING_DB = -1;
const LIMITER_CEILING_DB = -1.2;

/** Where a play ends: the first point after its loudest moment that stays this far below it for TAIL_QUIET_SECONDS. */
const TAIL_FLOOR_DB = -50;
const TAIL_QUIET_SECONDS = 0.2;
const START_FADE_SECONDS = 0.003;
const END_FADE_SECONDS = 0.15;

const PRIORITY_TONES = ['moderncallemergency', 'moderncallhigh', 'moderncallmedium', 'moderncalllow'];

/** Cuts the source's silent (or near-silent) tail; returns a copy. */
function trimTail(samples) {
  const window = Math.round(SAMPLE_RATE * 0.01);
  const levels = [];

  for (let start = 0; start + window <= samples.length; start += window) {
    let sum = 0;

    for (let i = start; i < start + window; i += 1) sum += samples[i] * samples[i];
    levels.push(Math.sqrt(sum / window));
  }

  const loudest = Math.max(...levels);
  const floor = loudest * fromDb(TAIL_FLOOR_DB);
  const quietWindows = Math.round((TAIL_QUIET_SECONDS * SAMPLE_RATE) / window);

  for (let index = levels.indexOf(loudest); index < levels.length; index += 1) {
    if (levels.slice(index, index + quietWindows).every((level) => level <= floor)) return samples.slice(0, index * window);
  }

  return samples.slice();
}

/** One play of a priority tone: the original, as one channel, without its silent tail, with click-free ends. */
function priorityPlay(name) {
  const { sampleRate, channels } = readWav(path.join(here, 'sources', `${name}.wav`));

  if (sampleRate !== SAMPLE_RATE) throw new Error(`${name}: expected ${SAMPLE_RATE} Hz, found ${sampleRate} Hz`);

  return trimTail(downmix(channels));
}

// Re-notify voice: a clean fundamental with enough upper harmonics to carry over noise, and an octave-down layer for
// body on larger speakers. 1.3–2.2 kHz is the band the ear is most sensitive to and phone speakers reproduce best;
// moderncallemergency is a 700/880 Hz two-tone, so this one is clearly distinct from it.
const NOTE = { E6: 1318.51, A6: 1760.0, Cs7: 2217.46, E7: 2637.02 };

const PARTIALS = [
  { ratio: 1, gain: 1 },
  { ratio: 2, gain: 0.42 },
  { ratio: 3, gain: 0.22 },
  { ratio: 4, gain: 0.1 },
  { ratio: 0.5, gain: 0.28 },
];

/** Adds one voiced tone: fast attack, a short plateau, then a decay toward `sustain`, and a click-free release. */
function addTone(signal, { start, length, frequencies, level = 1, attack = 0.004, plateau = 0.05, sustain = 0.65, release = 0.012, tremolo = null }) {
  const first = Math.round(start * SAMPLE_RATE);
  const count = Math.round(length * SAMPLE_RATE);

  for (let i = 0; i < count && first + i < signal.length; i += 1) {
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
      for (const partial of PARTIALS) sample += partial.gain * Math.sin(2 * Math.PI * frequency * partial.ratio * t);
    }

    signal[first + i] += (level * envelope * sample) / frequencies.length;
  }
}

/** One play of the re-notify tone: four quick rising bursts, then the pulsing accent (about 2.8 s). */
function renotifyPlay() {
  const NOTE_LENGTH = 0.105;
  const NOTE_SPACING = 0.115;
  const BURST_SPACING = 0.46;
  const ACCENT_LENGTH = 0.95;
  const signal = new Float64Array(Math.round(SAMPLE_RATE * (4 * BURST_SPACING + ACCENT_LENGTH)));

  for (let burst = 0; burst < 4; burst += 1) {
    [NOTE.E6, NOTE.A6, NOTE.Cs7].forEach((frequency, step) => {
      addTone(signal, { start: burst * BURST_SPACING + step * NOTE_SPACING, length: NOTE_LENGTH, frequencies: [frequency], level: step === 2 ? 1 : 0.9 });
    });
  }

  // A6 + C#7 with a little E7 shimmer and a 12 Hz pulse, fading out at the end.
  addTone(signal, {
    start: 4 * BURST_SPACING,
    length: ACCENT_LENGTH,
    frequencies: [NOTE.A6, NOTE.Cs7, NOTE.E7],
    level: 1.15,
    plateau: 0.4,
    sustain: 0.6,
    release: 0.2,
    tremolo: { rate: 12, depth: 0.4 },
  });

  return signal;
}

/**
 * Levels one play: as loud as `targetLufs` (loudest 400 ms) or as loud as MAX_GAIN_REDUCTION_DB of limiting allows,
 * whichever is quieter, with true peak at or below TRUE_PEAK_CEILING_DB.
 */
function master(play, targetLufs) {
  fadeIn(play, START_FADE_SECONDS);

  fadeOut(play, END_FADE_SECONDS);
  const peak = truePeak(play);
  const input = play.map((value) => value / peak);
  const envelope = truePeakEnvelope(input);
  const ceiling = fromDb(LIMITER_CEILING_DB);

  const fits = (drive) => {
    const { output, gainReductionDb } = limit(input, envelope, drive, ceiling);

    return gainReductionDb <= MAX_GAIN_REDUCTION_DB && maxMomentaryLoudness([output, output]) <= targetLufs;
  };

  // Loudness and gain reduction both only rise with drive, so bisect for the highest drive that fits.
  let low = 0.05;
  let high = 20;

  for (let step = 0; step < 50; step += 1) {
    const drive = Math.sqrt(low * high);

    if (fits(drive)) low = drive;
    else high = drive;
  }

  const { output, gainReductionDb } = limit(input, envelope, low, ceiling);
  const overshoot = truePeak(output) / fromDb(TRUE_PEAK_CEILING_DB);

  if (overshoot > 1) for (let i = 0; i < output.length; i += 1) output[i] /= overshoot;

  return { output, gainReductionDb };
}

/** The play PLAYS times with GAP_SECONDS of silence between plays. */
function repeat(play) {
  const gap = Math.round(SAMPLE_RATE * GAP_SECONDS);
  const file = new Float64Array(PLAYS * play.length + (PLAYS - 1) * gap);

  for (let index = 0; index < PLAYS; index += 1) file.set(play, index * (play.length + gap));

  return file;
}

const sounds = [...PRIORITY_TONES.map((name) => ({ name, play: priorityPlay(name), target: CALL_TARGET_LUFS })), { name: 'moderncallrenotify', play: trimTail(renotifyPlay()), target: RENOTIFY_TARGET_LUFS }];

for (const { name, play, target } of sounds) {
  const { output, gainReductionDb } = master(play, target);
  const file = repeat(output);
  const seconds = file.length / SAMPLE_RATE;

  if (seconds >= IOS_MAX_SECONDS) throw new Error(`${name}: ${seconds.toFixed(1)} s is too long for an iOS notification sound`);
  const filePeak = truePeak(file);

  if (db(filePeak) > TRUE_PEAK_CEILING_DB + 0.01) throw new Error(`${name}: true peak ${db(filePeak).toFixed(2)} dBTP is above ${TRUE_PEAK_CEILING_DB} dBTP`);
  const bytes = writeWav(path.join(AUDIO_DIR, `${name}.wav`), [file]);

  console.log(
    `${name}.wav: ${PLAYS} × ${(output.length / SAMPLE_RATE).toFixed(2)} s = ${seconds.toFixed(2)} s, ${(bytes / 1024).toFixed(0)} KB, ` +
      `loudest 400 ms ${maxMomentaryLoudness([output, output]).toFixed(1)} LUFS, true peak ${db(filePeak).toFixed(2)} dBTP ` +
      `(sample peak ${db(samplePeak(file)).toFixed(2)} dBFS), limiter ${gainReductionDb.toFixed(1)} dB`
  );
}
