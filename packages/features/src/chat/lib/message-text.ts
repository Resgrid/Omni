import { type ChatMessageResultData, ChatMessageType, ChatParticipantType } from '@resgrid/models';
import { decodeHtmlEntities, decodeHtmlEntitiesIfEncoded } from '@resgrid/ui';

// Formatting tags the web rich-text editor writes (call natures, notes). An allowlist rather than `<[^>]+>`: the assistant's
// own replies carry placeholders such as `C<id>`, `<details>` and `<number or name>` that must survive.
const FORMATTING_TAGS = 'a|b|blockquote|br|center|code|div|em|font|h[1-6]|hr|i|img|li|ol|p|pre|s|small|span|strike|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul';
const FORMATTING_TAG = new RegExp(`</?(?:${FORMATTING_TAGS})(?:\\s[^<>]*)?/?>`, 'gi');
const HAS_FORMATTING_TAG = new RegExp(FORMATTING_TAG.source, 'i');
const LINE_BREAK = /<br\s*\/?>(?:\r?\n)?/gi;
const BLOCK_END = /<\/(?:blockquote|div|h[1-6]|li|ol|p|pre|table|tr|ul)>(?:\r?\n)?/gi;
const LIST_ITEM = /<li(?:\s[^<>]*)?>/gi;

/** Rich text quoted into a chat message as plain text: line breaks and list bullets kept, formatting tags dropped. */
export const richTextToPlain = (text: string): string => {
  const markup = decodeHtmlEntitiesIfEncoded(text);
  if (!HAS_FORMATTING_TAG.test(markup)) return decodeHtmlEntities(markup);
  const plain = markup.replace(LINE_BREAK, '\n').replace(BLOCK_END, '\n').replace(LIST_ITEM, '• ').replace(FORMATTING_TAG, '');
  return decodeHtmlEntities(plain)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

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
