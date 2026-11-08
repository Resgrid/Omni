// Notification sound files. No modern sound clips (scripts/notification-sounds/fix-peaks.mjs repairs one that does). The
// call alert sounds (scripts/notification-sounds/generate-call-sounds.mjs) — the dispatch tones by call priority and the
// dispatch re-notification — play their tone four times, loud but never clipping, as mono 16-bit PCM WAV shorter than
// 30 s (iOS plays its default sound instead of a longer notification sound). Other notification sounds play once.
import * as fs from 'fs';
import * as path from 'path';

import { MODERN_SOUNDS, type ModernSound } from '../sounds';
import { REPO_ROOT } from './helpers';

const audioDir = path.join(REPO_ROOT, 'apps', 'omni', 'assets', 'audio');

const PRIORITY_TONES = ['moderncallemergency', 'moderncallhigh', 'moderncallmedium', 'moderncalllow'] as const;
const CALL_ALERT_SOUNDS = [...PRIORITY_TONES, 'moderncallrenotify'] as const;

interface PcmWav {
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  /** The first channel, as stored. */
  samples: Int16Array;
  /** The largest absolute sample of any channel. */
  peak: number;
}

function readPcmWav(sound: ModernSound): PcmWav {
  const wav = fs.readFileSync(path.join(audioDir, `${sound}.wav`));
  const result: PcmWav = { format: 0, channels: 0, sampleRate: 0, bitsPerSample: 0, samples: new Int16Array(0), peak: 0 };
  let dataStart = 0;
  let dataSize = 0;

  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);

    if (id === 'fmt ') {
      result.format = wav.readUInt16LE(offset + 8);
      result.channels = wav.readUInt16LE(offset + 10);
      result.sampleRate = wav.readUInt32LE(offset + 12);
      result.bitsPerSample = wav.readUInt16LE(offset + 22);
    } else if (id === 'data') {
      dataStart = offset + 8;
      dataSize = size;
    }

    offset += 8 + size + (size % 2);
  }

  const frames = Math.floor(dataSize / (Math.max(result.channels, 1) * 2));

  result.samples = new Int16Array(frames);

  for (let frame = 0; frame < frames; frame++) result.samples[frame] = wav.readInt16LE(dataStart + frame * result.channels * 2);

  for (let index = 0; index < frames * result.channels; index++) result.peak = Math.max(result.peak, Math.abs(wav.readInt16LE(dataStart + index * 2)));

  return result;
}

const seconds = (wav: PcmWav): number => wav.samples.length / wav.sampleRate;

const toDb = (sample: number): number => 20 * Math.log10(Math.max(sample, 1) / 32768);

/** The sounding parts of the file: runs of sound separated by at least 250 ms of digital silence. */
function plays(wav: PcmWav): Int16Array[] {
  const minimumGap = Math.round(wav.sampleRate * 0.25);
  const parts: Int16Array[] = [];
  let start = -1;
  let last = -1;

  for (let index = 0; index < wav.samples.length; index++) {
    if (wav.samples[index] === 0) continue;

    if (start < 0) start = index;
    else if (index - last > minimumGap) {
      parts.push(wav.samples.subarray(start, last + 1));
      start = index;
    }

    last = index;
  }

  if (start >= 0) parts.push(wav.samples.subarray(start, last + 1));

  return parts;
}

const bytesOf = (samples: Int16Array): Buffer => Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);

/** RMS of the loudest 400 ms, in dBFS. */
function loudest400Ms(wav: PcmWav): number {
  const block = Math.round(wav.sampleRate * 0.4);
  const total = new Float64Array(wav.samples.length + 1);

  for (let index = 0; index < wav.samples.length; index++) total[index + 1] = total[index] + wav.samples[index] * wav.samples[index];
  let loudest = 0;

  for (let start = 0; start + block <= wav.samples.length; start += Math.round(wav.sampleRate * 0.01)) loudest = Math.max(loudest, (total[start + block] - total[start]) / block);

  return toDb(Math.sqrt(loudest));
}

/** Level while sounding: RMS over the 50 ms windows louder than -40 dBFS, and how long those last. */
interface SoundingLevel {
  rmsDb: number;
  seconds: number;
}

function soundingLevel(wav: PcmWav): SoundingLevel {
  const window = Math.round(wav.sampleRate * 0.05);
  let activeSum = 0;
  let activeWindows = 0;

  for (let start = 0; start + window <= wav.samples.length; start += window) {
    let sum = 0;

    for (let index = start; index < start + window; index++) sum += wav.samples[index] * wav.samples[index];
    const rms = Math.sqrt(sum / window);

    if (rms > 32768 * 0.01) {
      activeSum += rms * rms;
      activeWindows++;
    }
  }

  return { rmsDb: toDb(Math.sqrt(activeSum / Math.max(activeWindows, 1))), seconds: activeWindows * 0.05 };
}

describe.each(MODERN_SOUNDS)('%s.wav', (sound) => {
  it('never clips: no sample reaches full scale, and the peak stays at or below -0.5 dBFS', () => {
    const wav = readPcmWav(sound);

    expect(wav).toMatchObject({ format: 1, bitsPerSample: 16 });
    expect(toDb(wav.peak)).toBeLessThanOrEqual(-0.5);
  });
});

describe.each(CALL_ALERT_SOUNDS)('call alert %s.wav', (sound) => {
  const wav = readPcmWav(sound);

  it('is mono 16-bit PCM at 44.1 kHz and shorter than the iOS 30 s limit', () => {
    expect(wav).toMatchObject({ format: 1, channels: 1, sampleRate: 44100, bitsPerSample: 16 });
    expect(seconds(wav)).toBeGreaterThan(4);
    expect(seconds(wav)).toBeLessThan(30);
  });

  it('plays the same tone four times', () => {
    const parts = plays(wav);

    expect(parts).toHaveLength(4);

    for (const part of parts.slice(1)) expect(bytesOf(part).equals(bytesOf(parts[0]))).toBe(true);
  });

  it('is loud and peaks at or below -1 dBFS', () => {
    expect(toDb(wav.peak)).toBeLessThanOrEqual(-1);
    expect(loudest400Ms(wav)).toBeGreaterThan(-12);
  });
});

describe('dispatch re-notification sound (ModernCallRenotify, 27)', () => {
  it('is louder and sounds longer than every priority call tone', () => {
    const renotify = soundingLevel(readPcmWav('moderncallrenotify'));

    for (const tone of PRIORITY_TONES) {
      const level = soundingLevel(readPcmWav(tone));

      expect(renotify.rmsDb).toBeGreaterThan(level.rmsDb + 2);
      expect(renotify.seconds).toBeGreaterThan(level.seconds);
    }
  });
});
