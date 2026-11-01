import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { loadManifest } from '../../__tests__/helpers/variants';
import { CANONICAL_ROUTES, isRouteAvailableFor, ROUTE_KEYS } from '../canonical';
import { defineRoutes, matchRoutePattern } from '../define-routes';
import { buildRoutePath, createHrefBuilders, getHrefBuilders, setRouteContract, useHref } from '../href';
import { resolveNotificationRoute } from '../notification-routes';

describe('canonical routes', () => {
  it('uses the canonical paths (no legacy weather-alert or [...messing] paths)', () => {
    const patterns = ROUTE_KEYS.map((key) => CANONICAL_ROUTES[key].pattern);
    expect(patterns).toEqual(
      expect.arrayContaining(['/call/[id]', '/call/[id]/edit', '/call/new', '/weather-alerts/[id]', '/poi/[id]', '/chat/[channelId]', '/records', '/settings/account-security', '/maps', '/[...missing]'])
    );
    expect(patterns.some((pattern) => pattern.includes('weather-alert/') || pattern.includes('weather-alert-detail') || pattern.includes('messing'))).toBe(false);
  });
});

describe('defineRoutes / matchRoutePattern', () => {
  const contract = defineRoutes(['home', 'callDetail', 'callNew', 'callEdit', 'missing']);

  it('resolves concrete paths and patterns, preferring static segments', () => {
    expect(contract.resolve('/')).toBe('home');
    expect(contract.resolve('/call/12')).toBe('callDetail');
    expect(contract.resolve('/call/[id]')).toBe('callDetail');
    expect(contract.resolve('/call/new')).toBe('callNew');
    expect(contract.resolve('/call/12/edit')).toBe('callEdit');
    expect(contract.resolve('/call/12?tab=notes')).toBe('callDetail');
  });

  it('falls through to the catch-all only for unknown paths', () => {
    expect(contract.resolve('/no/such/page')).toBe('missing');
    expect(defineRoutes(['home']).resolve('/calls')).toBeNull();
  });

  it('matches patterns segment by segment', () => {
    expect(matchRoutePattern('/chat/[channelId]', '/chat/g:42')).toBe(true);
    expect(matchRoutePattern('/chat/[channelId]', '/chat')).toBe(false);
    expect(matchRoutePattern('/[...missing]', '/')).toBe(false);
  });

  it('rejects non-canonical keys', () => {
    expect(() => defineRoutes(['home', 'weather-alert' as never])).toThrow(/not a canonical route/);
  });
});

describe('href builders', () => {
  const href = createHrefBuilders(defineRoutes(['home', 'callDetail', 'chatChannel', 'approveSignIn']));

  it('builds declared routes with encoded positional params', () => {
    expect(href.home()).toBe('/');
    expect(href.callDetail(1234)).toBe('/call/1234');
    expect(href.chatChannel('g:a/b')).toBe('/chat/g%3Aa%2Fb');
  });

  it('returns null for routes the variant lacks (callers hide the link)', () => {
    expect(href.callEdit(1)).toBeNull();
    expect(href.weatherAlertDetail('w1')).toBeNull();
    expect(href.settingsStorage()).toBeNull();
    expect(href.has('callEdit')).toBe(false);
  });

  it('returns null when a parameter is missing', () => {
    expect(href.callDetail('')).toBeNull();
    expect(href.build('callDetail', {})).toBeNull();
  });

  it('builds with named params and a query string', () => {
    expect(href.build('approveSignIn', {}, { requestId: 'r 1', empty: undefined })).toBe('/approve-sign-in?requestId=r%201');
    expect(buildRoutePath('callEdit', { id: 7 })).toBe('/call/7/edit');
  });
});

describe('useHref', () => {
  function Probe() {
    const href = useHref();
    const link = href.callDetail(5);
    return <Text testID="link">{link === null ? 'hidden' : String(link)}</Text>;
  }

  afterEach(() => {
    act(() => setRouteContract(defineRoutes(['home'])));
  });

  it('returns null for missing routes and follows the active contract', () => {
    act(() => setRouteContract(defineRoutes(['home'])));
    render(<Probe />);
    expect(screen.getByTestId('link')).toHaveTextContent('hidden');

    act(() => setRouteContract(defineRoutes(['home', 'callDetail'])));
    expect(screen.getByTestId('link')).toHaveTextContent('/call/5');
  });
});

