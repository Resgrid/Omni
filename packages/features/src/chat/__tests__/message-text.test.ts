import '../../status/__tests__/test-setup';

import { ChatMessageType, ChatParticipantType } from '@resgrid/models';

import { messageBodyText, richTextToPlain } from '../lib/message-text';

describe('richTextToPlain', () => {
  it('drops editor markup and keeps the line breaks it implied', () => {
    expect(richTextToPlain('Call TEST 10-7-2026\n<div dir="ltr">JUST A TEST!</div>\n')).toBe('Call TEST 10-7-2026\nJUST A TEST!');
    expect(richTextToPlain('<p>Structure <b>fire</b></p><p>2nd floor<br/>rear</p>')).toBe('Structure fire\n2nd floor\nrear');
    expect(richTextToPlain('<ul><li>Engine 1</li><li class="x">Ladder 2</li></ul>')).toBe('• Engine 1\n• Ladder 2');
  });

  it('decodes entities, including a body that arrives entity-encoded', () => {
    expect(richTextToPlain('<div>Fire &amp; EMS&nbsp;at "Main" St</div>')).toBe('Fire & EMS at "Main" St');
    expect(richTextToPlain('&lt;div&gt;Medical&lt;/div&gt;')).toBe('Medical');
  });

  it("keeps the assistant's own placeholders", () => {
    const help = 'C<id>: call detail (e.g. C1445)\nDISPATCH <details>: create a new call\nSET UNIT <number or name> TO <status>';
    expect(richTextToPlain(help)).toBe(help);
    expect(richTextToPlain('<div>Text C<id> for details</div>')).toBe('Text C<id> for details');
  });
});

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
