import { isRichText, plainTextToRichText, richTextForSave, richTextToPlain } from '../html-sanitizer';

describe('richTextToPlain', () => {
  it('drops editor markup and keeps the line breaks it implied', () => {
    expect(richTextToPlain('Call TEST 10-7-2026\n<div dir="ltr">JUST A TEST!</div>\n')).toBe('Call TEST 10-7-2026\nJUST A TEST!');
    expect(richTextToPlain('<p>Structure <b>fire</b></p><p>2nd floor<br/>rear</p>')).toBe('Structure fire\n2nd floor\nrear');
    expect(richTextToPlain('<ul><li>Engine 1</li><li class="x">Ladder 2</li></ul>')).toBe('• Engine 1\n• Ladder 2');
    expect(richTextToPlain('<p>JUST A TEST!</p>')).toBe('JUST A TEST!');
  });

  it('keeps table cells apart: a tab between the cells of a row, a line per row', () => {
    expect(richTextToPlain('<table><tr><td>Road</td><td>Closed</td></tr></table>')).toBe('Road\tClosed');
    expect(richTextToPlain('<table><thead><tr><th>Unit</th>\n<th class="x">Status</th></tr></thead><tbody><tr><td>E1</td><td><b>On scene</b></td></tr></tbody></table>')).toBe('Unit\tStatus\nE1\tOn scene');
  });

  it('decodes entities, including a value that arrives entity-encoded', () => {
    expect(richTextToPlain('<div>Fire &amp; EMS&nbsp;at "Main" St</div>')).toBe('Fire & EMS at "Main" St');
    expect(richTextToPlain('&lt;div&gt;Medical&lt;/div&gt;')).toBe('Medical');
    // Core's sanitizer encodes plain-text fields too (a call's name).
    expect(richTextToPlain('Smith &amp; Sons &lt;Rear&gt;')).toBe('Smith & Sons <Rear>');
  });

  it("keeps the assistant's own placeholders", () => {
    const help = 'C<id>: call detail (e.g. C1445)\nDISPATCH <details>: create a new call\nSET UNIT <number or name> TO <status>';

    expect(richTextToPlain(help)).toBe(help);
    expect(richTextToPlain('<div>Text C<id> for details</div>')).toBe('Text C<id> for details');
  });
});

describe('isRichText', () => {
  it('is true only for the editor formatting tags', () => {
    expect(isRichText('<p>JUST A TEST!</p>')).toBe(true);
    expect(isRichText('&lt;p&gt;JUST A TEST!&lt;/p&gt;')).toBe(true);
    expect(isRichText('Smith &amp; Sons')).toBe(false);
    expect(isRichText('SET UNIT <number or name> TO <status>')).toBe(false);
    expect(isRichText('')).toBe(false);
  });
});

describe('plainTextToRichText', () => {
  it('writes one paragraph per line and escapes the text', () => {
    expect(plainTextToRichText('Fire & EMS\n\n<Rear> door')).toBe('<p>Fire &amp; EMS</p><p><br></p><p>&lt;Rear&gt; door</p>');
  });

  it('reads back as the same text', () => {
    const text = 'Structure fire\n2nd floor\n\nSmoke from the "rear"';

    expect(richTextToPlain(plainTextToRichText(text))).toBe(text);
  });
});

describe('richTextForSave', () => {
  const stored = '<p><strong>Structure</strong> fire</p><ul><li>Engine 1</li></ul>';

  it('sends the stored rich text when the text was left as loaded', () => {
    expect(richTextForSave(richTextToPlain(stored), stored)).toBe(stored);
    expect(richTextForSave(`  ${richTextToPlain(stored)}\n`, stored)).toBe(stored);
  });

  it('sends changed text as paragraphs on a field stored as rich text', () => {
    expect(richTextForSave('Structure fire\nEngine 1 & Ladder 2', stored)).toBe('<p>Structure fire</p><p>Engine 1 &amp; Ladder 2</p>');
  });

  it('sends the text as typed on a field stored as plain text, blank or missing', () => {
    expect(richTextForSave('Smith & Sons', 'Smith &amp; Sons')).toBe('Smith & Sons');
    expect(richTextForSave('Line 1\nLine 2', 'Line 1')).toBe('Line 1\nLine 2');
    expect(richTextForSave('New', '')).toBe('New');
    expect(richTextForSave('New', null)).toBe('New');
    expect(richTextForSave('New', undefined)).toBe('New');
  });

  it('keeps a blank as a blank', () => {
    expect(richTextForSave('', stored)).toBe('');
    expect(richTextForSave('  ', stored)).toBe('  ');
  });
});
