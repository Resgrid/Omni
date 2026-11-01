import type { StyleProp, ViewStyle } from 'react-native';

import { sanitizeHtmlContent } from './html-sanitizer';

export interface HtmlRendererProps {
  /** The raw (server-supplied) HTML for the body. Always sanitized before rendering. */
  html: string;
  /** Inline style applied to the container. */
  style?: StyleProp<ViewStyle>;
  /** Whether scrolling is enabled (default: false). */
  scrollEnabled?: boolean;
  /** Whether to show the vertical scroll indicator (default: false). */
  showsVerticalScrollIndicator?: boolean;
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
}: HtmlDocumentOptions): string {
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
      <head>${includeCharset ? '\n        <meta charset="utf-8" />' : ''}
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
