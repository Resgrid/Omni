#!/usr/bin/env node
// Generates the Dispatch app's own notification sound set in apps/omni/variants/dispatch/assets/audio: one file for every
// shared modern sound (same file name, so Core's sound types and Android channel ids map 1:1 and no server change is
// needed) plus the five dispatcher desk sounds (Core PushSoundTypes 28–32, sent only to the Dispatch app). Department
// custom call tones (c1–c25) stay shared: departments chose them. The other four apps keep apps/omni/assets/audio.
//
// The set keeps the modern style — short tonal chimes, a fast attack and a bell-like decay, the same urgency ladder,
// length and loudness as the shared sound it replaces — but has its own voice, so a dispatcher knows at once that a sound
// came from the Dispatch app and not from Responder or Unit on the same desk:
//
// - Timbre: a soft FM "console mallet" (a vibraphone-like bar: an FM body whose brightness falls away after the strike,
//   the bar's two-octave partial and a faint tine), with a slow motor tremolo on the ringing notes. The shared set is
//   pure sine chimes and bright two-tone beeps; nothing in it trembles.
// - Signature: every sound opens with the "console tap", a short grace note a perfect fifth below the note it leads into.
// - Key: every note is from D major pentatonic (D E F# A B), so the whole set sounds like one instrument.
// - Urgency: alarms (call alerts, trouble, desk queue) use the bright voice (a second-harmonic modulator, a faster
//   tremolo), faster figures and higher notes; closings, statuses and breaks use the soft voice and slower figures.
//
// Levels follow scripts/notification-sounds/generate-call-sounds.mjs: the call alerts play their tone four times (the OS
// plays a push sound once) levelled to -6 LUFS (re-notify -3 LUFS) as the loudest 400 ms; every other sound plays once
// at the loudness of the shared sound it replaces (the desk sounds at the level of the sound class they belong to). True
// peak is at or below -1 dBTP everywhere (no clipping, even after resampling to 48 kHz), every note has a click-free
// attack and release, and every file is mono 44.1 kHz 16-bit PCM WAV shorter than iOS's 30 s limit.
//
// Deterministic (no randomness, no network): the same script always writes the same bytes. Usage (repo root):
//   node scripts/notification-sounds/generate-dispatch-sounds.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db, fadeIn, fadeOut, fromDb, limit, maxMomentaryLoudness, SAMPLE_RATE, samplePeak, truePeak, truePeakEnvelope, writeWav } from './audio.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const OUT_DIR = path.join(root, 'apps', 'omni', 'variants', 'dispatch', 'assets', 'audio');

/** Call alerts: how many times the file plays its tone, and the silence between plays (as generate-call-sounds.mjs). */
const PLAYS = 4;
const GAP_SECONDS = 0.3;

/** iOS replaces a notification sound of 30 s or more with the default sound. */
const IOS_MAX_SECONDS = 30;

/** True-peak ceiling of every file, and the limiter's own ceiling just below it. */
const TRUE_PEAK_CEILING_DB = -1;
const LIMITER_CEILING_DB = -1.2;

/** Where a sound ends: the point after which it stays this far below its loudest 10 ms. */
const TAIL_FLOOR_DB = -60;
const START_FADE_SECONDS = 0.003;
const END_FADE_SECONDS = 0.08;

/** Loudness is measured over 400 ms blocks, so a shorter sound is padded with silence to this length. */
const MIN_SECONDS = 0.45;

/** The console tap: the grace note sounds this long before the note it leads into, a perfect fifth below it. */
const GRACE_LEAD_SECONDS = 0.085;
const GRACE_LENGTH_SECONDS = 0.2;
const GRACE_LEVEL = 0.55;

