# rpi-podcast — Hub-Side Design

**Date:** 2026-04-24
**Scope:** Changes to `rpi-hub` to support a new managed service, `rpi-podcast`, that plays podcast episodes from a user-maintained playlist of direct audio URLs. This document specifies the hub side only; `rpi-podcast`'s internal architecture (audio engine, LED rendering, on-disk files) is its own concern and is referenced here only where it defines a contract the hub depends on.

## Goals

Add a first-class podcast player to the hub that feels like a sibling of `rpi-radio`: a dashboard widget, a dedicated management page, real-time status over Socket.io, and group-based mutex with the other LED-panel services. Keep the hub a thin control plane — audio playback, playlist storage, and position persistence live in `rpi-podcast`.

## Non-Goals

- **No subscription model.** The playlist is a flat, user-owned list of episode URLs. No feed polling, no automatic episode ingestion, no unlistened-counts.
- **No embedded playback.** rpi-hub does not play audio. Audio belongs to `rpi-podcast`.
- **No full visualizer.** The LED panel shows a scrolling episode title only; spectrum/waveform modes are explicitly out of scope.
- **No authentication.** Matches the rest of rpi-hub: LAN-only, trusted network.

## Architecture Overview

Two cooperating processes, mirroring the radio pattern:

```
[Browser] <--Socket.io--> [rpi-hub] <--Socket.io--> [rpi-podcast]
                              |                           |
                              |                           +-- audio out (mpv/vlc via IPC)
                              |                           +-- LED panel (scrolling title)
                              |                           +-- playlist.json / positions.json
                              |
                              +-- services/rss.js (feed parse for import helper)
                              +-- systemctl mutex via services.json group: led-panel
```

**Roles:**

- **rpi-hub** — Socket.io relay between browsers and `rpi-podcast`; RSS feed fetcher/parser used by the `Import RSS` helper on the podcasts page; page/widget renderer; systemd controller via the existing services.json mechanism. No audio, no playback, no playlist storage.
- **rpi-podcast** — Owns playlist, owns position persistence, owns audio playback, owns LED rendering. Connects to rpi-hub as a Socket.io client and identifies itself by emitting `podcast:status`.
- **Mutex** — `group: "led-panel"` in `services.json`. Starting `rpi-podcast` auto-stops `rpi-radio` (and vice versa) via the existing registry logic. No new mutex code.

## Hub-Side Components

### New files

| File | Role | Mirrors |
|---|---|---|
| `sockets/podcast.js` | Socket.io relay + in-memory state cache (status, now-playing, playlist, position) | `sockets/radio.js` |
| `routes/podcasts.js` | `GET /podcasts` renders the playlist editor; `POST /podcasts/rss-preview` fetches/parses an RSS URL and returns an episode list | `routes/stations.js` + new RSS endpoint |
| `services/rss.js` | Fetches RSS feed URL, parses episode entries, returns `{show, episodes: [{title, url, duration, pubDate}]}`. Input-validates URL, enforces size/time limits. | New |
| `views/podcasts.ejs` | Full playlist editor page: sticky now-playing bar with seek slider, playlist table, RSS import modal, CSV import/export | `views/stations.ejs` |
| `public/js/podcast-widget.js` | Dashboard widget client: play/pause/prev/next/volume, status badge, now-playing title (no seek bar on the dashboard) | `public/js/radio-widget.js` |
| `public/js/podcasts.js` | `/podcasts` page client: table rendering, inline edit, drag-reorder, CSV import/export, RSS import modal, seek slider, save-with-unsaved-tracking | `public/js/stations.js` |
| `tests/services/rss.test.js` | Unit tests for RSS parsing, URL validation, size/timeout guards | — |
| `tests/routes/podcasts.test.js` | Integration tests for `/podcasts` page + `/podcasts/rss-preview` endpoint (mocked `RssService`) | `tests/routes/dashboard.test.js` pattern |

### Modifications to existing files

