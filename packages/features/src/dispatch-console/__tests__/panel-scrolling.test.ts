import fs from 'fs';
import path from 'path';

/**
 * On a phone the console stacks its panels in one vertical ScrollView, each panel capped in height. Android hands a drag
 * to a scroll view inside another one only with `nestedScrollEnabled`, so every list a panel scrolls must set it, or a
 * long list (units, notes, the activity log) cannot be scrolled by touch there.
 */
const COMPONENTS = path.resolve(__dirname, '..', 'components');

const sources = fs
  .readdirSync(COMPONENTS)
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => ({ file: name, text: fs.readFileSync(path.join(COMPONENTS, name), 'utf8') }));

/** The opening tag starting at `start`: up to the first `>` outside braces (props hold arrow functions and JSX). */
const openingTag = (text: string, start: number): string => {
  let depth = 0;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (char === '{') depth++;
    else if (char === '}') depth--;
    else if (char === '>' && depth === 0) return text.slice(start, index + 1);
  }

  return text.slice(start);
};

describe('dispatch console panel scrolling', () => {
  it('lets every panel list scroll inside the phone layout (nestedScrollEnabled)', () => {
    const scrollers = sources.flatMap(({ file, text }) => [...text.matchAll(/<(FlatList|FlashList|ScrollView|SectionList)\b/g)].map((match) => ({ file, tag: openingTag(text, match.index) })));

    expect(scrollers.length).toBeGreaterThan(0);
    expect(scrollers.filter(({ tag }) => !/\bnestedScrollEnabled\b/.test(tag)).map(({ file, tag }) => `${file}: ${tag.split('\n')[0]}`)).toEqual([]);
  });
});
