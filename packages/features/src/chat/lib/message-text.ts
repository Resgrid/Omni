import { type ChatMessageResultData, ChatMessageType, ChatParticipantType } from '@resgrid/models';
import { richTextToPlain } from '@resgrid/ui';

const isServerAuthored = (message: Pick<ChatMessageResultData, 'MessageType' | 'SenderParticipantType'>): boolean =>
  message.MessageType === ChatMessageType.Bot || message.MessageType === ChatMessageType.System || message.SenderParticipantType === ChatParticipantType.Bot;

/**
 * A message's text as shown and copied. Assistant replies and system notices can quote server rich text (a call's nature
 * arrives as `<div dir="ltr">…</div>`), so theirs is flattened; what people type is shown exactly as written.
 */
export const messageBodyText = (message: Pick<ChatMessageResultData, 'Body' | 'MessageType' | 'SenderParticipantType'>): string => {
  const body = message.Body ?? '';

  return isServerAuthored(message) ? richTextToPlain(body) : body;
};
