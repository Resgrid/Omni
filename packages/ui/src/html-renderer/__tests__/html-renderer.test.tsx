import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Linking, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { ColorSchemeProvider } from '../../theme/color-scheme';
import { darkTokens, lightTokens } from '../../theme/tokens';
import { fitHtmlHeight, HTML_AUTO_HEIGHT_INITIAL, HTML_HEIGHT_MESSAGE_PREFIX, readHeightMessage } from '../document';
// The import resolver maps both files to one module; they are different builds (native WebView vs web iframe).
// eslint-disable-next-line import/no-duplicates
import { HTML_RENDERER_ORIGIN_WHITELIST, HtmlRenderer } from '../index';
// eslint-disable-next-line import/no-duplicates
import { HTML_RENDERER_IFRAME_SANDBOX, HtmlRenderer as WebHtmlRenderer } from '../index.web';

type HostJson = { type: string; props: Record<string, unknown>; children: HostJson[] | null };

const documentHtml = () => screen.getByTestId('webview-html').props.children as string;
const webView = () => screen.getByTestId('html-renderer');

const MALICIOUS = '<p onclick="steal()">Hello</p><script>alert(1)</script><a href="javascript:alert(2)">bad</a><img src="x" onerror="alert(3)"><a href="https://resgrid.com">good</a>';

