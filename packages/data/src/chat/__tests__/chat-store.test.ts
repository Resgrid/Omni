import { getChatChannels, getChatMessages, sendChatMessage } from '@resgrid/api';
import type { ChatMessageResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, httpError, networkError, ok, persisted } from '../../__tests__/helpers';
import { setDataStorage } from '../../core/persist';
import { CHAT_MESSAGE_SEND_EVENT, PENDING_SEQ_BASE, upsertChatMessage, useChatStore } from '../chat-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getChatChannels: jest.fn(),
  getChatMessages: jest.fn(),
  sendChatMessage: jest.fn(),
}));

const message = (id: string, seq: number, overrides: Partial<ChatMessageResultData> = {}): ChatMessageResultData =>
  ({ ChatMessageId: id, ChatChannelId: 'ch-1', MessageSeq: seq, SentOn: '2026-10-31T12:00:00Z', Body: id, Reactions: [], Attachments: [], ...overrides }) as ChatMessageResultData;

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'ic' });
  await defaultResetRegistry.getStoreResets().get('data.chat')?.('logout');
});

describe('chat store (IC + Dispatch call filter)', () => {
  it('uses one getChannels signature (unit, archived, call)', async () => {
    jest.mocked(getChatChannels).mockResolvedValue(
      ok([
        { ChatChannelId: 'ch-1', CallId: 7 },
        { ChatChannelId: 'ch-2', CallId: 8 },
      ]) as never
    );
    await useChatStore.getState().fetchChannels({ activeUnitId: 10 });
    expect(getChatChannels).toHaveBeenLastCalledWith(expect.anything(), { activeUnitId: 10, includeArchived: undefined });
    await useChatStore.getState().loadIncidentChannels('7');
    expect(getChatChannels).toHaveBeenLastCalledWith(expect.anything(), { includeArchived: true, callId: 7 });
    expect(useChatStore.getState().incidentChannelsByCallId['7'].map((c) => c.ChatChannelId)).toEqual(['ch-1']);
    expect(useChatStore.getState().incidentChannelsStatusByCallId['7']).toBe('loaded');
  });

  it('marks an incident channel request as failed (retryable) rather than "no channel"', async () => {
    jest.mocked(getChatChannels).mockRejectedValue(networkError());
    await useChatStore.getState().loadIncidentChannels('7');
    expect(useChatStore.getState().incidentChannelsStatusByCallId['7']).toBe('failed');
  });

  it('upserts by ChatMessageId or ClientMessageId and keeps existing collections', () => {
    const optimistic = message('local', PENDING_SEQ_BASE + 1, { ClientMessageId: 'c1', Reactions: [{ Emoji: 'x' }] as never });
    const merged = upsertChatMessage([message('a', 1), optimistic], { ...message('srv', 2, { ClientMessageId: 'c1' }), Reactions: undefined as never });
    expect(merged.map((m) => m.ChatMessageId)).toEqual(['a', 'srv']);
    expect(merged[1].Reactions).toHaveLength(1);
  });

  it('composes offline: optimistic pending message, delivered on reconnect with ClientMessageId = outbox id', async () => {
    runtime.connectivity.setOnline(false);
    const result = await useChatStore.getState().sendMessage({ channelId: 'ch-1', body: 'Staging at north lot' });
    const pending = useChatStore.getState().messagesByChannel['ch-1'][0];
    expect(pending).toMatchObject({ ClientMessageId: result.id, _localStatus: 'pending', Body: 'Staging at north lot', SenderDisplayName: 'Alex Crew' });

    jest.mocked(sendChatMessage).mockResolvedValue(ok(message('srv-1', 42, { ClientMessageId: result.id, Body: 'Staging at north lot' })) as never);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    expect(sendChatMessage).toHaveBeenCalledWith(expect.anything(), { channelId: 'ch-1' }, expect.objectContaining({ ClientMessageId: result.id, Body: 'Staging at north lot', MessageType: 0, Priority: 0 }));
    const list = useChatStore.getState().messagesByChannel['ch-1'];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ ChatMessageId: 'srv-1', MessageSeq: 42, _localStatus: 'sent' });
  });

  it('a refused send is marked failed; a reload keeps unconfirmed sends on top of the page', async () => {
    jest.mocked(sendChatMessage).mockRejectedValue(httpError(403));
    const result = await useChatStore.getState().sendMessage({ channelId: 'ch-1', body: 'x' });
    expect(result.outcome).toBe('rejected');
    jest.mocked(getChatMessages).mockResolvedValue(ok([message('a', 1)]) as never);
    await useChatStore.getState().loadInitialMessages('ch-1');
    const list = useChatStore.getState().messagesByChannel['ch-1'];
    expect(list.map((m) => m._localStatus ?? 'server')).toEqual(['server', 'failed']);
  });

  it('imports the legacy chat-outbox-storage queue into the durable outbox, keeping each ClientMessageId', async () => {
    runtime.connectivity.setOnline(false);
    runtime.kv.set('chat-outbox-storage', JSON.stringify({ state: { outbox: [{ ClientMessageId: 'legacy-1', ChannelId: 'ch-9', Body: 'old', MessageType: 0, Priority: 1, CreatedAt: 5 }] }, version: 0 }));
    await setDataStorage(runtime.kv);
    expect(useChatStore.getState().outbox).toHaveLength(1);
    expect(await useChatStore.getState().importLegacyOutbox()).toBe(1);
    const [row] = await runtime.rows();
    expect(row).toMatchObject({ id: 'legacy-1', type: CHAT_MESSAGE_SEND_EVENT, createdAt: 5 });
    expect(useChatStore.getState().outbox).toEqual([]);
    expect(persisted(runtime.kv, 'chat-outbox-storage')?.state.outbox).toEqual([]);
  });
});
