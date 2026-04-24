# Collapsible Dashboard Widgets — Design

**Date:** 2026-04-24
**Scope:** RPi Radio and Signboard widgets on the dashboard page

## Goal

Let users collapse and expand the RPi Radio and Signboard widgets on the dashboard. Collapsed state persists across reloads. On a first visit (no stored state), both widgets start collapsed so the Services grid is the primary focus.

## User-facing behavior

- Each widget has a chevron toggle (▾/▸) on the right side of its header and the entire header row is clickable.
- When collapsed, the widget shows only its header plus a one-line summary directly below:
  - **Radio**: `♪ {station} — {track}` when a track is playing; otherwise the current status text (e.g., `Offline`, `Paused`).
  - **Signboard**: the last sent message, truncated to ~60 characters. Empty state: `No recent messages`.
- When expanded, the summary line is hidden and the full widget body is shown.
- The chevron rotates to reflect state (down when expanded, right when collapsed).
- Clicking anywhere in the header toggles state. Clicks on the status badge or chevron also toggle (no need to carve exceptions out).

## Persistence

- `localStorage` keys: `widget-collapsed:radio`, `widget-collapsed:signboard`.
- Value stored as the string `"true"` or `"false"`.
- If the key is missing (first visit), default is collapsed (`true`).

## Markup changes

File: `views/dashboard.ejs`

Both widgets get the same structural changes:

1. Add a `<button class="widget-collapse-toggle">▾</button>` to the header, after the status badge.
2. Add a `<div class="widget-summary {radio|signboard}-summary"></div>` immediately after the header.
3. Wrap the existing widget body content (everything after the header that is not the summary) in a new `<div class="widget-body">...</div>`.

The chevron uses `aria-expanded` (`true` when expanded) and `aria-label="Toggle widget"` for accessibility. The header row gets `role="button"` and `tabindex="0"` so keyboard users can toggle with Enter/Space.

Example for the radio widget (abbreviated):

```html
<div class="radio-widget" id="radio-widget">
  <div class="radio-header" role="button" tabindex="0" aria-expanded="false">
    <h3>RPi Radio</h3>
    <span class="radio-status-badge stopped">Offline</span>
    <button class="widget-collapse-toggle" aria-label="Toggle widget" aria-expanded="false">▾</button>
  </div>
  <div class="widget-summary radio-summary"></div>
  <div class="widget-body">
    <!-- existing radio widget content: now-playing, transport, volume, selectors -->
  </div>
</div>
```

The Signboard widget follows the same pattern with `.signboard-header`, `.signboard-summary`, and its existing body content wrapped in `.widget-body`.

## CSS changes

File: `public/css/style.css`

New shared rules (added once, not per widget):

```css
.radio-header,
.signboard-header {
  cursor: pointer;
  user-select: none;
}

.widget-collapse-toggle {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 0 4px;
  margin-left: 8px;
  transition: transform 0.15s ease;
}

.radio-widget:not(.collapsed) .widget-collapse-toggle,
.signboard-widget:not(.collapsed) .widget-collapse-toggle {
  transform: rotate(0deg);  /* chevron points down ▾ when expanded */
}

.radio-widget.collapsed .widget-collapse-toggle,
.signboard-widget.collapsed .widget-collapse-toggle {
  transform: rotate(-90deg); /* chevron points right ▸ when collapsed */
}

.widget-summary {
  display: none;
  padding: 6px 8px;
  margin-top: 8px;
  background: var(--bg-primary);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.radio-widget.collapsed .widget-summary,
.signboard-widget.collapsed .widget-summary {
  display: block;
}

.radio-widget.collapsed .widget-body,
.signboard-widget.collapsed .widget-body {
  display: none;
}

.radio-widget.collapsed,
.signboard-widget.collapsed {
  margin-bottom: 12px; /* tighter spacing when collapsed */
}
```

