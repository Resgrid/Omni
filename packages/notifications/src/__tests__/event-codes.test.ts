// Event-code parsing table (resgrid-realtime-push skill), ported from the Responder/Unit store tests
// (call-closed, communication-test, mfa-approval parsing) and extended to every code Core sends.
import { categoryForEventCode, extractPushNotificationData, isCriticalEventCode, parseEventCode, resolveNotificationTarget } from '../event-codes';

describe('parseEventCode', () => {
  it.each([
    // [eventCode, kind, id, extra target fields]
    ['C1234', 'call', '1234', {}],
    ['C:1234', 'call', '1234', {}],
    ['c:1234', 'call', '1234', {}],
    ['NC:1234', 'call', '1234', { closed: true }],
    ['nc:77', 'call', '77', { closed: true }],
    ['M5678', 'message', '5678', {}],
    ['M:5678', 'message', '5678', {}],
    ['N42', 'notification', '42', {}],
    ['N:42', 'notification', '42', {}],
    ['t:9012', 'chat', '9012', { chatType: 'direct' }],
    ['T:9012', 'chat', '9012', { chatType: 'direct' }],
    ['g:3456', 'chat', '3456', { chatType: 'group' }],
    ['G:6a1f0c4e-1b2c-4d5e-8f90-1234567890ab', 'chat', '6a1f0c4e-1b2c-4d5e-8f90-1234567890ab', { chatType: 'group' }],
    ['CT:abc123token', 'communicationTest', 'abc123token', {}],
    ['ct:abc', 'communicationTest', 'abc', {}],
    ['NWO:88', 'workOrder', '88', {}],
    ['NA:approval-1', 'signInApproval', 'approval-1', {}],
    ['W:9012', 'weatherAlert', '9012', {}],
    ['W15', 'weatherAlert', '15', {}],
  ])('reads %s as %s %s', (eventCode, kind, id, extra) => {
    const parsed = parseEventCode(eventCode);
    expect(parsed.kind).toBe(kind);
    expect(parsed.id).toBe(id);
    expect(parsed.target).toEqual({ kind, id, ...extra });
  });

  it('splits on the first colon only, so an id containing one survives', () => {
    expect(parseEventCode('t:channel:with:colons').target).toEqual({ kind: 'chat', id: 'channel:with:colons', chatType: 'direct' });
  });

  it('checks whole prefixes before the first character', () => {
    // CT would otherwise be a call, NWO/NA/NC a plain notification.
    expect(parseEventCode('CT:1').kind).toBe('communicationTest');
    expect(parseEventCode('NWO:1').kind).toBe('workOrder');
    expect(parseEventCode('NA:1').kind).toBe('signInApproval');
    expect(parseEventCode('NC:1').target?.closed).toBe(true);
  });

  it('falls back to the first character for unknown multi-letter prefixes', () => {
    expect(parseEventCode('NX:5').kind).toBe('notification');
    expect(parseEventCode('MSG:5').kind).toBe('message');
  });

  it('reads the colon-less legacy form only as one type letter followed by digits', () => {
    expect(parseEventCode('C1234').kind).toBe('call');
    expect(parseEventCode('CT123').kind).toBe('unknown');
    expect(parseEventCode('NC123').kind).toBe('unknown');
    expect(parseEventCode('Cabc').kind).toBe('unknown');
    expect(parseEventCode('X123').kind).toBe('unknown');
  });

  it.each(['', '   ', ':123', 'Z:1', 'hello', '1234'])('treats %p as unknown with no target', (eventCode) => {
    const parsed = parseEventCode(eventCode);
    expect(parsed.kind).toBe('unknown');
    expect(parsed.id).toBe('');
    expect(parsed.target).toBeNull();
  });

  it.each([undefined, null, 42, {}, ['C1']])('treats a non-string %p as unknown', (eventCode) => {
    expect(parseEventCode(eventCode).kind).toBe('unknown');
    expect(parseEventCode(eventCode).target).toBeNull();
  });

  describe('malicious ids are refused by isSafeRouteId', () => {
    it.each(['C:../settings', 'C:1/2', 't:abc/../../admin', 'g:x?redirect=evil', 'M:5#frag', 'NWO:a\\b', 'NA:..', 'CT:.', 'C:', 'NC:', 't:\u0000x', 'W:1\n2'])('%p has no target', (eventCode) => {
      expect(parseEventCode(eventCode).target).toBeNull();
      expect(resolveNotificationTarget(eventCode)).toBeNull();
    });

    it('still reports the kind for the modal', () => {
      expect(parseEventCode('C:../settings').kind).toBe('call');
    });
  });

  it('turns the assistant channel into a chatbot target', () => {
    const isChatbotChannel = (id: string) => id === 'bot-1';
    expect(parseEventCode('t:bot-1', { isChatbotChannel }).target).toEqual({ kind: 'chatbot', id: 'bot-1' });
    expect(parseEventCode('t:other', { isChatbotChannel }).target).toEqual({ kind: 'chat', id: 'other', chatType: 'direct' });
  });

  it('treats a throwing chatbot check as an ordinary chat', () => {
    expect(
      parseEventCode('g:5', {
        isChatbotChannel: () => {
          throw new Error('boom');
        },
      }).target
    ).toEqual({ kind: 'chat', id: '5', chatType: 'group' });
  });
});

describe('first-letter rule (Core NovuProvider)', () => {
  it.each([
    ['C1', 'calls', true],
    ['CT:1', 'calls', true],
    ['NC:1', 'notifications', false],
    ['M:1', 'messages', false],
    ['N1', 'notifications', false],
    ['NWO:1', 'notifications', false],
    ['NA:1', 'notifications', false],
    ['t:1', 'chats', false],
    ['g:1', 'chats', false],
    ['W:1', 'notifications', false],
  ])('%s → category %s, critical %s', (eventCode, category, critical) => {
    expect(categoryForEventCode(eventCode)).toBe(category);
    expect(isCriticalEventCode(eventCode)).toBe(critical);
    expect(parseEventCode(eventCode).category).toBe(category);
    expect(parseEventCode(eventCode).critical).toBe(critical);
  });
});

describe('extractPushNotificationData', () => {
  it('reads content.data on Android', () => {
    expect(extractPushNotificationData({ content: { data: { eventCode: 'C1', type: '7' } } })).toEqual({ eventCode: 'C1', data: { eventCode: 'C1', type: '7' } });
  });

  it('falls back to the iOS payload.body', () => {
    const result = extractPushNotificationData({ content: { data: {} }, trigger: { type: 'push', payload: { aps: { alert: 'x' }, body: { eventCode: 't:5', type: '13' } } } });
    expect(result.eventCode).toBe('t:5');
    expect(result.data).toEqual({ eventCode: 't:5', type: '13' });
  });

  it('falls back to a top-level payload key, then aps', () => {
    expect(extractPushNotificationData({ content: { data: null }, trigger: { payload: { eventCode: 'M9' } } }).eventCode).toBe('M9');
    expect(extractPushNotificationData({ content: { data: null }, trigger: { payload: { aps: { eventCode: 'N3' } } } }).eventCode).toBe('N3');
  });

  it('returns no event code when none is anywhere', () => {
    expect(extractPushNotificationData({ content: { data: { other: 1 } }, trigger: null })).toEqual({ eventCode: undefined, data: { other: 1 } });
    expect(extractPushNotificationData({ content: { data: { eventCode: 5 } } }).eventCode).toBeUndefined();
  });
});
