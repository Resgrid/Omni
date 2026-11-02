import { inflateSync, strFromU8 } from 'fflate';

import type { OfflinePackFileStore } from './file-store';

/**
 * Offline glyphs (MapLibre plan §19.5): the manifest's `Styles.Glyphs` zip (`GetOfflineAsset/glyphs.zip`, the operator's
 * `OfflineGlyphsArchiveUrl` mirrored as is) is extracted into a local `{fontstack}/{range}.pbf` directory that the offline
 * styles' `{glyphs}` placeholder points at. Core does not prescribe the folder layout inside the zip, so any leading
 * folders are accepted (`fonts/Noto Sans Regular/0-255.pbf` and `Noto Sans Regular/0-255.pbf` both work).
 *
 * The zip is read through its central directory, one entry at a time (`read(offset, length)`), so a large archive never
 * sits in memory whole and entries written with data descriptors (sizes after the data) still extract. ZIP64 and
 * encrypted entries are refused. The archive was SHA-256 verified before this runs.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;
const CENTRAL_HEADER_BYTES = 46;
const LOCAL_HEADER_BYTES = 30;

/** Upper bounds against a malformed or hostile archive (a full Protomaps font set is well below both). */
export const GLYPH_ARCHIVE_MAX_FILES = 20_000;
export const GLYPH_ARCHIVE_MAX_BYTES = 512 * 1024 * 1024;

export class GlyphArchiveError extends Error {
  constructor(readonly reason: 'not-a-zip' | 'zip64' | 'no-glyphs' | 'too-large' | 'corrupt') {
    super(`Glyph archive rejected: ${reason}`);
    this.name = 'GlyphArchiveError';
  }
}

export interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflate. */
  method: number;
  encrypted: boolean;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

const u16 = (bytes: Uint8Array, offset: number): number => bytes[offset] | (bytes[offset + 1] << 8);
const u32 = (bytes: Uint8Array, offset: number): number => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

