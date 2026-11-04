/**
 * HTML sanitizer for API-supplied content rendered inside WebViews.
 *
 * Fields like call Nature, call/contact notes and protocol text are authored server-side
 * and rendered as real markup, so they must be sanitized before injection — otherwise a
 * crafted note is script execution inside the WebView. Mirrors the strict allowlist used
 * by the Responder app so the apps stay consistent.
 */

import sanitizeHtmlLib from 'sanitize-html';

import { decodeHtmlEntities, decodeHtmlEntitiesIfEncoded, escapeHtml } from './html-entities';

/**
 * Checks if a URL scheme is safe (not javascript:, vbscript: or data:)
 */
export function isSafeScheme(url: string): boolean {
  if (!url) return false;
  // Browsers ignore ASCII whitespace and control characters inside a scheme ("java<TAB>script:"), so drop them before checking.

  const normalizedUrl = url.replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase();

  return !normalizedUrl.startsWith('javascript:') && !normalizedUrl.startsWith('data:') && !normalizedUrl.startsWith('vbscript:');
}

/**
 * Filters attributes to remove dangerous ones (on* events, unsafe styles)
 */
function filterDangerousAttributes(tag: string, name: string, value: string): boolean {
  // Block all event handlers (onclick, onload, etc.)
  if (name.toLowerCase().startsWith('on')) {
    return false;
  }

  // Block style attributes with expressions or javascript
  if (name.toLowerCase() === 'style') {
    const normalizedValue = value.toLowerCase();

    if (normalizedValue.includes('expression(') || normalizedValue.includes('javascript:')) {
      return false;
    }
  }

  // For URL attributes, ensure safe schemes
  if (['href', 'src', 'srcset', 'srcdoc'].includes(name.toLowerCase())) {
    return isSafeScheme(value);
  }

  return true;
}

// Strict sanitization configuration with explicit allowlist
export const strictSanitizeConfig: sanitizeHtmlLib.IOptions = {
  // Allow only safe HTML tags - strict allowlist (includes table tags for webview compatibility)
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'span',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'blockquote',
    'pre',
    'code',
    // Table tags for webview compatibility
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    // Additional formatting tags
    'hr',
    's',
    'small',
    'sub',
    'sup',
    'dl',
    'dt',
    'dd',
  ],

  // Allow only safe attributes - strict allowlist with filtering
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    span: ['style'],
    div: ['style'],
    p: ['style'],
    table: ['width', 'cellpadding', 'cellspacing'],
    th: ['scope', 'colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
    '*': ['class'],
  },

  // Allow only safe URL schemes
  allowedSchemes: ['http', 'https', 'mailto'],

  // Specific schemes allowed per tag
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto'],
    img: ['http', 'https'],
  },

  // Disallow unknown tags (strict mode)
  disallowedTagsMode: 'discard',

  // Additional security options
  allowedIframeHostnames: [], // No iframes allowed
  allowedScriptHostnames: [], // No scripts allowed

  // Style attribute options - very restrictive
  allowedStyles: {
    '*': {
      color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/],
      'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
      'font-size': [/^\d+(?:px|em|%)$/],
      'font-weight': [/^(?:normal|bold|bolder|lighter|\d+)$/],
      margin: [/^\d+(?:px|em|%)$/],
      padding: [/^\d+(?:px|em|%)$/],
    },
  },

  // Remove empty elements and dangerous tags
  nonTextTags: ['style', 'script', 'textarea', 'option'],

  // Transform tags for better security and validation
  transformTags: {
    a: (tagName, attribs) => {
      // Validate href attribute and remove if unsafe
      if (attribs.href && !isSafeScheme(attribs.href)) {
        delete attribs.href;
      }

      // Filter out dangerous attributes
      const filteredAttribs: Record<string, string> = {};
      Object.entries(attribs).forEach(([name, value]) => {
        if (filterDangerousAttributes(tagName, name, value)) {
          filteredAttribs[name] = value;
        }
      });

      return {
        tagName: 'a',
        attribs: {
          ...filteredAttribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      };
    },
    img: (tagName, attribs) => {
      // Validate src attribute and remove if unsafe
      if (attribs.src && !isSafeScheme(attribs.src)) {
        delete attribs.src;
      }

      // Filter out dangerous attributes
      const filteredAttribs: Record<string, string> = {};
      Object.entries(attribs).forEach(([name, value]) => {
        if (filterDangerousAttributes(tagName, name, value)) {
          filteredAttribs[name] = value;
        }
      });

      return {
        tagName: 'img',
        attribs: filteredAttribs,
      };
    },
    // Apply filtering to all other tags
    '*': (tagName, attribs) => {
      const filteredAttribs: Record<string, string> = {};
      Object.entries(attribs).forEach(([name, value]) => {
        if (filterDangerousAttributes(tagName, name, value)) {
          filteredAttribs[name] = value;
        }
      });

      return {
        tagName,
        attribs: filteredAttribs,
      };
    },
  },
};

