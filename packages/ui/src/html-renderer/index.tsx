import React, { useCallback, useMemo } from 'react';
import { Linking, StyleSheet } from 'react-native';
import WebView, { type WebViewNavigation } from 'react-native-webview';

import { useThemeColors } from '../theme/use-theme-colors';
import { buildHtmlDocument, type HtmlRendererProps, isSafeLink } from './document';

export type { HtmlRendererProps };
export { decodeHtmlEntitiesIfEncoded, escapeHtml, htmlToPlainText, isSafeLink, sanitizeDescription, sanitizeHtmlContent } from './html';

/**
 * The WebView may only ever show our own inline document (about:blank). react-native-webview hands a URL
 * that fails this whitelist straight to the OS (Linking.openURL) without asking us, so the whitelist names
 * exactly the schemes we route ourselves: http/https/mailto reach onShouldStartLoadWithRequest, which
 * cancels the navigation and opens the link externally. Never `['*']`: that lets server HTML navigate the
 * WebView anywhere. Other schemes cannot appear — the sanitizer only keeps http/https/mailto URLs.
 */
export const HTML_RENDERER_ORIGIN_WHITELIST = ['about:*', 'http://*', 'https://*', 'mailto:*'];
const isOwnDocument = (url: string) => url === 'about:blank' || url.startsWith('about:blank#') || url === 'about:srcdoc';

/**
 * Server HTML renderer (Unit baseline) — **iOS/Android** variant on react-native-webview. Web and Electron
 * resolve `index.web.tsx` (sandboxed iframe). Input always goes through `sanitizeHtmlContent()`;
 * JavaScript and DOM storage are off by default; links open externally (http/https/mailto only).
 */
export const HtmlRenderer: React.FC<HtmlRendererProps> = ({
  html,
  style,
  scrollEnabled = false,
  showsVerticalScrollIndicator = false,
  textColor,
  backgroundColor,
  linkColor,
  rendererKey,
  customCSS = '',
  onLinkPress,
  javaScriptEnabled = false,
  domStorageEnabled = false,
  testID = 'html-renderer',
}) => {
  const colors = useThemeColors();

  const fullHtml = useMemo(
    () =>
      buildHtmlDocument({
        html,
        textColor: textColor ?? colors.tokens['typography-800'],
        backgroundColor: backgroundColor ?? 'transparent',
        linkColor: linkColor ?? colors.tokens['info-600'],
        customCSS,
      }),
    [html, textColor, backgroundColor, linkColor, customCSS, colors]
  );

  const openLink = useCallback(
    (url: string) => {
      if (!isSafeLink(url)) {
        return;
      }
      if (onLinkPress) {
        onLinkPress(url);
      } else {
        Linking.openURL(url).catch(() => undefined);
      }
    },
    [onLinkPress]
  );

  const handleShouldStartLoad = useCallback(
    (request: WebViewNavigation) => {
      if (isOwnDocument(request.url)) {
        return true;
      }
      openLink(request.url);
      return false;
    },
    [openLink]
  );

  return (
    <WebView
      key={rendererKey}
      testID={testID}
      style={StyleSheet.flatten([styles.container, style])}
      originWhitelist={HTML_RENDERER_ORIGIN_WHITELIST}
      source={{ html: fullHtml }}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      androidLayerType="software"
      javaScriptEnabled={javaScriptEnabled}
      domStorageEnabled={domStorageEnabled}
      // target="_blank" links (the sanitizer adds it) must stay in this WebView so they reach
      // onShouldStartLoadWithRequest instead of opening a window we do not control.
      setSupportMultipleWindows={false}
      allowFileAccess={false}
      allowsLinkPreview={false}
      mixedContentMode="never"
      onShouldStartLoadWithRequest={handleShouldStartLoad}
      onOpenWindow={(event) => openLink(event.nativeEvent.targetUrl)}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'transparent',
  },
});
