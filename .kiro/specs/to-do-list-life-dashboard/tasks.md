# Implementation Plan: To-Do List Life Dashboard

## Overview

The Life Dashboard is a single-page, client-side productivity app built from exactly three files — `index.html`, `css/style.css`, and `js/app.js` — with no build step, no bundler, no external libraries, and no backend. Because the app must run when opened directly over `file://` (Requirement 8.2), ES modules are unavailable (CORS), so `js/app.js` is a classic script wrapped in a single IIFE that organizes logic into plain module objects/closures with nothing leaking to `window`.

The implementation proceeds in waves: first the static HTML skeleton and CSS, then the pure-logic core (greeting, clock formatting, validation, serialization, timer math) which is the testable seam, then the persistence layer, then the side-effecting modules (clock, timer, todo, links), and finally the App/Init wiring that attaches all event listeners and starts the clock. Pure functions are exposed on a read-only `window.LifeDashboardPure` namespace so an optional fast-check test harness can exercise them without a DOM.

Key invariants enforced throughout: targeted DOM updates (the 1-second clock tick patches only its own three text nodes, never re-rendering lists or touching inputs — Requirement 6.4), a drift-free timestamp-based timer (`remaining = endTime - Date.now()`), a one-time `localStorage` availability probe with quota-error detection, and identical code for the standalone app and a Manifest V3 browser extension popup.

## Tasks

- [x] 1. Set up project structure and dev tooling
  - [x] 1.1 Create `index.html` static skeleton
    - Single HTML file linking `css/style.css` and `js/app.js`; no inline `style` attributes, no inline `<script>` bodies, no `on*=` handler attributes
    - Four sections with stable IDs: greeting/clock/date, timer display + start/stop/reset buttons + `#timer-notification`, to-do form/input/list, links form/inputs/list; a global `#storage-error` banner with `role="alert"`
    - Inputs carry `maxlength` (255 task, 50 name, 2048 url) as a first line of defense
    - _Requirements: 8.2, 9.1, 9.2, 9.3_
  - [x] 1.2 Create `css/style.css` with design tokens and all section styles
    - CSS custom properties: sans-serif font stack, ≥16px base font size, ≥4.5:1 text/background contrast pair, uniform spacing token
    - Numbered comment sections: design tokens, base/reset, layout (`.dashboard`/`.section` with dividers), greeting, timer, to-do, links, buttons/inputs, error/notification states, extension popup min sizing
    - Section dividers/spacing implement visual separation and uniform spacing
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 9.1_
  - [x] 1.3 Create `js/app.js` IIFE shell with module stubs and `LifeDashboardPure` namespace
    - Wrap everything in one IIFE; define `Storage.KEYS`, stub module objects (Clock, Timer, Todo, Links, Storage, App), and a `window.LifeDashboardPure` read-only namespace skeleton
    - No `import`/`export` statements; no globals on `window` except the test namespace
    - _Requirements: 9.2, 9.3_
  - [ ]* 1.4 Set up the test harness (optional, dev-only)
    - Add `package.json` with dev-only `fast-check` and `jsdom`; a test runner config and a setup file that loads `js/app.js` in jsdom and reads `window.LifeDashboardPure`
    - For stateful property tests, expose a minimal read-only test interface for module state if the pure namespace is insufficient
    - Not required to run the dashboard itself
    - _Requirements: 9.4_

- [x] 2. Implement pure logic core
  - [x] 2.1 Implement clock pure functions and expose them
    - `getGreeting(date)` → "Good morning"/"Good afternoon"/"Good evening" by hour bands [0,12)/[12,18)/[18,24); `formatTime(date)` → zero-padded `HH:MM:SS`; `formatDate(date)` → localized long date
    - Add all three to `window.LifeDashboardPure`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [ ]* 2.2 Write property test for greeting bands
    - **Property 1: Greeting matches time-of-day band**
    - **Validates: Requirements 1.3, 1.4, 1.5**
  - [ ]* 2.3 Write property test for clock formatting round-trip
    - **Property 2: Clock formatting round-trips through its components**
    - **Validates: Requirement 1.1**
  - [ ]* 2.4 Write unit test for `formatDate` on known dates
    - Assert the expected long-date string for representative dates
    - _Requirements: 1.2_
  - [x] 2.5 Implement validation and serialization pure functions and expose them
    - `validateTaskText(text)` → `{ valid, error }`: valid iff trimmed length 1–255; whitespace-only → "Task text is required."; >255 → "Maximum task length is 255 characters."
    - `validateQuickLink(name, url)` → `{ valid, error }`: name 1–50, url 1–2048, empty/whitespace url → "URL is required."
    - `serialize(value)` → JSON string; `deserialize(raw)` → parsed value with a per-entry shape guard that drops malformed entries
    - Add all four to `window.LifeDashboardPure`
    - _Requirements: 3.1, 3.2, 3.7, 3.8, 4.2, 4.5, 5.4_
  - [ ]* 2.6 Write property test for task text validation
    - **Property 3: Task text validation accepts exactly 1–255 trimmed characters**
    - **Validates: Requirements 3.1, 3.2, 3.7, 3.8**
  - [ ]* 2.7 Write property test for quick link validation
    - **Property 4: Quick link validation accepts valid name/URL pairs and rejects empty URLs**
    - **Validates: Requirements 4.2, 4.5**
  - [ ]* 2.8 Write property test for serialization round-trip
    - **Property 5: Serialization round-trips losslessly**
    - **Validates: Requirement 5.4**
  - [x] 2.9 Implement timer pure functions and expose them
    - `computeRemaining(endTimeMs, nowMs)` → `Math.max(0, endTimeMs - nowMs)`; `formatRemaining(ms)` → zero-padded `mm:ss`, clamps negative to 0
    - Add both to `window.LifeDashboardPure`
    - _Requirements: 2.1, 2.2, 2.5_
  - [ ]* 2.10 Write property test for timer remaining bounds and monotonicity
    - **Property 6: Timer remaining is bounded and monotonic non-increasing**
    - **Validates: Requirements 2.2, 2.5**
  - [ ]* 2.11 Write property test for timer formatting round-trip
    - **Property 7: Timer formatting round-trips through milliseconds**
    - **Validates: Requirements 2.1, 2.2**