const NOTE_NAMES = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** Equal temperament, A4 = 440 Hz: `hz('F#6')`. */
function hz(name) {
  const match = /^([A-G])(#?)(\d)$/.exec(name);

  if (!match) throw new Error(`Unknown note ${name}`);
  const semitones = NOTE_NAMES[match[1]] + (match[2] ? 1 : 0) + (Number(match[3]) - 4) * 12;

  return 440 * 2 ** (semitones / 12);
}

/** The note a perfect fifth (7 semitones) below. */
const fifthBelow = (frequency) => frequency / 2 ** (7 / 12);

// Voices. An FM body (sin(carrier + index · sin(ratio · carrier))) whose index falls from `index` toward `indexFloor`
// over `indexTime` (the strike's brightness), the bar partial two octaves up decaying over `barTime`, a faint tine at
// 9.2× for the mallet's contact, an exponential decay over `decay` (toward `sustain` for held alarm notes) and a motor
// tremolo of `tremoloDepth` at `tremoloRate` Hz that starts at full level.
const VOICES = {
  // The everyday Dispatch voice: messages, notifications, desk offers.
  mallet: { ratio: 1, index: 1.4, indexFloor: 0.12, indexTime: 0.06, bar: 0.3, barTime: 0.16, tine: 0.05, decay: 0.42, sustain: 0, tremoloRate: 5.6, tremoloDepth: 0.22 },
  // Rounder and quieter: closings, statuses, breaks, training.
  soft: { ratio: 1, index: 0.75, indexFloor: 0.04, indexTime: 0.05, bar: 0.16, barTime: 0.14, tine: 0.025, decay: 0.55, sustain: 0, tremoloRate: 5, tremoloDepth: 0.18 },
  // Attention: call alerts, trouble, the desk queue. Odd harmonics from the 2:1 modulator carry over a noisy room.
  bright: { ratio: 2, index: 1.6, indexFloor: 0.45, indexTime: 0.1, bar: 0.14, barTime: 0.1, tine: 0.03, decay: 0.3, sustain: 0.35, tremoloRate: 9, tremoloDepth: 0.28 },
};

/** Highest bar or tine partial the voices add (anything above is left out, so nothing turns shrill). */
const PARTIAL_LIMIT_HZ = 6000;

/** Every sound is low-passed here (2nd-order Butterworth): the FM sidebands above it only add sizzle on a phone speaker. */
const LOWPASS_HZ = 6500;

/**
 * Adds one struck note. `event`: `at` (s), `note` (a name) or `frequency` (Hz), `length` (s, including the release), `voice`, `level`,
 * and overrides of the voice's fields (`decay`, `sustain`, `tremoloRate`, `tremoloDepth`, `index`).
 */
function addNote(signal, event) {
  const voice = { ...VOICES[event.voice ?? 'mallet'], ...event };
  const frequency = event.frequency ?? hz(event.note);
  const first = Math.round(event.at * SAMPLE_RATE);
  const count = Math.round(event.length * SAMPLE_RATE);
  const attack = 0.004;
  const release = Math.min(0.06, event.length / 3);
  const level = event.level ?? 1;
  const barFrequency = frequency * 4;
  const tineFrequency = frequency * 9.2;

  for (let i = 0; i < count && first + i < signal.length; i += 1) {
    const t = i / SAMPLE_RATE;
    let envelope = voice.sustain + (1 - voice.sustain) * Math.exp(-t / voice.decay);

    if (t < attack) envelope *= 0.5 - 0.5 * Math.cos((Math.PI * t) / attack);
    const remaining = event.length - t;

    if (remaining < release) envelope *= 0.5 - 0.5 * Math.cos((Math.PI * Math.max(0, remaining)) / release);
    envelope *= 1 - voice.tremoloDepth * (0.5 - 0.5 * Math.cos(2 * Math.PI * voice.tremoloRate * t));
    const index = voice.indexFloor + (voice.index - voice.indexFloor) * Math.exp(-t / voice.indexTime);
    const phase = 2 * Math.PI * frequency * t;
    let sample = Math.sin(phase + index * Math.sin(voice.ratio * phase));

    if (barFrequency < PARTIAL_LIMIT_HZ) sample += voice.bar * Math.exp(-t / voice.barTime) * Math.sin(4 * phase);

    if (tineFrequency < PARTIAL_LIMIT_HZ) sample += voice.tine * Math.exp(-t / 0.012) * Math.sin(9.2 * phase);
    signal[first + i] += level * envelope * sample;
  }
}

/** The console tap leading into `note` at `at`: the grace note a fifth below, GRACE_LEAD_SECONDS earlier. */
function tap(at, note, voice) {
  return { at: Math.max(0, at - GRACE_LEAD_SECONDS), frequency: fifthBelow(hz(note)), length: GRACE_LENGTH_SECONDS, voice, level: GRACE_LEVEL, tremoloDepth: 0 };
}

/** A note led in by the console tap. */
function tapped(event) {
  return [tap(event.at, event.note, event.voice), event];
}

/** 2nd-order Butterworth low-pass (RBJ biquad), in place. */
function lowpass(samples, cutoffHz) {
  const w = (2 * Math.PI * cutoffHz) / SAMPLE_RATE;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 - Math.cos(w)) / 2 / a0;
  const b1 = (1 - Math.cos(w)) / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i];
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;

    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    samples[i] = y;
  }
}

