import { useEffect, useState } from 'react';

import { opfsPathOf } from '../offline/opfs-file-store';
import { readLocalPackFile } from '../pmtiles/register-pmtiles';

/**
 * Web and Electron: a downloaded pack file in OPFS (`opfs://…`) as a `blob:` URL, so an `<img>` (image size) and
 * maplibre-gl can load it; other URLs pass through. The blob URL is revoked when the file changes or the screen goes.
 */
export const useLocalFileUrl = (uri: string | null): string | null => {
  const local = uri !== null && opfsPathOf(uri) !== null;
  const [resolved, setResolved] = useState<{ uri: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!uri || !local) return undefined;
    let active = true;
    let objectUrl: string | null = null;
    void readLocalPackFile(uri)
      .catch(() => null)
      .then((bytes) => {
        if (!active) return;
        objectUrl = bytes ? URL.createObjectURL(new Blob([bytes as BlobPart])) : null;
        setResolved({ uri, url: objectUrl });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [local, uri]);
  if (!uri || !local) return uri;
  return resolved && resolved.uri === uri ? resolved.url : null;
};
