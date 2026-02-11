import emojiData from 'emojibase-data/en/data.json';
import emojiMessages from 'emojibase-data/en/messages.json';
import taAnnotationsJson from 'cldr-annotations-full/annotations/ta/annotations.json';

interface EmojiRecord {
  emoji: string;
  label?: string;
  tags?: string[];
  group?: number;
  subgroup?: number;
  type?: number;
}

const NOUN_GROUPS = new Set<number>([
  3, // animals & nature
  4, // food & drink
  5, // travel & places
  6, // activities
  7 // objects
]);

const PERSON_SUBGROUP_KEYS = new Set<string>(['person-role', 'person-activity', 'person-sport', 'person-resting']);

interface EmojiMessages {
  subgroups: Array<{ key: string; order: number }>;
}

interface TamilAnnotations {
  annotations: {
    annotations: Record<string, { default?: string[]; tts?: string[] }>;
  };
}
const messages = emojiMessages as EmojiMessages;
const tamilAnnotations = taAnnotationsJson as TamilAnnotations;
const tamilByEmoji = tamilAnnotations.annotations.annotations;
const PERSON_SUBGROUP_ORDERS = new Set<number>(
  messages.subgroups.filter((entry) => PERSON_SUBGROUP_KEYS.has(entry.key)).map((entry) => entry.order)
);

// Keep a few person nouns explicitly in addition to activity/occupation subgroups.
const NOUN_PERSON_OVERRIDES: Array<{ emoji: string; keywords: string[] }> = [
  { emoji: '👶', keywords: ['baby', 'infant', 'newborn'] },
  { emoji: '👦', keywords: ['boy'] },
  { emoji: '👧', keywords: ['girl'] },
  { emoji: '👨', keywords: ['man'] },
  { emoji: '👩', keywords: ['woman'] },
  { emoji: '👨‍🏫', keywords: ['teacher'] },
  { emoji: '👩‍⚕️', keywords: ['doctor', 'nurse'] }
];

const STOPWORDS = new Set<string>([
  'and',
  'or',
  'with',
  'without',
  'the',
  'a',
  'an',
  'face',
  'symbol',
  'sign',
  'button'
]);

const records = emojiData as EmojiRecord[];

function normalizeWord(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
}

function splitKeywords(value: string): string[] {
  return normalizeWord(value)
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !STOPWORDS.has(part));
}

