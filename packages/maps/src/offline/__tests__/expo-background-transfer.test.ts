/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so they require their stand-ins. */
import { BACKGROUND_TRANSFER_RESUME_KEY, createExpoBackgroundTransfer } from '../expo-background-transfer';
import type { OfflineMapsKv } from '../manager';
import { type DownloadTask, mockDownloads, mockFs } from './fake-expo-file-system';
import { bytesOf, createFakeServer, packUrl } from './helpers';

jest.mock('expo-file-system', () => require('./fake-expo-file-system'));

const ROOT = 'file:///docs/resgrid-offline-maps';
const PART = 'scope/tmp/a.part';
const DESTINATION = `${ROOT}/${PART}`;
const URL_A = packUrl('a');

const createKv = (initial: Record<string, string> = {}): OfflineMapsKv & { values: Map<string, string | boolean> } => {
  const values = new Map<string, string | boolean>(Object.entries(initial));
  return {
    values,
    getString: (key) => {
      const value = values.get(key);
      return typeof value === 'string' ? value : undefined;
    },
    getBoolean: (key) => {
      const value = values.get(key);
      return typeof value === 'boolean' ? value : undefined;
    },
    set: (key, value) => values.set(key, value),
    delete: (key) => {
      values.delete(key);
    },
  };
};

const savedIn = (kv: OfflineMapsKv): Record<string, unknown> | undefined => {
  const raw = kv.getString(BACKGROUND_TRANSFER_RESUME_KEY);
  return raw === undefined ? undefined : (JSON.parse(raw) as Record<string, unknown>);
};

const setup = (kv: OfflineMapsKv = createKv()) => {
  const server = createFakeServer();
  const transfer = createExpoBackgroundTransfer({ kv, fetchImpl: server.fetchImpl });
  return { server, kv, transfer };
};

const lastTask = () => {
  const task = mockDownloads.tasks.at(-1);
  if (!task) throw new Error('no download task');
  return task;
};

/** A transfer paused by `abort` (the manager cancelling): resolves null like DownloadTask after a pause. */
const pausedBy = (abort: AbortController) => async (task: DownloadTask) => {
  const paused = task.untilPaused();
  abort.abort();
  return paused;
};

beforeEach(() => {
  mockFs.files.clear();
  mockFs.dirs.clear();
  mockFs.dirs.add('file:///docs');
  mockDownloads.reset();
});

