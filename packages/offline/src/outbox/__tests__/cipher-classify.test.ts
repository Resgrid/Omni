import { __emitNetInfo, __listenerCount, __resetNetInfoFake } from '../../__tests__/fakes/netinfo';
import { httpError, networkError } from '../../__tests__/helpers';
import { createMemorySecureKeyStore } from '../../kv/secure-store';
import { createAesGcmPayloadCipher, OUTBOX_KEY_NAME } from '../cipher';
import { defaultClassify, getHttpStatus, isNetworkError, toOutboxError } from '../classify';
import { createManualConnectivitySource, createNetInfoConnectivitySource, isNetInfoOnline } from '../connectivity';

describe('AES-GCM payload cipher', () => {
  it('round-trips unicode payloads with a key generated once into the secure store', async () => {
    const secureStore = createMemorySecureKeyStore();
    const cipher = createAesGcmPayloadCipher({ secureStore });
    const plaintext = JSON.stringify({ note: 'Größe — 患者 🚑' });

    const ciphertext = await cipher.encrypt(plaintext);
    expect(ciphertext).not.toContain('Größe');
    expect(await cipher.decrypt(ciphertext)).toBe(plaintext);

    const key = await secureStore.getItem(OUTBOX_KEY_NAME);
    expect(key).toBeTruthy();
    const again = createAesGcmPayloadCipher({ secureStore });
    expect(await again.decrypt(ciphertext)).toBe(plaintext);
    expect(await secureStore.getItem(OUTBOX_KEY_NAME)).toBe(key);
  });

  it('uses a fresh IV per message', async () => {
    const cipher = createAesGcmPayloadCipher({ secureStore: createMemorySecureKeyStore() });
    expect(await cipher.encrypt('same')).not.toBe(await cipher.encrypt('same'));
  });

  it('fails to decrypt with another key', async () => {
    const ciphertext = await createAesGcmPayloadCipher({ secureStore: createMemorySecureKeyStore() }).encrypt('secret');
    await expect(createAesGcmPayloadCipher({ secureStore: createMemorySecureKeyStore() }).decrypt(ciphertext)).rejects.toThrow();
  });
});

describe('error classification (Unit rules)', () => {
  it.each([
    [httpError(400), 'permanent'],
    [httpError(404), 'permanent'],
    [httpError(422), 'permanent'],
    [httpError(401), 'auth'],
    [httpError(408), 'retry'],
    [httpError(429), 'retry'],
    [httpError(500), 'retry'],
    [httpError(503), 'retry'],
    [networkError(), 'network'],
    [new TypeError('Network request failed'), 'network'],
    [new Error('something odd'), 'retry'],
  ])('%s → %s', (error, expected) => {
    expect(defaultClassify(error)).toBe(expected);
  });

  it('reads axios and fetch style statuses', () => {
    expect(getHttpStatus({ response: { status: 409 } })).toBe(409);
    expect(getHttpStatus({ status: 502 })).toBe(502);
    expect(getHttpStatus('nope')).toBeUndefined();
    expect(isNetworkError(httpError(500))).toBe(false);
  });

  it('records status, code and a short message — never bodies', () => {
    const error = Object.assign(httpError(400, 'x'.repeat(1000)), { code: 'ERR_BAD_REQUEST', response: { status: 400, data: { password: 'p' } } });
    const stored = toOutboxError(error);
    expect(stored.status).toBe(400);
    expect(stored.code).toBe('ERR_BAD_REQUEST');
    expect(stored.message.length).toBeLessThanOrEqual(301);
    expect(JSON.stringify(stored)).not.toContain('password');
  });
});

describe('connectivity sources', () => {
  afterEach(() => __resetNetInfoFake());

  it('treats unknown reachability as online', () => {
    expect(isNetInfoOnline({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isNetInfoOnline({ isConnected: null, isInternetReachable: null })).toBe(true);
    expect(isNetInfoOnline({ isConnected: false, isInternetReachable: null })).toBe(false);
    expect(isNetInfoOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('wraps NetInfo with one native listener and change-only notifications', () => {
    const source = createNetInfoConnectivitySource();
    const listener = jest.fn();
    source.subscribe(listener);
    source.subscribe(jest.fn());
    expect(__listenerCount()).toBe(1);
    __emitNetInfo({ isConnected: false });
    __emitNetInfo({ isConnected: false });
    __emitNetInfo({ isConnected: true });
    expect(listener.mock.calls).toEqual([[false], [true]]);
    source.dispose();
    expect(__listenerCount()).toBe(0);
  });

  it('manual source notifies subscribers until they unsubscribe', () => {
    const source = createManualConnectivitySource(false);
    const listener = jest.fn();
    const unsubscribe = source.subscribe(listener);
    source.setOnline(true);
    unsubscribe();
    source.setOnline(false);
    expect(listener.mock.calls).toEqual([[true]]);
  });
});
