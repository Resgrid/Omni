// The NetInfo connectivity source: online/offline for the outbox and realtime, and network handovers (Wi-Fi ↔ cellular)
// for the long-lived media connections (voice channels, audio streams) that must reconnect on them.
import { __emitNetInfo, __resetNetInfoFake } from '../../__tests__/fakes/netinfo';
import { createManualConnectivitySource, createNetInfoConnectivitySource } from '../connectivity';

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => __resetNetInfoFake());

describe('createNetInfoConnectivitySource', () => {
  it('reports going offline and back online', async () => {
    const source = createNetInfoConnectivitySource();
    const online = jest.fn();
    source.subscribe(online);
    await flush();

    __emitNetInfo({ isConnected: false });
    expect(source.isOnline()).toBe(false);
    __emitNetInfo({ isConnected: true });
    expect(online.mock.calls).toEqual([[false], [true]]);
    source.dispose();
  });

  it('reports a move between Wi-Fi and cellular while online, but not coming back online on another network', async () => {
    const source = createNetInfoConnectivitySource();
    const changed = jest.fn();
    source.subscribeNetworkChange?.(changed);
    await flush();

    __emitNetInfo({ type: 'cellular' });
    expect(changed).toHaveBeenCalledTimes(1);
    __emitNetInfo({ type: 'cellular' });
    expect(changed).toHaveBeenCalledTimes(1);
    __emitNetInfo({ type: 'wifi' });
    expect(changed).toHaveBeenCalledTimes(2);

    // Offline in between: listeners hear "online" instead.
    __emitNetInfo({ isConnected: false });
    __emitNetInfo({ isConnected: true, type: 'cellular' });
    expect(changed).toHaveBeenCalledTimes(2);
    source.dispose();
  });
});

describe('createManualConnectivitySource', () => {
  it('signals a network change only while online', () => {
    const source = createManualConnectivitySource(true);
    const changed = jest.fn();
    const unsubscribe = source.subscribeNetworkChange(changed);
    source.changeNetwork();
    source.setOnline(false);
    source.changeNetwork();
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
    source.setOnline(true);
    source.changeNetwork();
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
