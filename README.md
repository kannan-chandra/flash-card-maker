# Flash Card Maker

Frontend-only flashcard generator for GitHub Pages. Users design one master card layout (image + two text boxes), import a row list, preview per-row output, and generate printable PDF sheets.

## Features
- Master card editor with drag/resize for one image and two text boxes
- Text settings: role mapping (`word` or `subtitle`), web-safe font, size, alignment
- Row list management via CSV paste/import (header or no-header) and manual edits
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
The app stores one project object locally:
- `template`: card layout and style JSON
- `rows`: list of `word`, `subtitle`, `imageUrl`, optional local image data URL
- `preset`: cards-per-page setting
- `showCutGuides`: PDF border toggle
- `selectedRowId`: row focused in preview

## CSV Input
Supported formats:
- With header: `word,subtitle,imageUrl`
- Without header: first 3 columns are mapped in that order

## Important Notes
- No backend is used and no file/image upload to a server occurs.
- Data is only in browser storage. Clearing browser data removes projects.
- Some web image hosts block cross-origin fetches required for browser-side PDF generation.
- Workaround for blocked images: save image locally and upload via row file input.

## Crucial Decision Points
- Stack: `React + TypeScript + Vite` for lightweight static deployment.
- Canvas editor: `react-konva` for direct drag/drop/resize interactions.
- PDF generation: `pdf-lib` fully client-side, no server rendering.
- Storage: `IndexedDB` (`idb-keyval`) for offline/local persistence.
- Fonts: web-safe/system fonts only for reliability and simple PDF standard-font mapping.
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