/** Renders a list of note events to a buffer long enough for all of them, low-passed at LOWPASS_HZ. */
function render(events) {
  const end = Math.max(...events.map((event) => event.at + event.length));
  const signal = new Float64Array(Math.ceil(end * SAMPLE_RATE));

  for (const event of events) addNote(signal, event);
  lowpass(signal, LOWPASS_HZ);

  return signal;
}

/** Repeats `count` notes `step` seconds apart, alternating through `notes`. */
function alternate(start, step, count, notes, event) {
  return Array.from({ length: count }, (_, index) => ({ ...event, at: start + index * step, note: notes[index % notes.length] }));
}

// The compositions. `target` is the loudest 400 ms in LUFS (as played on two speakers); `maxGainReductionDb` is how far
// the limiter may turn the peaks down to get there; `call` marks the call alerts, which repeat PLAYS times.
const SOUNDS = {
  // Call alerts (generate-call-sounds.mjs targets). Emergency: a fast high bell alternating A6/D6 after the tap, then a
  // held, trembling D major chord. High: three rising D-F#-A arpeggios. Medium: two A-F#-A turns. Low: a slow, low
  // ringing dyad. Re-notify: four rapid rising bursts and a fast-pulsing high accent, louder than all of them.
  moderncallemergency: {
    call: true,
    target: -6,
    maxGainReductionDb: 4,
    events: [
      ...tapped({ at: 0.09, note: 'D6', length: 0.2, voice: 'bright' }),
      ...alternate(0.26, 0.115, 8, ['A6', 'D6'], { length: 0.16, voice: 'bright', level: 0.85, tremoloDepth: 0 }),
      ...['D6', 'F#6', 'A6'].map((note) => ({ at: 1.2, note, length: 0.78, voice: 'bright', level: 0.55, decay: 0.5, tremoloRate: 11, tremoloDepth: 0.4 })),
    ],
  },
  moderncallhigh: {
    call: true,
    target: -6,
    maxGainReductionDb: 4,
    events: [
      ...tapped({ at: 0.09, note: 'D6', length: 0.22, voice: 'bright' }),
      ...[0.32, 0.78, 1.24].flatMap((start, burst) =>
        ['D6', 'F#6', 'A6'].map((note, step) => ({
          at: start + step * 0.1,
          note,
          length: step === 2 ? (burst === 2 ? 0.7 : 0.3) : 0.2,
          voice: 'bright',
          level: step === 2 ? 0.95 : 0.8,
          tremoloDepth: burst === 2 ? 0.3 : 0,
        }))
      ),
    ],
  },
  moderncallmedium: {
    call: true,
    target: -6.3,
    maxGainReductionDb: 4,
    events: [
      ...tapped({ at: 0.09, note: 'A5', length: 0.3, voice: 'mallet', decay: 0.3 }),
      ...[0.42, 1.1].flatMap((start, turn) =>
        ['A5', 'F#5', 'A5'].map((note, step) => ({ at: start + step * 0.17, note, length: step === 2 && turn === 1 ? 0.75 : 0.32, voice: 'mallet', level: 0.9, decay: 0.3, sustain: 0.12, index: 1.8, indexFloor: 0.3 }))
      ),
    ],
  },
  moderncalllow: {
    call: true,
    target: -6,
    maxGainReductionDb: 4,
    events: [
      ...tapped({ at: 0.09, note: 'A5', length: 0.4, voice: 'mallet', decay: 0.35 }),
      { at: 0.5, note: 'D6', length: 1.6, voice: 'mallet', decay: 0.7, sustain: 0.15, index: 1.7, indexFloor: 0.3, tremoloDepth: 0.3, level: 0.9 },
      { at: 0.5, note: 'A5', length: 1.6, voice: 'mallet', decay: 0.7, sustain: 0.15, index: 1.7, indexFloor: 0.3, tremoloDepth: 0.3, level: 0.6 },
    ],
  },
  moderncallrenotify: {
    call: true,
    target: -3,
    maxGainReductionDb: 4,
    events: [
      ...[0, 0.4, 0.8, 1.2].flatMap((start) => ['A5', 'D6', 'F#6'].map((note, step) => ({ at: start + step * 0.11, note, length: 0.13, voice: 'bright', level: step === 2 ? 1 : 0.9, tremoloDepth: 0, decay: 0.5 }))),
      ...['D6', 'A6'].map((note) => ({ at: 1.62, note, length: 1.1, voice: 'bright', level: 0.75, decay: 0.9, sustain: 0.8, tremoloRate: 12, tremoloDepth: 0.45 })),
    ],
  },
  // Call updated: a gentle tap into A6, answered by E6. Call closed: the tap into A5, then falling through F#5 to D5.
  moderncallupdated: { target: -15.8, events: [...tapped({ at: 0.09, note: 'A6', length: 0.45, voice: 'mallet' }), { at: 0.42, note: 'E6', length: 1, voice: 'mallet', decay: 0.4 }] },
  moderncallclosed: {
    target: -19.4,
    events: [...tapped({ at: 0.09, note: 'A5', length: 0.4, voice: 'soft' }), { at: 0.38, note: 'F#5', length: 0.45, voice: 'soft' }, { at: 0.66, note: 'D5', length: 1.1, voice: 'soft', decay: 0.5 }],
  },
  // Chat: the console tap alone, soft and short. Message: the tap into A6, rung twice.
  modernchat: { target: -29.4, events: tapped({ at: 0.09, note: 'A6', length: 0.26, voice: 'soft', decay: 0.12, tremoloDepth: 0 }) },
  modernmessage: { target: -20.4, events: [...tapped({ at: 0.09, note: 'A6', length: 0.3, voice: 'mallet', decay: 0.2 }), { at: 0.33, note: 'A6', length: 0.6, voice: 'mallet', decay: 0.25 }] },
  // Notification: the tap into E6, a single clear strike.
  modernnotification: { target: -13.5, events: tapped({ at: 0.09, note: 'E6', length: 0.6, voice: 'mallet', decay: 0.22 }) },
  // Statuses and notices: low, soft, one or two notes.
  modernpersonnelstatus: { target: -31.1, events: tapped({ at: 0.09, note: 'F#6', length: 0.6, voice: 'soft', decay: 0.25 }) },
  modernunitstatus: { target: -14.4, events: [...tapped({ at: 0.09, note: 'B5', length: 0.3, voice: 'mallet', decay: 0.2 }), { at: 0.36, note: 'B5', length: 0.6, voice: 'mallet', decay: 0.25 }] },
  modernstaffing: { target: -14.9, events: [...tapped({ at: 0.09, note: 'E6', length: 0.3, voice: 'mallet', decay: 0.2 }), { at: 0.3, note: 'D6', length: 0.6, voice: 'mallet', decay: 0.25 }] },
  modernunitnotice: { target: -21.1, events: tapped({ at: 0.09, note: 'E5', length: 0.6, voice: 'soft', decay: 0.25 }) },
  moderncalendar: { target: -23.4, events: [...tapped({ at: 0.09, note: 'F#6', length: 0.35, voice: 'soft' }), { at: 0.36, note: 'D6', length: 0.75, voice: 'soft', decay: 0.35 }] },
  modernavailabilityalert: {
    target: -17.1,
    events: [...tapped({ at: 0.09, note: 'A6', length: 0.18, voice: 'mallet', decay: 0.15, index: 1.9 }), { at: 0.27, note: 'A6', length: 0.45, voice: 'mallet', decay: 0.2, index: 1.9 }],
  },
  modernresourceorder: {
    target: -15.9,
    events: [...tapped({ at: 0.09, note: 'A5', length: 0.35, voice: 'mallet' }), { at: 0.42, note: 'B5', length: 0.35, voice: 'mallet' }, { at: 0.72, note: 'A5', length: 0.9, voice: 'mallet', decay: 0.4 }],
  },
  // Weather alert: a warning that walks down from A6, bright but not an alarm.
  modernweatheralert: {
    target: -12.3,
    events: [
      ...tapped({ at: 0.09, note: 'A6', length: 0.45, voice: 'bright', sustain: 0, decay: 0.3, tremoloRate: 6, index: 1.6 }),
      ...['F#6', 'D6'].map((note, step) => ({ at: 0.48 + step * 0.38, note, length: 0.5, voice: 'bright', sustain: 0, decay: 0.3, tremoloRate: 6, index: 1.6 })),
      { at: 1.24, note: 'A5', length: 1.4, voice: 'bright', sustain: 0, decay: 0.55, tremoloRate: 6, tremoloDepth: 0.3, index: 1.6 },
    ],
  },
  // Shift: a rising D major arpeggio that rings out. Training: a slow descent that rings out.
  modernshift: {
    target: -8.4,
    maxGainReductionDb: 2,
    events: [
      ...tapped({ at: 0.09, note: 'A5', length: 0.4, voice: 'mallet' }),
      ...['D6', 'F#6', 'A6'].map((note, step) => ({ at: 0.36 + step * 0.24, note, length: step === 2 ? 3 : 2.6 - step * 0.24, voice: 'mallet', decay: 1.1, level: 0.75 })),
    ],
  },
  moderntraining: {
    target: -16.8,
    events: [
      ...tapped({ at: 0.09, note: 'E6', length: 0.6, voice: 'soft' }),
      ...['D6', 'A5', 'F#5'].map((note, step) => ({ at: 0.48 + step * 0.4, note, length: 1.2, voice: 'soft', decay: 0.6 })),
      { at: 1.68, note: 'D5', length: 1.9, voice: 'soft', decay: 0.9 },
    ],
  },
  // Trouble alert: the loudest one-shot. A fast, trembling B6/F#6 alternation after the tap, then a held chord.
  moderntroublealert: {
    target: -5.5,
    maxGainReductionDb: 4,
    events: [
      ...tapped({ at: 0.09, note: 'B6', length: 0.16, voice: 'bright' }),
      ...alternate(0.22, 0.095, 10, ['F#6', 'B6'], { length: 0.14, voice: 'bright', level: 0.85, tremoloDepth: 0 }),
      ...['B5', 'F#6'].map((note) => ({ at: 1.18, note, length: 0.7, voice: 'bright', level: 0.7, decay: 0.45, tremoloRate: 12, tremoloDepth: 0.45 })),
    ],
  },
  // Dispatcher desk (PushSoundTypes 28–32, Dispatch only). Offer: work routed to you — the tap into A6, then B6 and D7
  // rising ("for you"), at notification level. Queue alert: work waiting too long — two bright tapped double strikes,
  // between the call updated and trouble alert levels. Message: a desk conversation — the tap into B6, answered by D7,
  // a little more present than a message. Break reminder: a relaxed descent. Break over: a rising "back on" arpeggio.
  moderndeskoffer: {
    target: -11,
    events: [...tapped({ at: 0.09, note: 'A6', length: 0.3, voice: 'mallet' }), { at: 0.3, note: 'B6', length: 0.3, voice: 'mallet' }, { at: 0.5, note: 'D7', length: 0.75, voice: 'mallet', decay: 0.3 }],
  },
  moderndeskqueuealert: {
    target: -8,
    maxGainReductionDb: 3,
    events: [0, 0.6].flatMap((start) => [
      ...tapped({ at: start + 0.09, note: 'E6', length: 0.2, voice: 'bright', sustain: 0, decay: 0.2 }),
      { at: start + 0.27, note: 'E6', length: start === 0 ? 0.32 : 0.75, voice: 'bright', sustain: 0, decay: start === 0 ? 0.2 : 0.35, tremoloRate: 8, tremoloDepth: start === 0 ? 0 : 0.35 },
    ]),
  },
  moderndeskmessage: { target: -18.5, events: [...tapped({ at: 0.09, note: 'B6', length: 0.3, voice: 'mallet', decay: 0.2 }), { at: 0.3, note: 'D7', length: 0.6, voice: 'mallet', decay: 0.25 }] },
  modernbreakreminder: {
    target: -16,
    events: [...tapped({ at: 0.09, note: 'A6', length: 0.45, voice: 'soft' }), { at: 0.45, note: 'F#6', length: 0.5, voice: 'soft' }, { at: 0.8, note: 'D6', length: 1.1, voice: 'soft', decay: 0.5 }],
  },
  modernbreakover: {
    target: -13,
    events: [
      ...tapped({ at: 0.09, note: 'A5', length: 0.3, voice: 'mallet' }),
      ...['D6', 'F#6', 'A6'].map((note, step) => ({ at: 0.27 + step * 0.15, note, length: step === 2 ? 1.1 : 0.35, voice: 'mallet', decay: step === 2 ? 0.45 : 0.25 })),
    ],
  },
};

