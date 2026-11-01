// Novu inbox configuration per variant: subscriber id + HMAC hash (Responder/Dispatch/BigBoard user, Unit unit, IC
// IC user), placeholder credentials until everything arrives, the web enablement flag, the always-mounted provider and
// inbox item → target (Unit's inbox-reference tests, generalized).
import { ApiError } from '@resgrid/api';
import { createElement, type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { buildNovuSubscriberId, inboxItemTarget, isNovuInboxEnabled, NOVU_PLACEHOLDER_CONFIG, type NovuInboxConfig, resolveNovuInboxConfig, selectNovuSubscriberHash } from '../novu';
import { NotificationsInboxProvider, openInboxItem, SUBSCRIBER_HASH_ATTEMPTS_BEFORE_SETTLING, useNovuInboxConfig, type UseNovuInboxConfigInput, useUnitSubscriberHash } from '../novu-provider';
import { configureForTest, defaultSession, flushAll, selectVariant, type TestContext } from './helpers';

const mockProviderProps: Record<string, unknown>[] = [];

jest.mock('@novu/react-native', () => ({
  NovuProvider: (props: Record<string, unknown> & { children?: ReactNode }) => {
    const { children, ...rest } = props;
    mockProviderProps.push(rest);
    return children ?? null;
  },
}));

const config = { NovuApplicationId: 'app-id', NovuBackendApiUrl: 'https://novu-api.test', NovuSocketUrl: 'wss://novu-ws.test' };

let ctx: TestContext;

beforeEach(() => {
  mockProviderProps.length = 0;
  selectVariant('responder');
  ctx = configureForTest();
});

describe('subscriber ids and hashes per variant', () => {
  it.each([
    ['responder', 'DEPT_User_user-1', 'hash-user'],
    ['dispatch', 'DEPT_User_user-1', 'hash-user'],
    ['bigboard', 'DEPT_User_user-1', 'hash-user'],
    ['ic', 'DEPT_IC_User_user-1', 'hash-ic'],
    ['unit', 'DEPT_Unit_12', 'hash-unit'],
  ] as const)('%s opens %s with its hash', (variant, subscriberId, subscriberHash) => {
    const subject = variant === 'unit' ? 'unit' : variant === 'ic' ? 'icUser' : 'user';
    const resolved = resolveNovuInboxConfig({ subject, session: defaultSession(), unitId: '12', unitSubscriberHash: 'hash-unit', unitHashSettled: true, config });
    expect(resolved).toEqual({ ready: true, subscriberId, subscriberHash, applicationIdentifier: 'app-id', apiUrl: 'https://novu-api.test', socketUrl: 'wss://novu-ws.test' });
  });

  it('builds nothing without the parts, or for a variant without a subject', () => {
    expect(buildNovuSubscriberId('user', { departmentCode: '', userId: 'u' })).toBeNull();
    expect(buildNovuSubscriberId('user', { departmentCode: 'D', userId: null })).toBeNull();
    expect(buildNovuSubscriberId('unit', { departmentCode: 'D', userId: 'u', unitId: '' })).toBeNull();
    expect(buildNovuSubscriberId('none', { departmentCode: 'D', userId: 'u' })).toBeNull();
  });

  it('picks the hash that matches the subscriber', () => {
    const rights = { NovuSubscriberHash: 'u', NovuICSubscriberHash: 'ic' };
    expect(selectNovuSubscriberHash('user', { rights })).toBe('u');
    expect(selectNovuSubscriberHash('icUser', { rights })).toBe('ic');
    expect(selectNovuSubscriberHash('unit', { rights, unitSubscriberHash: 'unit' })).toBe('unit');
    expect(selectNovuSubscriberHash('user', { rights: { NovuSubscriberHash: '' } })).toBeUndefined();
    expect(selectNovuSubscriberHash('none', { rights })).toBeUndefined();
  });

  it('opens without a hash on an older server that sends none', () => {
    const resolved = resolveNovuInboxConfig({ subject: 'user', session: { ...defaultSession(), rights: null }, config });
    expect(resolved.ready).toBe(true);
    expect(resolved.subscriberHash).toBeUndefined();
  });
});

describe('placeholders', () => {
  it.each([
    ['no config', { config: null }],
    ['no socket url', { config: { ...config, NovuSocketUrl: '' } }],
    ['signed out', { session: null }],
    ['unit hash not settled', { subject: 'unit' as const, unitId: '12', unitHashSettled: false }],
    ['no unit', { subject: 'unit' as const, unitId: null, unitHashSettled: true }],
  ])('uses placeholder credentials with %s', (_label, overrides) => {
    expect(resolveNovuInboxConfig({ subject: 'user', session: defaultSession(), config, ...overrides })).toEqual(NOVU_PLACEHOLDER_CONFIG);
  });

  it('honours the web enablement flag', () => {
    expect(isNovuInboxEnabled({ isWeb: false, enableOnWeb: false })).toBe(true);
    expect(isNovuInboxEnabled({ isWeb: true })).toBe(true);
    expect(isNovuInboxEnabled({ isWeb: true, enableOnWeb: false })).toBe(false);
    expect(resolveNovuInboxConfig({ subject: 'user', session: defaultSession(), config, isWeb: true, enableOnWeb: false }).ready).toBe(false);
  });
});

describe('inbox items', () => {
  it.each([
    [{ eventCode: 'C1234' }, { kind: 'call', id: '1234' }],
    [{ eventCode: 'C:1234' }, { kind: 'call', id: '1234' }],
    [{ eventCode: 't:abc' }, { kind: 'chat', id: 'abc', chatType: 'direct' }],
    [{ eventCode: 'g:abc' }, { kind: 'chat', id: 'abc', chatType: 'group' }],
    [{ eventCode: 'M77' }, { kind: 'message', id: '77' }],
    [{ eventId: 'NWO:5' }, { kind: 'workOrder', id: '5' }],
  ])('points %p at %p', (data, target) => {
    expect(inboxItemTarget({ data })).toEqual(target);
  });

  it.each([{ data: null }, { data: {} }, { data: { eventCode: 'C:1/2' } }, { data: { eventCode: 5 } }, null])('points %p nowhere', (item) => {
    expect(inboxItemTarget(item)).toBeNull();
  });

  it('opens an inbox item through the variant resolver', async () => {
    await expect(openInboxItem({ data: { eventCode: 'C:9' }, subject: 'Call', body: 'Fire' })).resolves.toBe(true);
    expect(ctx.resolveRoute).toHaveBeenCalledWith({ kind: 'call', id: '9' });
    await expect(openInboxItem({ data: {} })).resolves.toBe(false);
  });
});

describe('NotificationsInboxProvider', () => {
  it('stays mounted with placeholders, then receives the real credentials without remounting the children', async () => {
    let mounts = 0;
    const Child = (): null => {
      useEffect(() => {
        mounts += 1;
      }, []);
      return null;
    };
    const children = createElement(Child);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(NotificationsInboxProvider, { config: NOVU_PLACEHOLDER_CONFIG }, children));
    });
    expect(mockProviderProps.at(-1)).toEqual({ subscriber: '', applicationIdentifier: '', apiUrl: '', socketUrl: '' });

    const ready: NovuInboxConfig = { ready: true, subscriberId: 'DEPT_User_u', subscriberHash: 'h', applicationIdentifier: 'app', apiUrl: 'https://api', socketUrl: 'wss://ws' };
    await act(async () => {
      renderer.update(createElement(NotificationsInboxProvider, { config: ready }, children));
    });
    expect(mockProviderProps.at(-1)).toEqual({ subscriber: 'DEPT_User_u', subscriberHash: 'h', applicationIdentifier: 'app', apiUrl: 'https://api', socketUrl: 'wss://ws' });
    expect(mounts).toBe(1);
    act(() => renderer.unmount());
  });

  it('renders the children alone when Novu is off for the platform', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(NotificationsInboxProvider, { config: NOVU_PLACEHOLDER_CONFIG, enabled: false }));
    });
    expect(mockProviderProps).toHaveLength(0);
    act(() => renderer.unmount());
  });
});

