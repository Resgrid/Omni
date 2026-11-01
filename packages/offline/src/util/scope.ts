/**
 * Who a record or queued write belongs to (plan §8.2: server + department + user, + unit for Unit).
 * Writes are only ever replayed by the session that queued them (Responder rule, generalized).
 */
export interface OfflineScope {
  server: string;
  departmentId: number;
  userId: string;
  unitId?: number;
}

/** Comparable server identity: trimmed, lower-cased, without trailing slashes or the `/api/v4` suffix. */
export function normalizeServer(server: string): string {
  return server
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/\/api\/v\d+$/, '')
    .replace(/\/+$/, '');
}

/**
 * True when both scopes are the same session: same server, department and user. The unit is not
 * compared — a Unit crew switching apparatus still owns what it queued (the payload names the unit).
 */
export function isSameSession(a: OfflineScope, b: OfflineScope): boolean {
  return normalizeServer(a.server) === normalizeServer(b.server) && a.departmentId === b.departmentId && a.userId === b.userId;
}

/** Stable string form for keys and logs. The user id is included as-is; callers must not send it to analytics. */
export function scopeKey(scope: OfflineScope): string {
  return `${normalizeServer(scope.server)}|${scope.departmentId}|${scope.userId}`;
}
