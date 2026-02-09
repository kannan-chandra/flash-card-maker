# Flash Card Maker

Frontend-only flashcard generator for GitHub Pages. Users design one master card layout (image + two text boxes), import a row list, preview per-row output, and generate printable PDF sheets.

## Features
- Master card editor with drag/resize for one image and two text boxes
- Multiple flashcard sets stored locally, with set browser/create/delete
- Text settings: role mapping (`word` or `subtitle`), font, size, alignment
- Row list management via CSV paste/import (header or no-header) and manual edits
- Dedicated selected-card detail editor for quick per-row iteration (word, subtitle, image URL, local image upload)
- Image selection model: if a row has no image, show three first-class options (URL, upload, emoji choices); if an image is set, show a single remove-image action
- Emoji assist: shows up to 5 best matches using both `word` and `subtitle` (word prioritized; subtitle fills gaps), with English + Tamil keywords; selected emoji is converted to a local PNG image
- Per-row image sources:
  - URL (web image)
  - Local file upload (stored locally as data URL)
- Row status flags:
  - Text overflow detection based on rendered wrapping metrics
  - Missing/blocked image indicators
- Preview-by-row workflow (click a row to inspect it on the canvas)
- PDF export for US Letter with fixed presets: 6, 8, or 12 cards per page
- Optional cut guide borders
- Local persistence in IndexedDB, with clear local-only data warning

## Data Model
The app stores one local workspace object:
- `sets`: each set includes template, rows, preset, and preview state
- `activeSetId`: currently opened set

## CSV Input
Supported formats:
- With header: `word,subtitle,imageUrl`
- Without header: first 3 columns are mapped in that order

## Important Notes
- No backend is used and no file/image upload to a server occurs.
- Data is only in browser storage. Clearing browser data removes all sets.
- Some web image hosts block cross-origin fetches required for browser-side PDF generation.
- Workaround for blocked images: save image locally and upload via row file input.

## Crucial Decision Points
- Stack: `React + TypeScript + Vite` for lightweight static deployment.
- Canvas editor: `react-konva` for direct drag/drop/resize interactions.
- PDF generation: `pdf-lib` fully client-side, no server rendering.
- Unicode text in PDF: embeds `Noto Sans Tamil` for Tamil script support.
- Storage: `IndexedDB` (`idb-keyval`) for offline/local persistence.
- Fonts: web-safe/system fonts plus bundled Tamil font for Unicode PDF support.
- Simpler offline phase: no service worker/PWA yet; app still works with local persistence after load.
- Fixed print layout: US Letter only and fixed 6/8/12 grid presets for initial scope.

## Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Browser E2E Test
```bash
npm run test:e2e
```

Current Playwright coverage includes:
- CSV import with Tamil text
- Per-row local image upload
- PDF generation and download assertion
- No uncaught runtime errors during that flow

## Emoji Support List
- Generate full supported emoji keyword list:
```bash
npm run emoji:list
```
- Output file: `emoji-supported.tsv` (columns: `emoji`, `keywords`)
