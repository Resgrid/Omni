/** One caption cue of a WebVTT track (times in seconds). */
export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

const TIMING = /^((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)/;

/** `01:02:03.500`, `02:03.5` → seconds; NaN when it is not a WebVTT timestamp. */
export function vttSeconds(stamp: string): number {
  const parts = stamp.replace(',', '.').split(':').map(Number);

  if (parts.some((part) => !Number.isFinite(part))) return Number.NaN;

  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Strips WebVTT markup (`<v Speaker>`, `<b>`, `<00:01.000>`) so a cue renders as plain text, never as markup. */
const plain = (line: string): string => line.replace(/<[^>]*>/g, '').trim();

/**
 * The cues of a WebVTT track, in order. Header, NOTE, STYLE and REGION blocks and cue settings are skipped; a cue's lines are
 * joined with line breaks. Anything that is not a well-formed cue is ignored rather than shown.
 */
export function parseWebVtt(text: string): CaptionCue[] {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const cues: CaptionCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => TIMING.test(line));

    if (timingIndex < 0) continue;

    const match = TIMING.exec(lines[timingIndex] ?? '');
    const start = vttSeconds(match?.[1] ?? '');
    const end = vttSeconds(match?.[2] ?? '');

    const body = lines
      .slice(timingIndex + 1)
      .map(plain)
      .filter(Boolean)
      .join('\n');

    if (Number.isFinite(start) && Number.isFinite(end) && end > start && body) cues.push({ start, end, text: body });
  }

  return cues.sort((a, b) => a.start - b.start);
}

/** The cue shown at `seconds` (the last one started when cues overlap), or null. */
export function cueAt(cues: readonly CaptionCue[], seconds: number): CaptionCue | null {
  let found: CaptionCue | null = null;

  for (const cue of cues) {
    if (cue.start > seconds) break;

    if (cue.end > seconds) found = cue;
  }

  return found;
}

/** Signed media links stop at UrlExpiresOn: treat them as gone a little before, so a player never starts on a dying link. */
export const PLAYLIST_EXPIRY_MARGIN_MS = 20_000;

export const isPlaylistExpired = (expiresOn: string | null | undefined, now: number = Date.now()): boolean => {
  const at = expiresOn ? Date.parse(expiresOn.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(expiresOn) ? expiresOn : `${expiresOn}Z`) : Number.NaN;

  return !Number.isFinite(at) || at - PLAYLIST_EXPIRY_MARGIN_MS <= now;
};

/** Share of a video watched (0–100) from the furthest position reached. */
export const watchedPercent = (furthestSeconds: number, durationSeconds: number): number => (durationSeconds > 0 ? Math.max(0, Math.min(100, Math.round((furthestSeconds / durationSeconds) * 100))) : 0);
