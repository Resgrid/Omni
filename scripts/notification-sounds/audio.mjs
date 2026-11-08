// Audio helpers for the notification sound scripts (generate-call-sounds.mjs, fix-peaks.mjs): 16-bit PCM WAV in and out,
// ITU-R BS.1770-4 momentary loudness, 4x oversampled true peak, a de-clipper, and a look-ahead peak limiter that turns
// gain down smoothly instead of shaping the waveform, so a sound gets louder without clipping or audible distortion.
// Plain Node, no dependencies, deterministic: the same input always gives the same bytes.
import fs from 'node:fs';

export const SAMPLE_RATE = 44100;

export const db = (value) => 20 * Math.log10(Math.max(value, 1e-12));

export const fromDb = (value) => 10 ** (value / 20);

/** Reads a PCM WAV (16-bit) and returns its sample rate and one Float64Array (-1..1) per channel. */
export function readWav(file) {
  const buffer = fs.readFileSync(file);

  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file} is not a WAV file`);
  let format = null;
  let data = null;

  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);

    if (id === 'fmt ') format = { tag: buffer.readUInt16LE(offset + 8), channels: buffer.readUInt16LE(offset + 10), sampleRate: buffer.readUInt32LE(offset + 12), bits: buffer.readUInt16LE(offset + 22) };
    else if (id === 'data') data = { start: offset + 8, size: Math.min(size, buffer.length - offset - 8) };

    offset += 8 + size + (size % 2);
  }

  if (!format || !data) throw new Error(`${file} has no fmt or data chunk`);

  if (format.tag !== 1 || format.bits !== 16) throw new Error(`${file} is not 16-bit PCM`);
  const frames = Math.floor(data.size / (format.channels * 2));
  const channels = Array.from({ length: format.channels }, () => new Float64Array(frames));

  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < format.channels; channel += 1) channels[channel][frame] = buffer.readInt16LE(data.start + (frame * format.channels + channel) * 2) / 32768;
  }

  return { sampleRate: format.sampleRate, channels };
}

/**
 * Writes 16-bit PCM, one Float64Array per channel (the same scale readWav returns, so an untouched sample is written
 * back exactly). Returns the file size in bytes.
 */
export function writeWav(file, channels, sampleRate = SAMPLE_RATE) {
  const frames = channels[0].length;
  const blockAlign = channels.length * 2;
  const dataBytes = frames * blockAlign;
  const wav = Buffer.alloc(44 + dataBytes);

  wav.write('RIFF', 0, 'ascii');

  wav.writeUInt32LE(36 + dataBytes, 4);

  wav.write('WAVE', 8, 'ascii');

  wav.write('fmt ', 12, 'ascii');

  wav.writeUInt32LE(16, 16);

  wav.writeUInt16LE(1, 20);

  wav.writeUInt16LE(channels.length, 22);

  wav.writeUInt32LE(sampleRate, 24);

  wav.writeUInt32LE(sampleRate * blockAlign, 28);

  wav.writeUInt16LE(blockAlign, 32);

  wav.writeUInt16LE(16, 34);

  wav.write('data', 36, 'ascii');

  wav.writeUInt32LE(dataBytes, 40);

  for (let frame = 0; frame < frames; frame += 1) {
    channels.forEach((samples, channel) => {
      wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[frame] * 32768))), 44 + frame * blockAlign + channel * 2);
    });
  }

  fs.writeFileSync(file, wav);

  return wav.length;
}

/** A 16-bit sample at full scale: what a clipped waveform is flattened to. */
const isFullScale = (value) => value >= 32767 / 32768 || value <= -1;

/**
 * Rebuilds the peaks of a clipped channel (runs of full-scale samples): each run is replaced by the cubic through the two
 * samples on either side of it, so the waveform gets its rounded top back. The rebuilt peak lies above full scale, so a
 * limiter has to bring it down afterwards. Returns the channel's copy and how many samples were rebuilt.
 */
export function declip(samples) {
  const output = samples.slice();
  let rebuilt = 0;

  for (let start = 0; start < samples.length; start += 1) {
    if (!isFullScale(samples[start])) continue;
    let end = start;

    while (end + 1 < samples.length && isFullScale(samples[end + 1]) && Math.sign(samples[end + 1]) === Math.sign(samples[start])) end += 1;

    if (start >= 2 && end + 2 < samples.length) {
      const xs = [start - 2, start - 1, end + 1, end + 2];
      const ys = xs.map((x) => samples[x]);

      for (let x = start; x <= end; x += 1) {
        // Lagrange cubic through the four neighbours, kept on the clipped side and at most 6 dB above full scale.
        let value = 0;

        xs.forEach((xi, i) => {
          let term = ys[i];

          xs.forEach((xj, j) => {
            if (j !== i) term *= (x - xj) / (xi - xj);
          });
          value += term;
        });

        output[x] = Math.sign(samples[x]) * Math.min(2, Math.max(Math.abs(samples[x]), Math.sign(samples[x]) * value));
        rebuilt += 1;
      }
    }

    start = end;
  }

  return { output, rebuilt };
}

/** Averages the channels into one. */
export function downmix(channels) {
  const mono = new Float64Array(channels[0].length);

  for (const channel of channels) {
    for (let i = 0; i < mono.length; i += 1) mono[i] += channel[i] / channels.length;
  }

  return mono;
}

function biquad(samples, b, a) {
  const out = new Float64Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i];
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;

    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }

  return out;
}

/** BS.1770 K-weighting (the high shelf and the RLB high-pass), designed for any sample rate as libebur128 does. */
function kWeight(samples, sampleRate) {
  let k = Math.tan((Math.PI * 1681.974450955533) / sampleRate);
  const q = 0.7071752369554196;
  const vh = 10 ** (3.999843853973347 / 20);
  const vb = vh ** 0.4996667741545416;
  let a0 = 1 + k / q + k * k;
  const shelf = biquad(samples, [(vh + (vb * k) / q + k * k) / a0, (2 * (k * k - vh)) / a0, (vh - (vb * k) / q + k * k) / a0], [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0]);

  k = Math.tan((Math.PI * 38.13547087602444) / sampleRate);
  const q2 = 0.5003270373238773;

  a0 = 1 + k / q2 + k * k;

  return biquad(shelf, [1, -2, 1], [1, (2 * (k * k - 1)) / a0, (1 - k / q2 + k * k) / a0]);
}

/**
 * Maximum momentary loudness (EBU R128 "M max": the loudest 400 ms, K-weighted, in LUFS) of the channels as played. A
 * mono file plays on both speakers, so pass it twice (`[mono, mono]`) to compare it with a stereo file. Unlike gated
 * integrated loudness it only rises when the sound gets louder, so a drive search can aim at it, and it is what a
 * listener hears when the alert goes off.
 */
export function maxMomentaryLoudness(channels, sampleRate = SAMPLE_RATE) {
  const length = channels[0].length;
  const block = Math.round(sampleRate * 0.4);
  const step = Math.round(sampleRate * 0.01);
  // Running total of the K-weighted power of all channels, so each 400 ms block is one subtraction.
  const total = new Float64Array(length + 1);

  for (const channel of channels) {
    const weighted = kWeight(channel, sampleRate);
    let sum = 0;

    for (let i = 0; i < length; i += 1) {
      sum += weighted[i] * weighted[i];
      total[i + 1] += sum;
    }
  }

  let loudest = 0;

  for (let start = 0; start + block <= length; start += step) loudest = Math.max(loudest, (total[start + block] - total[start]) / block);

  return -0.691 + 10 * Math.log10(Math.max(loudest, 1e-20));
}

// 4x oversampling interpolator (windowed sinc, 32 taps per phase) for true-peak measurement, as BS.1770 Annex 2 does.
const OVERSAMPLE = 4;
const HALF_TAPS = 16;

const INTERPOLATION_PHASES = Array.from({ length: OVERSAMPLE - 1 }, (_, index) => {
  const fraction = (index + 1) / OVERSAMPLE;

  return Array.from({ length: HALF_TAPS * 2 }, (_, tap) => {
    const t = tap - HALF_TAPS + 1 - fraction;
    const sinc = Math.sin(Math.PI * t) / (Math.PI * t);
    const window = 0.42 + 0.5 * Math.cos((Math.PI * t) / HALF_TAPS) + 0.08 * Math.cos((2 * Math.PI * t) / HALF_TAPS);

    return sinc * window;
  });
});

/** Per sample: the largest absolute value of the oversampled signal between the previous and the next sample. */
export function truePeakEnvelope(samples) {
  const segment = new Float64Array(samples.length);

  for (let n = 0; n < samples.length; n += 1) {
    let peak = Math.abs(samples[n]);

    for (const taps of INTERPOLATION_PHASES) {
      let value = 0;

      for (let tap = 0; tap < taps.length; tap += 1) {
        const index = n + tap - HALF_TAPS + 1;

        if (index >= 0 && index < samples.length) value += samples[index] * taps[tap];
      }

      peak = Math.max(peak, Math.abs(value));
    }

    segment[n] = peak;
  }

  const envelope = new Float64Array(samples.length);

  for (let n = 0; n < samples.length; n += 1) envelope[n] = Math.max(segment[n], n > 0 ? segment[n - 1] : 0);

  return envelope;
}

export const truePeak = (samples) => truePeakEnvelope(samples).reduce((peak, value) => Math.max(peak, value), 0);

export const samplePeak = (samples) => samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);

/**
 * Look-ahead peak limiter. `drive` is the gain before limiting; the gain then comes down just ahead of any true peak
 * that would pass `ceiling` (linear) and recovers over `releaseSeconds`. The gain never moves faster than one
 * look-ahead window, so tones keep their shape (no waveshaping, no added harmonics). `envelope` is the input's
 * true-peak envelope (computed once by the caller, because the drive search runs this many times).
 */
export function limit(samples, envelope, drive, ceiling, lookaheadSeconds = 0.005, releaseSeconds = 0.12) {
  const length = samples.length;
  const window = Math.max(1, Math.round(SAMPLE_RATE * lookaheadSeconds));
  const required = new Float64Array(length);

  for (let n = 0; n < length; n += 1) required[n] = envelope[n] * drive > ceiling ? ceiling / (envelope[n] * drive) : 1;

  // The lowest required gain over the next `window` samples (sliding-window minimum).
  const ahead = new Float64Array(length);
  const queue = new Int32Array(length + window);
  let head = 0;
  let tail = 0;

  for (let n = length - 1; n >= 0; n -= 1) {
    while (tail > head && required[queue[tail - 1]] >= required[n]) tail -= 1;
    queue[tail] = n;
    tail += 1;

    while (queue[head] > n + window - 1) head += 1;
    ahead[n] = required[queue[head]];
  }

  // Exponential release toward unity, never above what is required.
  const recovery = 1 - Math.exp(-1 / (SAMPLE_RATE * releaseSeconds));
  const held = new Float64Array(length);
  let gain = 1;

  for (let n = 0; n < length; n += 1) {
    gain = Math.min(ahead[n], gain + (1 - gain) * recovery);
    held[n] = gain;
  }

  // Moving average over the window: a smooth attack that still reaches each peak's required gain in time. Before the
  // first sample it averages in the first window's requirement, so a sound that starts loud is limited from sample 0.
  const output = new Float64Array(length);
  const before = length > 0 ? ahead[0] : 1;
  let sum = window * before;
  let minimumGain = 1;

  for (let n = 0; n < length; n += 1) {
    sum += held[n] - (n >= window ? held[n - window] : before);
    const smoothed = sum / window;

    minimumGain = Math.min(minimumGain, smoothed);
    output[n] = samples[n] * drive * smoothed;
  }

  return { output, gainReductionDb: -db(minimumGain) };
}

/** Raised-cosine fade in over the first `seconds`. */
export function fadeIn(samples, seconds) {
  const count = Math.min(samples.length, Math.round(SAMPLE_RATE * seconds));

  for (let i = 0; i < count; i += 1) samples[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / count);
}

/** Raised-cosine fade out over the last `seconds`. */
export function fadeOut(samples, seconds) {
  const count = Math.min(samples.length, Math.round(SAMPLE_RATE * seconds));

  for (let i = 0; i < count; i += 1) samples[samples.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / count);
}
