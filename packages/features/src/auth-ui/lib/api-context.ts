import type { ApiContext } from '@resgrid/api';
import { getDataApiContext, hasDataApiContext } from '@resgrid/data';

/**
 * The authenticated API context the app shell injected (`configureData`). The account-security, approver and shared-session
 * endpoints in @resgrid/auth take it explicitly; it carries the bearer token, client headers and the current server.
 */
export const authUiApi = (): ApiContext => getDataApiContext();

export const hasAuthUiApi = (): boolean => hasDataApiContext();