describe('HtmlRenderer (native WebView)', () => {
  it('renders the provided HTML inside a full document', async () => {
    await render(<HtmlRenderer html="<p>Hello World</p>" />);

    expect(documentHtml()).toContain('<p>Hello World</p>');
    expect(documentHtml()).toContain('<!DOCTYPE html>');
    expect(documentHtml()).toContain('<meta name="viewport"');
  });

  it('always sanitizes: script tags, javascript: URLs and on* handlers are stripped', async () => {
    await render(<HtmlRenderer html={MALICIOUS} />);
    const html = documentHtml();

    expect(html).not.toMatch(/<script>alert|onclick|onerror|javascript:/i);
    expect(html).toContain('Hello');
    expect(html).toContain('href="https://resgrid.com"');
  });

  it('never whitelists every origin and keeps JavaScript, DOM storage and file access off', async () => {
    await render(<HtmlRenderer html="<p>x</p>" />);
    const props = webView().props;

    expect(props.originWhitelist).toEqual(HTML_RENDERER_ORIGIN_WHITELIST);
    expect(props.originWhitelist).not.toContain('*');
    expect(props.javaScriptEnabled).toBe(false);
    expect(props.domStorageEnabled).toBe(false);
    expect(props.allowFileAccess).toBe(false);
    expect(props.setSupportMultipleWindows).toBe(false);
  });

  it('lets a scrollable renderer scroll inside a parent ScrollView (Android nested scrolling)', async () => {
    const { rerender } = await render(<HtmlRenderer html="<p>x</p>" scrollEnabled />);
    expect(webView().props.scrollEnabled).toBe(true);
    expect(webView().props.nestedScrollEnabled).toBe(true);

    await rerender(<HtmlRenderer html="<p>x</p>" />);
    expect(webView().props.scrollEnabled).toBe(false);
    expect(webView().props.nestedScrollEnabled).toBe(false);
  });

  describe('autoHeight', () => {
    const reportHeight = async (data: string) => {
      // SAFETY: the WebView stand-in passes the renderer's props through, so onMessage is the renderer's message handler.
      const onMessage = webView().props.onMessage as (event: { nativeEvent: { data: string } }) => void;

      await act(async () => onMessage({ nativeEvent: { data } }));
    };

    // SAFETY: the renderer passes a flattened ViewStyle to the WebView stand-in.
    const height = () => StyleSheet.flatten(webView().props.style as StyleProp<ViewStyle>)?.height;

    it('grows to the height its document reports and leaves the drag to the parent', async () => {
      await render(<HtmlRenderer html="<p>x</p>" autoHeight maxHeight={400} />);
      expect(height()).toBe(HTML_AUTO_HEIGHT_INITIAL);
      expect(webView().props.scrollEnabled).toBe(true);

      await reportHeight(`${HTML_HEIGHT_MESSAGE_PREFIX}96`);

      expect(height()).toBe(96);
      expect(webView().props.scrollEnabled).toBe(false);
      expect(webView().props.nestedScrollEnabled).toBe(false);
    });

    it('stops at maxHeight and scrolls the rest inside itself, with the indicator showing', async () => {
      await render(<HtmlRenderer html="<p>x</p>" autoHeight maxHeight={400} />);
      await reportHeight(`${HTML_HEIGHT_MESSAGE_PREFIX}5000`);

      expect(height()).toBe(400);
      expect(webView().props.scrollEnabled).toBe(true);
      expect(webView().props.nestedScrollEnabled).toBe(true);
      expect(webView().props.showsVerticalScrollIndicator).toBe(true);
    });

    it('ignores any other message', async () => {
      await render(<HtmlRenderer html="<p>x</p>" autoHeight maxHeight={400} />);
      await reportHeight('{"height":10}');
      await reportHeight(`${HTML_HEIGHT_MESSAGE_PREFIX}-5`);
      await reportHeight(`${HTML_HEIGHT_MESSAGE_PREFIX}12px`);

      expect(height()).toBe(HTML_AUTO_HEIGHT_INITIAL);
    });

    it('runs only its own nonce-carrying script; server scripts stay stripped and blocked by the CSP', async () => {
      await render(<HtmlRenderer html={MALICIOUS} autoHeight />);
      const html = documentHtml();
      const nonce = /script-src 'nonce-([a-z0-9]+)'/i.exec(html)?.[1];

      expect(webView().props.javaScriptEnabled).toBe(true);
      expect(nonce).toBeTruthy();
      expect(html).toContain('Content-Security-Policy');
      expect(html.match(/<script/g)).toHaveLength(1);
      expect(html).toContain(`<script nonce="${nonce}">`);
      expect(html).toContain('window.ReactNativeWebView.postMessage');
      expect(html).not.toMatch(/<script>alert|onclick|onerror|javascript:/i);
    });

    it('gives every document a fresh 128-bit nonce from the secure random source', async () => {
      const nonceOf = () => /script-src 'nonce-([a-z0-9]+)'/i.exec(documentHtml())?.[1];
      const { rerender } = await render(<HtmlRenderer html="<p>first</p>" autoHeight />);
      const first = nonceOf();

      expect(first).toMatch(/^[0-9a-f]{32}$/);

      await rerender(<HtmlRenderer html="<p>second</p>" autoHeight />);

      expect(nonceOf()).toMatch(/^[0-9a-f]{32}$/);
      expect(nonceOf()).not.toBe(first);
      expect(documentHtml()).toContain(`<script nonce="${nonceOf()}">`);
    });

    it('is off by default: no script, no CSP, no message handler', async () => {
      await render(<HtmlRenderer html="<p>x</p>" />);

      expect(documentHtml()).not.toContain('<script');
      expect(documentHtml()).not.toContain('Content-Security-Policy');
      expect(webView().props.onMessage).toBeUndefined();
    });
  });

  it('loads only its own document and opens http/https/mailto links externally', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<HtmlRenderer html="<p>x</p>" />);
    const shouldStart = webView().props.onShouldStartLoadWithRequest as (request: { url: string }) => boolean;

    expect(shouldStart({ url: 'about:blank' })).toBe(true);
    expect(shouldStart({ url: 'https://resgrid.com' })).toBe(false);
    expect(openURL).toHaveBeenCalledWith('https://resgrid.com');
    expect(shouldStart({ url: 'mailto:ops@example.com' })).toBe(false);
    expect(openURL).toHaveBeenCalledWith('mailto:ops@example.com');

    openURL.mockClear();
    expect(shouldStart({ url: 'javascript:alert(1)' })).toBe(false);
    expect(shouldStart({ url: 'data:text/html,<p>x</p>' })).toBe(false);
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it('routes links to onLinkPress when given', async () => {
    const onLinkPress = jest.fn();
    await render(<HtmlRenderer html="<p>x</p>" onLinkPress={onLinkPress} />);
    const shouldStart = webView().props.onShouldStartLoadWithRequest as (request: { url: string }) => boolean;

    shouldStart({ url: 'https://resgrid.com/a' });
    shouldStart({ url: 'intent://evil' });

    expect(onLinkPress).toHaveBeenCalledTimes(1);
    expect(onLinkPress).toHaveBeenCalledWith('https://resgrid.com/a');
  });

  it('applies colour overrides', async () => {
    await render(<HtmlRenderer html="<p>x</p>" textColor="#FF0000" backgroundColor="#333333" />);

    expect(documentHtml()).toContain('color: #FF0000');
    expect(documentHtml()).toContain('background-color: #333333');
  });

  it('refuses colour values that could break out of the CSS rule', async () => {
    await render(<HtmlRenderer html="<p>x</p>" textColor="red;}</style><script>alert(1)</script>" />);

    expect(documentHtml()).not.toContain('<script>alert(1)');
  });

  it('strips markup from custom CSS', async () => {
    await render(<HtmlRenderer html="<p>x</p>" customCSS="p { margin: 0 } </style><script>alert(1)</script>" />);

    expect(documentHtml()).toContain('p { margin: 0 }');
    expect(documentHtml()).not.toContain('<script>');
  });

  it('follows the theme tokens in light and dark mode', async () => {
    const { rerender } = await render(
      <ColorSchemeProvider mode="light">
        <HtmlRenderer html="<p>x</p>" />
      </ColorSchemeProvider>
    );

    expect(documentHtml()).toContain(`color: ${lightTokens['typography-800']}`);

    await rerender(
      <ColorSchemeProvider mode="dark">
        <HtmlRenderer html="<p>x</p>" />
      </ColorSchemeProvider>
    );
    expect(documentHtml()).toContain(`color: ${darkTokens['typography-800']}`);
    expect(documentHtml()).toContain('background-color: transparent');
  });
});

