import { safeFileName, setFileOpener } from '@resgrid/core/device/file-opener';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Native file opener (protocol and training attachments): the bytes go to a cache file that the share/open sheet hands to
// a viewer app (iOS Quick Look, an Android PDF reader). The cache directory is the OS's to clear.
setFileOpener(async ({ data, fileName, contentType }) => {
  const file = new File(Paths.cache, safeFileName(fileName));
  file.create({ overwrite: true });
  await file.write(new Uint8Array(data));
  await Sharing.shareAsync(file.uri, { mimeType: contentType ?? 'application/octet-stream', dialogTitle: safeFileName(fileName) });
});