| File | Change |
|---|---|
| `app.js` | `require('./routes/podcasts')`, mount it; instantiate `RssService` and `app.set('rss', …)` |
| `sockets/index.js` | Call `setupPodcastSocket(io)` alongside the existing `setupRadioSocket(io)` |
| `views/dashboard.ejs` | Add podcast widget markup modeled on `.radio-widget`; include `/js/podcast-widget.js` in the script block |
| `views/layout.ejs` | Insert `Podcasts` nav link between `Stations` and `Settings` |
| `services.json` | Add new `"rpi-podcast"` entry with `group: "led-panel"` |
| `public/css/style.css` | Rules scoped to `.podcast-widget`, `.podcast-page`, `.rss-import-modal`, `.seek-slider`. Reuse existing color/spacing tokens. |
| `tests/services/registry.test.js` | Assert the new `rpi-podcast` entry is loaded and participates in `led-panel` group-membership lookup |
| `tests/routes/dashboard.test.js` | Assert dashboard HTML contains `id="podcast-widget"` |

No changes to `services/systemctl.js`, `services/registry.js`, `services/stats.js`, or `services/deploy.js` — the existing start/stop/restart pipeline handles `rpi-podcast` transparently once registered.

## Socket.io Event Contract

Every event is namespaced `podcast:*`. The hub caches the latest `podcast:status`, `podcast:now-playing`, `podcast:playlist`, and `podcast:position` and replays them to newly connected browsers, matching the radio relay.

### rpi-podcast → hub (broadcast to browsers, cached)

| Event | Payload | When |
|---|---|---|
| `podcast:status` | `{is_playing, volume, episode_index, episode_count, connected}` | On connect (identifies itself to the relay); on any state change |
| `podcast:now-playing` | `{episode_name, show, duration, position}` | When the episode changes; when metadata becomes known |
| `podcast:playlist` | `[{name, url, duration?, show?}, …]` | On connect; after a `podcast:playlist-update` has been applied |
| `podcast:position` | `{position, duration}` | Every 1 s while playing |

### Browser → hub (relayed to rpi-podcast)

| Event | Payload | Behavior |
|---|---|---|
| `podcast:play` | `{index?, position?}` | Play current if no `index`; otherwise jump to the item at `index`. If `position` is absent, rpi-podcast auto-resumes from its stored position for that URL. `position: 0` explicitly restarts. |
| `podcast:pause` | `{}` | rpi-podcast persists current position to `positions.json` on pause. |
| `podcast:next` / `podcast:prev` | `{}` | rpi-podcast persists current position before switching. |
| `podcast:volume` | `{volume}` | 0–150, same scale as radio. Hub clamps out-of-range values before forwarding. |
| `podcast:seek` | `{position}` | Seconds. rpi-podcast seeks the audio engine and updates its stored position for that URL. |
| `podcast:playlist-update` | `[{name, url, …}, …]` | Full replacement. rpi-podcast writes its `playlist.json` and re-emits `podcast:playlist` so browsers converge. |

### Disconnect behavior

On rpi-podcast disconnect the hub broadcasts `{is_playing: false, connected: false}` and clears its relay socket ID — same code path shape as `sockets/radio.js`. Cached `playlist` and `now-playing` are retained so the UI does not flash empty during a transient reconnect; they are overwritten on the next `podcast:status`.

### Not on the Socket.io wire

RSS preview is a browser → hub HTTP call only, not routed through rpi-podcast:

- `POST /podcasts/rss-preview` with `{feedUrl}` → `{show, episodes: [{title, url, duration, pubDate}]}`.

The browser decides which episodes to push into its local working copy; the selection is sent to rpi-podcast only when the user clicks `Save` on the main toolbar (as a `podcast:playlist-update`).

## Data Model

### Owned by rpi-podcast (on the Pi at `/home/obrelix/rpi-podcast/`)

`playlist.json` — flat ordered array:

```json
[
  { "name": "Ep 142: Rust vs Zig", "url": "https://…/ep142.mp3", "duration": 5412, "show": "Software Unscripted" },
  { "name": "Latest news roundup",  "url": "https://…/news.mp3", "duration": null, "show": null }
]
```

Only `name` and `url` are required. `duration` (seconds) and `show` are optional and populated by the RSS importer when available.

`positions.json` — resume map, keyed by **URL** (not index):

```json
{
  "https://…/ep142.mp3": 1823,
  "https://…/news.mp3": 45
}
```

