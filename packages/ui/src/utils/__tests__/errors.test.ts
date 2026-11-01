import { useToastStore } from '../../toast/store';
import { extractError, showError, showErrorMessage } from '../errors';

describe('error toasts (Responder showError on the toast store)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.getState().clearToasts();
  });

  afterEach(() => {
    useToastStore.getState().clearToasts();
    jest.useRealTimers();
  });

  it('shows an API error as an error toast with a translated title', () => {
    showError({ response: { data: 'Network error occurred' } } as never);

    const [toast] = useToastStore.getState().toasts;
    expect(toast).toMatchObject({ type: 'error', message: 'Network error occurred', title: 'Error' });
  });

  it('keeps error toasts up for four seconds', () => {
    showErrorMessage('Custom error message');
    jest.advanceTimersByTime(3999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('falls back to a generic message', () => {
    showErrorMessage();
    showError(undefined);

    const messages = useToastStore.getState().toasts.map((toast) => toast.message);
    expect(messages).toEqual(['Something went wrong', 'Something went wrong']);
  });

  it('never logs the response body (it can contain PII)', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    showError({ response: { data: { Email: ['jane@example.com is taken'] } } } as never);

    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });

  it('flattens validation payloads into readable text', () => {
    expect(extractError({ Name: ['Required'], Code: 'Too long' })).toContain('- Name:');
    expect(extractError(['a', 'b'])).toBe('  a  b');
    expect(extractError('plain')).toBe('plain');
  });
});
