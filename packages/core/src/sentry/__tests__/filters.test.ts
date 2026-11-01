import type { Breadcrumb, ErrorEvent, TransactionEvent } from '@sentry/react-native';

import { isNoiseEvent, sentryBeforeBreadcrumb, sentryBeforeSend, sentryBeforeSendTransaction } from '../filters';

const errorEvent = (partial: Partial<ErrorEvent>): ErrorEvent => ({ type: undefined, ...partial }) as ErrorEvent;

describe('sentryBeforeBreadcrumb (Responder)', () => {
  it('drops console breadcrumbs', () => {
    expect(sentryBeforeBreadcrumb({ category: 'console', message: 'API payload {...}' })).toBeNull();
  });

  it('strips query strings from request and navigation URLs', () => {
    const crumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.resgrid.com/api/v4/Calls/GetCall?callId=1&access_token=abc', method: 'GET', status_code: 200 } };
    expect(sentryBeforeBreadcrumb(crumb)?.data).toEqual({ url: 'https://api.resgrid.com/api/v4/Calls/GetCall', method: 'GET', status_code: 200 });
    expect(sentryBeforeBreadcrumb({ category: 'navigation', data: { from: '/a?x=1', to: '/b#y' } })?.data).toEqual({ from: '/a', to: '/b' });
  });

  it('removes control characters and inline credentials from messages', () => {
    expect(sentryBeforeBreadcrumb({ category: 'log', message: '\u001b[33mBearer abc.def\u001b[0m' })?.message).toBe('Bearer [REDACTED]');
  });

  it('passes other breadcrumbs through', () => {
    const crumb: Breadcrumb = { category: 'ui.click', message: 'button' };
    expect(sentryBeforeBreadcrumb(crumb)).toEqual(crumb);
  });
});

describe('sentryBeforeSend (Unit/IC noise filters + Dispatch web tag)', () => {
  const mapError = errorEvent({
    exception: {
      values: [{ type: 'TypeError', value: "Cannot read properties of null (reading '3')", stacktrace: { frames: [{ function: 'GeolocateControl._onSuccess' }, { function: 'Map._cameraForBoundsOnGlobe' }] } }],
    },
  });

  it('drops the map GeolocateControl projection-matrix error', () => {
    expect(isNoiseEvent(mapError)).toBe(true);
    expect(sentryBeforeSend(mapError, 'web')).toBeNull();
  });

  it('keeps the same TypeError from app code', () => {
    const appError = errorEvent({ exception: { values: [{ type: 'TypeError', value: "Cannot read properties of null (reading '3')", stacktrace: { frames: [{ function: 'renderCallList' }] } }] } });
    expect(sentryBeforeSend(appError, 'ios')).not.toBeNull();
  });

  it('drops benign ResizeObserver loop errors', () => {
    expect(sentryBeforeSend(errorEvent({ exception: { values: [{ type: 'Error', value: 'ResizeObserver loop completed with undelivered notifications.' }] } }), 'web')).toBeNull();
  });

  it('removes request bodies, cookies and query strings', () => {
    const event = errorEvent({ request: { url: 'https://app/x?token=1', data: 'password=hunter2', cookies: { a: 'b' }, query_string: 'token=1', method: 'POST' } });
    const sent = sentryBeforeSend(event, 'ios');
    expect(sent?.request).toEqual({ url: 'https://app/x', method: 'POST', query_string: undefined });
    expect(JSON.stringify(sent)).not.toContain('hunter2');
  });

  it('tags the user agent on web only', () => {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'TestAgent/1.0' }, configurable: true, writable: true });
    expect(sentryBeforeSend(errorEvent({ tags: { a: '1' } }), 'web')?.tags).toEqual({ a: '1', user_agent: 'TestAgent/1.0' });
    expect(sentryBeforeSend(errorEvent({ tags: { a: '1' } }), 'android')?.tags).toEqual({ a: '1' });
  });
});

describe('sentryBeforeSendTransaction (U/I/D)', () => {
  const tx = (trace: Record<string, unknown>): TransactionEvent => ({ type: 'transaction', contexts: { trace } }) as unknown as TransactionEvent;

  it('drops navigation transactions without a route', () => {
    expect(sentryBeforeSendTransaction(tx({ op: 'navigation', data: {} }))).toBeNull();
  });

  it('keeps navigation transactions with a route and other transactions', () => {
    expect(sentryBeforeSendTransaction(tx({ op: 'navigation', data: { route: '/calls' } }))).not.toBeNull();
    expect(sentryBeforeSendTransaction(tx({ op: 'http.client' }))).not.toBeNull();
  });
});