/** Lists the entries of a zip file in the store (central directory). */
export async function readZipEntries(store: OfflinePackFileStore, path: string): Promise<ZipEntry[]> {
  const total = await store.size(path);
  if (total === null || total < EOCD_MIN_BYTES) throw new GlyphArchiveError('not-a-zip');
  const tailLength = Math.min(total, EOCD_MIN_BYTES + MAX_COMMENT_BYTES);
  const tail = await store.read(path, total - tailLength, tailLength);
  let eocd = -1;
  for (let index = tail.length - EOCD_MIN_BYTES; index >= 0; index--) {
    if (u32(tail, index) === EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new GlyphArchiveError('not-a-zip');
  const count = u16(tail, eocd + 10);
  const directorySize = u32(tail, eocd + 12);
  const directoryOffset = u32(tail, eocd + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new GlyphArchiveError('zip64');
  if (count > GLYPH_ARCHIVE_MAX_FILES) throw new GlyphArchiveError('too-large');
  if (directoryOffset + directorySize > total) throw new GlyphArchiveError('corrupt');

  const directory = await store.read(path, directoryOffset, directorySize);
  const entries: ZipEntry[] = [];
  let position = 0;
  for (let index = 0; index < count; index++) {
    if (position + CENTRAL_HEADER_BYTES > directory.length || u32(directory, position) !== CENTRAL_SIGNATURE) throw new GlyphArchiveError('corrupt');
    const flags = u16(directory, position + 8);
    const nameLength = u16(directory, position + 28);
    const extraLength = u16(directory, position + 30);
    const commentLength = u16(directory, position + 32);
    const compressedSize = u32(directory, position + 20);
    const size = u32(directory, position + 24);
    const localHeaderOffset = u32(directory, position + 42);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localHeaderOffset === 0xffffffff) throw new GlyphArchiveError('zip64');
    const nameStart = position + CENTRAL_HEADER_BYTES;
    if (nameStart + nameLength > directory.length) throw new GlyphArchiveError('corrupt');
    entries.push({
      name: strFromU8(directory.subarray(nameStart, nameStart + nameLength)),
      method: u16(directory, position + 10),
      encrypted: (flags & 0x1) !== 0,
      compressedSize,
      size,
      localHeaderOffset,
    });
    position = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The uncompressed bytes of one entry (stored or deflate). */
export async function readZipEntry(store: OfflinePackFileStore, path: string, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.encrypted) throw new GlyphArchiveError('corrupt');
  const header = await store.read(path, entry.localHeaderOffset, LOCAL_HEADER_BYTES);
  if (header.length < LOCAL_HEADER_BYTES || u32(header, 0) !== LOCAL_SIGNATURE) throw new GlyphArchiveError('corrupt');
  const dataOffset = entry.localHeaderOffset + LOCAL_HEADER_BYTES + u16(header, 26) + u16(header, 28);
  const raw = entry.compressedSize > 0 ? await store.read(path, dataOffset, entry.compressedSize) : new Uint8Array(0);
  if (raw.length !== entry.compressedSize) throw new GlyphArchiveError('corrupt');
  if (entry.method === 0) {
    if (raw.length !== entry.size) throw new GlyphArchiveError('corrupt');
    return raw;
  }
  if (entry.method === 8) {
    try {
      const out = inflateSync(raw, { out: new Uint8Array(entry.size) });
      if (out.length !== entry.size) throw new GlyphArchiveError('corrupt');
      return out;
    } catch (error) {
      if (error instanceof GlyphArchiveError) throw error;
      throw new GlyphArchiveError('corrupt');
    }
  }
  throw new GlyphArchiveError('corrupt');
}

const GLYPH_FILE = /^(\d{1,5})-(\d{1,5})\.pbf$/;
// Font names are plain text (letters, digits, spaces, commas, dashes…); never path syntax or control characters.
const UNSAFE_SEGMENT = /[\u0000-\u001f\\:*?"<>|]/;

/** `{fontstack}/{range}.pbf` for a glyph entry (the last two path segments), or null for anything else. */
export function glyphTargetOf(entryName: string): { fontstack: string; range: string } | null {
  if (entryName.endsWith('/') || entryName.includes('\\')) return null;
  const segments = entryName.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 2 || segments.some((segment) => segment === '.' || segment === '..' || segment === '__MACOSX')) return null;
  const file = segments[segments.length - 1];
  const fontstack = segments[segments.length - 2].trim();
  const match = GLYPH_FILE.exec(file);
  if (!match || !fontstack || fontstack.startsWith('.') || UNSAFE_SEGMENT.test(fontstack)) return null;
  return { fontstack, range: `${match[1]}-${match[2]}` };
}

export interface GlyphExtractResult {
  files: number;
  bytes: number;
  fontstacks: string[];
}

export interface GlyphExtractOptions {
  signal?: AbortSignal;
  maxFiles?: number;
  maxBytes?: number;
  /** Lets the event loop run between entries (default `setTimeout(0)` every 32 entries). */
  yieldToEventLoop?: () => Promise<void>;
}

const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const abortError = (): Error => {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
};

/**
 * Extracts the glyph PBFs of `zipPath` into `targetDirectory` (`<target>/<fontstack>/<range>.pbf`). The target is
 * cleared first; the caller extracts into a staging directory and moves it into place (atomic swap).
 */
export async function extractGlyphArchive(store: OfflinePackFileStore, zipPath: string, targetDirectory: string, options: GlyphExtractOptions = {}): Promise<GlyphExtractResult> {
  const maxFiles = options.maxFiles ?? GLYPH_ARCHIVE_MAX_FILES;
  const maxBytes = options.maxBytes ?? GLYPH_ARCHIVE_MAX_BYTES;
  const yieldToEventLoop = options.yieldToEventLoop ?? defaultYield;
  const entries = await readZipEntries(store, zipPath);
  await store.remove(targetDirectory);

  const written = new Set<string>();
  const fontstacks = new Set<string>();
  let bytes = 0;
  for (const entry of entries) {
    if (options.signal?.aborted) throw abortError();
    const target = glyphTargetOf(entry.name);
    if (!target) continue;
    const relative = `${target.fontstack}/${target.range}.pbf`;
    if (written.has(relative)) continue;
    if (written.size >= maxFiles || bytes + entry.size > maxBytes) throw new GlyphArchiveError('too-large');
    const data = await readZipEntry(store, zipPath, entry);
    await store.append(`${targetDirectory}/${relative}`, data);
    written.add(relative);
    fontstacks.add(target.fontstack);
    bytes += data.length;
    if (written.size % 32 === 0) await yieldToEventLoop();
  }
  if (written.size === 0) throw new GlyphArchiveError('no-glyphs');
  return { files: written.size, bytes, fontstacks: [...fontstacks].sort() };
}
