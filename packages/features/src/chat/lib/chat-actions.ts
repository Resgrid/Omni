import { createAdHocChatChannel, createDirectMessageChannel, flagChatMessage, moderatorDeleteChatMessage, pinChatMessage, searchChatGifs, unpinChatMessage } from '@resgrid/api';
import { assertV4Success, getDataApiContext, unwrapItem, unwrapList, useChatStore } from '@resgrid/data';
import { type ChatChannelResultData, type GifResultData } from '@resgrid/models';

/**
 * Chat writes the data store does not expose yet (online only): starting conversations (Dispatch new-conversation
 * sheet), moderation (IC message actions) and GIF search. TODO(omni): move into `useChatStore` (`createConversation`,
 * `pinMessage`, `flagMessage`, `moderatorDelete`) so features stop calling endpoints directly.
 */
export async function startDirectConversation(targetUserId: string): Promise<ChatChannelResultData | null> {
  const channel = unwrapItem(await createDirectMessageChannel(getDataApiContext(), { TargetUserId: targetUserId }));
  await useChatStore.getState().fetchChannels(undefined, { bypassCache: true });
  return channel;
}

export async function startGroupConversation(name: string, memberUserIds: string[]): Promise<ChatChannelResultData | null> {
  const channel = unwrapItem(await createAdHocChatChannel(getDataApiContext(), { Name: name, MemberUserIds: memberUserIds }));
  await useChatStore.getState().fetchChannels(undefined, { bypassCache: true });
  return channel;
}

export async function setMessagePinned(messageId: string, pinned: boolean): Promise<void> {
  assertV4Success(pinned ? await pinChatMessage(getDataApiContext(), { messageId }) : await unpinChatMessage(getDataApiContext(), { messageId }));
}

export async function flagMessage(messageId: string, reason: number): Promise<void> {
  assertV4Success(await flagChatMessage(getDataApiContext(), { messageId }, { Reason: reason }));
}

export async function moderatorDeleteMessage(messageId: string): Promise<void> {
  assertV4Success(await moderatorDeleteChatMessage(getDataApiContext(), { messageId }));
}

/** GIF provider search through Core (`Chat/SearchGifs`); an empty query returns trending GIFs, an unconfigured provider none. */
export async function searchGifs(query: string, signal?: AbortSignal): Promise<GifResultData[]> {
  const trimmed = query.trim();
  return unwrapList(await searchChatGifs(getDataApiContext(), { ...(trimmed ? { q: trimmed } : {}), limit: 24 }, signal ? { signal } : undefined));
}