The existing `.radio-header` and `.signboard-header` rules (display: flex, justify-content: space-between, align-items: center, margin-bottom: 12px) are kept. When collapsed, the header's `margin-bottom` is reduced to 0 so the summary sits close to the header:

```css
.radio-widget.collapsed .radio-header,
.signboard-widget.collapsed .signboard-header {
  margin-bottom: 0;
}
```

No animation on body show/hide — instant toggle. Keeps CSS simple; a max-height transition could be added later without touching markup.

## JavaScript changes

### New file: `public/js/widget-collapse.js`

A small IIFE module that:

1. On `DOMContentLoaded`, finds all `.radio-widget` and `.signboard-widget` elements on the page and applies their stored collapsed state (default: collapsed).
2. Attaches a click handler to each `.radio-header` / `.signboard-header` that toggles the `.collapsed` class on the widget, updates `localStorage`, and syncs `aria-expanded` on the header and the chevron button.
3. Attaches a `keydown` handler on the header for Enter/Space to also toggle.
4. Exposes `window.setWidgetSummary(widgetSelector, text)` — called by the two widget scripts to update their summary line text when their underlying data changes.

The mapping of widget → storage key → summary selector lives in this one file:

```js
const WIDGETS = [
  { root: '#radio-widget',     header: '.radio-header',     storageKey: 'widget-collapsed:radio',     summary: '.radio-summary' },
  { root: '#signboard-widget', header: '.signboard-header', storageKey: 'widget-collapsed:signboard', summary: '.signboard-summary' }
];
```

### Changes to `public/js/radio-widget.js`

When the widget receives status/now-playing updates, compute the summary text and call `window.setWidgetSummary('#radio-widget', text)`:

- If `radio:now-playing` has a track and station: `♪ {station} — {track}`.
- Else if status is `playing` but no track info yet: `♪ {station}`.
- Else: use the status badge text (e.g., `Offline`, `Paused`, `Stopped`).

The summary is computed and pushed on every update so it stays fresh even while the widget is expanded (no conditional logic needed).

### Changes to `public/js/signboard-widget.js`

After a successful send (the existing flow that appends to the recent-messages history), also call `window.setWidgetSummary('#signboard-widget', message)`. Truncate to 60 characters with `…` suffix if longer. On page load, if there is at least one recent message already rendered, set the summary from the most recent one; otherwise set `No recent messages`.

## Script loading order

The dashboard footer currently loads:

```html
<script src="/js/radio-widget.js"></script>
<script src="/js/signboard-widget.js"></script>
```

Add `widget-collapse.js` **before** these two so `window.setWidgetSummary` is defined when the widget scripts run:

```html
<script src="/js/widget-collapse.js"></script>
<script src="/js/radio-widget.js"></script>
<script src="/js/signboard-widget.js"></script>
```

## Out of scope

- No server-side changes. No `services.json` changes. No new routes or Socket.io events.
- No changes to the Services grid, stats bar, or other pages.
- No new tests. The existing Jest suite covers routes and services; these widgets are DOM-only client code with no existing test coverage, consistent with the project's testing scope.
- No animation on body show/hide (deferred — easy to add later without markup changes).

## Accessibility notes

- Header gets `role="button"`, `tabindex="0"`, and `aria-expanded` that flips with state.
- The chevron button has a visible label (`aria-label="Toggle widget"`) in case a screen reader focuses it directly.
- Keyboard toggle via Enter/Space on the header.

## Files touched

| File | Change |
|------|--------|
| `views/dashboard.ejs` | Add chevron button, summary div, wrap body in `.widget-body` on both widgets; load new JS file |
| `public/css/style.css` | New shared collapse rules |
| `public/js/widget-collapse.js` | New file |
| `public/js/radio-widget.js` | Call `setWidgetSummary` on status/now-playing updates |
| `public/js/signboard-widget.js` | Call `setWidgetSummary` after sending and on load |
