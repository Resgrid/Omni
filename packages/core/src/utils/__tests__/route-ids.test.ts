import { isSafeRouteId } from '../route-ids';

describe('isSafeRouteId', () => {
  it('accepts plain ids', () => {
    for (const id of ['1234', 'a1b2c3d4-e5f6-7890-abcd-ef0123456789', 'chan_42', 'Group Chat 1']) expect(isSafeRouteId(id)).toBe(true);
  });

  it('rejects anything that could steer the router (the legacy push-store rule)', () => {
    for (const id of ['', '../settings', 'a/b', 'a\\b', 'x?tab=1', 'x#frag']) expect(isSafeRouteId(id)).toBe(false);
  });

  it('also rejects dot segments, control characters and non-strings', () => {
    for (const id of ['.', '..', 'a\nb', 'a\u0000', 42, null, undefined]) expect(isSafeRouteId(id)).toBe(false);
  });
});