describe('HtmlRenderer (web iframe)', () => {
  type MessageListener = (event: { data: unknown; source: unknown }) => void;

  const mockWindow = window as unknown as { addEventListener?: unknown; removeEventListener?: unknown };
  const listeners = new Set<MessageListener>();
  const originalAdd = mockWindow.addEventListener;
  const originalRemove = mockWindow.removeEventListener;
  const fakeFrameWindow = {};

  beforeAll(() => {
    mockWindow.addEventListener = (_type: string, listener: MessageListener) => listeners.add(listener);
    mockWindow.removeEventListener = (_type: string, listener: MessageListener) => listeners.delete(listener);
  });

  afterAll(() => {
    mockWindow.addEventListener = originalAdd;
    mockWindow.removeEventListener = originalRemove;
  });

  afterEach(() => listeners.clear());

  const post = (data: unknown, source: unknown) => listeners.forEach((listener) => listener({ data, source }));

  const findIframe = (node: HostJson | null): HostJson | null => {
    if (!node) return null;

    if (node.type === 'iframe') return node;

    for (const child of node.children ?? []) {
      const found = typeof child === 'object' ? findIframe(child) : null;

      if (found) return found;
    }

    return null;
  };

  const renderIframe = async (element: React.ReactElement) => {
    const { toJSON } = await render(element);
    const iframe = findIframe(toJSON() as unknown as HostJson);

    if (!iframe) throw new Error('iframe not rendered');

    return iframe.props;
  };

  it('sandboxes the iframe without allow-same-origin (server HTML must not reach app storage)', async () => {
    const props = await renderIframe(<WebHtmlRenderer html="<p>x</p>" />);

    expect(props.sandbox).toBe(HTML_RENDERER_IFRAME_SANDBOX);
    expect(String(props.sandbox)).not.toContain('allow-same-origin');
    expect(String(props.sandbox)).not.toContain('allow-top-navigation');
    expect(String(props.sandbox)).not.toContain('allow-popups');
    expect(props.referrerPolicy).toBe('no-referrer');
  });

  it('sanitizes the srcDoc', async () => {
    const srcDoc = String((await renderIframe(<WebHtmlRenderer html={MALICIOUS} />)).srcDoc);

    expect(srcDoc).not.toMatch(/<script>alert|onclick|onerror|javascript:/i);
    expect(srcDoc).toContain('Hello');
    // Our own link interceptor is the only script in the document.
    expect(srcDoc.match(/<script>/g)).toHaveLength(1);
  });

  it('has an accessible title', async () => {
    expect((await renderIframe(<WebHtmlRenderer html="<p>x</p>" />)).title).toBe('Content');
  });

  describe('autoHeight', () => {
    const renderFitted = async () => {
      const view = await render(<WebHtmlRenderer html="<p>x</p>" autoHeight maxHeight={400} />);
      const [iframe] = view.container.queryAll((node) => node.type === 'iframe');

      Object.assign(iframe, { contentWindow: fakeFrameWindow });

      return view;
    };

    // SAFETY: the container View's style is the flattened ViewStyle the renderer built.
    const containerHeight = () => StyleSheet.flatten(screen.getByTestId('html-renderer').props.style as StyleProp<ViewStyle>)?.height;

    it('adds a height reporter after the link interceptor and lets the document scroll past maxHeight', async () => {
      const srcDoc = String((await renderIframe(<WebHtmlRenderer html={MALICIOUS} autoHeight />)).srcDoc);

      expect(srcDoc.match(/<script>/g)).toHaveLength(2);
      expect(srcDoc).toContain("window.parent.postMessage(message, '*')");
      expect(srcDoc).toContain('overflow: auto');
      expect(srcDoc).not.toMatch(/<script>alert|onclick|onerror|javascript:/i);
    });

    it('follows the height its own iframe reports, up to maxHeight', async () => {
      await renderFitted();
      expect(containerHeight()).toBe(HTML_AUTO_HEIGHT_INITIAL);

      await act(async () => post(`${HTML_HEIGHT_MESSAGE_PREFIX}120`, fakeFrameWindow));
      expect(containerHeight()).toBe(120);

      await act(async () => post(`${HTML_HEIGHT_MESSAGE_PREFIX}9000`, fakeFrameWindow));
      expect(containerHeight()).toBe(400);
    });

    it('ignores height messages from any other window', async () => {
      await renderFitted();
      await act(async () => post(`${HTML_HEIGHT_MESSAGE_PREFIX}120`, {}));

      expect(containerHeight()).toBe(HTML_AUTO_HEIGHT_INITIAL);
    });
  });

  describe('link messages from the iframe', () => {
    const renderWithFrame = async (onLinkPress?: (url: string) => void) => {
      const view = await render(<WebHtmlRenderer html='<a href="https://resgrid.com">x</a>' onLinkPress={onLinkPress} />);
      // RNTL 14 has no createNodeMock. A host ref is the same TestInstance the container query returns, so the iframe's
      // ref gets its fake contentWindow here (the renderer reads it when a message arrives).
      const [iframe] = view.container.queryAll((node) => node.type === 'iframe');
      Object.assign(iframe, { contentWindow: fakeFrameWindow });

      return view;
    };

    it('opens http/https/mailto links posted by its own iframe', async () => {
      const onLinkPress = jest.fn();
      await renderWithFrame(onLinkPress);

      post({ type: 'html-renderer-link', url: 'https://resgrid.com' }, fakeFrameWindow);
      post({ type: 'html-renderer-link', url: 'mailto:ops@example.com' }, fakeFrameWindow);

      expect(onLinkPress.mock.calls).toEqual([['https://resgrid.com'], ['mailto:ops@example.com']]);
    });

    it('ignores unsafe schemes', async () => {
      const onLinkPress = jest.fn();
      await renderWithFrame(onLinkPress);

      post({ type: 'html-renderer-link', url: 'javascript:alert(1)' }, fakeFrameWindow);
      post({ type: 'html-renderer-link', url: 'data:text/html,x' }, fakeFrameWindow);

      expect(onLinkPress).not.toHaveBeenCalled();
    });

    it('ignores messages from any other window', async () => {
      const onLinkPress = jest.fn();
      await renderWithFrame(onLinkPress);

      post({ type: 'html-renderer-link', url: 'https://evil.test' }, {});
      post({ type: 'html-renderer-link', url: 'https://evil.test' }, undefined);

      expect(onLinkPress).not.toHaveBeenCalled();
    });

    it('falls back to opening the link externally', async () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      await renderWithFrame();

      post({ type: 'html-renderer-link', url: 'https://resgrid.com' }, fakeFrameWindow);

      expect(openURL).toHaveBeenCalledWith('https://resgrid.com');
      openURL.mockRestore();
    });
  });
});

describe('autoHeight sizing', () => {
  it('reads only well-formed height messages', () => {
    expect(readHeightMessage(`${HTML_HEIGHT_MESSAGE_PREFIX}240`)).toBe(240);
    expect(readHeightMessage('html-renderer-link')).toBeNull();
    expect(readHeightMessage(`${HTML_HEIGHT_MESSAGE_PREFIX}1e9`)).toBeNull();
    expect(readHeightMessage('[object Object]')).toBeNull();
  });

  it('fits the content up to maxHeight and scrolls only past it', () => {
    expect(fitHtmlHeight(null, 500)).toEqual({ height: HTML_AUTO_HEIGHT_INITIAL, scrollEnabled: true });
    expect(fitHtmlHeight(null, 100)).toEqual({ height: 100, scrollEnabled: true });
    expect(fitHtmlHeight(80, 500)).toEqual({ height: 80, scrollEnabled: false });
    expect(fitHtmlHeight(500, 500)).toEqual({ height: 500, scrollEnabled: false });
    expect(fitHtmlHeight(2000, 500)).toEqual({ height: 500, scrollEnabled: true });
    expect(fitHtmlHeight(0, 500)).toEqual({ height: 1, scrollEnabled: false });
  });
});
