import { createConsoleTransport, LogService } from '../logger';
import type { LogContext, LogLevel, LogRecord } from '../types';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const mockCreateLogger = jest.fn();
jest.mock('react-native-logs', () => ({
  consoleTransport: jest.fn(),
  logger: { createLogger: (...args: unknown[]) => mockCreateLogger(...args) },
}));

const makeLogger = (minLevel: LogLevel = 'debug') => {
  const lines: { level: LogLevel; message: string; context: LogContext }[] = [];
  const service = new LogService({ minLevel, transport: (level, message, context) => lines.push({ level, message, context }) });
  return { service, lines };
};

const axiosError = () =>
  Object.assign(new Error('Request failed with status code 400'), {
    name: 'AxiosError',
    isAxiosError: true,
    code: 'ERR_BAD_REQUEST',
    config: { method: 'post', url: '/Connect/token?x=1', data: 'grant_type=password&username=pat&password=hunter2' },
    response: { status: 400 },
  });

describe('LogService console transport', () => {
  it('redacts the context before it reaches the device console (IC)', () => {
    const { service, lines } = makeLogger();
    service.warn({ message: 'Sign-in failed', operation: 'login', context: { error: axiosError(), accessToken: 'abc', username: 'pat', unitId: 'unit-123' } });

    expect(lines).toHaveLength(1);
    const [{ message, context }] = lines;
    expect(message).toBe('Sign-in failed');
    expect(context).toEqual(
      expect.objectContaining({
        accessToken: '[REDACTED]',
        username: '[REDACTED]',
        unitId: 'unit-123',
        operation: 'login',
        error: expect.objectContaining({ name: 'AxiosError', status: 400, url: '/Connect/token' }),
        timestamp: expect.any(String),
      })
    );
    const serialized = JSON.stringify(lines);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('pat');
  });

  it('never writes control characters (SentryCrash rejects them)', () => {
    const { service, lines } = makeLogger();
    service.error({ message: '\u001b[31mBoom\u001b[0m with Bearer abc.def', context: { detail: 'line\u001b[2K' } });
    const serialized = JSON.stringify(lines);
    expect(serialized).not.toMatch(/\u001b/);
    expect(lines[0].message).toBe('Boom with Bearer [REDACTED]');
  });

  it('filters by minimum level', () => {
    const { service, lines } = makeLogger('warn');
    service.debug({ message: 'd' });
    service.info({ message: 'i' });
    service.warn({ message: 'w' });
    service.error({ message: 'e' });
    expect(lines.map((l) => l.level)).toEqual(['warn', 'error']);
    service.setMinLevel('debug');
    service.debug({ message: 'd2' });
    expect(lines).toHaveLength(3);
  });

  it('merges and sanitizes global context', () => {
    const { service, lines } = makeLogger();
    service.setGlobalContext({ variant: 'unit', sessionId: 'abc' });
    service.info({ message: 'hello', context: { callId: 7 } });
    expect(lines[0].context).toEqual(expect.objectContaining({ variant: 'unit', sessionId: '[REDACTED]', callId: 7 }));
    service.clearGlobalContext();
    service.info({ message: 'again' });
    expect(lines[1].context).not.toHaveProperty('variant');
  });

  it('keeps `this` when methods are destructured', () => {
    const { service, lines } = makeLogger();
    const { warn } = service;
    warn({ message: 'destructured' });
    expect(lines).toHaveLength(1);
  });

  it('does not throw when the transport throws', () => {
    const service = new LogService({
      minLevel: 'debug',
      transport: () => {
        throw new Error('console gone');
      },
    });
    expect(() => service.error({ message: 'x' })).not.toThrow();
  });
});

describe('LogService listeners (Sentry forwarding hook)', () => {
  it('hands listeners a sanitized record and a bare copy of the Error', () => {
    const service = new LogService({ minLevel: 'debug', transport: null });
    const records: LogRecord[] = [];
    service.addListener((r) => records.push(r));
    const error = axiosError();

    service.error({ message: 'Failed to send location', trace_id: 'abc', context: { error, unitId: 'u1' } });

    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.level).toBe('error');
    expect(record.error).toBeInstanceOf(Error);
    expect(record.error).not.toBe(error);
    expect(record.error?.name).toBe('AxiosError');
    expect(record.context).toEqual(expect.objectContaining({ unitId: 'u1', trace_id: 'abc' }));
    expect(JSON.stringify(record)).not.toContain('hunter2');
  });

  it('reports a null error when the context holds no Error', () => {
    const service = new LogService({ minLevel: 'debug', transport: null });
    const records: LogRecord[] = [];
    service.addListener((r) => records.push(r));
    service.error({ message: 'Token refresh rejected', context: { error: 'invalid_grant' } });
    expect(records[0].error).toBeNull();
  });

  it('stops notifying after unsubscribe and survives a throwing listener', () => {
    const service = new LogService({ minLevel: 'debug', transport: null });
    const seen: string[] = [];
    service.addListener(() => {
      throw new Error('sentry not ready');
    });
    const off = service.addListener((r) => seen.push(r.message));
    service.warn({ message: 'one' });
    off();
    service.warn({ message: 'two' });
    expect(seen).toEqual(['one']);
  });
});

describe('createConsoleTransport', () => {
  it('configures react-native-logs without colours (no ANSI codes) and writes through the level method', () => {
    const write = jest.fn();
    mockCreateLogger.mockReturnValue({ debug: write, info: write, warn: write, error: write });
    const transport = createConsoleTransport();
    const config = mockCreateLogger.mock.calls[0][0];
    expect(config.transportOptions).toEqual({});
    expect(config.transportOptions).not.toHaveProperty('colors');
    expect(config.async).toBe(true);
    transport('warn', 'msg', { a: 1 });
    expect(write).toHaveBeenCalledWith('msg', { a: 1 });
  });
});