describe('createExpoBackgroundTransfer', () => {
  it('downloads the part file with a background DownloadTask', async () => {
    const { transfer } = setup();
    // A stale file at the destination must not survive into the transfer.
    mockFs.dirs.add(`${ROOT}/scope/tmp`);
    mockFs.files.set(DESTINATION, bytesOf(5, 2));
    const body = bytesOf(64, 1);
    mockDownloads.run = async (task) => {
      expect(mockFs.files.has(DESTINATION)).toBe(false);
      return task.complete(body);
    };

    await expect(transfer.download({ url: URL_A, path: PART })).resolves.toEqual({ status: 'complete' });

    const task = lastTask();
    expect(mockDownloads.tasks).toHaveLength(1);
    expect(task.url).toBe(URL_A);
    expect(task.destination.uri).toBe(DESTINATION);
    expect(task.options.sessionType).toBe('background');
    expect(task.calls).toEqual(['download', 'release']);
    expect(mockFs.files.get(DESTINATION)).toEqual(body);
  });

  it('creates the part’s folder when it is missing', async () => {
    const { transfer } = setup();
    mockDownloads.run = async (task) => task.complete(bytesOf(1));
    await transfer.download({ url: URL_A, path: 'scope/tmp/nested/b.part' });
    expect(mockFs.dirs.has(`${ROOT}/scope/tmp/nested`)).toBe(true);
    expect(lastTask().destination.uri).toBe(`${ROOT}/scope/tmp/nested/b.part`);
  });

  it('forwards progress, with an unknown total as null', async () => {
    const { transfer } = setup();
    mockDownloads.run = async (task) => {
      task.options.onProgress?.({ bytesWritten: 10, totalBytes: 100 });
      task.options.onProgress?.({ bytesWritten: 20, totalBytes: -1 });
      return task.complete(bytesOf(100));
    };
    const progress: [number, number | null][] = [];
    await transfer.download({ url: URL_A, path: PART, onProgress: (written, total) => progress.push([written, total]) });
    expect(progress).toEqual([
      [10, 100],
      [20, null],
    ]);
  });

  it('pauses on cancel, keeps the OS resume data and resumes from it next time', async () => {
    const other = { url: packUrl('b'), fileUri: `${ROOT}/scope/tmp/b.part`, isDirectory: false, resumeData: 'resume:b' };
    const kv = createKv({ [BACKGROUND_TRANSFER_RESUME_KEY]: JSON.stringify({ 'scope/tmp/b.part': other }) });
    const { transfer } = setup(kv);
    const abort = new AbortController();
    mockDownloads.run = pausedBy(abort);

    await expect(transfer.download({ url: URL_A, path: PART, signal: abort.signal })).resolves.toEqual({ status: 'stopped', code: 'cancelled' });
    const first = lastTask();
    expect(first.calls).toEqual(['download', 'pause', 'release']);
    const saved = { url: URL_A, fileUri: DESTINATION, isDirectory: false, resumeData: `resume:${URL_A}` };
    expect(savedIn(kv)).toEqual({ 'scope/tmp/b.part': other, [PART]: saved });

    const body = bytesOf(32, 3);
    mockDownloads.run = async (task) => task.complete(body);
    await expect(transfer.download({ url: URL_A, path: PART })).resolves.toEqual({ status: 'complete' });
    const second = lastTask();
    expect(second).not.toBe(first);
    expect(mockDownloads.restored).toEqual([saved]);
    expect(second.calls).toEqual(['resume', 'release']);
    // Only the resumed part's entry is used up.
    expect(savedIn(kv)).toEqual({ 'scope/tmp/b.part': other });
    expect(mockFs.files.get(DESTINATION)).toEqual(body);
  });

  it('clears the saved entry once its last transfer resumed', async () => {
    const { kv, transfer } = setup();
    const abort = new AbortController();
    mockDownloads.run = pausedBy(abort);
    await transfer.download({ url: URL_A, path: PART, signal: abort.signal });
    expect(savedIn(kv)).toEqual({ [PART]: expect.objectContaining({ url: URL_A }) });

    mockDownloads.run = async (task) => task.complete(bytesOf(4));
    await transfer.download({ url: URL_A, path: PART });
    expect(kv.getString(BACKGROUND_TRANSFER_RESUME_KEY)).toBeUndefined();
  });

  it('starts over for a different (re-signed) URL and drops the stale resume data', async () => {
    const { kv, transfer } = setup();
    const abort = new AbortController();
    mockDownloads.run = pausedBy(abort);
    await transfer.download({ url: URL_A, path: PART, signal: abort.signal });

    const resigned = packUrl('a', 's2');
    mockDownloads.run = async (task) => task.complete(bytesOf(4));
    await expect(transfer.download({ url: resigned, path: PART })).resolves.toEqual({ status: 'complete' });
    expect(mockDownloads.restored).toEqual([]);
    expect(lastTask().url).toBe(resigned);
    expect(lastTask().calls).toEqual(['download', 'release']);
    expect(kv.getString(BACKGROUND_TRANSFER_RESUME_KEY)).toBeUndefined();
  });

  it('starts over when the resume data cannot be restored or the saved entries are unreadable', async () => {
    const corrupt = createKv({ [BACKGROUND_TRANSFER_RESUME_KEY]: JSON.stringify({ [PART]: { url: URL_A, fileUri: DESTINATION, isDirectory: false, resumeData: 'corrupt' } }) });
    mockDownloads.run = async (task) => task.complete(bytesOf(4));
    await expect(setup(corrupt).transfer.download({ url: URL_A, path: PART })).resolves.toEqual({ status: 'complete' });
    expect(lastTask().calls).toEqual(['download', 'release']);

    for (const raw of ['{not json', '[1,2]', 'null']) {
      const kv = createKv({ [BACKGROUND_TRANSFER_RESUME_KEY]: raw });
      await expect(setup(kv).transfer.download({ url: URL_A, path: PART })).resolves.toEqual({ status: 'complete' });
      expect(lastTask().calls).toEqual(['download', 'release']);
    }
  });

  it('works without a key-value store (nothing is remembered)', async () => {
    const transfer = createExpoBackgroundTransfer({ kv: null, fetchImpl: createFakeServer().fetchImpl });
    const abort = new AbortController();
    mockDownloads.run = pausedBy(abort);
    await expect(transfer.download({ url: URL_A, path: PART, signal: abort.signal })).resolves.toEqual({ status: 'stopped', code: 'cancelled' });
    mockDownloads.run = async (task) => task.complete(bytesOf(4));
    await expect(transfer.download({ url: URL_A, path: PART })).resolves.toEqual({ status: 'complete' });
    expect(lastTask().calls).toEqual(['download', 'release']);
  });

  it('keeps resume data when the OS paused the transfer itself, and nothing when there is none', async () => {
    const { kv, transfer } = setup();
    mockDownloads.run = async (task) => {
      await task.pauseAsync();
      return null;
    };
    await expect(transfer.download({ url: URL_A, path: PART })).resolves.toEqual({ status: 'stopped', code: 'cancelled' });
    expect(savedIn(kv)).toEqual({ [PART]: expect.objectContaining({ url: URL_A }) });

    kv.delete(BACKGROUND_TRANSFER_RESUME_KEY);
    // Resolved null while not paused: savable() throws, so there is nothing to keep.
    mockDownloads.run = async () => null;
    await expect(transfer.download({ url: URL_A, path: PART })).resolves.toEqual({ status: 'stopped', code: 'cancelled' });
    expect(kv.getString(BACKGROUND_TRANSFER_RESUME_KEY)).toBeUndefined();
  });

  it('does not start when already cancelled', async () => {
    const { transfer } = setup();
    const abort = new AbortController();
    abort.abort();
    await expect(transfer.download({ url: URL_A, path: PART, signal: abort.signal })).resolves.toEqual({ status: 'stopped', code: 'cancelled' });
    expect(lastTask().calls).toEqual(['release']);
  });

  // Known source bug: the saved entry is forgotten before the already-aborted check, so a cancel that lands before the
  // transfer starts throws the OS resume data away. Change to `it` once that is fixed.
  it('keeps the saved resume data when already cancelled', async () => {
    const { kv, transfer } = setup();
    const abort = new AbortController();
    mockDownloads.run = pausedBy(abort);
    await transfer.download({ url: URL_A, path: PART, signal: abort.signal });
    expect(savedIn(kv)).toEqual({ [PART]: expect.objectContaining({ url: URL_A }) });

    const again = new AbortController();
    again.abort();
    await transfer.download({ url: URL_A, path: PART, signal: again.signal });
    expect(savedIn(kv)).toEqual({ [PART]: expect.objectContaining({ url: URL_A }) });
  });

  it.each([
    [403, { status: 'failed', code: 'download-url-expired', httpStatus: 403 }],
    [401, { status: 'failed', code: 'download-url-expired', httpStatus: 401 }],
    [410, { status: 'failed', code: 'download-url-expired', httpStatus: 410 }],
    [500, { status: 'failed', code: 'download-http-error', httpStatus: 500 }],
    [404, { status: 'failed', code: 'download-http-error', httpStatus: 404 }],
  ])('probes a failed transfer’s URL: HTTP %i', async (status, expected) => {
    const { server, transfer } = setup();
    server.files.set(URL_A, { status });
    mockDownloads.run = async () => {
      mockFs.files.set(DESTINATION, bytesOf(3));
      throw new Error('The request failed');
    };
    await expect(transfer.download({ url: URL_A, path: PART })).resolves.toEqual(expected);
    expect(server.requestsFor(URL_A).map((request) => request.range)).toEqual(['bytes=0-0']);
    expect(mockFs.files.has(DESTINATION)).toBe(false);
    expect(lastTask().released).toBe(true);
  });

  it('treats a failed transfer as a network error when the probe gets no answer or the URL still works', async () => {
    const { server, transfer } = setup();
    mockDownloads.run = async () => {
      throw new Error('The network connection was lost');
    };
    server.serveFile(URL_A, bytesOf(10), { failFrom: 0 });
    await expect(transfer.download({ url: URL_A, path: PART })).resolves.toEqual({ status: 'stopped', code: 'download-network-error' });
    expect(lastTask().released).toBe(true);

    server.serveFile(URL_A, bytesOf(10));
    await expect(transfer.download({ url: URL_A, path: PART })).resolves.toEqual({ status: 'stopped', code: 'download-network-error' });
    expect(lastTask().released).toBe(true);
  });

  it('reports a cancel that made the transfer fail as cancelled, without probing', async () => {
    const { server, transfer } = setup();
    const abort = new AbortController();
    mockDownloads.run = async () => {
      abort.abort();
      throw new Error('cancelled');
    };
    await expect(transfer.download({ url: URL_A, path: PART, signal: abort.signal })).resolves.toEqual({ status: 'stopped', code: 'cancelled' });
    expect(server.requests).toHaveLength(0);
    expect(lastTask().released).toBe(true);
  });

  it('tolerates a task that was already released', async () => {
    const { transfer } = setup();
    mockDownloads.run = async (task) => {
      task.release = () => {
        throw new Error('Already released');
      };
      return task.complete(bytesOf(2));
    };
    await expect(transfer.download({ url: URL_A, path: PART })).resolves.toEqual({ status: 'complete' });
  });
});
