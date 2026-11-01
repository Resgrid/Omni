import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { useThemeColors } from '../theme/use-theme-colors';
import { useTranslation } from '../utils/i18n';
import { buildHtmlDocument, type HtmlRendererProps, isSafeLink } from './document';

export type { HtmlRendererProps };
export { decodeHtmlEntitiesIfEncoded, escapeHtml, htmlToPlainText, isSafeLink, sanitizeDescription, sanitizeHtmlContent } from './html';

/**
 * The iframe sandbox. `allow-scripts` runs only our link interceptor below (the sanitizer strips every
 * script from server HTML). `allow-same-origin` must NEVER be added: combined with srcDoc it gives the
 * server-supplied HTML this origin — the app's web storage, cookies and auth tokens (IC's bug). Without it
 * the iframe runs on an opaque origin, isolated from the app.
 */
export const HTML_RENDERER_IFRAME_SANDBOX = 'allow-scripts';

const LINK_MESSAGE_TYPE = 'html-renderer-link';

// Intercepts link clicks and asks the parent to open them; the parent validates the scheme and the sender.
const LINK_INTERCEPTOR = `<script>
  document.addEventListener('click', function (e) {
    var anchor = e.target && e.target.closest ? e.target.closest('a') : null;
    if (anchor && anchor.href) {
      e.preventDefault();
      window.parent.postMessage({ type: '${LINK_MESSAGE_TYPE}', url: anchor.href }, '*');
    }
  });
</script>`;

/**
 * Server HTML renderer (Unit baseline) — **web & Electron** variant. Renders inside a sandboxed `<iframe>`
 * via `srcDoc` on an opaque origin; input always goes through `sanitizeHtmlContent()`; links open only for
 * http/https/mailto, through `onLinkPress` or a new browser window.
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
  testID = 'html-renderer',
}) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fullHtml = useMemo(
    () =>
      buildHtmlDocument({
        html,
        textColor: textColor ?? colors.tokens['typography-800'],
        backgroundColor: backgroundColor ?? 'transparent',
        linkColor: linkColor ?? colors.tokens['info-600'],
        customCSS,
        scrollEnabled,
        showsVerticalScrollIndicator,
        trailingMarkup: LINK_INTERCEPTOR,
        includeCharset: true,
        controlOverflow: true,
      }),
    [html, textColor, backgroundColor, linkColor, customCSS, scrollEnabled, showsVerticalScrollIndicator, colors]
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      // Only accept messages from our own iframe (its origin is opaque, 'null', so check the source window).
      const frameWindow = iframeRef.current?.contentWindow;
      if (!data || data.type !== LINK_MESSAGE_TYPE || !frameWindow || event.source !== frameWindow) {
        return;
      }
      const url = typeof data.url === 'string' ? data.url : '';
      // A crafted anchor could otherwise hand us a javascript: or data: URL.
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

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const iframeStyle: React.CSSProperties = {
    border: 'none',
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    colorScheme: 'normal',
  };

  return (
    <View style={StyleSheet.flatten([styles.container, style])} key={rendererKey} testID={testID}>
      <iframe
        ref={iframeRef}
        srcDoc={fullHtml}
        sandbox={HTML_RENDERER_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
        title={t('common.html_content', { defaultValue: 'Content' })}
        style={iframeStyle}
        data-testid={`${testID}-iframe`}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'transparent',
  },
});