/** Cuts the silent tail: everything after the sound stays TAIL_FLOOR_DB below its loudest 10 ms. Returns a copy. */
function trimTail(samples) {
  const window = Math.round(SAMPLE_RATE * 0.01);
  const levels = [];

  for (let start = 0; start + window <= samples.length; start += window) {
    let sum = 0;

    for (let i = start; i < start + window; i += 1) sum += samples[i] * samples[i];
    levels.push(Math.sqrt(sum / window));
  }

  const floor = Math.max(...levels) * fromDb(TAIL_FLOOR_DB);
  const last = levels.findLastIndex((level) => level > floor);

  return samples.slice(0, Math.min(samples.length, (last + 1) * window));
}

/** A copy padded with silence to at least MIN_SECONDS. */
function padded(samples) {
  const output = new Float64Array(Math.max(samples.length, Math.round(MIN_SECONDS * SAMPLE_RATE)));

  output.set(samples);

  return output;
}

/** Loudest 400 ms in LUFS as played on two speakers (a sound shorter than MIN_SECONDS is measured padded). */
const loudness = (samples) => maxMomentaryLoudness([padded(samples), padded(samples)]);

/**
 * Levels one play: as loud as `targetLufs` or as loud as `maxGainReductionDb` of limiting allows, whichever is quieter,
 * with true peak at or below TRUE_PEAK_CEILING_DB (as generate-call-sounds.mjs `master`).
 */
