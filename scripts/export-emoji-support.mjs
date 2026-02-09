import fs from 'node:fs';
import emojiData from 'emojibase-data/en/data.json' with { type: 'json' };
import emojiMessages from 'emojibase-data/en/messages.json' with { type: 'json' };

const NOUN_GROUPS = new Set([3, 4, 5, 6, 7]);
const PERSON_SUBGROUP_KEYS = new Set(['person-role', 'person-activity', 'person-sport', 'person-resting']);
const PERSON_SUBGROUP_ORDERS = new Set(
  emojiMessages.subgroups.filter((entry) => PERSON_SUBGROUP_KEYS.has(entry.key)).map((entry) => entry.order)
);
const OVERRIDES = [
  { emoji: '👶', keywords: ['baby', 'infant', 'newborn'] },
  { emoji: '👦', keywords: ['boy'] },
  { emoji: '👧', keywords: ['girl'] },
  { emoji: '👨', keywords: ['man'] },
  { emoji: '👩', keywords: ['woman'] },
  { emoji: '👨‍🏫', keywords: ['teacher'] },
  { emoji: '👩‍⚕️', keywords: ['doctor', 'nurse'] }
];
const STOPWORDS = new Set(['and', 'or', 'with', 'without', 'the', 'a', 'an', 'face', 'symbol', 'sign', 'button']);

const normalizeWord = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');

const splitKeywords = (value) =>
  normalizeWord(value)
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !STOPWORDS.has(part));

const singularize = (word) => {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
  return word;
};

const emojiToKeywords = new Map();

for (const item of emojiData) {
  const inNounGroup = item.group !== undefined && NOUN_GROUPS.has(item.group);
  const inAllowedPersonSubgroup = item.subgroup !== undefined && PERSON_SUBGROUP_ORDERS.has(item.subgroup);
  if (item.type !== 1 || !item.emoji || (!inNounGroup && !inAllowedPersonSubgroup)) continue;

  const set = emojiToKeywords.get(item.emoji) ?? new Set();
  if (item.label) splitKeywords(item.label).forEach((k) => set.add(k));
  for (const tag of item.tags ?? []) splitKeywords(tag).forEach((k) => set.add(k));
  emojiToKeywords.set(item.emoji, set);
}

for (const override of OVERRIDES) {
  const set = emojiToKeywords.get(override.emoji) ?? new Set();
  for (const keyword of override.keywords) {
    set.add(normalizeWord(keyword));
  }
  emojiToKeywords.set(override.emoji, set);
}

const lines = ['emoji\tkeywords'];
for (const [emoji, keywordsSet] of [...emojiToKeywords.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const keywords = [...keywordsSet]
    .flatMap((k) => [k, singularize(k)])
    .filter((k, idx, arr) => k && arr.indexOf(k) === idx)
    .sort();
  lines.push(`${emoji}\t${keywords.join(', ')}`);
}

fs.writeFileSync('emoji-supported.tsv', `${lines.join('\n')}\n`);
console.log(`Wrote emoji-supported.tsv (${emojiToKeywords.size} emoji)`);