rpi-podcast writes this on pause, seek, next/prev, and before clean shutdown. On `podcast:play` without an explicit `position`, rpi-podcast looks up the URL here. A saved position within 10 seconds of `duration` is treated as "finished" and reset to 0, so a just-finished episode does not instantly mark itself done the next time it is selected.

**Rationale for URL-keyed positions:** the playlist is reordered and edited routinely. Index-keyed positions would corrupt resume state on every edit. Keying by URL is stable across reorders and survives remove-and-re-add.

### Owned by rpi-hub

No persistent storage is added. The hub caches state in memory only (same pattern as radio) and loses it on restart. rpi-podcast re-pushes state on reconnect.

### services.json entry

```json
"rpi-podcast": {
  "name": "RPi Podcast",
  "unit": "rpi-podcast.service",
  "deployPath": "/home/obrelix/rpi-podcast",
  "repo": "https://github.com/Obrelix/rpi-podcast.git",
  "configFile": "/home/obrelix/rpi-podcast/config.json",
  "group": "led-panel",
  "description": "Podcast player with LED title scroller"
}
```

## UI

### Dashboard widget (`views/dashboard.ejs` + `public/js/podcast-widget.js`)

Structurally mirrors the radio widget.

- **Header** — title `RPi Podcast`, collapsible, status badge (`Offline` / `Playing` / `Paused`), summary line for the collapsed state: `♪ <show> — <episode>`.
- **Body** — now-playing block (show name, episode name, `mm:ss / mm:ss` under it), transport buttons (prev / play-pause / next), volume slider, playlist select dropdown.
- **No seek bar on the dashboard** — seek is a page-only control. Keeps the widget compact and matches the radio widget's density.
- Clicking the header navigates to `/podcasts` (same pattern as the radio header → `/stations`).

### /podcasts page (`views/podcasts.ejs` + `public/js/podcasts.js`)

Mirrors the stations page with two additions: a seek slider and an RSS import modal.

- **Sticky now-playing bar** at the top: prev / play-pause / next, episode name + show, **seek slider with position/duration labels**, volume, status badge.
- **Toolbar**: `Import RSS`, `Import CSV`, `Export CSV`, `+ Add Episode`, `Remove Selected`, `Save`.
- **Table rows**: drag handle, `#`, select checkbox, play button, `Name`, `URL`, `Show`, `Duration`. Inline edit on Name/URL/Show (double-click). `Duration` is read-only — filled by RSS import, otherwise blank.
- **Unsaved-change detection** exactly as on the stations page: `Save` highlights when dirty; playing an item with unsaved changes auto-saves first so indices stay consistent.

### RSS import modal

Opened from `Import RSS` on the /podcasts page:

1. Input: feed URL. Submit triggers `POST /podcasts/rss-preview`.
2. Result panel: feed show name + scrollable list of episodes (title, pubDate, duration), each with a checkbox.
3. Actions: `Select all newest N`, `Add selected to playlist`. Added items append to the local working copy; they are not persisted until the user clicks `Save` on the main toolbar.

### Navigation

`views/layout.ejs`: insert `Podcasts` between `Stations` and `Settings`.

### Styling

New rules in `public/css/style.css` scoped to `.podcast-widget`, `.podcast-page`, `.rss-import-modal`, `.seek-slider`. Reuse existing color and spacing tokens — no palette additions. The seek slider is styled consistently with the existing `.radio-volume` range input.

## Dependencies

This feature adds **one** new runtime dependency to rpi-hub: a small XML parser to support `services/rss.js`. The project's stated preference is a minimal dependency footprint, so the implementation plan should pick a lightweight, maintained package (e.g. `fast-xml-parser`) rather than a full podcast-feed abstraction. RSS 2.0 `<enclosure>` extraction and Atom `<link rel="enclosure">` extraction are trivial once the XML is parsed; no feed-specific library is needed.

No new client-side dependencies. No changes to existing dependencies.

## Error Handling

### rpi-podcast disconnect

- Hub broadcasts `{is_playing: false, connected: false}` and clears the relay socket ID (matching `sockets/radio.js`).
- Browser widget/page show `Offline` badge; controls remain visible but are effectively emit-only — the hub silently drops relayed commands when `rpi-podcast` is not connected, matching radio's behavior.

