export const cardTypes = ['Определение', 'Теорема', 'Доказательство', 'Другое'] as const;
export type CardType = (typeof cardTypes)[number];
export type Rating = 'unknown' | 'hard' | 'known';
export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null>;
  content?: RichNode[];
  marks?: { type: string }[];
}
export type Doc = RichNode;
export const emptyDoc = (): Doc => ({ type: 'doc', content: [{ type: 'paragraph' }] });
export interface Deck {
  id: string;
  name: string;
  description: string;
  demo: boolean;
  createdAt: string;
  openedAt: string | null;
}
export interface Card {
  id: string;
  deckId: string;
  title: string;
  type: CardType;
  front: Doc;
  back: Doc;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastRating: Rating | null;
  reviewCount: number;
}
export interface Collection {
  id: string;
  name: string;
  cardIds: string[];
}
export interface StudySession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  cardIds: string[];
  results: { cardId: string; rating: Rating; reviewedAt: string }[];
}
export interface Settings {
  theme: 'light' | 'dark' | 'system';
  onboarded: boolean;
}
export interface Snapshot {
  decks: Deck[];
  cards: Card[];
  collections: Collection[];
  sessions: StudySession[];
  settings: Settings;
  dataPath: string;
}
export interface CardInput {
  id?: string;
  deckId: string;
  title: string;
  type: CardType;
  front: Doc;
  back: Doc;
  tags: string[];
}
export interface Commands {
  snapshot: { input: undefined; output: Snapshot };
  saveDeck: { input: { id?: string; name: string; description: string }; output: string };
  openDeck: { input: { id: string }; output: void };
  deleteDeck: { input: { id: string }; output: void };
  saveCard: { input: CardInput; output: string };
  deleteCards: { input: { ids: string[] }; output: void };
  duplicateCard: { input: { id: string }; output: string };
  moveCards: { input: { ids: string[]; deckId: string }; output: void };
  saveCollection: { input: { id?: string; name: string; cardIds: string[] }; output: string };
  deleteCollection: { input: { id: string }; output: void };
  startSession: { input: { cardIds: string[] }; output: string };
  rateCard: { input: { sessionId: string; cardId: string; rating: Rating }; output: void };
  endSession: { input: { id: string }; output: void };
  settings: { input: Settings; output: void };
  demo: { input: { action: 'install' | 'remove' | 'skip' }; output: void };
  addImage: { input: { bytes: number[] }; output: string };
  export: { input: { deckIds: string[] }; output: boolean };
  import: { input: undefined; output: number | null };
}
export interface Bridge {
  invoke<K extends keyof Commands>(
    command: K,
    payload: Commands[K]['input'],
  ): Promise<Commands[K]['output']>;
}
declare global {
  interface Window {
    mathcards: Bridge;
  }
}
export function imageIds(doc: Doc): string[] {
  return [
    ...new Set([
      ...(doc.type === 'image' ? [String(doc.attrs?.src).replace('media://image/', '')] : []),
      ...(doc.content ?? []).flatMap(imageIds),
    ]),
  ];
}
export function plainText(doc: Doc): string {
  return [doc.text ?? '', doc.attrs?.latex ?? '', ...(doc.content ?? []).map(plainText)].join(' ');
}
