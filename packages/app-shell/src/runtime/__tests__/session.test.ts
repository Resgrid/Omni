import { securityStore, useAuthStore } from '@resgrid/auth';
import { DepartmentRightsResultData } from '@resgrid/models';

import { resetShellRuntimeForTests } from '../runtime-holder';
import { getSessionScope, getSessionUserId, isSessionSignedIn, setActiveUnitProvider } from '../session';

const rights = (DepartmentId: number): DepartmentRightsResultData => Object.assign(new DepartmentRightsResultData(), { DepartmentId, DepartmentCode: 'ABCD' });

describe('session getters (offline scope)', () => {
  beforeEach(() => {
    resetShellRuntimeForTests();
    setActiveUnitProvider(() => '12');
    securityStore.setState({ rights: rights(7) });
  });

  afterEach(() => {
    setActiveUnitProvider(null);
    securityStore.setState({ rights: null });
    useAuthStore.setState({ status: 'signedOut', accessToken: null, refreshToken: null, userId: null });
  });

  it('scopes a signed-in session by server, department, user and unit', () => {
    useAuthStore.setState({ status: 'signedIn', accessToken: 'access', refreshToken: 'refresh', userId: 'user-1' });
    expect(isSessionSignedIn()).toBe(true);
    expect(getSessionScope()).toEqual({ server: expect.any(String), departmentId: 7, userId: 'user-1', unitId: 12 });
  });

  // A restore that could not reach the token endpoint opens the app on its refresh token; without a scope the outbox
  // refused every write made offline and the stores could not read their offline records.
  it('keeps the scope for a session restored offline on its refresh token alone', () => {
    useAuthStore.setState({ status: 'signedIn', accessToken: null, refreshToken: 'refresh', userId: 'user-1' });
    expect(isSessionSignedIn()).toBe(true);
    expect(getSessionUserId()).toBe('user-1');
    expect(getSessionScope()).toEqual({ server: expect.any(String), departmentId: 7, userId: 'user-1', unitId: 12 });
  });

  it('has no scope while signed out, while a restore still waits, or without a department', () => {
    useAuthStore.setState({ status: 'signedOut', accessToken: null, refreshToken: null, userId: 'user-1' });
    expect(getSessionScope()).toBeNull();

    useAuthStore.setState({ status: 'loading', accessToken: null, refreshToken: 'refresh', userId: 'user-1' });
    expect(isSessionSignedIn()).toBe(false);
    expect(getSessionScope()).toBeNull();

    useAuthStore.setState({ status: 'signedIn', accessToken: 'access', refreshToken: 'refresh', userId: 'user-1' });
    securityStore.setState({ rights: null });
    expect(getSessionScope()).toBeNull();
  });
});