### RSS fetch failures (`services/rss.js`)

- **URL validation**: must be `http://` or `https://`; must parse as a URL. Reject non-http(s) schemes, loopback hostnames, and private-range IPs defensively (the hub runs as root; SSRF into the hub itself or localhost services must be blocked).
- **Fetch limits**: 10 s timeout, 5 MB max body. Use a streaming size check so a malicious feed cannot OOM the hub.
- **Parse failures** (invalid XML, not an RSS/Atom feed, no `<enclosure>` items): the route returns `400` with a short error message. The UI surfaces it in the modal; no toast spam.
- **No retries** on the hub side. The user can click again.

### Malformed browser input

- `podcast:volume` out of range → clamped to 0–150 in the hub relay before forwarding.
- `podcast:seek` with negative or non-numeric `position` → dropped silently, not forwarded.
- `podcast:playlist-update` must be an array where each entry has `name` (string) and `url` (valid http/https URL). Reject the whole update if malformed; the browser's local copy is unchanged because no `podcast:playlist` echo comes back.

### Playlist save race

Two browsers editing simultaneously: last write wins, same as the stations page today. Not worth solving at LAN-only two-user scale.

### Position persistence failures (rpi-podcast side)

Out of scope for the hub. rpi-podcast must tolerate `positions.json` being absent or corrupt by treating it as an empty map — documented here as a contract, not enforced by the hub.

### Systemd mutex edge cases

- Starting `rpi-podcast` while `rpi-radio` is running → the existing registry group logic stops `rpi-radio` first. No change.
- rpi-podcast crash-restart loop → surfaced through the existing systemd log route; no hub-level handling added.

## Testing

Follows the existing Jest conventions (mock the `services/` layer; route integration tests verify HTTP status codes and key HTML markers; pure functions tested directly).

### New test files

**`tests/services/rss.test.js`** — unit tests, fixture-driven, no network:

- Parse valid RSS 2.0 feed with `<enclosure>` → correct episode list; duration parsed from `itunes:duration` in both `HH:MM:SS` and plain-seconds forms.
- Parse Atom feed → correct episode list (audio `<link rel="enclosure">`).
- Feed with no audio enclosures → returns `[]` with `show` populated.
- Malformed XML → throws a typed error consumers can catch.
- URL validator rejects: non-http(s) schemes, loopback hostnames, private-range IPs, malformed URLs.
- Size limit: streaming a 5 MB + 1 byte fixture aborts the parse.
- Timeout: mocked slow response → rejects after the configured timeout (fake timers).

**`tests/routes/podcasts.test.js`** — integration tests, mock `RssService`:

- `GET /podcasts` → 200, HTML contains the `Podcasts` heading and the seek slider element.
- `POST /podcasts/rss-preview` with valid body and mocked RSS → 200 JSON with `{show, episodes: [...]}`.
- `POST /podcasts/rss-preview` with missing or invalid `feedUrl` → 400.
- `POST /podcasts/rss-preview` when `RssService` throws → 400 with the error message (no 500; no stack leak).

### Extensions to existing tests

- **`tests/services/registry.test.js`** — assert the new `rpi-podcast` entry is loaded, has `group: "led-panel"`, and participates in the group-membership lookup. Same assertion shape as the existing `rpi-radio` case.
- **`tests/routes/dashboard.test.js`** — assert dashboard HTML contains `id="podcast-widget"`. Add a matching assertion for the radio widget if one does not already exist.

### Explicitly not tested

- `sockets/podcast.js` — matches the existing decision not to test `sockets/radio.js`. The relay is trivial wiring and a Socket.io harness would be disproportionate to value. Add tests if a bug surfaces.
- Client-side JS (`podcast-widget.js`, `podcasts.js`) — matches the existing project convention of manual testing for client code.
- End-to-end with a real rpi-podcast process — out of scope for the hub's test suite. rpi-podcast will have its own tests in its own repo.

### Verification before commit

```bash
npm test
```

All existing tests plus the new cases must pass on Windows. A Pi-side smoke test (start `rpi-podcast`, verify widget + seek + resume + mutex with `rpi-radio`) is required before the feature is considered done but is not covered by the unit-test suite.
