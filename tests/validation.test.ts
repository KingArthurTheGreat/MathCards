import { expect, it } from 'vitest';
import { docSchema } from '../shared/validation';
import katex from 'katex';
import { demoDecks } from '../shared/demo';
import type { Doc } from '../shared/model';
it('rejects malformed rich text that could crash renderer or editor', () => {
  for (const value of [0, false, '', null]) {
    expect(docSchema.safeParse({ type: 'doc', content: value }).success).toBe(false);
    expect(
      docSchema.safeParse({ type: 'doc', content: [{ type: 'paragraph', marks: value }] }).success,
    ).toBe(false);
  }
  expect(docSchema.safeParse({ type: 'doc', content: [{ type: 'text' }] }).success).toBe(false);
  expect(
    docSchema.safeParse({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { src: 'https://example.com/image.png' } }],
        },
      ],
    }).success,
  ).toBe(false);
});
it('renders every demo formula without KaTeX errors', () => {
  let count = 0;
  function verify(doc: Doc) {
    if (doc.type === 'blockMath' || doc.type === 'inlineMath') {
      expect(() =>
        katex.renderToString(String(doc.attrs?.latex), { throwOnError: true, trust: false }),
      ).not.toThrow();
      count++;
    }
    doc.content?.forEach(verify);
  }
  for (const deck of demoDecks)
    for (const card of deck.cards) {
      expect(docSchema.safeParse(card.front).success).toBe(true);
      expect(docSchema.safeParse(card.back).success).toBe(true);
      verify(card.front);
      verify(card.back);
    }
  expect(count).toBe(7);
});
