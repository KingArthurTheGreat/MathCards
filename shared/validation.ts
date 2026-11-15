import { z } from 'zod';
import { cardTypes, type Doc } from './model';
export const id = z.string().uuid();
export const ids = z.array(id).max(20000);
const name = z.string().trim().min(1, 'Введите название').max(300);
export const mediaName = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;
const nodeTypes = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
  'image',
  'inlineMath',
  'blockMath',
]);
function validNode(n: unknown, depth = 0): boolean {
  if (!n || typeof n !== 'object' || depth > 30) return false;
  const node = n as Doc;
  if (node.content !== undefined && !Array.isArray(node.content)) return false;
  if (node.marks !== undefined && !Array.isArray(node.marks)) return false;
  if (
    node.attrs !== undefined &&
    (!node.attrs || typeof node.attrs !== 'object' || Array.isArray(node.attrs))
  )
    return false;
  if (
    !nodeTypes.has(node.type) ||
    (node.text !== undefined && (typeof node.text !== 'string' || node.type !== 'text'))
  )
    return false;
  if (node.type === 'text' && (typeof node.text !== 'string' || node.text.length === 0))
    return false;
  if (
    ['image', 'inlineMath', 'blockMath', 'text', 'hardBreak', 'horizontalRule'].includes(
      node.type,
    ) &&
    node.content?.length
  )
    return false;
  if (node.type === 'heading' && ![1, 2, 3, 4, 5, 6].includes(Number(node.attrs?.level)))
    return false;
  const inline = new Set(['text', 'inlineMath', 'hardBreak']);
  const blocks = new Set([
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'blockquote',
    'codeBlock',
    'horizontalRule',
    'image',
    'blockMath',
  ]);
  if (node.content && Array.isArray(node.content)) {
    if (
      ['doc', 'blockquote', 'listItem'].includes(node.type) &&
      node.content.some((c) => !blocks.has(c.type))
    )
      return false;
    if (
      ['paragraph', 'heading'].includes(node.type) &&
      node.content.some((c) => !inline.has(c.type))
    )
      return false;
    if (
      ['bulletList', 'orderedList'].includes(node.type) &&
      node.content.some((c) => c.type !== 'listItem')
    )
      return false;
    if (node.type === 'codeBlock' && node.content.some((c) => c.type !== 'text')) return false;
  }
  if (
    node.marks &&
    (!Array.isArray(node.marks) ||
      node.marks.some((m) => !['bold', 'italic', 'strike', 'code', 'underline'].includes(m.type)))
  )
    return false;
  if (
    node.attrs &&
    (typeof node.attrs !== 'object' ||
      Object.values(node.attrs).some(
        (v) => v !== null && !['string', 'number', 'boolean'].includes(typeof v),
      ))
  )
    return false;
  if (
    node.type === 'image' &&
    !/^media:\/\/image\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(String(node.attrs?.src))
  )
    return false;
  if (
    node.type === 'image' &&
    node.attrs?.width !== undefined &&
    (typeof node.attrs.width !== 'number' || node.attrs.width < 10 || node.attrs.width > 100)
  )
    return false;
  if (
    ['inlineMath', 'blockMath'].includes(node.type) &&
    (typeof node.attrs?.latex !== 'string' || node.attrs.latex.length > 10000)
  )
    return false;
  return (
    !node.content ||
    (Array.isArray(node.content) && node.content.every((c) => validNode(c, depth + 1)))
  );
}
export const docSchema = z.custom<Doc>((v) => {
  try {
    return JSON.stringify(v).length <= 2_000_000 && (v as Doc)?.type === 'doc' && validNode(v);
  } catch {
    return false;
  }
}, 'Некорректное содержимое карточки');
export const cardSchema = z.object({
  id: id.optional(),
  deckId: id,
  title: name,
  type: z.enum(cardTypes),
  front: docSchema,
  back: docSchema,
  tags: z.array(z.string().trim().min(1).max(80)).max(50),
});
export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  onboarded: z.boolean(),
});
export const schemas = {
  snapshot: z.undefined(),
  saveDeck: z.object({ id: id.optional(), name, description: z.string().max(3000) }),
  openDeck: z.object({ id }),
  deleteDeck: z.object({ id }),
  saveCard: cardSchema,
  deleteCards: z.object({ ids }),
  duplicateCard: z.object({ id }),
  moveCards: z.object({ ids, deckId: id }),
  saveCollection: z.object({ id: id.optional(), name, cardIds: ids }),
  deleteCollection: z.object({ id }),
  startSession: z.object({ cardIds: ids.min(1) }),
  rateCard: z.object({ sessionId: id, cardId: id, rating: z.enum(['unknown', 'hard', 'known']) }),
  endSession: z.object({ id }),
  settings: settingsSchema,
  demo: z.object({ action: z.enum(['install', 'remove', 'skip']) }),
  addImage: z.object({
    bytes: z
      .array(z.number().int().min(0).max(255))
      .min(12)
      .max(20 * 1024 * 1024),
  }),
  export: z.object({ deckIds: ids }),
  import: z.undefined(),
};
