// Stand-in for @resgrid/core (its root import pulls in Sentry, Countly and native logging). Maps uses only these.
export const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
export const isDev = (): boolean => false;
export const isJest = (): boolean => true;
