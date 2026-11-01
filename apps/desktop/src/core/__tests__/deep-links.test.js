const { createDeepLinkQueue, findDeepLink, parseDeepLink } = require('../deep-links');

describe('parseDeepLink', () => {
  it("accepts the app's scheme, case-insensitively, and normalizes it", () => {
    expect(parseDeepLink('resgridunit://call/123', ['resgridunit'])).toBe('resgridunit://call/123');
    expect(parseDeepLink('ResgridUnit://call/123?x=1', ['resgridunit'])).toBe('resgridunit://call/123?x=1');
    expect(parseDeepLink('  resgriddispatch://auth/callback?code=1 ', ['resgriddispatch'])).toBe('resgriddispatch://auth/callback?code=1');
  });

  it('refuses other schemes, flags, control characters and huge values', () => {
    const schemes = ['resgridunit'];
    expect(parseDeepLink('https://resgrid.com', schemes)).toBeNull();
    expect(parseDeepLink('--inspect=9229', schemes)).toBeNull();
    expect(parseDeepLink('resgridunitx://a', schemes)).toBeNull();
    expect(parseDeepLink('resgridunit://a\n--gpu-launcher=calc', schemes)).toBeNull();
    expect(parseDeepLink(`resgridunit://${'a'.repeat(5000)}`, schemes)).toBeNull();
    expect(parseDeepLink('resgridunit://a', [])).toBeNull();
    expect(parseDeepLink(undefined, schemes)).toBeNull();
  });
});

describe('findDeepLink', () => {
  it("finds the link among a second instance's arguments", () => {
    const argv = ['C:\\Program Files\\Resgrid Unit\\Resgrid Unit.exe', '--allow-file-access-from-files', 'resgridunit://call/9'];
    expect(findDeepLink(argv, ['resgridunit'])).toBe('resgridunit://call/9');
    expect(findDeepLink(['app.exe', '--flag'], ['resgridunit'])).toBeNull();
    expect(findDeepLink('resgridunit://x', ['resgridunit'])).toBeNull();
  });
});

describe('createDeepLinkQueue', () => {
  it('holds links until the page subscribes, then forwards directly', () => {
    const sent = [];
    const queue = createDeepLinkQueue({ send: (link) => (sent.push(link), true) });
    queue.push('a://1');
    queue.push('a://2');
    expect(sent).toEqual([]);
    expect(queue.subscribe()).toEqual(['a://1', 'a://2']);
    queue.push('a://3');
    expect(sent).toEqual(['a://3']);
    expect(queue.size).toBe(0);
  });

  it('queues again after a reload and when sending fails', () => {
    let canSend = true;
    const queue = createDeepLinkQueue({ send: () => canSend });
    queue.subscribe();
    queue.reset();
    queue.push('a://reloading');
    expect(queue.size).toBe(1);
    expect(queue.subscribe()).toEqual(['a://reloading']);
    canSend = false;
    queue.push('a://loading');
    expect(queue.subscribe()).toEqual(['a://loading']);
  });

  it('keeps only the newest links beyond its limit', () => {
    const queue = createDeepLinkQueue({ send: () => false, maxPending: 2 });
    queue.push('a://1');
    queue.push('a://2');
    queue.push('a://3');
    expect(queue.subscribe()).toEqual(['a://2', 'a://3']);
  });
});
