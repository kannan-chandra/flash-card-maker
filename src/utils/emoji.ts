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

const keywordToEmoji = new Map<string, string>();
const keywordToEmojis = new Map<string, Set<string>>();
const emojiToKeywords = new Map<string, Set<string>>();

function getTamilKeywords(emoji: string): string[] {
  const exact = tamilByEmoji[emoji];
  const withoutVs = tamilByEmoji[emoji.replace(/\uFE0F/g, '')];
  const withVs = tamilByEmoji[`${emoji}\uFE0F`];
  const keywords = [...(exact?.default ?? []), ...(withoutVs?.default ?? []), ...(withVs?.default ?? [])];
  return keywords;
}

function addKeywordEmoji(keyword: string, emoji: string) {
  if (!keywordToEmoji.has(keyword)) {
    keywordToEmoji.set(keyword, emoji);
  }
  const set = keywordToEmojis.get(keyword) ?? new Set<string>();
  set.add(emoji);
  keywordToEmojis.set(keyword, set);
}

for (const item of records) {
  const inNounGroup = item.group !== undefined && NOUN_GROUPS.has(item.group);
  const inAllowedPersonSubgroup = item.subgroup !== undefined && PERSON_SUBGROUP_ORDERS.has(item.subgroup);
  if (item.type !== 1 || !item.emoji || (!inNounGroup && !inAllowedPersonSubgroup)) {
    continue;
  }

  const keywordSet = new Set<string>();
  if (item.label) {
    splitKeywords(item.label).forEach((keyword) => keywordSet.add(keyword));
  }
  for (const tag of item.tags ?? []) {
    splitKeywords(tag).forEach((keyword) => keywordSet.add(keyword));
  }
  for (const taKeyword of getTamilKeywords(item.emoji)) {
    splitKeywords(taKeyword).forEach((keyword) => keywordSet.add(keyword));
  }

  keywordSet.forEach((keyword) => {
    addKeywordEmoji(keyword, item.emoji);
    const singular = singularize(keyword);
    addKeywordEmoji(singular, item.emoji);
  });
  emojiToKeywords.set(item.emoji, keywordSet);
}

for (const override of NOUN_PERSON_OVERRIDES) {
  for (const keyword of override.keywords) {
    const normalized = normalizeWord(keyword);
    addKeywordEmoji(normalized, override.emoji);
    const existing = emojiToKeywords.get(override.emoji) ?? new Set<string>();
    existing.add(normalized);
    emojiToKeywords.set(override.emoji, existing);
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

  const exactMatches = keywordToEmojis.get(normalized);
  for (const emoji of exactMatches ?? []) {
    bump(emoji, 100);
  }

  for (const part of parts) {
    const singular = singularize(part);
    for (const emoji of keywordToEmojis.get(part) ?? []) {
      bump(emoji, 60);
    }
    for (const emoji of keywordToEmojis.get(singular) ?? []) {
      bump(emoji, 50);
    }
  }

  for (const [keyword, emojis] of keywordToEmojis.entries()) {
    if (normalized.includes(keyword)) {
      for (const emoji of emojis) {
        bump(emoji, 20);
      }
    }
  }

  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, limit))
    .map(([emoji]) => ({
      emoji,
      keywords: [...(emojiToKeywords.get(emoji) ?? [])].slice(0, 8)
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
