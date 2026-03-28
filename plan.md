# Soci — Post Preview Mockup Parity & Modularization Plan

## Objective
Implement exact social post mockups from `inspo/social mockup generator.html` for non-carousel post types (`photo`, `video`, `text`) while preserving the existing specialized carousel preview system and enforcing modular file-size limits (target: <= 500–600 LOC per file).

## Constraints
- Keep architecture zero-dependency and framework-free (vanilla JS frontend).
- Do not break existing editor flows (save, upload, comments, statuses, permissions).
- Keep carousel preview behavior intact and isolated.
- Prefer edits within existing project; only add modular files that are necessary.

## Current Baseline (Before Changes)
- `src/render.js` (~1426 LOC)
- `src/main.js` (~1180 LOC)
- `styles.css` (~2708 LOC)

## Execution Order

### Phase 1 — Modularization First (Safety + Maintainability)
1. Split render concerns into focused modules:
   - `src/render/index.js` (barrel exports)
   - `src/render/kanban.js`
   - `src/render/calendar.js`
   - `src/render/profileSimulator.js`
   - `src/render/inspector/index.js`
   - `src/render/inspector/helpers.js`
   - `src/render/inspector/carouselPreview.js` (extract existing carousel specialization)
   - `src/render/inspector/socialMockups.js` (new non-carousel preview specialization)

2. Split CSS into scoped modules:
   - `styles/base.css`
   - `styles/layout.css`
   - `styles/inspector.css`
   - `styles/carousel-preview.css`
   - `styles/social-mockups.css`
   - `styles/responsive.css`
   - keep `styles.css` as an import hub.

3. Update imports:
   - `src/main.js` imports from `src/render/index.js`.
   - `index.html` keeps a single stylesheet entrypoint via `styles.css`.

### Phase 2 — Specialized Non-Carousel Mockup Engine
4. In `socialMockups.js`, add mockup renderers matching inspo structures:
   - Instagram
   - TikTok
   - X/Twitter
   - Facebook
   - LinkedIn
   - Reddit

5. Add shared data mapping helper:
   - map post/client/profile/media into `{ name, handle, text, image }`
   - caption precedence: platform variant -> base caption
   - media precedence: first valid media -> fallback placeholder

6. Add inspector mockup platform switcher (preview-only state):
   - integrates with existing Post Preview area
   - no mutation to saved post data

7. Route preview rendering by post type:
   - `carousel` -> existing carousel specialized preview module
   - `photo/video/text` -> new social mockup specialized module

### Phase 3 — Styling Parity + Validation
8. Port and scope needed styles into `styles/social-mockups.css` using isolated class namespace.

9. Browser validation pass:
   - verify all six mockups render correctly
   - verify carousel remains unchanged
   - verify no regressions in save/upload/comments/workflow/status/calendar/kanban

10. Update `memory-bank.md` with implementation snapshot after completion.

## Definition of Done
- Non-carousel inspector previews show platform-authentic mockups (all six).
- Carousel specialization remains functional.
- Files are modularized with each file kept under size constraint target.
- No critical regressions in existing app flows.
- Memory bank updated with final architecture notes.
