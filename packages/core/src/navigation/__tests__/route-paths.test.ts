import { logger } from '../../logging/logger';
import { encodeRouteId, isNumericRouteId, pushRoutePath, replaceRoutePath, routePathWithId, routePathWithQuery } from '../route-paths';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('react-native-logs', () => ({ consoleTransport: jest.fn(), logger: { createLogger: () => ({}) } }));

/**
 * Route builders run inside press handlers, where a throw hard-crashes a release build. These pin the replacement: a
 * refused id is encoded as null, reported once as an error naming the route (never the value), and navigating to a null
 * path does nothing.
 */
describe('route paths', () => {
  let reportError: jest.SpyInstance;

  beforeEach(() => {
    reportError = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    reportError.mockRestore();
  });

  it('encodes safe ids, and positive integers that arrive as numbers', () => {
    expect(encodeRouteId('test.route', 'Group Chat 1')).toBe('Group%20Chat%201');
    expect(encodeRouteId('test.route', 'a1b2c3d4-e5f6-7890-abcd-ef0123456789')).toBe('a1b2c3d4-e5f6-7890-abcd-ef0123456789');
    expect(encodeRouteId('test.route', 42)).toBe('42');
    expect(reportError).not.toHaveBeenCalled();
  });

  it('refuses unsafe and missing ids with null, reporting the route but never the value', () => {
    for (const id of ['../settings', 'a/b', 'x?tab=1', 'x#frag', '..', '', undefined, null, -1, 0, 1.5, Number.NaN]) {
      expect(encodeRouteId('protocols.detail', id)).toBeNull();
    }

    expect(reportError).toHaveBeenCalledTimes(12);
    expect(reportError).toHaveBeenCalledWith({ message: 'Route id refused for protocols.detail; navigation skipped', context: { route: 'protocols.detail', id: 'missing' } });
    expect(reportError).toHaveBeenCalledWith({ message: 'Route id refused for protocols.detail; navigation skipped', context: { route: 'protocols.detail', id: 'malformed' } });
    expect(JSON.stringify(reportError.mock.calls)).not.toContain('settings');
  });

  it('applies a route-specific check', () => {
    expect(encodeRouteId('pois.detail', 'abc', isNumericRouteId)).toBeNull();
    expect(encodeRouteId('pois.detail', 7, isNumericRouteId)).toBe('7');
    expect(encodeRouteId('pois.detail', '7', isNumericRouteId)).toBe('7');
  });

  it('accepts only positive integers as numeric ids', () => {
    for (const id of [1, 12, '12', 9007199254740991]) expect(isNumericRouteId(id)).toBe(true);

    for (const id of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '0', '012', '-1', '1.5', ' 12', '', 'abc', null, undefined]) expect(isNumericRouteId(id)).toBe(false);
  });

  it('builds a path around an accepted id, or null for a refused one', () => {
    expect(routePathWithId('protocols.detail', 'p 1', (id) => `/protocols/${id}`)).toBe('/protocols/p%201');
    expect(routePathWithId('protocols.detail', undefined, (id) => `/protocols/${id}`)).toBeNull();
  });

  it('adds present query ids, leaves absent ones out and refuses the whole path for an unsafe one', () => {
    expect(routePathWithQuery('routes.active', '/routes/active', { planId: 'p1', instanceId: 'i 2' })).toBe('/routes/active?planId=p1&instanceId=i%202');
    expect(routePathWithQuery('routes.active', '/routes/active', { planId: undefined, instanceId: null })).toBe('/routes/active');
    expect(routePathWithQuery('routes.active', '/routes/active', { planId: '', instanceId: 'i2' })).toBe('/routes/active?instanceId=i2');
    expect(routePathWithQuery('routes.active', '/routes/active', { planId: 'p1', instanceId: '../x' })).toBeNull();
    expect(routePathWithQuery('routes.active', null, { planId: 'p1' })).toBeNull();
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('navigates to a path and skips a null one', () => {
    const navigator = { push: jest.fn(), replace: jest.fn() };

    pushRoutePath(navigator, '/protocols/p1');
    replaceRoutePath(navigator, '/records/r1');
    pushRoutePath(navigator, null);
    replaceRoutePath(navigator, null);

    expect(navigator.push.mock.calls).toEqual([['/protocols/p1']]);
    expect(navigator.replace.mock.calls).toEqual([['/records/r1']]);
  });
});