function master(play, targetLufs, maxGainReductionDb) {
  fadeIn(play, START_FADE_SECONDS);

  fadeOut(play, END_FADE_SECONDS);
  const peak = truePeak(play);
  const input = play.map((value) => value / peak);
  const envelope = truePeakEnvelope(input);
  const ceiling = fromDb(LIMITER_CEILING_DB);

  const fits = (drive) => {
    const { output, gainReductionDb } = limit(input, envelope, drive, ceiling);

    return gainReductionDb <= maxGainReductionDb + 1e-9 && loudness(output) <= targetLufs;
  };

  // Loudness and gain reduction both only rise with drive, so bisect for the highest drive that fits.
  let low = 0.001;
  let high = 20;

  for (let step = 0; step < 60; step += 1) {
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

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [name, sound] of Object.entries(SOUNDS)) {
  const play = trimTail(render(sound.events));
  const { output, gainReductionDb } = master(play, sound.target, sound.maxGainReductionDb ?? 1);
  const file = sound.call ? repeat(output) : padded(output);
  const seconds = file.length / SAMPLE_RATE;

  if (seconds >= IOS_MAX_SECONDS) throw new Error(`${name}: ${seconds.toFixed(1)} s is too long for an iOS notification sound`);
  const filePeak = truePeak(file);

  if (db(filePeak) > TRUE_PEAK_CEILING_DB + 0.01) throw new Error(`${name}: true peak ${db(filePeak).toFixed(2)} dBTP is above ${TRUE_PEAK_CEILING_DB} dBTP`);
  const bytes = writeWav(path.join(OUT_DIR, `${name}.wav`), [file]);
  const plays = sound.call ? `${PLAYS} × ${(output.length / SAMPLE_RATE).toFixed(2)} s = ` : '';

  console.log(
    `${name}.wav: ${plays}${seconds.toFixed(2)} s, ${(bytes / 1024).toFixed(0)} KB, loudest 400 ms ${loudness(output).toFixed(1)} LUFS (target ${sound.target}), ` +
      `true peak ${db(filePeak).toFixed(2)} dBTP (sample peak ${db(samplePeak(file)).toFixed(2)} dBFS), limiter ${gainReductionDb.toFixed(1)} dB`
  );
}
