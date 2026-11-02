import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { normalizePackPath, type OfflinePackFileStore } from './file-store';

/** Folder under the app's document directory (kept by the OS, unlike caches). Frozen once released. */
export const OFFLINE_PACKS_DIRECTORY = 'resgrid-offline-maps';

/**
 * iOS/Android pack storage on expo-file-system (SDK 58 `File`/`Directory` API) under
 * `<documents>/resgrid-offline-maps`. Backups: on Android the documents directory is the `file` domain, which no build
 * backs up (`allowBackup="false"`, and expo-secure-store's data extraction rules include only shared preferences for
 * device transfer — guarded by `packages/config-plugins/__tests__/backup-rules.test.js`). On iOS the folder is still
 * in iCloud backups: expo-file-system (SDK 58) cannot set `NSURLIsExcludedFromBackupKey`, so that needs a native module.
 */
export function createExpoPackFileStore(options: { directoryName?: string } = {}): OfflinePackFileStore | null {
  const root = new Directory(Paths.document, options.directoryName ?? OFFLINE_PACKS_DIRECTORY);
  const fileAt = (relativePath: string): File => new File(root, normalizePackPath(relativePath));
  const directoryAt = (relativePath: string): Directory => {
    const path = normalizePackPath(relativePath);
    return path ? new Directory(root, path) : root;
  };
  const ensureParent = (file: File): void => {
    const parent = file.parentDirectory;
    if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
  };
  const sizeOfDirectory = (directory: Directory): number => {
    if (!directory.exists) return 0;
    let total = 0;
    for (const entry of directory.list()) {
      total += entry instanceof Directory ? sizeOfDirectory(entry) : (entry.size ?? 0);
    }
    return total;
  };

  return {
    uriFor: (relativePath) => fileAt(relativePath).uri,
    size: async (relativePath) => {
      const file = fileAt(relativePath);
      return file.exists ? file.size : null;
    },
    append: async (relativePath, bytes) => {
      const file = fileAt(relativePath);
      if (!file.exists) {
        ensureParent(file);
        file.create({ intermediates: true });
      }
      // Async since SDK 58 (writeSync is the blocking form): resolve only once the chunk is on disk.
      await file.write(bytes, { append: true });
    },
    read: async (relativePath, offset, length) => {
      const handle = fileAt(relativePath).open(FileMode.ReadOnly);
      try {
        handle.offset = offset;
        // readBytes is async: await it so the handle closes after the read, not before.
        return await handle.readBytes(length);
      } finally {
        handle.close();
      }
    },
    readText: (relativePath) => fileAt(relativePath).text(),
    move: async (fromRelativePath, toRelativePath) => {
      const sourceDirectory = directoryAt(fromRelativePath);
      if (sourceDirectory.exists) {
        // A directory tree (the extracted glyphs): the destination must not exist, or the source lands inside it.
        const destination = directoryAt(toRelativePath);
        if (destination.exists) destination.delete();
        const parent = destination.parentDirectory;
        if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
        await sourceDirectory.move(destination);
        return;
      }
      const destination = fileAt(toRelativePath);
      ensureParent(destination);
      if (destination.exists) destination.delete();
      await fileAt(fromRelativePath).move(destination);
    },
    remove: async (relativePath) => {
      const path = normalizePackPath(relativePath);
      const directory = directoryAt(path);
      if (directory.exists) {
        directory.delete();
        return;
      }
      const file = fileAt(path);
      if (file.exists) file.delete();
    },
    list: async (relativeDirectory) => {
      const directory = directoryAt(relativeDirectory);
      if (!directory.exists) return [];
      return directory.list().map((entry) => ({ name: entry.name, isDirectory: entry instanceof Directory }));
    },
    directorySize: async (relativeDirectory) => sizeOfDirectory(directoryAt(relativeDirectory)),
    diskSpace: async () => {
      const freeBytes = Paths.availableDiskSpace;
      const totalBytes = Paths.totalDiskSpace;
      return Number.isFinite(freeBytes) && Number.isFinite(totalBytes) && totalBytes > 0 ? { freeBytes, totalBytes } : null;
    },
  };
}
