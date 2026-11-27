/**
 * Opens a file whose bytes came from an authenticated endpoint (a protocol attachment or document, a training attachment):
 * the app layer registers the platform implementation (native: a cache file handed to the share/open sheet; web and
 * Electron: a browser download), so feature screens stay free of file-system and sharing modules. The bytes never go to
 * a URL: an authenticated download cannot be opened by link.
 */
export interface OpenableFile {
  data: ArrayBuffer;
  /** Shown to the member and used for the cache file; reduced to a safe name by the opener. */
  fileName: string;
  /** MIME type from the response, or null. */
  contentType: string | null;
}

export type FileOpener = (file: OpenableFile) => Promise<void>;

export class FileOpenerUnavailableError extends Error {
  constructor() {
    super('No file opener is registered');
    this.name = 'FileOpenerUnavailableError';
  }
}

let opener: FileOpener | null = null;

/** Registers (or clears, with null) the platform file opener. */
export function setFileOpener(next: FileOpener | null): void {
  opener = next;
}

/** Opens the file with the registered opener; throws FileOpenerUnavailableError when there is none. */
export async function openFile(file: OpenableFile): Promise<void> {
  if (!opener) throw new FileOpenerUnavailableError();
  await opener(file);
}

/** A file name without path parts or characters a file system refuses, never empty. */
export function safeFileName(name: string | null | undefined, fallback = 'file'): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';

  const cleaned = base
    .replace(/[^\w.\- ()]+/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);

  return cleaned || fallback;
}
