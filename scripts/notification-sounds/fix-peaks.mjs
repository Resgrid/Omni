#!/usr/bin/env node
// Repairs a notification sound that clips, in place, without changing how it sounds otherwise: clipped runs (samples
// flattened at full scale) get their rounded peak back (audio.mjs `declip`), then a look-ahead limiter with no makeup
// gain brings only those peaks down to TRUE_PEAK_CEILING_DB. Everything quieter than the ceiling keeps its exact level;
// channels, sample rate and length stay the same. A file that already has no full-scale samples and a true peak at or
// below the ceiling is left untouched, so running it twice changes nothing.
//
// The call alert sounds are built by generate-call-sounds.mjs instead; this is for the other sounds, which are kept as
// they are. Usage (repo root):
//   node scripts/notification-sounds/fix-peaks.mjs apps/omni/assets/audio/moderntroublealert.wav
import path from 'node:path';

import { db, declip, fromDb, limit, maxMomentaryLoudness, readWav, SAMPLE_RATE, samplePeak, truePeak, truePeakEnvelope, writeWav } from './audio.mjs';

const TRUE_PEAK_CEILING_DB = -1;
const LIMITER_CEILING_DB = -1.2;

/**
 * A short release: the gain dips only around each rebuilt peak and is back within a few cycles, so the sound loses as
 * little loudness as possible (a sound that clipped was louder than any clean version of it can be).
 */
const LOOKAHEAD_SECONDS = 0.005;
const RELEASE_SECONDS = 0.02;

const describe = (channels) => {
  const peaks = channels.map(truePeak);

  return `true peak ${db(Math.max(...peaks)).toFixed(2)} dBTP, sample peak ${db(Math.max(...channels.map(samplePeak))).toFixed(2)} dBFS, loudest 400 ms ${maxMomentaryLoudness(channels).toFixed(1)} LUFS`;
};

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error('Usage: node scripts/notification-sounds/fix-peaks.mjs <file.wav> [...]');
  process.exit(1);
}

for (const file of files) {
  const { sampleRate, channels } = readWav(file);
  const name = path.basename(file);

  if (sampleRate !== SAMPLE_RATE) throw new Error(`${name}: expected ${SAMPLE_RATE} Hz, found ${sampleRate} Hz`);
  const repaired = channels.map(declip);
  const rebuilt = repaired.reduce((total, channel) => total + channel.rebuilt, 0);
  const before = describe(channels);

  if (rebuilt === 0 && db(Math.max(...channels.map(truePeak))) <= TRUE_PEAK_CEILING_DB) {
    console.log(`${name}: already clean (${before}), unchanged`);
    continue;
  }

  // One gain for all channels (from the loudest of them at each moment), so the stereo image does not move.
  const envelopes = repaired.map(({ output }) => truePeakEnvelope(output));
  const linked = envelopes[0].map((value, index) => Math.max(...envelopes.map((envelope) => envelope[index])));
  const limited = repaired.map(({ output }) => limit(output, linked, 1, fromDb(LIMITER_CEILING_DB), LOOKAHEAD_SECONDS, RELEASE_SECONDS));
  const output = limited.map((channel) => channel.output);
  const overshoot = Math.max(...output.map(truePeak)) / fromDb(TRUE_PEAK_CEILING_DB);

  if (overshoot > 1) for (const channel of output) for (let i = 0; i < channel.length; i += 1) channel[i] /= overshoot;

  writeWav(file, output, sampleRate);

  console.log(`${name}: rebuilt ${rebuilt} clipped samples, limiter ${Math.max(...limited.map((channel) => channel.gainReductionDb)).toFixed(1)} dB on the peaks`);
  console.log(`  before: ${before}`);
  console.log(`  after:  ${describe(readWav(file).channels)}`);
}
