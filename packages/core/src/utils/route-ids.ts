/**
 * Ids parsed out of push event codes and deep links are attacker-influenced and land straight in a route path, so
 * anything that could steer the router elsewhere — a path separator, a query, a fragment, a dot segment or a
 * control character — disqualifies the id. Shared by the deep-link handlers and the notification UI so a tap and a
 * cold-start deep link accept exactly the same ids (the five legacy push stores, plus the dot-segment and control
 * character checks).
 */
export const isSafeRouteId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id !== '.' && id !== '..' && !/[/\\?#\u0000-\u001f\u007f]/.test(id);