describe('resolveNotificationRoute (deep links)', () => {
  it('maps push targets to declared routes', () => {
    const href = createHrefBuilders(defineRoutes(['home', 'callDetail', 'chatChannel', 'chatbot', 'weatherAlertDetail', 'messageDetail', 'workOrderDetail', 'approveSignIn']));
    expect(resolveNotificationRoute({ kind: 'call', id: '42' }, href)).toBe('/call/42');
    expect(resolveNotificationRoute({ kind: 'call', id: '42', closed: true }, href)).toBe('/call/42');
    expect(resolveNotificationRoute({ kind: 'chat', id: 'abc', chatType: 'direct' }, href)).toBe('/chat/abc');
    expect(resolveNotificationRoute({ kind: 'chatbot', id: 'bot' }, href)).toBe('/chatbot');
    expect(resolveNotificationRoute({ kind: 'weatherAlert', id: 'w9' }, href)).toBe('/weather-alerts/w9');
    expect(resolveNotificationRoute({ kind: 'message', id: '7' }, href)).toBe('/messages/7');
    expect(resolveNotificationRoute({ kind: 'workOrder', id: '3' }, href)).toBe('/work-orders/3');
    expect(resolveNotificationRoute({ kind: 'signInApproval', id: 'req' }, href)).toBe('/approve-sign-in?id=req');
  });

  it('returns null (push modal fallback) when the variant has no screen for the target', () => {
    setRouteContract(defineRoutes(['home']));
    expect(resolveNotificationRoute({ kind: 'call', id: '42' })).toBeNull();
    expect(resolveNotificationRoute({ kind: 'notification', id: '1' }, getHrefBuilders())).toBeNull();
    expect(resolveNotificationRoute({ kind: 'communicationTest', id: 't' }, getHrefBuilders())).toBeNull();
  });
});

describe('canonical route gates', () => {
  const manifest = (id: Parameters<typeof loadManifest>[0]) => loadManifest(id);

  it('gates module, capability and field-records routes per variant (never by the variant id itself)', () => {
    expect(isRouteAvailableFor('memberHomeCalls', manifest('responder'))).toBe(true);
    expect(isRouteAvailableFor('memberHomeCalls', manifest('unit'))).toBe(false);
    expect(isRouteAvailableFor('commandBoard', manifest('ic'))).toBe(true);
    expect(isRouteAvailableFor('commandBoard', manifest('dispatch'))).toBe(false);
    expect(isRouteAvailableFor('callCommand', manifest('dispatch'))).toBe(true);
    expect(isRouteAvailableFor('callCommand', manifest('ic'))).toBe(false);
    expect(isRouteAvailableFor('records', manifest('dispatch'))).toBe(true);
    expect(isRouteAvailableFor('records', manifest('bigboard'))).toBe(false);
    expect(isRouteAvailableFor('checklists', manifest('unit'))).toBe(true);
    expect(isRouteAvailableFor('checklists', manifest('dispatch'))).toBe(false);
    expect(isRouteAvailableFor('settingsOfflineMaps', manifest('ic'))).toBe(true);
    expect(isRouteAvailableFor('settingsOfflineMaps', manifest('bigboard'))).toBe(false);
    expect(isRouteAvailableFor('callNew', manifest('bigboard'))).toBe(false);
    expect(isRouteAvailableFor('home', manifest('bigboard'))).toBe(true);
  });

  it('resolves static segments before ids in the new trees', () => {
    const contract = defineRoutes(['records', 'recordDetail', 'recordDeployments', 'recordDeployment', 'certifications', 'certificationDetail', 'certificationEdit', 'callDetail', 'callCommand', 'callEdit']);
    expect(contract.resolve('/records/deployments')).toBe('recordDeployments');
    expect(contract.resolve('/records/deployments/9')).toBe('recordDeployment');
    expect(contract.resolve('/records/9')).toBe('recordDetail');
    expect(contract.resolve('/certifications/edit')).toBe('certificationEdit');
    expect(contract.resolve('/call/5/command')).toBe('callCommand');
  });
});