- [x] 3. Checkpoint — pure logic complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Storage module
  - [x] 4.1 Implement the Storage module
    - `probe()` feature-detects `localStorage` (set/remove a dummy key) once at startup, setting `available`
    - `isQuotaExceededError(err)` cross-browser classifier (codes 22/1014, names `QuotaExceededError`/`NS_ERROR_DOM_QUOTA_REACHED`)
    - `save(key, value)` → `{ ok, error }` via `JSON.stringify`+`setItem` in try/catch; never throws; on failure show `#storage-error` and keep the value in memory
    - `load(key, fallback)` → parse in try/catch, return fallback on missing/corrupt; `remove(key)` is a no-op if unavailable
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ]* 4.2 Write unit test for the quota-error classifier
    - Assert `isQuotaExceededError` is true for quota error shapes and false for others
    - _Requirements: 5.5_
  - [ ]* 4.3 Write unit test for corrupt/missing load fallback
    - Assert `load` returns the fallback empty array on corrupt JSON / missing key
    - _Requirements: 5.3, 5.5_

- [x] 5. Implement Clock and Timer modules
  - [x] 5.1 Implement the Clock module (side effects)
    - `start()` runs an independent 1s interval whose callback updates only `#greeting`, `#clock`, `#date` via `textContent`; `stop()` clears it
    - The tick never queries, re-renders, or replaces list nodes or inputs (Requirement 6.4)
    - _Requirements: 1.1, 1.2, 1.6, 6.4_
  - [x] 5.2 Implement the Timer module (side effects)
    - State machine: idle/running/paused/finished; `DURATION_MS = 1500000`; drift-free `remaining = endTime - Date.now()` each tick
    - `start()` (idle/finished → set DURATION then run; paused → resume), `stop()` (running → capture remaining, pause), `reset()` (any state → idle, "25:00", clear notification), `tick()` (≤0 → finished + completion notification)
    - Timer interval is separate from the clock interval (Requirement 2.6)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [ ]* 5.3 Write property test for reset and finished-restart
    - **Property 8: Reset and finished-restart restore the full duration (idempotent reset)**
    - **Validates: Requirements 2.4, 2.7**
  - [ ]* 5.4 Write property test for stop preserving remaining time
    - **Property 9: Stop preserves the exact remaining time**
    - **Validates: Requirement 2.3**
  - [ ]* 5.5 Write integration test for timer/clock independence
    - Start the timer and assert the clock still advances; reset the timer and assert the clock still advances
    - _Requirements: 2.6_
  - [ ]* 5.6 Write integration test for greeting boundary update
    - With a fake clock crossing 11:59:59 → 12:00:00, assert the greeting updates on the next tick
    - _Requirements: 1.6_

- [x] 6. Checkpoint — engine complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Todo module
  - [x] 7.1 Implement the Todo module
    - In-memory `tasks` source of truth; `add`/`edit`/`toggleComplete`/`remove` with validation via `validateTaskText`
    - Inline edit: swap span→input on edit, commit on Enter/blur, cancel on Escape; on invalid edit keep previous text and show `#todo-error`
    - Targeted DOM updates: `add` appends one `<li>`, `remove` removes one node, `toggleComplete` toggles a completion-indicator class; `renderAll` rebuilds the list only on load
    - `loadFromStorage`/`save` via Storage; on save failure show `#storage-error` and keep `tasks` in memory
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 5.1, 5.6_
  - [ ]* 7.2 Write property test for collection removal
    - **Property 10: Collection removal decreases size by one and removes the id**
    - **Validates: Requirements 3.4, 4.4**
  - [ ]* 7.3 Write unit test for the completion indicator
    - Assert toggling complete adds the indicator class and an incomplete task lacks it
    - _Requirements: 3.3_
  - [ ]* 7.4 Write integration test for to-do persistence round-trip
    - Add/edit/toggle/delete tasks with a localStorage spy asserting `setItem` is called with serialized data; reload and assert restored data matches
    - _Requirements: 3.5, 3.6, 5.1_

