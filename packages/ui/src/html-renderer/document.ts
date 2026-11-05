import { getRandomBytes } from 'expo-crypto';
import type { StyleProp, ViewStyle } from 'react-native';

import { sanitizeHtmlContent } from './html-sanitizer';

export interface HtmlRendererProps {
  /** The raw (server-supplied) HTML for the body. Always sanitized before rendering. */
  html: string;
  /** Inline style applied to the container. */
  style?: StyleProp<ViewStyle>;
  /** Whether scrolling is enabled (default: false). Ignored with `autoHeight`, which decides it from the content. */
  scrollEnabled?: boolean;
  /** Whether to show the vertical scroll indicator (default: false). Always shown while an `autoHeight` renderer scrolls. */
  showsVerticalScrollIndicator?: boolean;
  /**
   * Size the renderer to its content instead of a fixed `style` height: it grows with the document up to `maxHeight`
   * and scrolls inside itself past that, so short text leaves no empty box and long text can still be read in full.
   * Turns on a measuring script in the document (native: allowed by a nonce-only CSP; server HTML stays script-free).
   */
  autoHeight?: boolean;
  /** With `autoHeight`: the tallest the renderer grows before its content scrolls. Defaults to 60% of the window height. */
  maxHeight?: number;
  /** Body text colour — defaults to the theme's text token. */
  textColor?: string;
  /** Body background colour — defaults to transparent. */
  backgroundColor?: string;
  /** Link colour — defaults to the theme's info token. */
  linkColor?: string;
  /** React key for forcing a re-render. */
  rendererKey?: string;
  /** Extra CSS appended inside the <style> block after the defaults (trusted, app-authored only). */
  customCSS?: string;
  /** Called with the URL when a link is tapped (http, https and mailto only). Defaults to opening it externally. */
  onLinkPress?: (url: string) => void;
  /** Native only: JavaScript inside the WebView (default false — sanitized HTML never needs it). */
  javaScriptEnabled?: boolean;
  /** Native only: DOM storage inside the WebView (default false). */
  domStorageEnabled?: boolean;
  testID?: string;
}

/** Prefix of the string message an `autoHeight` document posts with its height in CSS pixels. */
export const HTML_HEIGHT_MESSAGE_PREFIX = 'html-renderer-height:';

/** An `autoHeight` renderer's height until its document reports one (the old fixed description box). */
export const HTML_AUTO_HEIGHT_INITIAL = 160;

/**
 * `maxHeight`'s default, as a share of the window height. Beyond the screen's size Android cannot reliably draw a
 * WebView on its software layer (`androidLayerType="software"`), so a tall document scrolls inside the renderer instead.
 */
export const HTML_AUTO_HEIGHT_MAX_WINDOW_SHARE = 0.6;

const HEIGHT_MESSAGE = /^html-renderer-height:(\d{1,6})$/;

/** The height a document's message reports, or null for any other message. */
export const readHeightMessage = (message: string): number | null => {
  const match = HEIGHT_MESSAGE.exec(message);

  return match ? Number(match[1]) : null;
};

export interface FittedHtmlHeight {
  height: number;
  scrollEnabled: boolean;
}

/** An `autoHeight` renderer's height and whether its content scrolls: as tall as the content up to `maxHeight`. */
export const fitHtmlHeight = (contentHeight: number | null, maxHeight: number): FittedHtmlHeight => {
  const max = Math.max(1, Math.round(maxHeight));

  // Not measured yet: the old fixed box, scrollable, so the content is reachable even if no height ever arrives.
  if (contentHeight === null) return { height: Math.min(HTML_AUTO_HEIGHT_INITIAL, max), scrollEnabled: true };

  return { height: Math.max(1, Math.min(contentHeight, max)), scrollEnabled: contentHeight > max };
};

/** Bits of randomness in a CSP nonce (CSP asks for at least 128). */
const SCRIPT_NONCE_BYTES = 16;

/**
 * A fresh CSP nonce for one generated document: 128 bits from the platform's secure random source (expo-crypto), as hex,
 * so it can never break out of the attribute.
 */
