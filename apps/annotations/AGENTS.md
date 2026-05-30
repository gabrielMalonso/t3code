# AGENTS.md

## Task Completion Requirements

- For code changes in this package, all of `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, and `bun run e2e` must pass before considering package work completed.
- After each code change, run the smallest relevant check first; before considering package work complete, run `bun run smoke` when a full package validation is needed.
- Run `bun run build` before `bun run e2e`; the e2e specs depend on `dist`.
- NEVER run `bun run test:watch` as a completion check. Always use `bun run test` (Vitest run).

## Project Snapshot

`Annotations` is a local Chrome Manifest V3 extension for selecting a page element, adding a note, and copying an annotated PNG for coding agents.

This repository is an early local-only MVP with no backend, server, cloud, login, telemetry, or synced history. Proposing changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under Chrome MV3 lifecycle events, restricted URLs, injection failures, offscreen render timeouts, clipboard blocking, cross-origin iframe limits, and partial page state.

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `src/background`: Chrome MV3 service worker for action/command activation, content script injection, visible-tab capture, offscreen lifecycle, and failure results.
- `src/content`: Shadow DOM overlay, picker state machine, annotation UI, page-event shielding, focused-tab clipboard write, and fallback UX.
- `src/offscreen`: Offscreen document entrypoint for PNG composition and render diagnostics.
- `src/shared`: Shared contracts and pure logic for messages, types, crop/selector metadata, privacy redaction, diagnostics, copy, and PNG rendering.
- `public`: Manifest, offscreen HTML, and icons copied into `dist`.
- `tests`: Vitest unit/integration coverage plus Playwright e2e fixtures for extension behavior.

## Chrome MV3 Capture Flow (Important)

The capture path crosses three extension contexts and browser permission boundaries. Small local changes can break activation, capture, rendering, clipboard copy, or fallback behavior.

How we use it in this codebase:

- Activation, `chrome.scripting.executeScript`, `chrome.tabs.captureVisibleTab`, offscreen creation, and timeout handling live in `src/background/service-worker.ts`.
- Picker state, overlay hiding before capture, focused-tab clipboard copy, and fallback presentation live in `src/content/boot.ts`.
- Canvas PNG rendering is requested through `src/offscreen/offscreen.ts` and implemented with shared rendering/crop/privacy logic in `src/shared`.
- `vite.config.ts` builds the service worker and offscreen script as module entries, then bundles `src/content/boot.ts` as an IIFE because injected scripts must be self-contained.

Docs:

- Architecture: `docs/architecture.md`
- Privacy and redaction: `docs/privacy.md`
- Browser and MVP limits: `docs/limitations.md`

## Reference Repos

- Impeccable Live: https://github.com/pbakaus/impeccable

Use this as an implementation reference when designing picker, highlight, annotation, and element-context workflows.
