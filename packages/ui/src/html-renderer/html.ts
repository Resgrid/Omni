// Platform-neutral HTML helpers (no WebView import) — safe for any consumer that only needs sanitizing.
export { buildHtmlDocument, type HtmlDocumentOptions, type HtmlRendererProps, isSafeLink, SAFE_LINK_PATTERN } from './document';
export { decodeHtmlEntities, decodeHtmlEntitiesIfEncoded, escapeHtml, looksHtmlEncoded } from './html-entities';
export { htmlToPlainText, isSafeScheme, sanitizeDescription, sanitizeHtmlContent, strictSanitizeConfig } from './html-sanitizer';