export const createScriptNonce = (): string => Array.from(getRandomBytes(SCRIPT_NONCE_BYTES), (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * App-authored script that posts the document's height whenever it changes (layout, images loading, rotation).
 * `post` is `native` (react-native-webview bridge) or `web` (the parent window of the sandboxed iframe).
 */
export const buildHeightReporter = (post: 'native' | 'web', nonce?: string): string => {
  const send = post === 'native' ? 'window.ReactNativeWebView.postMessage(message);' : "window.parent.postMessage(message, '*');";
  const nonceAttribute = nonce ? ` nonce="${nonce.replace(/[^a-z0-9]/gi, '')}"` : '';

  return `<script${nonceAttribute}>
  (function () {
    var last = -1;
    function report() {
      var body = document.body;
      if (!body) return;
      var height = Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height));
      if (height === last) return;
      last = height;
      var message = '${HTML_HEIGHT_MESSAGE_PREFIX}' + height;
      ${send}
    }
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(report).observe(document.body);
    window.addEventListener('load', report);
    report();
  })();
</script>`;
};

/** The only link schemes HtmlRenderer will ever open. */
export const SAFE_LINK_PATTERN = /^(https?:|mailto:)/i;

export const isSafeLink = (url: string | null | undefined): url is string => typeof url === 'string' && SAFE_LINK_PATTERN.test(url.trim());

// Theme colours are interpolated into CSS; accept only plain colour syntax so a prop can never close the rule.
const SAFE_CSS_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]+)$/i;
const cssColor = (value: string, fallback: string): string => (SAFE_CSS_COLOR.test(value.trim()) ? value.trim() : fallback);

export interface HtmlDocumentOptions {
  html: string;
  textColor: string;
  backgroundColor: string;
  linkColor: string;
  customCSS?: string;
  /** Web: hide overflow / scrollbars inside the iframe. */
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  /** Extra markup after the sanitized body (web link interceptor). Never server content. */
  trailingMarkup?: string;
  /** Web adds a charset meta; native WebView infers it. */
  includeCharset?: boolean;
  /** Web iframe controls overflow on html/body. */
  controlOverflow?: boolean;
  /** Only scripts carrying this nonce may run (CSP meta); server markup can then never run script, sanitizer or not. */
  scriptNonce?: string;
}

/** Wraps sanitized body HTML in a full themed document. The body is always passed through sanitizeHtmlContent(). */
export function buildHtmlDocument({
  html,
  textColor,
  backgroundColor,
  linkColor,
  customCSS = '',
  scrollEnabled = false,
  showsVerticalScrollIndicator = false,
  trailingMarkup = '',
  includeCharset = false,
  controlOverflow = false,
  scriptNonce,
}: HtmlDocumentOptions): string {
  const nonce = scriptNonce ? scriptNonce.replace(/[^a-z0-9]/gi, '') : '';
  const cspMeta = nonce ? `\n        <meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}'; object-src 'none'; base-uri 'none'">` : '';

  const overflowCss = controlOverflow
    ? `
          html, body {
            margin: 0;
            padding: 0;
            overflow: ${scrollEnabled ? 'auto' : 'hidden'};
            background-color: transparent;
          }`
    : '';

  const scrollbarCss = controlOverflow && !showsVerticalScrollIndicator ? '\n          ::-webkit-scrollbar { display: none; }\n          body { -ms-overflow-style: none; scrollbar-width: none; }' : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>${includeCharset ? '\n        <meta charset="utf-8" />' : ''}${cspMeta}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
        <style>${overflowCss}
          body {
            color: ${cssColor(textColor, '#1F2937')};
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 8px;
            font-size: 16px;
            line-height: 1.5;
            background-color: ${cssColor(backgroundColor, 'transparent')};
            overflow-wrap: anywhere;
          }
          a {
            color: ${cssColor(linkColor, '#0077C7')};
          }${scrollbarCss}
          * {
            max-width: 100%;
          }
          ${customCSS.replace(/</g, '')}
        </style>
      </head>
      <body>${sanitizeHtmlContent(html)}${trailingMarkup}</body>
    </html>
  `;
}
