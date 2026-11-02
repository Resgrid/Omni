import { strToU8, Zip, ZipDeflate, ZipPassThrough, zipSync } from 'fflate';

import { createMemoryPackFileStore } from '../file-store';
import { extractGlyphArchive, GlyphArchiveError, glyphTargetOf, readZipEntries } from '../glyphs';
import { bytesOf } from './helpers';

const REGULAR_0 = bytesOf(700, 1);
const REGULAR_256 = bytesOf(300, 2);
const BOLD_0 = bytesOf(500, 3);

/** A zip written in one go (sizes in the local headers). */
const syncZip = (files: Record<string, Uint8Array>, level: 0 | 6 = 6): Uint8Array => zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, [data, { level }]])));

/** A streamed zip: sizes follow the data (data descriptors), the layout a non-seekable writer produces. */
function streamedZip(files: Record<string, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    chunks.push(chunk);
  });
  for (const [name, data] of Object.entries(files)) {
    const entry = name.endsWith('.txt') ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
    zip.add(entry);
    entry.push(data, true);
  }
  zip.end();
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function storeWith(zip: Uint8Array) {
  const store = createMemoryPackFileStore();
  await store.append('s/tmp/glyphs.part', zip);
  return store;
}

describe('glyphTargetOf', () => {
  it('takes the last two segments of a range file, whatever folders lead to it', () => {
    expect(glyphTargetOf('fonts/Noto Sans Regular/0-255.pbf')).toEqual({ fontstack: 'Noto Sans Regular', range: '0-255' });
    expect(glyphTargetOf('Noto Sans Bold/65280-65535.pbf')).toEqual({ fontstack: 'Noto Sans Bold', range: '65280-65535' });
    expect(glyphTargetOf('a/b/Open Sans Regular,Arial Unicode MS Regular/256-511.pbf')).toEqual({ fontstack: 'Open Sans Regular,Arial Unicode MS Regular', range: '256-511' });
  });

  it('ignores everything else and refuses path tricks', () => {
    for (const name of [
      '0-255.pbf',
      'fonts/',
      'fonts/Noto Sans Regular/readme.txt',
      '__MACOSX/fonts/Noto Sans Regular/0-255.pbf',
      'fonts/Noto Sans Regular/._0-255.pbf',
      '../Noto/0-255.pbf',
      'x/../0-255.pbf',
      'fonts\\Noto\\0-255.pbf',
      'fonts/.hidden/0-255.pbf',
    ]) {
      expect(glyphTargetOf(name)).toBeNull();
    }
  });
});

describe('extractGlyphArchive', () => {
  it('extracts deflated and stored entries under a leading folder into {fontstack}/{range}.pbf', async () => {
    const zip = syncZip({
      'fonts/Noto Sans Regular/0-255.pbf': REGULAR_0,
      'fonts/Noto Sans Regular/256-511.pbf': REGULAR_256,
      'fonts/Noto Sans Bold/0-255.pbf': BOLD_0,
      'fonts/README.md': strToU8('licence'),
    });
    const store = await storeWith(zip);
    await store.append('s/tmp/glyphs-x/leftover.pbf', new Uint8Array([1]));

    const result = await extractGlyphArchive(store, 's/tmp/glyphs.part', 's/tmp/glyphs-x', { yieldToEventLoop: async () => undefined });
    expect(result).toEqual({ files: 3, bytes: REGULAR_0.length + REGULAR_256.length + BOLD_0.length, fontstacks: ['Noto Sans Bold', 'Noto Sans Regular'] });
    expect(store.files.get('s/tmp/glyphs-x/Noto Sans Regular/0-255.pbf')).toEqual(REGULAR_0);
    expect(store.files.get('s/tmp/glyphs-x/Noto Sans Regular/256-511.pbf')).toEqual(REGULAR_256);
    expect(store.files.get('s/tmp/glyphs-x/Noto Sans Bold/0-255.pbf')).toEqual(BOLD_0);
    // The target is cleared first; non-glyph entries are not written.
    expect(store.files.has('s/tmp/glyphs-x/leftover.pbf')).toBe(false);
    expect([...store.files.keys()].some((key) => key.endsWith('README.md'))).toBe(false);

    const stored = await storeWith(syncZip({ 'Noto Sans Regular/0-255.pbf': REGULAR_0 }, 0));
    await extractGlyphArchive(stored, 's/tmp/glyphs.part', 's/out');
    expect(stored.files.get('s/out/Noto Sans Regular/0-255.pbf')).toEqual(REGULAR_0);
  });

  it('reads sizes from the central directory, so streamed zips with data descriptors extract too', async () => {
    const store = await storeWith(streamedZip({ 'glyphs/Noto Sans Regular/0-255.pbf': REGULAR_0, 'glyphs/Noto Sans Italic/0-255.pbf': BOLD_0, 'glyphs/notes.txt': strToU8('x') }));
    const entries = await readZipEntries(store, 's/tmp/glyphs.part');
    expect(entries.map((entry) => entry.name)).toEqual(['glyphs/Noto Sans Regular/0-255.pbf', 'glyphs/Noto Sans Italic/0-255.pbf', 'glyphs/notes.txt']);
    await extractGlyphArchive(store, 's/tmp/glyphs.part', 's/out');
    expect(store.files.get('s/out/Noto Sans Regular/0-255.pbf')).toEqual(REGULAR_0);
    expect(store.files.get('s/out/Noto Sans Italic/0-255.pbf')).toEqual(BOLD_0);
  });

  it('refuses files that are not zips, zips without glyphs and archives over the limits', async () => {
    const notZip = await storeWith(bytesOf(200, 9));
    await expect(extractGlyphArchive(notZip, 's/tmp/glyphs.part', 's/out')).rejects.toMatchObject({ name: 'GlyphArchiveError', reason: 'not-a-zip' });

    const empty = await storeWith(syncZip({ 'fonts/readme.txt': strToU8('nothing here') }));
    await expect(extractGlyphArchive(empty, 's/tmp/glyphs.part', 's/out')).rejects.toBeInstanceOf(GlyphArchiveError);

    const big = await storeWith(syncZip({ 'A/0-255.pbf': REGULAR_0, 'B/0-255.pbf': BOLD_0 }));
    await expect(extractGlyphArchive(big, 's/tmp/glyphs.part', 's/out', { maxFiles: 1 })).rejects.toMatchObject({ reason: 'too-large' });
    await expect(extractGlyphArchive(big, 's/tmp/glyphs.part', 's/out', { maxBytes: 100 })).rejects.toMatchObject({ reason: 'too-large' });
  });

  it('stops when aborted', async () => {
    const store = await storeWith(syncZip({ 'A/0-255.pbf': REGULAR_0 }));
    const abort = new AbortController();
    abort.abort();
    await expect(extractGlyphArchive(store, 's/tmp/glyphs.part', 's/out', { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
