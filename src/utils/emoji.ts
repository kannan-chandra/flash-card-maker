const EMOJI_KEYWORDS: Array<{ emoji: string; keywords: string[] }> = [
  { emoji: '👶', keywords: ['baby', 'infant', 'newborn'] },
  { emoji: '👦', keywords: ['boy'] },
  { emoji: '👧', keywords: ['girl'] },
  { emoji: '👨', keywords: ['man'] },
  { emoji: '👩', keywords: ['woman'] },
  { emoji: '👨‍🏫', keywords: ['teacher'] },
  { emoji: '👩‍⚕️', keywords: ['doctor', 'nurse'] },
  { emoji: '🐶', keywords: ['dog', 'puppy'] },
  { emoji: '🐱', keywords: ['cat', 'kitten'] },
  { emoji: '🐭', keywords: ['mouse'] },
  { emoji: '🐰', keywords: ['rabbit', 'bunny'] },
  { emoji: '🦁', keywords: ['lion'] },
  { emoji: '🐯', keywords: ['tiger'] },
  { emoji: '🐻', keywords: ['bear'] },
  { emoji: '🐼', keywords: ['panda'] },
  { emoji: '🐮', keywords: ['cow'] },
  { emoji: '🐷', keywords: ['pig'] },
  { emoji: '🐵', keywords: ['monkey'] },
  { emoji: '🐔', keywords: ['chicken'] },
  { emoji: '🦆', keywords: ['duck'] },
  { emoji: '🦉', keywords: ['owl'] },
  { emoji: '🐸', keywords: ['frog'] },
  { emoji: '🐟', keywords: ['fish'] },
  { emoji: '🐬', keywords: ['dolphin'] },
  { emoji: '🦈', keywords: ['shark'] },
  { emoji: '🐘', keywords: ['elephant'] },
  { emoji: '🦒', keywords: ['giraffe'] },
  { emoji: '🦓', keywords: ['zebra'] },
  { emoji: '🍎', keywords: ['apple'] },
  { emoji: '🍌', keywords: ['banana'] },
  { emoji: '🍇', keywords: ['grape', 'grapes'] },
  { emoji: '🍓', keywords: ['strawberry'] },
  { emoji: '🍉', keywords: ['watermelon'] },
  { emoji: '🥕', keywords: ['carrot'] },
  { emoji: '🥦', keywords: ['broccoli'] },
  { emoji: '🌽', keywords: ['corn'] },
  { emoji: '🍞', keywords: ['bread'] },
  { emoji: '🥚', keywords: ['egg'] },
  { emoji: '🧀', keywords: ['cheese'] },
  { emoji: '🍚', keywords: ['rice'] },
  { emoji: '🍪', keywords: ['cookie'] },
  { emoji: '🏠', keywords: ['house', 'home'] },
  { emoji: '🏫', keywords: ['school'] },
  { emoji: '🚗', keywords: ['car'] },
  { emoji: '🚌', keywords: ['bus'] },
  { emoji: '🚲', keywords: ['bicycle', 'bike'] },
  { emoji: '✈️', keywords: ['airplane', 'plane'] },
  { emoji: '🚂', keywords: ['train'] },
  { emoji: '⛵', keywords: ['boat', 'ship'] },
  { emoji: '🌳', keywords: ['tree'] },
  { emoji: '🌸', keywords: ['flower'] },
  { emoji: '☀️', keywords: ['sun'] },
  { emoji: '🌙', keywords: ['moon'] },
  { emoji: '⭐', keywords: ['star'] },
  { emoji: '☁️', keywords: ['cloud'] },
  { emoji: '🌧️', keywords: ['rain'] },
  { emoji: '⚽', keywords: ['football', 'soccer'] },
  { emoji: '🏀', keywords: ['basketball'] },
  { emoji: '⚾', keywords: ['baseball'] },
  { emoji: '🎾', keywords: ['tennis'] },
  { emoji: '📚', keywords: ['book', 'books'] },
  { emoji: '✏️', keywords: ['pencil'] },
  { emoji: '🧮', keywords: ['abacus', 'math'] },
  { emoji: '🔢', keywords: ['number', 'numbers'] },
  { emoji: '🔤', keywords: ['alphabet', 'letters'] },
  { emoji: '❤️', keywords: ['heart', 'love'] },
  { emoji: '😊', keywords: ['happy', 'smile'] },
  { emoji: '😢', keywords: ['sad', 'cry'] },
  { emoji: '😡', keywords: ['angry'] }
];

function normalizeWord(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function findEmojiForWord(word: string): string | null {
  const normalized = normalizeWord(word);
  if (!normalized) {
    return null;
  }

  const exact = EMOJI_KEYWORDS.find((item) => item.keywords.includes(normalized));
  if (exact) {
    return exact.emoji;
  }

  const token = normalized.split(' ')[0];
  const tokenMatch = EMOJI_KEYWORDS.find((item) => item.keywords.includes(token));
  if (tokenMatch) {
    return tokenMatch.emoji;
  }

  const includes = EMOJI_KEYWORDS.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)));
  return includes?.emoji ?? null;
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