describe('hooks', () => {
  let renderer: ReactTestRenderer | null = null;
  let latest: NovuInboxConfig | null = null;
  let latestHash: { settled: boolean; subscriberHash: string | undefined } | null = null;

  function ConfigHarness(props: UseNovuInboxConfigInput): null {
    latest = useNovuInboxConfig(props);
    return null;
  }

  function HashHarness({ unitId }: { unitId: string | null }): null {
    latestHash = useUnitSubscriberHash(unitId);
    return null;
  }

  const render = async (element: ReturnType<typeof createElement>) => {
    await act(async () => {
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
    await act(async () => flushAll());
  };

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
    latest = null;
    latestHash = null;
    jest.useRealTimers();
  });

  it('fetches the unit hash and opens the unit inbox with it (Unit)', async () => {
    selectVariant('unit');
    ctx.api.respond.mockResolvedValueOnce({ Data: { UnitId: '12', SubscriberHash: 'hash-12' }, Status: 'success' });
    await render(createElement(ConfigHarness, { session: defaultSession(), config, unitId: '12' }));
    expect(ctx.api.requests[0]).toMatchObject({ method: 'GET', url: '/Inbox/GetUnitSubscriberHash?unitId=12' });
    expect(latest).toMatchObject({ ready: true, subscriberId: 'DEPT_Unit_12', subscriberHash: 'hash-12' });
  });

  it('keeps the last good credentials while a refresh briefly drops the config, and forgets them at sign-out', async () => {
    await render(createElement(ConfigHarness, { session: defaultSession(), config }));
    expect(latest?.ready).toBe(true);
    await render(createElement(ConfigHarness, { session: defaultSession(), config: null }));
    expect(latest).toMatchObject({ ready: true, subscriberId: 'DEPT_User_user-1' });
    await render(createElement(ConfigHarness, { session: null, config: null }));
    expect(latest).toEqual(NOVU_PLACEHOLDER_CONFIG);
  });

  it('settles without a hash at once when the server definitively refuses (older server)', async () => {
    ctx.api.respond.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 404 }));
    await render(createElement(HashHarness, { unitId: '12' }));
    expect(latestHash).toEqual({ settled: true, subscriberHash: undefined });
    expect(ctx.api.requests).toHaveLength(1);
  });

  it('retries a lookup without an answer and settles after a few attempts', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    ctx.api.respond.mockRejectedValue(new Error('Network Error'));
    await render(createElement(HashHarness, { unitId: '12' }));
    expect(latestHash?.settled).toBe(false);
    for (let i = 0; i < SUBSCRIBER_HASH_ATTEMPTS_BEFORE_SETTLING; i++) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });
    }
    expect(latestHash?.settled).toBe(true);
    expect(ctx.api.requests.length).toBeGreaterThanOrEqual(SUBSCRIBER_HASH_ATTEMPTS_BEFORE_SETTLING);
  });
});
