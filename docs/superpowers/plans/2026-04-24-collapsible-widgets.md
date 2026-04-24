# Collapsible Dashboard Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add collapse/expand support to the RPi Radio and Signboard widgets on the dashboard, with state persisted in localStorage and a one-line summary visible while collapsed.

**Architecture:** Introduce a single shared CSS class (`.collapsed`), a small reusable client-side module (`widget-collapse.js`) that handles toggle + persistence + exposes `window.setWidgetSummary`, and light edits to the two existing widget scripts so they push a summary string on state changes. No server-side changes.

**Tech Stack:** Vanilla JavaScript (CommonJS server, no build step), EJS templates, CSS custom properties. No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-04-24-collapsible-widgets-design.md`

**Testing approach:** The project has no existing client-side DOM tests (Jest covers services and routes only). Per `CLAUDE.md`: "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete." Each task includes a manual browser verification step. A final `npm test` run confirms the existing test suite still passes.

---

## File Structure

| File | Change | Responsibility |
|------|--------|---------------|
| `public/css/style.css` | Modify | Shared `.collapsed` styles, chevron rotation, summary line, clickable header |
| `views/dashboard.ejs` | Modify | Add chevron button + summary div + `.widget-body` wrapper to both widgets; load new JS file |
| `public/js/widget-collapse.js` | Create | Toggle state, persist to localStorage, expose `setWidgetSummary` |
| `public/js/radio-widget.js` | Modify | Compute + push summary text on status/now-playing updates |
| `public/js/signboard-widget.js` | Modify | Compute + push summary text on history updates and sends |

---

## Task 1: Add shared CSS for collapse feature

**Files:**
- Modify: `public/css/style.css` (append new rules at the end of the file, or insert before the signboard block — see step 2)

- [ ] **Step 1: Open `public/css/style.css` and locate a good insertion point**

The existing `.radio-widget` rules start at line 738 and `.signboard-widget` rules at line 1288. The new shared rules should sit after both widget sections to keep related styles together. Append them at the very end of the file (after the last existing rule).

- [ ] **Step 2: Append the new collapse-related CSS rules**

Append the following to the end of `public/css/style.css`:

```css
/* ── Collapsible widget support (Radio + Signboard) ─────────────── */

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
  line-height: 1;
  transition: transform 0.15s ease;
}

.widget-collapse-toggle:hover {
  color: var(--text-primary);
}

.radio-widget:not(.collapsed) .widget-collapse-toggle,
.signboard-widget:not(.collapsed) .widget-collapse-toggle {
  transform: rotate(0deg);
}