/**
 * Sanitizes API-supplied HTML for safe injection into a WebView document.
 *
 * Entity-decoding happens first because some fields arrive encoded (`&lt;p&gt;…`);
 * decoding after sanitizing would let an encoded payload slip through untouched.
 */
export const sanitizeHtmlContent = (html: string): string => {
  if (!html) {
    return '';
  }

  return sanitizeHtmlLib(decodeHtmlEntitiesIfEncoded(html), strictSanitizeConfig);
};

/** Sanitized HTML with surrounding whitespace trimmed (Responder's calendar descriptions). */
export function sanitizeDescription(input: string): string {
  return sanitizeHtmlContent(input).trim();
}

/**
 * Plain text from HTML (all tags stripped) — for previews, list rows and accessibility labels. sanitize-html escapes its
 * text output (`&` → `&amp;`); the result is decoded once more because it is rendered as text, never as HTML.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';

  return decodeHtmlEntities(sanitizeHtmlLib(decodeHtmlEntitiesIfEncoded(html), { allowedTags: [], allowedAttributes: {} })).trim();
}

// Formatting tags the web's rich-text editor (Quill) and Core's sanitizer write: call natures and notes, messages,
// calendar and shift descriptions. An allowlist rather than `<[^>]+>`: plain text such as the assistant's own `C<id>`,
// `<details>` and `<number or name>` placeholders must survive.
const FORMATTING_TAGS = 'a|b|blockquote|br|center|code|div|em|font|h[1-6]|hr|i|img|li|ol|p|pre|s|small|span|strike|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul';
const FORMATTING_TAG = new RegExp(`</?(?:${FORMATTING_TAGS})(?:\\s[^<>]*)?/?>`, 'gi');
const HAS_FORMATTING_TAG = new RegExp(FORMATTING_TAG.source, 'i');
const LINE_BREAK = /<br\s*\/?>(?:\r?\n)?/gi;
const BLOCK_END = /<\/(?:blockquote|div|h[1-6]|li|ol|p|pre|table|tr|ul)>(?:\r?\n)?/gi;
const LIST_ITEM = /<li(?:\s[^<>]*)?>/gi;

/** Whether the value is rich text (it has the editor's formatting tags), entity-encoded or not. */
export const isRichText = (text: string): boolean => HAS_FORMATTING_TAG.test(decodeHtmlEntitiesIfEncoded(text));

/**
 * Rich text as plain text, for a text input or a text view: line breaks and list bullets kept, formatting tags dropped,
 * entities decoded (Core's sanitizer writes `&amp;` even in plain-text fields such as a call's name).
 */
export const richTextToPlain = (text: string): string => {
  const markup = decodeHtmlEntitiesIfEncoded(text);

  if (!HAS_FORMATTING_TAG.test(markup)) return decodeHtmlEntities(markup);
  const plain = markup.replace(LINE_BREAK, '\n').replace(BLOCK_END, '\n').replace(LIST_ITEM, '• ').replace(FORMATTING_TAG, '');

  return decodeHtmlEntities(plain)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/** Plain text as the rich text the web's editor writes: one paragraph per line, an empty line as an empty paragraph. */
export const plainTextToRichText = (text: string): string =>
  text
    .split(/\r?\n/)
    .map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`)
    .join('');

/**
 * A rich-text field (a call's nature or note) as a save sends it after a form edited it as plain text
 * (`richTextToPlain`). The field keeps the format it is stored in:
 * - left as loaded: the stored rich text, so the formatting the web gave it (bold, lists, links) survives an edit of
 *   another field;
 * - changed: the edited text as paragraphs, so its line breaks still show on the web and in the apps' rich-text views;
 * - stored as plain text, or blanked: the text as typed (a blank keeps meaning "blank" to the server).
 */
export function richTextForSave(edited: string, stored: string | null | undefined): string {
  const original = stored ?? '';
  const text = edited.trim();

  if (!text || !isRichText(original)) return edited;

  return text === richTextToPlain(original) ? original : plainTextToRichText(text);
}
