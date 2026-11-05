import { type CallRights, type CallsCapability, isCallReporter, resolveCallPermissions } from '../lib/call-permissions';

const ALL_CALLS: CallsCapability = { create: 'full', dispatch: true, close: true, queues: true, runCards: true };
const MEMBER: CallRights = { isAdmin: false, canCreateCalls: true, canCloseCalls: true, canDeleteCalls: true };
const NOW = Date.parse('2026-11-04T12:00:00Z');

const call = (overrides: { State?: number; ReportingUserId?: string | null; DispatchedOnUtc?: string } = {}) => ({ State: 0, DispatchedOnUtc: '', ScheduledOnUtc: '', ReportingUserId: 'member-7', ...overrides });

const resolve = (overrides: { calls?: Partial<CallsCapability>; rights?: Partial<CallRights>; userId?: string | null; call?: ReturnType<typeof call> | null } = {}) =>
  resolveCallPermissions({
    calls: { ...ALL_CALLS, ...overrides.calls },
    rights: { ...MEMBER, ...overrides.rights },
    userId: overrides.userId === undefined ? 'member-7' : overrides.userId,
    call: overrides.call === undefined ? call() : overrides.call,
    now: NOW,
  });

describe('isCallReporter', () => {
  it('matches the reporting user without case, and treats a call nobody logged as nobody’s', () => {
    expect(isCallReporter({ ReportingUserId: 'ABC-1' }, 'abc-1')).toBe(true);
    expect(isCallReporter({ ReportingUserId: 'abc-2' }, 'abc-1')).toBe(false);
    expect(isCallReporter({ ReportingUserId: null }, 'abc-1')).toBe(false);
    expect(isCallReporter({ ReportingUserId: 'abc-1' }, null)).toBe(false);
  });

  it('cannot tell from a server that predates ReportingUserId, so leaves the decision to the server', () => {
    expect(isCallReporter({ ReportingUserId: undefined }, 'abc-1')).toBe(true);
  });
});

describe('resolveCallPermissions', () => {
  it('lets the member who logged an active call do everything', () => {
    expect(resolve()).toEqual({ canCreate: true, canEdit: true, canDispatch: true, canDispatchMore: true, canReschedule: false, canClose: true, canDelete: true });
  });

  it('offers only create without a call', () => {
    expect(resolve({ call: null })).toEqual({ canCreate: true, canEdit: false, canDispatch: false, canDispatchMore: false, canReschedule: false, canClose: false, canDelete: false });
  });

  it('needs the Create Call permission for everything (it grants Call_Update and Call_Delete)', () => {
    expect(Object.values(resolve({ rights: { canCreateCalls: false, canCloseCalls: false, canDeleteCalls: false } })).some(Boolean)).toBe(false);
  });

  it("keeps someone else's call to an admin for edit, add resources, reschedule and dispatch now, but not for close or delete", () => {
    const other = call({ ReportingUserId: 'member-9' });

    expect(resolve({ call: other })).toMatchObject({ canEdit: false, canDispatch: false, canDispatchMore: false, canClose: true, canDelete: true });
    expect(resolve({ call: other, rights: { isAdmin: true } })).toMatchObject({ canEdit: true, canDispatch: true, canDispatchMore: true });
    expect(resolve({ call: call({ ReportingUserId: null }) })).toMatchObject({ canEdit: false, canDispatchMore: false });
  });

  it('follows the Close Call and Delete Call permissions on their own', () => {
    expect(resolve({ rights: { canCloseCalls: false } })).toMatchObject({ canClose: false, canDelete: true, canEdit: true });
    expect(resolve({ rights: { canDeleteCalls: false } })).toMatchObject({ canClose: true, canDelete: false, canEdit: true });
  });

  it('follows the call state: pending calls dispatch but take no more resources, scheduled ones reschedule, closed ones only delete', () => {
    expect(resolve({ call: call({ State: 8 }) })).toMatchObject({ canEdit: true, canDispatch: true, canDispatchMore: false, canReschedule: false, canClose: true });
    expect(resolve({ call: call({ DispatchedOnUtc: '2026-11-04T15:00:00Z' }) })).toMatchObject({ canReschedule: true, canDispatch: true });
    expect(resolve({ call: call({ State: 1 }) })).toEqual({ canCreate: true, canEdit: false, canDispatch: false, canDispatchMore: false, canReschedule: false, canClose: false, canDelete: true });
  });

  it("follows the app's calls capability", () => {
    expect(Object.values(resolve({ calls: { create: 'none', dispatch: false, close: false } })).some(Boolean)).toBe(false);
    expect(resolve({ calls: { dispatch: false } })).toMatchObject({ canEdit: true, canDispatch: false, canDispatchMore: false, canReschedule: false });
    expect(resolve({ calls: { close: false } })).toMatchObject({ canClose: false, canDelete: true });
  });
});
