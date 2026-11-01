import { getActiveVariant } from '@resgrid/config';
import { Loading } from '@resgrid/ui';
import { type Href, Redirect } from 'expo-router';
import React from 'react';

import { useChatAvailability } from '../hooks/use-chat-availability';

export interface ChatGateProps {
  children: React.ReactNode;
  /** Where a disabled chat route goes; defaults to the variant's home route. */
  homeHref?: string;
}

const variantHome = (): string => {
  try {
    return getActiveVariant().shell.homeRoute;
  } catch {
    return '/';
  }
};

/**
 * Wraps every chat route: renders the children only when chat is available (variant chat hub + department
 * `Chat.System`), waits while flags load, and redirects home when chat is off — so a push or deep link into chat on a
 * department without it lands somewhere useful instead of on endpoints that 404.
 */
export const ChatGate: React.FC<ChatGateProps> = ({ children, homeHref }) => {
  const availability = useChatAvailability();
  if (availability === 'unknown') return <Loading testID="chat-gate-loading" />;
  if (availability === 'disabled') return <Redirect href={(homeHref ?? variantHome()) as Href} />;
  return <>{children}</>;
};
