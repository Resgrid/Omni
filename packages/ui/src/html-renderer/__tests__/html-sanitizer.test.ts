import { decodeHtmlEntitiesIfEncoded, escapeHtml, looksHtmlEncoded } from '../html-entities';
import { htmlToPlainText, isSafeScheme, sanitizeHtmlContent } from '../html-sanitizer';

describe('sanitizeHtmlContent', () => {
  it('returns an empty string for empty input', () => {
    expect(sanitizeHtmlContent('')).toBe('');
  });

  it('preserves safe formatting markup', () => {
    const result = sanitizeHtmlContent('<p>Engine <strong>fully</strong> staffed</p>');

    expect(result).toContain('<strong>fully</strong>');
    expect(result).toContain('Engine');
  });

  it('drops script tags and their contents', () => {
    const result = sanitizeHtmlContent('<p>before</p><script>alert(1)</script><p>after</p>');

    expect(result).not.toContain('script');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('before');
    expect(result).toContain('after');
  });

  it('drops style blocks, iframes, forms and meta refreshes', () => {
    const result = sanitizeHtmlContent(
      '<style>body{display:none}</style><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input name="p"></form><meta http-equiv="refresh" content="0;url=https://evil.test"><p>ok</p>'
    );

    expect(result).not.toMatch(/<style|<iframe|<form|<input|<meta/i);
    expect(result).not.toContain('display:none');
    expect(result).toContain('ok');
  });

  it('strips inline event handlers', () => {
    const result = sanitizeHtmlContent('<p onclick="steal()">tap me</p><img src="https://x.test/a.png" onerror="steal()" /><a href="https://x.test" onmouseover="steal()">x</a>');

    expect(result).not.toMatch(/on(click|error|mouseover)/i);
    expect(result).not.toContain('steal');
    expect(result).toContain('tap me');
  });

  it('removes javascript:, vbscript: and data: URLs from links and images', () => {
    const result = sanitizeHtmlContent(
      '<a href="javascript:alert(1)">a</a><a href=" JaVaScRiPt:alert(2)">b</a><a href="vbscript:msgbox(1)">c</a><img src="data:image/svg+xml;base64,PHN2Zz4=" /><a href="data:text/html,<script>alert(3)</script>">d</a>'
    );

    expect(result).not.toMatch(/javascript:|vbscript:|data:/i);
    expect(result).toContain('a');
  });

  it('keeps http, https and mailto links and drops other schemes', () => {
    const result = sanitizeHtmlContent('<a href="https://resgrid.com">site</a> <a href="mailto:ops@example.com">mail</a> <a href="tel:911">call</a>');

    expect(result).toContain('href="https://resgrid.com"');
    expect(result).toContain('href="mailto:ops@example.com"');
    expect(result).not.toContain('tel:');
    // target/rel are not in the attribute allowlist; HtmlRenderer intercepts every link itself.
    expect(result).not.toContain('target=');
  });

  it('keeps allowlisted style properties only', () => {
    const result = sanitizeHtmlContent('<p style="color: #ff0000; width: 100px; position: fixed">x</p>');

    expect(result).toContain('color:#ff0000');
    expect(result).not.toMatch(/width|position/);
  });

  it('drops the whole style attribute when it carries script or expressions', () => {
    const result = sanitizeHtmlContent('<p style="color: #ff0000; background-image: url(javascript:alert(1)); width: expression(alert(1))">x</p>');

    expect(result).toBe('<p>x</p>');
  });

  // The API returns some fields entity-encoded. Decoding has to happen before sanitizing,
  // otherwise an encoded payload passes through untouched and is revived as live markup.
  it('sanitizes payloads that arrive HTML-entity-encoded', () => {
    const result = sanitizeHtmlContent('&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;alert(2)&lt;/script&gt;');

    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(1)');
    expect(result).not.toContain('alert(2)');
    expect(result).not.toContain('<script');
  });

  it('renders entity-encoded markup as real tags', () => {
    const result = sanitizeHtmlContent('&lt;p&gt;Structure fire&lt;/p&gt;');

    expect(result).toContain('<p>');
    expect(result).toContain('Structure fire');
  });

  it('leaves entities alone when the value already contains real markup', () => {
    const result = sanitizeHtmlContent('<p>Smith &amp; Sons</p>');

    expect(result).toContain('&amp;');
    expect(result).toContain('<p>');
  });

  it('does not throw on numeric entities outside the Unicode range', () => {
    expect(() => sanitizeHtmlContent('&lt;p&gt;&#1114112;&#x110000;&#99999999999999999999999;&lt;/p&gt;')).not.toThrow();
    expect(sanitizeHtmlContent('&lt;p&gt;bad &#1114112; tail&lt;/p&gt;')).toContain('tail');
  });

  it('leaves surrogate-range numeric entities undecoded', () => {
    expect(sanitizeHtmlContent('&lt;p&gt;&#xD800;&#55296;&lt;/p&gt;')).not.toMatch(/[\uD800-\uDFFF]/);
  });

  it('still decodes valid decimal and hexadecimal entities', () => {
    const result = sanitizeHtmlContent('&lt;p&gt;&#65;&#x42;&#128664;&lt;/p&gt;');

    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('\u{1F698}');
  });
});

describe('isSafeScheme', () => {
  it('rejects scripting and data schemes even when obfuscated with whitespace or case', () => {
    expect(isSafeScheme('javascript:alert(1)')).toBe(false);
    expect(isSafeScheme(' JAVASCRIPT:alert(1)')).toBe(false);
    expect(isSafeScheme('java\tscript:alert(1)')).toBe(false);
    expect(isSafeScheme('vbscript:x')).toBe(false);
    expect(isSafeScheme('data:text/html,x')).toBe(false);
    expect(isSafeScheme('')).toBe(false);
  });

  it('accepts ordinary URLs', () => {
    expect(isSafeScheme('https://resgrid.com/a')).toBe(true);
    expect(isSafeScheme('mailto:a@b.c')).toBe(true);
  });
});

describe('html entities', () => {
  it('detects entity-encoded markup only when there are no real tags', () => {
    expect(looksHtmlEncoded('&lt;p&gt;x&lt;/p&gt;')).toBe(true);
    expect(looksHtmlEncoded('<p>&lt;</p>')).toBe(false);
    expect(decodeHtmlEntitiesIfEncoded('Smith &amp; Sons')).toBe('Smith &amp; Sons');
  });

  it('escapes the characters that can start markup or leave an attribute', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml('plain text')).toBe('plain text');
  });

  it('extracts plain text from (possibly encoded) HTML', () => {
    expect(htmlToPlainText('<p>Structure <b>fire</b></p><script>x()</script>')).toBe('Structure fire');
    expect(htmlToPlainText('&lt;p&gt;Medical&lt;/p&gt;')).toBe('Medical');
    expect(htmlToPlainText('')).toBe('');
  });

  it('returns text, not escaped markup: ampersands and quotes come back as typed', () => {
    expect(htmlToPlainText('<p>Fire &amp; EMS at "Main" St</p>')).toBe('Fire & EMS at "Main" St');
    expect(htmlToPlainText('Smith & Sons <i>Hardware</i>')).toBe('Smith & Sons Hardware');
  });
});
