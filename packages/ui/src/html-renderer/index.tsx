import React, { useCallback, useMemo, useState } from 'react';
import { Linking, StyleSheet, useWindowDimensions } from 'react-native';
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { useThemeColors } from '../theme/use-theme-colors';
import { buildHeightReporter, buildHtmlDocument, createScriptNonce, fitHtmlHeight, HTML_AUTO_HEIGHT_MAX_WINDOW_SHARE, type HtmlRendererProps, isSafeLink, readHeightMessage } from './document';

export type { HtmlRendererProps };

export {
  decodeHtmlEntities,
  decodeHtmlEntitiesIfEncoded,
  escapeHtml,
  htmlToPlainText,
  isRichText,
  isSafeLink,
  plainTextToRichText,
  richTextForSave,
  richTextToPlain,
  sanitizeDescription,
  sanitizeHtmlContent,
} from './html';

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
 *
 * `autoHeight` turns JavaScript on for one app-authored script that reports the document's height; a
 * Content-Security-Policy with a per-document nonce lets only that script run, never anything in the server HTML.
 */
export const HtmlRenderer: React.FC<HtmlRendererProps> = ({
  html,
  style,
  scrollEnabled = false,
  showsVerticalScrollIndicator = false,
  autoHeight = false,
  maxHeight,
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
  const { height: windowHeight } = useWindowDimensions();
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [scriptNonce] = useState(createScriptNonce);
  const fitted = autoHeight ? fitHtmlHeight(contentHeight, maxHeight ?? windowHeight * HTML_AUTO_HEIGHT_MAX_WINDOW_SHARE) : null;
  const canScroll = fitted ? fitted.scrollEnabled : scrollEnabled;

  const fullHtml = useMemo(
    () =>
      buildHtmlDocument({
        html,
        textColor: textColor ?? colors.tokens['typography-800'],
        backgroundColor: backgroundColor ?? 'transparent',
        linkColor: linkColor ?? colors.tokens['info-600'],
        customCSS,
        scriptNonce: autoHeight ? scriptNonce : undefined,
        trailingMarkup: autoHeight ? buildHeightReporter('native', scriptNonce) : '',
      }),
    [html, textColor, backgroundColor, linkColor, customCSS, colors, autoHeight, scriptNonce]
  );

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const height = readHeightMessage(event.nativeEvent.data);

    if (height !== null) setContentHeight(height);
  }, []);

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
      style={StyleSheet.flatten([styles.container, style, fitted ? { height: fitted.height } : null])}
      originWhitelist={HTML_RENDERER_ORIGIN_WHITELIST}
      source={{ html: fullHtml }}
      scrollEnabled={canScroll}
      // Android: a WebView inside a ScrollView or sheet never gets the drag without this, so long content cannot scroll (iOS nests by default).
      nestedScrollEnabled={canScroll}
      showsVerticalScrollIndicator={fitted ? fitted.scrollEnabled || showsVerticalScrollIndicator : showsVerticalScrollIndicator}
      androidLayerType="software"
      javaScriptEnabled={autoHeight || javaScriptEnabled}
      onMessage={autoHeight ? handleMessage : undefined}
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