.radio-widget.collapsed .widget-collapse-toggle,
.signboard-widget.collapsed .widget-collapse-toggle {
  transform: rotate(-90deg);
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

.radio-widget.collapsed .radio-header,
.signboard-widget.collapsed .signboard-header {
  margin-bottom: 0;
}

.radio-widget.collapsed,
.signboard-widget.collapsed {
  margin-bottom: 12px;
}
```

- [ ] **Step 3: Commit**

```bash
git add public/css/style.css
git commit -m "feat(dashboard): add collapsible widget CSS rules"
```

---

## Task 2: Update dashboard markup

**Files:**
- Modify: `views/dashboard.ejs` (lines 42-141 — both widget blocks + script tags at the end)

- [ ] **Step 1: Add chevron button and summary div, wrap body of the Radio widget**

In `views/dashboard.ejs`, replace the entire Radio widget block (currently lines 42-81) with:

```html
<!-- ── Radio Control Widget ───────────────────────────────────────── -->
<div class="radio-widget" id="radio-widget">
  <div class="radio-header" role="button" tabindex="0" aria-expanded="false">
    <h3>RPi Radio</h3>
    <span class="radio-status-badge stopped">Offline</span>
    <button class="widget-collapse-toggle" type="button" aria-label="Toggle widget" aria-expanded="false">&#x25BE;</button>
  </div>
  <div class="widget-summary radio-summary"></div>
  <div class="widget-body">
    <div class="radio-now-playing">
      <div class="radio-station-name">No station</div>
      <div class="radio-track-title"></div>
      <div class="radio-bitrate"></div>
    </div>
    <div class="radio-transport">
      <button class="radio-prev" title="Previous">&#x23EE;</button>
      <button class="radio-play-pause" title="Play/Pause">&#x25B6;</button>
      <button class="radio-next" title="Next">&#x23ED;</button>
    </div>
    <div class="radio-volume-row">
      <label>Volume</label>
      <input type="range" class="radio-volume" min="0" max="150" value="70">
      <span class="radio-volume-label">70%</span>
    </div>
    <div class="radio-selectors">
      <div>
        <label>Station</label>
        <div class="radio-station-row">
          <select class="radio-station-select"></select>
        </div>
      </div>
      <div>
        <label>Mode</label>
        <select class="radio-mode-select">
          <option value="spectrum">Spectrum</option>
          <option value="ticker">Ticker</option>
          <option value="blank">Blank</option>
          <option value="equalizer">Equalizer</option>
          <option value="waveform">Waveform</option>
        </select>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add chevron button and summary div, wrap body of the Signboard widget**

Replace the entire Signboard widget block (currently lines 83-141) with:

```html
<!-- ── Signboard Widget ──────────────────────────────────────────── -->
<div class="signboard-widget" id="signboard-widget">
  <div class="signboard-header" role="button" tabindex="0" aria-expanded="false">
    <h3>Signboard</h3>
    <span class="signboard-status-badge stopped">Offline</span>
    <button class="widget-collapse-toggle" type="button" aria-label="Toggle widget" aria-expanded="false">&#x25BE;</button>
  </div>
  <div class="widget-summary signboard-summary"></div>
  <div class="widget-body">
    <div class="signboard-current"></div>

    <textarea class="signboard-text" rows="2" placeholder="Type a message and press Enter\u2026" maxlength="500"></textarea>

    <div class="signboard-controls-row">
      <div class="signboard-control">
        <label>Color</label>
        <div class="signboard-color-swatches"></div>
        <input type="text" class="signboard-color-hex" value="#ffffff" maxlength="7">
      </div>
      <div class="signboard-control">
        <label>Background</label>
        <div class="signboard-bg-swatches"></div>
        <input type="text" class="signboard-bg-hex" value="#000000" maxlength="7">
      </div>
    </div>

    <div class="signboard-controls-row">
      <div class="signboard-control">
        <label>Size</label>
        <div class="signboard-radios">
          <label><input type="radio" name="signboard-size" value="small"> Small</label>
          <label><input type="radio" name="signboard-size" value="medium" checked> Medium</label>
          <label><input type="radio" name="signboard-size" value="large"> Large</label>
        </div>
      </div>
      <div class="signboard-control">
        <label>Mode</label>
        <div class="signboard-radios">
          <label><input type="radio" name="signboard-mode" value="scroll-once" checked> Scroll</label>
          <label><input type="radio" name="signboard-mode" value="persist"> Persist</label>
          <label><input type="radio" name="signboard-mode" value="loop"> Loop</label>
        </div>
      </div>
    </div>

    <div class="signboard-speed-row">
      <label>Speed</label>
      <input type="range" class="signboard-speed" min="1" max="5" value="2">
      <span class="signboard-speed-label">2</span>
    </div>

    <div class="signboard-actions">
      <button class="btn btn-success btn-sm signboard-send">Send</button>
      <button class="btn btn-secondary btn-sm signboard-clear">Clear Display</button>
    </div>

    <div class="signboard-history-header">
      <span>Recent messages</span>
      <button type="button" class="signboard-clear-history">Clear</button>
    </div>
    <div class="signboard-history"></div>
  </div>
</div>
```

- [ ] **Step 3: Add the new script tag to load `widget-collapse.js` first**

At the bottom of `views/dashboard.ejs`, the existing script tags are:

```html
<%- include('partials/footer') %>
<script src="/js/radio-widget.js"></script>
<script src="/js/signboard-widget.js"></script>
```

Change them to:

```html
<%- include('partials/footer') %>
<script src="/js/widget-collapse.js"></script>
<script src="/js/radio-widget.js"></script>
<script src="/js/signboard-widget.js"></script>
```

- [ ] **Step 4: Start the dev server and verify the page still renders**

Run (in a separate terminal or background shell):

```bash
node server.js
```

Open `http://localhost:3000` in a browser. Expected:
- Page loads without console errors (one 404 for `widget-collapse.js` is expected at this point — next task creates it).
- Both widgets render with their full content visible (no `.collapsed` class yet, so everything shows normally).
- The chevron ▾ appears at the right end of each header.
- The clickable header has a pointer cursor.

Clicking the header does nothing yet (expected — JS module not written).

Stop the dev server (Ctrl+C) before moving on.

- [ ] **Step 5: Commit**

```bash
git add views/dashboard.ejs
git commit -m "feat(dashboard): add collapse toggle + summary markup to widgets"
```

---

## Task 3: Create `widget-collapse.js`

**Files:**
- Create: `public/js/widget-collapse.js`

- [ ] **Step 1: Create the file with the full module**

Create `public/js/widget-collapse.js` with the following content:

```javascript
'use strict';

/**
 * Collapse/expand support for dashboard widgets (Radio + Signboard).
 * State is persisted per widget in localStorage. First visit defaults to
 * collapsed so the Services grid below stays the primary focus.
 *
 * Exposes window.setWidgetSummary(widgetSelector, text) so the individual
 * widget scripts can push a one-line summary used while collapsed.
 */
(function () {
  const WIDGETS = [
    {
      root: '#radio-widget',
      header: '.radio-header',
      storageKey: 'widget-collapsed:radio'
    },
    {
      root: '#signboard-widget',
      header: '.signboard-header',
      storageKey: 'widget-collapsed:signboard'
    }
  ];

  function getStored(key) {
    try {
      const v = window.localStorage.getItem(key);
      if (v === null) return true; // first visit: default to collapsed
      return v === 'true';
    } catch (err) {
      return true;
    }
  }

  function setStored(key, value) {
    try {
      window.localStorage.setItem(key, value ? 'true' : 'false');
    } catch (err) {
      /* ignore storage failures (private mode, etc.) */
    }
  }

  function applyState(root, header, collapsed) {
    if (collapsed) {
      root.classList.add('collapsed');
    } else {
      root.classList.remove('collapsed');
    }
    const expanded = collapsed ? 'false' : 'true';
    header.setAttribute('aria-expanded', expanded);
    const toggleBtn = header.querySelector('.widget-collapse-toggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', expanded);
  }

  function wireWidget(cfg) {
    const root = document.querySelector(cfg.root);
    if (!root) return;
    const header = root.querySelector(cfg.header);
    if (!header) return;

    let collapsed = getStored(cfg.storageKey);
    applyState(root, header, collapsed);

    function toggle() {
      collapsed = !collapsed;
      applyState(root, header, collapsed);
      setStored(cfg.storageKey, collapsed);
    }

    header.addEventListener('click', toggle);

    header.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  window.setWidgetSummary = function (widgetSelector, text) {
    const root = document.querySelector(widgetSelector);
    if (!root) return;
    const summary = root.querySelector('.widget-summary');
    if (!summary) return;
    summary.textContent = text || '';
  };

  function init() {
    WIDGETS.forEach(wireWidget);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 2: Start the dev server and verify collapse behavior**

Run:

```bash
node server.js
```

Open `http://localhost:3000` in a browser and verify each of the following (check browser console has no errors):

1. **First-visit default:** Open DevTools → Application → Local Storage → clear any `widget-collapsed:*` keys, then hard-refresh. Both widgets should appear collapsed — only the header row is visible for each, chevron points right (▸).
2. **Click header to expand:** Click the RPi Radio header. Body expands, chevron rotates to down (▾), `aria-expanded="true"` on the header.
3. **Click header to collapse:** Click again. Body hides, chevron rotates to right (▸).
4. **Persistence:** Expand the Radio widget, refresh the page. Radio widget stays expanded; Signboard stays in whatever state it was.
5. **Keyboard:** Tab to the header (focus ring appears), press Enter — toggles. Press Space — toggles.
6. **Summary line is empty:** Since no widget script calls `setWidgetSummary` yet, the summary `<div>` is rendered but empty. This is expected — next tasks wire it up.

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add public/js/widget-collapse.js
git commit -m "feat(dashboard): add widget-collapse module with persistence"
```

---

## Task 4: Wire the Radio widget summary

**Files:**
- Modify: `public/js/radio-widget.js` (add a new `updateSummary` function and call it from both `updateStatus` and `updateNowPlaying`)

- [ ] **Step 1: Add `updateSummary` and hook it in**

Edit `public/js/radio-widget.js`. After the existing `updateNowPlaying` function (ends at line 53), add a new `updateSummary` function, and call it from both `updateStatus` and `updateNowPlaying`.

Find this block (lines 30-53):

```javascript
  function updateStatus() {
    if (!radioState.connected) {
      statusBadge.textContent = 'Offline';
      statusBadge.className = 'radio-status-badge stopped';
      widget.classList.add('radio-offline');
    } else {
      widget.classList.remove('radio-offline');
      statusBadge.textContent = radioState.is_playing ? 'Playing' : 'Paused';
      statusBadge.className = 'radio-status-badge ' + (radioState.is_playing ? 'running' : 'stopped');
    }
    playPauseBtn.textContent = radioState.is_playing ? '\u23F8' : '\u25B6';
    volumeSlider.value = radioState.volume;
    volumeLabel.textContent = radioState.volume + '%';
    modeSelect.value = radioState.mode;
    if (radioState.station_index !== null) {
      stationSelect.value = radioState.station_index;
    }
  }

  function updateNowPlaying() {
    stationName.textContent = nowPlaying.station_name || 'No station';
    trackTitle.textContent = nowPlaying.track_title || '';
    bitrateEl.textContent = nowPlaying.bitrate || '';
  }
```

Replace it with:

```javascript
  function updateStatus() {
    if (!radioState.connected) {
      statusBadge.textContent = 'Offline';
      statusBadge.className = 'radio-status-badge stopped';
      widget.classList.add('radio-offline');
    } else {
      widget.classList.remove('radio-offline');
      statusBadge.textContent = radioState.is_playing ? 'Playing' : 'Paused';
      statusBadge.className = 'radio-status-badge ' + (radioState.is_playing ? 'running' : 'stopped');
    }
    playPauseBtn.textContent = radioState.is_playing ? '\u23F8' : '\u25B6';
    volumeSlider.value = radioState.volume;
    volumeLabel.textContent = radioState.volume + '%';
    modeSelect.value = radioState.mode;
    if (radioState.station_index !== null) {
      stationSelect.value = radioState.station_index;
    }
    updateSummary();
  }

  function updateNowPlaying() {
    stationName.textContent = nowPlaying.station_name || 'No station';
    trackTitle.textContent = nowPlaying.track_title || '';
    bitrateEl.textContent = nowPlaying.bitrate || '';
    updateSummary();
  }

  function updateSummary() {
    if (typeof window.setWidgetSummary !== 'function') return;
    let text;
    if (!radioState.connected) {
      text = 'Offline';
    } else if (radioState.is_playing && nowPlaying.station_name && nowPlaying.track_title) {
      text = '\u266A ' + nowPlaying.station_name + ' \u2014 ' + nowPlaying.track_title;
    } else if (radioState.is_playing && nowPlaying.station_name) {
      text = '\u266A ' + nowPlaying.station_name;
    } else if (radioState.is_playing) {
      text = 'Playing';
    } else {
      text = 'Paused';
    }
    window.setWidgetSummary('#radio-widget', text);
  }
```

- [ ] **Step 2: Start the dev server and verify the Radio summary**

Run:

```bash
node server.js
```

Open `http://localhost:3000`. Collapse the Radio widget (click its header if expanded). Verify:

1. **Offline state:** If rpi-radio is not running, the summary line shows `Offline`.
2. **Summary persists across refresh:** Refresh — summary line still shows `Offline` (or whatever state).
3. **No console errors.**

If rpi-radio is available and playing a station, you should see `♪ {station} — {track}` in the summary line. If you can't reach a running rpi-radio from your local dev machine, just verify the `Offline` path — the live-data paths are covered by the same code path and will work on the Pi.

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add public/js/radio-widget.js
git commit -m "feat(dashboard): push radio summary on status/now-playing updates"
```

---

## Task 5: Wire the Signboard widget summary

**Files:**
- Modify: `public/js/signboard-widget.js` (add `updateSummary`, call from `renderHistory` and after sends, and at init)

- [ ] **Step 1: Add `updateSummary` and hook it in**

Edit `public/js/signboard-widget.js`.

First, add a new `updateSummary` function. Insert it just before the `// ---- Socket.io listeners` comment (currently at line 186). Add:

```javascript
  function updateSummary() {
    if (typeof window.setWidgetSummary !== 'function') return;
    let text;
    if (!sbState.connected) {
      text = 'Offline';
    } else if (history.length > 0 && history[0].text) {
      const msg = history[0].text;
      text = msg.length > 60 ? msg.slice(0, 60) + '\u2026' : msg;
    } else {
      text = 'No recent messages';
    }
    window.setWidgetSummary('#signboard-widget', text);
  }
```

Second, call `updateSummary()` from three places:

(a) At the end of `updateStatus` — find this existing block (currently lines 126-143):

```javascript
  function updateStatus() {
    if (!sbState.connected) {
      statusBadge.textContent = 'Offline';
      statusBadge.className = 'signboard-status-badge stopped';
      widget.classList.add('signboard-offline');
    } else {
      widget.classList.remove('signboard-offline');
      statusBadge.textContent = sbState.is_idle ? 'Idle' : 'Showing';
      statusBadge.className =
        'signboard-status-badge ' + (sbState.is_idle ? 'stopped' : 'running');
    }

    if (sbState.current_message && sbState.current_message.text) {
      currentLbl.textContent = 'Now: ' + sbState.current_message.text;
    } else {
      currentLbl.textContent = '';
    }
  }
```

Replace with (adds `updateSummary();` at the end):

```javascript
  function updateStatus() {
    if (!sbState.connected) {
      statusBadge.textContent = 'Offline';
      statusBadge.className = 'signboard-status-badge stopped';
      widget.classList.add('signboard-offline');
    } else {
      widget.classList.remove('signboard-offline');
      statusBadge.textContent = sbState.is_idle ? 'Idle' : 'Showing';
      statusBadge.className =
        'signboard-status-badge ' + (sbState.is_idle ? 'stopped' : 'running');
    }

    if (sbState.current_message && sbState.current_message.text) {
      currentLbl.textContent = 'Now: ' + sbState.current_message.text;
    } else {
      currentLbl.textContent = '';
    }

    updateSummary();
  }
```

(b) At the end of `renderHistory` — find this existing block (currently lines 145-184):

```javascript
  function renderHistory() {
    historyList.innerHTML = '';
    if (!history.length) {
      const empty = document.createElement('div');
      empty.className = 'signboard-history-empty';
      empty.textContent = 'No recent messages';
      historyList.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      /* ...existing row-building code unchanged... */
      historyList.appendChild(row);
    });
  }
```

Only two changes are needed:
1. Before the early `return` inside the `if (!history.length)` branch, call `updateSummary();`.
2. After the `forEach` loop, call `updateSummary();`.

Apply as two edits:

- Find the line `      historyList.appendChild(empty);` (inside the empty branch) and change the three lines from:

```javascript
      historyList.appendChild(empty);
      return;
    }
```

to:

```javascript
      historyList.appendChild(empty);
      updateSummary();
      return;
    }
```

- Find the `renderHistory` function's closing `}` that follows the `forEach` and insert `updateSummary();` on the line just before it. The tail of the function changes from:

```javascript
      historyList.appendChild(row);
    });
  }
```

to:

```javascript
      historyList.appendChild(row);
    });
    updateSummary();
  }
```

(c) Also call `updateSummary()` at init. Find the existing init block at the end of the IIFE (currently lines 232-236):

```javascript
  buildSwatches(fgSwatches, function (hex) { fgHex.value = hex; });
  buildSwatches(bgSwatches, function (hex) { bgHex.value = hex; });
  speedLabel.textContent = speedSlider.value;
  updateStatus();
  renderHistory();
```

Replace with (no change to flow, `renderHistory` already calls `updateSummary` now, so this step is optional but explicit):

```javascript
  buildSwatches(fgSwatches, function (hex) { fgHex.value = hex; });
  buildSwatches(bgSwatches, function (hex) { bgHex.value = hex; });
  speedLabel.textContent = speedSlider.value;
  updateStatus();
  renderHistory();
```

No change needed at init — `renderHistory()` already calls `updateSummary()`. Skip this sub-step.

- [ ] **Step 2: Start the dev server and verify the Signboard summary**

Run:

```bash
node server.js
```

Open `http://localhost:3000`. Collapse the Signboard widget. Verify:

1. **Offline or empty-history state:** Summary shows `Offline` (if rpi-signboard is not running) or `No recent messages` (if connected but no history).
2. **Summary persists across refresh.**
3. **No console errors.**

If a rpi-signboard instance is reachable with a non-empty history, the summary shows the last message's text (truncated at 60 chars with `…` if longer).

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add public/js/signboard-widget.js
git commit -m "feat(dashboard): push signboard summary on history + status updates"
```

---

## Task 6: Final verification

**Files:** none modified; runs existing test suite + full manual walkthrough.

- [ ] **Step 1: Run the existing Jest test suite**

Run:

```bash
npm test
```

Expected: all 29 tests pass across 4 suites (registry, systemctl, stats, routes). No new failures. The CLAUDE.md constraint is "All tests must pass on both Windows and the Pi before committing."

If any test fails, fix the root cause before proceeding — do not skip or mark a task complete.

- [ ] **Step 2: Full manual browser walkthrough on the dashboard**

Run:

```bash
node server.js
```

Open `http://localhost:3000` and verify the full flow:

1. **Fresh-state default:** DevTools → Application → Local Storage → clear both `widget-collapsed:radio` and `widget-collapsed:signboard` keys → hard-refresh. Both widgets should appear collapsed with their summary lines visible (offline / no-message text).
2. **Toggle Radio:** Click the Radio header — expands, chevron rotates down, `aria-expanded="true"` on the header and on the chevron button.
3. **Toggle Signboard:** Click the Signboard header — expands, chevron rotates down.
4. **Keyboard toggle:** Tab to a header, press Enter or Space — toggles.
5. **Persistence:** Expand Radio, collapse Signboard, refresh — state preserved for each widget independently.
6. **Badge still works:** Status badge text (`Offline`, `Paused`, `Playing`, `Idle`, `Showing`) updates correctly in both widgets whether collapsed or expanded.
7. **Services grid unchanged:** Below the widgets, the Services grid still renders and start/stop/restart buttons still work (they should — we didn't touch them).
8. **No console errors or warnings.**

Stop the dev server.

- [ ] **Step 3: Commit nothing (verification only)**

No changes are expected in this task — it's a validation gate. If changes were needed (e.g., fixing a regression surfaced by manual testing), add them as steps above and commit them under the appropriate task.

---

## Rollout

No deployment steps beyond the normal dashboard update. To publish on the Pi:

```bash
scp -r ./public ./views obrelix@192.168.1.201:/home/obrelix/rpi-hub/
ssh obrelix@192.168.1.201 "sudo systemctl restart rpi-hub"
```

Then visit `http://192.168.1.201:3000` and run the same manual walkthrough above.
