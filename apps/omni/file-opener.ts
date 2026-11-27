import { safeFileName, setFileOpener } from '@resgrid/core/device/file-opener';

// Web and Electron file opener (protocol and training attachments): a browser download of the bytes, released right after.
setFileOpener(async ({ data, fileName, contentType }) => {
  const url = URL.createObjectURL(new Blob([data], { type: contentType ?? 'application/octet-stream' }));

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFileName(fileName);
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
});