- [x] 8. Implement Links module
  - [x] 8.1 Implement the Links module
    - In-memory `links` source of truth; `add`/`remove` with validation via `validateQuickLink`; `open(url)` → `window.open(url, '_blank', 'noopener,noreferrer')`
    - Targeted DOM updates: `add` renders a button, `remove` removes one node; `renderAll` only on load
    - `loadFromStorage`/`save` via Storage; on save failure show `#storage-error` and keep `links` in memory
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.6_
  - [ ]* 8.2 Write integration test for quick link open
    - Stub `window.open`, click a link button, assert it was called with the URL, `'_blank'`, and `noopener`
    - _Requirements: 4.1_
  - [ ]* 8.3 Write integration test for links persistence
    - Add/delete links with a localStorage spy; reload and assert restored links match
    - _Requirements: 4.2, 4.3, 4.4, 5.1_

- [x] 9. Wire App/Init and finalize
  - [x] 9.1 Implement App/Init wiring
    - On `DOMContentLoaded`: `Storage.probe()` (show `#storage-error` if unavailable), load and `renderAll` tasks and links, start the clock
    - Attach all listeners via `addEventListener`: timer start/stop/reset, todo form submit, todo list delegation (edit/complete/delete), links form submit, links list delegation (open/delete)
    - Populate/finalize `window.LifeDashboardPure` with all pure functions
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 5.3, 6.1, 8.2, 9.2, 9.3_
  - [ ]* 9.2 Write property test for failed-save preservation
    - **Property 11: A failed save leaves in-memory data unchanged**
    - **Validates: Requirement 5.6**
  - [ ]* 9.3 Write integration test for non-disruptive clock update
    - Focus an input with random text and cursor, run a clock tick, assert the input retains focus/cursor/value and only `#greeting`/`#clock`/`#date` changed
    - _Requirements: 6.4_
  - [ ]* 9.4 Write integration test for the storage failure path
    - Make `setItem` throw and assert the `#storage-error` banner appears and in-memory data is retained
    - _Requirements: 5.5, 5.6_

- [x] 10. Checkpoint — app wired
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Package browser extension and verify structure
  - [x] 11.1 Package the Manifest V3 browser extension
    - Add `manifest.json` reusing `index.html` as the popup; no extension-specific branching (popup `window.open` already opens a new tab)
    - _Requirements: 8.3_
  - [ ]* 11.2 Write smoke test for extension parity
    - Load the app as an MV3 popup and run the same interaction assertions as the standalone version
    - _Requirements: 8.3_
  - [ ]* 11.3 Write static test for project structure constraints
    - Assert exactly one file under `css/` and one under `js/`, no `style=` attributes, no inline `<script>` bodies, no `on*=` handlers, no external library `<script src>`, no `import`/`export`
    - _Requirements: 9.1, 9.2, 9.3_
  - [ ]* 11.4 Write static test for no-backend usage
    - Static scan asserting no `fetch`, `XMLHttpRequest`, or `WebSocket` usage in the source
    - _Requirements: 5.2_
  - [ ]* 11.5 Write smoke test for `file://` launch
    - Open `index.html` via `file://` and assert the dashboard renders and a task can be added with no test framework present
    - _Requirements: 8.2, 9.4_

- [x] 12. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; the dashboard runs without any test framework (Requirement 9.4).
- Each task references specific requirement clauses for traceability.
- Property sub-tasks map one-to-one to the design's Correctness Properties 1–11 and run ≥100 fast-check iterations per the design's testing strategy.
- Implementation tasks all write to the single `js/app.js` file, so they are serialized across waves; test tasks write to separate files and run in parallel where their dependencies allow.
- The focus timer is intentionally not persisted; only Tasks and Quick Links are persisted (Requirement 5).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.5", "2.2", "2.4"] },
    { "id": 3, "tasks": ["2.9", "2.3", "2.6", "2.8"] },
    { "id": 4, "tasks": ["4.1", "2.7", "2.10"] },
    { "id": 5, "tasks": ["5.1", "2.11", "4.2"] },
    { "id": 6, "tasks": ["5.2", "4.3", "5.6"] },
    { "id": 7, "tasks": ["7.1", "5.3", "5.5"] },
    { "id": 8, "tasks": ["8.1", "5.4", "7.2", "7.3", "7.4"] },
    { "id": 9, "tasks": ["9.1", "8.2"] },
    { "id": 10, "tasks": ["11.1", "8.3", "9.2", "9.3", "9.4", "11.3", "11.4", "11.5"] },
    { "id": 11, "tasks": ["11.2"] }
  ]
}
```
