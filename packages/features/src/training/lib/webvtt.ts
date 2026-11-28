import { parseUtcMs } from '@resgrid/core/utils/dates';

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

/** The character references caption files use (WebVTT reads HTML's), by name. */
const NAMED_REFERENCES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['lrm', '‎'],
  ['rlm', '‏'],
]);

const REFERENCE = /&(?:#[xX]([0-9a-fA-F]{1,6})|#(\d{1,7})|([a-zA-Z]{2,8}));/g;
const MAX_CODE_POINT = 0x10ffff;
const SURROGATES = { from: 0xd800, to: 0xdfff };

const isCharacter = (code: number): boolean => code > 0 && code <= MAX_CODE_POINT && (code < SURROGATES.from || code > SURROGATES.to);

/** `&amp;` → `&`, `&#233;` / `&#xE9;` → `é`; a reference this does not know is left as written. */
function decodeReferences(text: string): string {
  return text.replace(REFERENCE, (whole: string, hex: string | undefined, decimal: string | undefined, name: string | undefined) => {
    if (name) return NAMED_REFERENCES.get(name) ?? whole;

    const code = hex ? Number.parseInt(hex, 16) : Number.parseInt(decimal ?? '', 10);

    return isCharacter(code) ? String.fromCodePoint(code) : whole;
  });
}

/**
 * Strips WebVTT markup (`<v Speaker>`, `<b>`, `<00:01.000>`), then decodes character references, so a cue reads as written and
 * renders as plain text, never as markup (a decoded `&lt;b&gt;` is shown as the characters `<b>`).
 */
const plain = (line: string): string => decodeReferences(line.replace(/<[^>]*>/g, '')).trim();

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

/** When signed links stop (UrlExpiresOn, UTC: "Z", an offset, or none), in epoch milliseconds; null when it cannot be read. */
export const playlistExpiresAt = (expiresOn: string | null | undefined): number | null => parseUtcMs(expiresOn);

export const isPlaylistExpired = (expiresOn: string | null | undefined, now: number = Date.now()): boolean => {
  const at = playlistExpiresAt(expiresOn);

  return at === null || at - PLAYLIST_EXPIRY_MARGIN_MS <= now;
};

/** How long until the links are read again: just before they stop, and never sooner than a second (an unreadable stamp is "now"). */
export const playlistRefreshDelay = (expiresOn: string | null | undefined, now: number = Date.now()): number => Math.max(1000, (playlistExpiresAt(expiresOn) ?? now) - PLAYLIST_EXPIRY_MARGIN_MS - now);

/** Share of a video watched (0–100) from the furthest position reached. */
export const watchedPercent = (furthestSeconds: number, durationSeconds: number): number => (durationSeconds > 0 ? Math.max(0, Math.min(100, Math.round((furthestSeconds / durationSeconds) * 100))) : 0);
