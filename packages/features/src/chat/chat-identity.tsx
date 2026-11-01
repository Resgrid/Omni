import React, { createContext, useContext } from 'react';

/**
 * Who this device chats as. Unit chats as its active unit (`asUnitId` on sends, read marks and `SetActiveChannel`);
 * every other app chats as the signed-in user (no provider needed).
 */
export interface ChatIdentity {
  asUnitId: number | null;
}

const ChatIdentityContext = createContext<ChatIdentity>({ asUnitId: null });

export function ChatIdentityProvider({ asUnitId, children }: { asUnitId: number | null; children?: React.ReactNode }) {
  return <ChatIdentityContext.Provider value={{ asUnitId }}>{children}</ChatIdentityContext.Provider>;
}

export const useChatIdentity = (): ChatIdentity => useContext(ChatIdentityContext);
