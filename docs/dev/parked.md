<!-- Moved unchanged from dev.md (lines 1339-1375). Index: dev.md -->

## Parked / Incomplete Features

### P1. Resizable Scheduler Panels (2XL Breakpoint) — PARKED

**Goal**

- At 2xl (≥1536px), replace the fixed CSS grid layout with user-resizable panels (curriculum / main schedule / assignment) using `react-resizable-panels`. Panel sizes would persist to `localStorage` and survive reloads.

**What was attempted**

- `react-resizable-panels` (`Group`, `Panel`, `Separator`, `useDefaultLayout`) was integrated into `SchedulerLayout` behind a `useIs2xl()` breakpoint guard.
- A custom `@dnd-kit` pointer sensor (`PointerSensorIgnoreResizeSeparator`) was created to prevent drag-and-drop from stealing pointer events on `[data-separator]` elements.
- Multiple rounds of debugging (manual pointer capture, capture-phase listeners, layout validation, `localStorage` corruption detection) were attempted.

**Why it was parked**

- The `react-resizable-panels` library did not reliably resize panels. Events fired but panels did not visually move. Root causes investigated:
  - `@dnd-kit`'s `DndContext` calling `preventDefault()` on pointer events before the library could process them.
  - `localStorage` storing corrupted flex-grow values instead of 0–100 percentages, causing `ariaValueMin === ariaValueMax` (locked panels).
  - `Separator` components rendering at 0px width (invisible, unclickable) without explicit styling.
- Each fix resolved one symptom but resizing still failed. After significant iteration, the feature was parked to avoid further time investment.

**What was reverted**

- Removed `react-resizable-panels` dependency (`npm uninstall`).
- Removed all `Group`, `Panel`, `Separator`, `useDefaultLayout` usage from `SchedulerPage.tsx`.
- Removed `getValidatedStorageItem` localStorage validation helper.
- Removed `PointerSensorIgnoreResizeSeparator` custom sensor file.
- Reverted `SchedulerLayout` to a pure CSS grid layout (fixed proportions at each breakpoint).
- Restored standard `PointerSensor` from `@dnd-kit/core`.

**To revisit**

- Consider an alternative library (e.g. `allotment`, `react-split`, or a custom flexbox + drag implementation).
- Ensure any resize library coexists cleanly with `@dnd-kit`'s document-level pointer listeners.
- Test on a minimal reproduction first before integrating into the scheduler's complex component tree.
