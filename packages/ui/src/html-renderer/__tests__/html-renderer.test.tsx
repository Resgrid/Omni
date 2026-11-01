import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

import { ColorSchemeProvider } from '../../theme/color-scheme';
import { darkTokens, lightTokens } from '../../theme/tokens';
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
  it('renders the provided HTML inside a full document', () => {
    render(<HtmlRenderer html="<p>Hello World</p>" />);

    expect(documentHtml()).toContain('<p>Hello World</p>');
    expect(documentHtml()).toContain('<!DOCTYPE html>');
    expect(documentHtml()).toContain('<meta name="viewport"');
  });

  it('always sanitizes: script tags, javascript: URLs and on* handlers are stripped', () => {
    render(<HtmlRenderer html={MALICIOUS} />);
    const html = documentHtml();

    expect(html).not.toMatch(/<script>alert|onclick|onerror|javascript:/i);
    expect(html).toContain('Hello');
    expect(html).toContain('href="https://resgrid.com"');
  });

  it('never whitelists every origin and keeps JavaScript, DOM storage and file access off', () => {
    render(<HtmlRenderer html="<p>x</p>" />);
    const props = webView().props;

    expect(props.originWhitelist).toEqual(HTML_RENDERER_ORIGIN_WHITELIST);
    expect(props.originWhitelist).not.toContain('*');
    expect(props.javaScriptEnabled).toBe(false);
    expect(props.domStorageEnabled).toBe(false);
    expect(props.allowFileAccess).toBe(false);
    expect(props.setSupportMultipleWindows).toBe(false);
  });

  it('loads only its own document and opens http/https/mailto links externally', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<HtmlRenderer html="<p>x</p>" />);
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

  it('routes links to onLinkPress when given', () => {
    const onLinkPress = jest.fn();
    render(<HtmlRenderer html="<p>x</p>" onLinkPress={onLinkPress} />);
    const shouldStart = webView().props.onShouldStartLoadWithRequest as (request: { url: string }) => boolean;

    shouldStart({ url: 'https://resgrid.com/a' });
    shouldStart({ url: 'intent://evil' });

    expect(onLinkPress).toHaveBeenCalledTimes(1);
    expect(onLinkPress).toHaveBeenCalledWith('https://resgrid.com/a');
  });

  it('applies colour overrides', () => {
    render(<HtmlRenderer html="<p>x</p>" textColor="#FF0000" backgroundColor="#333333" />);

    expect(documentHtml()).toContain('color: #FF0000');
    expect(documentHtml()).toContain('background-color: #333333');
  });

  it('refuses colour values that could break out of the CSS rule', () => {
    render(<HtmlRenderer html="<p>x</p>" textColor="red;}</style><script>alert(1)</script>" />);

    expect(documentHtml()).not.toContain('<script>alert(1)');
  });

  it('strips markup from custom CSS', () => {
    render(<HtmlRenderer html="<p>x</p>" customCSS="p { margin: 0 } </style><script>alert(1)</script>" />);

    expect(documentHtml()).toContain('p { margin: 0 }');
    expect(documentHtml()).not.toContain('<script>');
  });

  it('follows the theme tokens in light and dark mode', () => {
    const { rerender } = render(
      <ColorSchemeProvider mode="light">
        <HtmlRenderer html="<p>x</p>" />
      </ColorSchemeProvider>
    );
    expect(documentHtml()).toContain(`color: ${lightTokens['typography-800']}`);

    rerender(
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

  const renderIframe = (element: React.ReactElement) => {
    const { toJSON } = render(element);
    const iframe = findIframe(toJSON() as unknown as HostJson);
    if (!iframe) throw new Error('iframe not rendered');
    return iframe.props;
  };

  it('sandboxes the iframe without allow-same-origin (server HTML must not reach app storage)', () => {
    const props = renderIframe(<WebHtmlRenderer html="<p>x</p>" />);

    expect(props.sandbox).toBe(HTML_RENDERER_IFRAME_SANDBOX);
    expect(String(props.sandbox)).not.toContain('allow-same-origin');
    expect(String(props.sandbox)).not.toContain('allow-top-navigation');
    expect(String(props.sandbox)).not.toContain('allow-popups');
    expect(props.referrerPolicy).toBe('no-referrer');
  });

  it('sanitizes the srcDoc', () => {
    const srcDoc = String(renderIframe(<WebHtmlRenderer html={MALICIOUS} />).srcDoc);

    expect(srcDoc).not.toMatch(/<script>alert|onclick|onerror|javascript:/i);
    expect(srcDoc).toContain('Hello');
    // Our own link interceptor is the only script in the document.
    expect(srcDoc.match(/<script>/g)).toHaveLength(1);
  });

  it('has an accessible title', () => {
    expect(renderIframe(<WebHtmlRenderer html="<p>x</p>" />).title).toBe('Content');
  });

  describe('link messages from the iframe', () => {
    const renderWithFrame = (onLinkPress?: (url: string) => void) =>
      render(<WebHtmlRenderer html='<a href="https://resgrid.com">x</a>' onLinkPress={onLinkPress} />, {
        createNodeMock: (element: { type: unknown }) => (element.type === 'iframe' ? { contentWindow: fakeFrameWindow } : null),
      });

    it('opens http/https/mailto links posted by its own iframe', () => {
      const onLinkPress = jest.fn();
      renderWithFrame(onLinkPress);

      post({ type: 'html-renderer-link', url: 'https://resgrid.com' }, fakeFrameWindow);
      post({ type: 'html-renderer-link', url: 'mailto:ops@example.com' }, fakeFrameWindow);

      expect(onLinkPress.mock.calls).toEqual([['https://resgrid.com'], ['mailto:ops@example.com']]);
    });

    it('ignores unsafe schemes', () => {
      const onLinkPress = jest.fn();
      renderWithFrame(onLinkPress);

      post({ type: 'html-renderer-link', url: 'javascript:alert(1)' }, fakeFrameWindow);
      post({ type: 'html-renderer-link', url: 'data:text/html,x' }, fakeFrameWindow);

      expect(onLinkPress).not.toHaveBeenCalled();
    });

    it('ignores messages from any other window', () => {
      const onLinkPress = jest.fn();
      renderWithFrame(onLinkPress);

      post({ type: 'html-renderer-link', url: 'https://evil.test' }, {});
      post({ type: 'html-renderer-link', url: 'https://evil.test' }, undefined);

      expect(onLinkPress).not.toHaveBeenCalled();
    });

    it('falls back to opening the link externally', () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      renderWithFrame();

      post({ type: 'html-renderer-link', url: 'https://resgrid.com' }, fakeFrameWindow);

      expect(openURL).toHaveBeenCalledWith('https://resgrid.com');
      openURL.mockRestore();
    });
  });
});
