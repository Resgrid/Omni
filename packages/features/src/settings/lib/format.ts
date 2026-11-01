/** Bytes as a short size ("0 B", "512 B", "1.4 KB", "23 MB", "1.2 GB"); null when unknown (the screen shows "—"). */
export const formatBytes = (bytes: number | null | undefined): string | null => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
};

export interface AgeParts {
  /** Translation key under `storage_sync.age.*`. */
  key: 'just_now' | 'minutes' | 'hours' | 'days';
  count: number;
}

/** How long ago, as a translation key and count (an outbox item's age, the last sync). */
export const ageParts = (ageMs: number): AgeParts => {
  const minutes = Math.floor(Math.max(0, ageMs) / 60_000);
  if (minutes < 1) {
    return { key: 'just_now', count: 0 };
  }
  if (minutes < 60) {
    return { key: 'minutes', count: minutes };
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return { key: 'hours', count: hours };
  }
  return { key: 'days', count: Math.floor(hours / 24) };
};