function singularize(word: string): string {
  if (!/^[a-z]+$/.test(word)) {
    return word;
  }
  if (word.endsWith('ies') && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.endsWith('s') && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
}

const keywordToEmojis = new Map<string, Set<string>>();
const keywordToEmojiRank = new Map<string, Map<string, number>>();
const emojiToKeywords = new Map<string, string[]>();

function getTamilKeywords(emoji: string): string[] {
  const exact = tamilByEmoji[emoji];
  const withoutVs = tamilByEmoji[emoji.replace(/\uFE0F/g, '')];
  const withVs = tamilByEmoji[`${emoji}\uFE0F`];
  const keywords = [...(exact?.default ?? []), ...(withoutVs?.default ?? []), ...(withVs?.default ?? [])];
  return keywords;
}

function addKeywordEmoji(keyword: string, emoji: string, rank: number) {
  const set = keywordToEmojis.get(keyword) ?? new Set<string>();
  set.add(emoji);
  keywordToEmojis.set(keyword, set);

  const rankByEmoji = keywordToEmojiRank.get(keyword) ?? new Map<string, number>();
  const existingRank = rankByEmoji.get(emoji);
  if (existingRank === undefined || rank < existingRank) {
    rankByEmoji.set(emoji, rank);
  }
  keywordToEmojiRank.set(keyword, rankByEmoji);
}

function addEmojiKeyword(emoji: string, keyword: string): number {
  const list = emojiToKeywords.get(emoji) ?? [];
  const existingIndex = list.indexOf(keyword);
  if (existingIndex >= 0) {
    emojiToKeywords.set(emoji, list);
    return existingIndex;
  }
  list.push(keyword);
  emojiToKeywords.set(emoji, list);
  return list.length - 1;
}

function keywordRankBonus(keyword: string, emoji: string): number {
  const rank = keywordToEmojiRank.get(keyword)?.get(emoji);
  if (rank === undefined) {
    return 0;
  }
  // Earlier keywords are treated as more semantically central.
  return Math.max(0, 18 - rank * 2);
}

for (const item of records) {
  const inNounGroup = item.group !== undefined && NOUN_GROUPS.has(item.group);
  const inAllowedPersonSubgroup = item.subgroup !== undefined && PERSON_SUBGROUP_ORDERS.has(item.subgroup);
  if ((item.type !== 1 && item.type !== 0) || !item.emoji || (!inNounGroup && !inAllowedPersonSubgroup)) {
    continue;
  }

  const orderedKeywords: string[] = [];
  const seenKeywords = new Set<string>();
  const pushKeyword = (keyword: string) => {
    if (!seenKeywords.has(keyword)) {
      seenKeywords.add(keyword);
      orderedKeywords.push(keyword);
    }
  };
  if (item.label) {
    splitKeywords(item.label).forEach((keyword) => pushKeyword(keyword));
  }
  for (const tag of item.tags ?? []) {
    splitKeywords(tag).forEach((keyword) => pushKeyword(keyword));
  }
  for (const taKeyword of getTamilKeywords(item.emoji)) {
    splitKeywords(taKeyword).forEach((keyword) => pushKeyword(keyword));
  }

  orderedKeywords.forEach((keyword) => {
    const rank = addEmojiKeyword(item.emoji, keyword);
    addKeywordEmoji(keyword, item.emoji, rank);
    const singular = singularize(keyword);
    const singularRank = addEmojiKeyword(item.emoji, singular);
    addKeywordEmoji(singular, item.emoji, singularRank);
  });
}

for (const override of NOUN_PERSON_OVERRIDES) {
  for (const keyword of override.keywords) {
    const normalized = normalizeWord(keyword);
    const rank = addEmojiKeyword(override.emoji, normalized);
    addKeywordEmoji(normalized, override.emoji, rank);
  }
}

export function findEmojiForWord(word: string): string | null {
  return findTopEmojiMatches(word, 1)[0]?.emoji ?? null;
}

export function findTopEmojiMatches(word: string, limit = 5): Array<{ emoji: string; keywords: string[] }> {
  const normalized = normalizeWord(word);
  if (!normalized) {
    return [];
  }

  const score = new Map<string, number>();
  const parts = normalized.split(' ').filter(Boolean);

  const bump = (emoji: string, points: number) => {
    score.set(emoji, (score.get(emoji) ?? 0) + points);
  };

  const bumpByKeyword = (keyword: string, basePoints: number) => {
    for (const emoji of keywordToEmojis.get(keyword) ?? []) {
      bump(emoji, basePoints + keywordRankBonus(keyword, emoji));
    }
  };

  const exactMatches = keywordToEmojis.get(normalized);
  for (const emoji of exactMatches ?? []) {
    bump(emoji, 100 + keywordRankBonus(normalized, emoji));
  }

  for (const part of parts) {
    const singular = singularize(part);
    bumpByKeyword(part, 60);
    bumpByKeyword(singular, 50);
  }

  for (const [keyword, emojis] of keywordToEmojis.entries()) {
    if (normalized.includes(keyword)) {
      for (const emoji of emojis) {
        bump(emoji, 20 + keywordRankBonus(keyword, emoji));
      }
    }
  }

  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, limit))
    .map(([emoji]) => ({
      emoji,
      keywords: (emojiToKeywords.get(emoji) ?? []).slice(0, 8)
    }));
}

export function createEmojiImageDataUrl(emoji: string, size = 512): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas unavailable');
  }

  context.clearRect(0, 0, size, size);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `${Math.floor(size * 0.72)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  context.fillText(emoji, size / 2, size / 2);
  return canvas.toDataURL('image/png');
}
