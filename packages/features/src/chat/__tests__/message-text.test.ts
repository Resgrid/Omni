import '../../status/__tests__/test-setup';

import { ChatMessageType, ChatParticipantType } from '@resgrid/models';

import { messageBodyText } from '../lib/message-text';

describe('messageBodyText', () => {
  const base = { Body: 'Call X\n<div>Nature</div>', MessageType: ChatMessageType.Text, SenderParticipantType: ChatParticipantType.User };

  it('flattens assistant replies and system notices', () => {
    expect(messageBodyText({ ...base, MessageType: ChatMessageType.Bot, SenderParticipantType: ChatParticipantType.Bot })).toBe('Call X\nNature');
    expect(messageBodyText({ ...base, MessageType: ChatMessageType.System })).toBe('Call X\nNature');
  });

  it('shows what people type exactly as written', () => {
    expect(messageBodyText(base)).toBe('Call X\n<div>Nature</div>');
    expect(messageBodyText({ ...base, Body: null })).toBe('');
  });
});
