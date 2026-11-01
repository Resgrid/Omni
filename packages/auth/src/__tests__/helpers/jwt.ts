const base64Url = (value: string): string => Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** An unsigned JWT with the given payload (the app never verifies signatures; the server does). */
export const makeJwt = (payload: Record<string, unknown>): string => `${base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${base64Url(JSON.stringify(payload))}.sig`;

export const idToken = (sub = 'user-1', extra: Record<string, unknown> = {}): string => makeJwt({ sub, name: 'Test Member', iat: 1, nbf: 1, exp: 4102444800, ...extra });

export const accessToken = (expSeconds: number, sub = 'user-1'): string => makeJwt({ sub, exp: expSeconds });

export const tokenResponse = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  access_token: accessToken(Math.floor(Date.now() / 1000) + 86400),
  refresh_token: 'refresh-1',
  id_token: idToken(),
  expires_in: 86400,
  token_type: 'Bearer',
  ...overrides,
});
