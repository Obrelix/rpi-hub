# CLAUDE.md

Project instructions for Claude Code. These instructions override default behavior.

## Project Overview

RPi Hub is a lightweight web dashboard for managing systemd services on a Raspberry Pi. It runs as a Node.js web server and lets users start/stop/restart LED matrix applications (Maze Battlegrounds, Voidex, and future services) from any device on the local network. It also provides live log streaming, system stats, OTA deployment, and config editing.

**Version:** 0.1.0
**Runtime:** Node.js, Express, EJS, Socket.io
**Target Hardware:** Raspberry Pi 4 (4GB) at `192.168.1.201`
**Access:** `http://192.168.1.201:3000` (LAN only, no authentication)

## Hardware Access

The Raspberry Pi is accessible via SSH:
```bash
ssh obrelix@192.168.1.201
```

The hub is deployed at `/home/obrelix/rpi-hub/` on the Pi.

## Commands

### Run Locally (Development)
```bash
cd rpi-hub
node server.js
# Dashboard at http://localhost:3000
```

System stats (CPU, temperature, memory) read from `/proc` and `/sys`, so they only produce real data on Linux. On Windows, the stats broadcast catches errors silently and the dashboard shows placeholder values.

### Run Tests
```bash
npm test
# or directly:
npx jest --verbose
```

29 tests across 4 suites: registry, systemctl, stats (unit tests) and routes (integration tests). All tests must pass on both Windows and the Pi before committing.

### Deploy to Pi
```bash
scp -r ./* obrelix@192.168.1.201:/home/obrelix/rpi-hub/
ssh obrelix@192.168.1.201 "cd /home/obrelix/rpi-hub && npm install --production && sudo systemctl restart rpi-hub"
```

### Systemd Service
```bash
sudo systemctl start rpi-hub
sudo systemctl stop rpi-hub
sudo systemctl restart rpi-hub
sudo journalctl -u rpi-hub -f
```

### First-Time Installation
```bash
# On the Pi:
git clone https://github.com/Obrelix/rpi-hub.git
cd rpi-hub
sudo bash install.sh
```

## Architecture

Entry point is `server.js`, which creates the HTTP server, attaches Socket.io, and starts the stats broadcast. `app.js` is the Express factory that wires middleware, services, and routes.

### Module Responsibilities

| Module | Role |
|--------|------|
| `server.js` | HTTP server, Socket.io init, starts stats broadcast |
| `app.js` | Express factory: middleware, service instances, route mounting, error handlers |
| `services/registry.js` | Loads/saves `services.json`, group membership lookups, CRUD for service entries |
| `services/systemctl.js` | Wraps `systemctl` and `journalctl` via `child_process.exec` with input validation |
| `services/stats.js` | Reads CPU, temperature, memory, disk from `/proc` filesystem and shell commands |
| `services/deploy.js` | Git pull via `spawn`, zip/tar extraction for uploaded archives |
| `sockets/index.js` | Registers all Socket.io event handlers |
| `sockets/stats.js` | Broadcasts system metrics to all clients every 2 seconds |
| `sockets/logs.js` | Manages per-client `journalctl -f` child processes for live log streaming |
| `routes/dashboard.js` | Dashboard page + service start/stop/restart API endpoints |
| `routes/logs.js` | Log viewer page |
| `routes/system.js` | System info page (hostname, CPU, memory, disk, network) |
| `routes/deploy.js` | Deploy page with git pull and file upload endpoints |
| `routes/settings.js` | Settings page for hub config, service registry, and config file editing |

### Data Flow

```
Browser (any LAN device)
  -> Express routes (pages + API endpoints)
    -> services/ layer (systemctl, registry, stats, deploy)
      -> systemd (start/stop/restart managed services)
      -> /proc filesystem (system stats)
      -> journalctl (log streaming via Socket.io)
  <- EJS templates (server-rendered HTML)
  <- Socket.io (real-time stats, status changes, log lines, deploy progress)
```

### File Organization

```
routes/     HTTP request handling, renders views
services/   Business logic (systemctl calls, stats collection, deploy operations)
sockets/    Socket.io real-time event handling
views/      EJS templates (server-rendered), layout.ejs + partials/footer.ejs pattern
public/     Static assets: CSS dark theme, client-side JS (Socket.io clients)
tests/      Jest tests: services/ for unit tests, routes/ for integration tests
```

## Key Design Decisions

<context_for_rules>
These constraints exist for specific reasons. Understanding them helps you make correct decisions in ambiguous situations.
</context_for_rules>

- **Group-based mutual exclusion.** Services in `services.json` can have a `group` field (e.g., `"led-panel"`). Services in the same group share hardware and cannot run simultaneously. Starting one auto-stops any running service in the same group. This exists because both Maze Battlegrounds and Voidex need exclusive GPIO access to the same LED matrix panel.

- **Runs as root.** The `rpi-hub.service` runs as root because `systemctl start/stop` requires elevated privileges to manage other services. Keep this in mind when handling user input — all file operations and shell commands execute with root permissions.

- **Input validation is security-critical.** Because the hub runs as root and accepts input from the LAN:
  - Unit names are validated against `/^[a-zA-Z0-9._@:-]+$/` before any shell command to prevent command injection.
  - Config file paths are restricted to `/home/obrelix/` to prevent arbitrary file read/write.
  - Zip uploads are checked for path traversal (zip slip) before extraction.
  - When adding new routes or features that accept user input, apply the same validation patterns found in `services/systemctl.js` and `routes/settings.js`.

- **`systemctl show` output is parsed as key=value pairs, not by line position.** The `--value` flag returns properties in systemd's internal order, which varies across systems. The `getStatus()` method in `services/systemctl.js` parses `Key=Value` format to be order-independent. Do not switch to `--value` parsing.

- **EJS layout uses a split include pattern.** Each page template starts with `<%- include('layout') %>` and ends with `<%- include('partials/footer') %>`. `layout.ejs` opens the HTML document through the `<main>` tag; `footer.ejs` closes it and injects Socket.io + page scripts. This is fragile — every page must include both, and the nav active state is driven by the `activePage` template variable.

- **Socket.io is used for four concerns:** stats broadcasting (every 2s timer), service status change notifications (triggered by route handlers via `io.emit`), live log streaming (per-client `journalctl` child processes), and deploy progress output. The `io` instance is shared via `app.set('io', io)`.

- **`services.json` is the runtime service registry.** It's read at startup and modified at runtime through the Settings page. When adding a new managed service, add an entry here — no code changes needed. The `services.json.example` pattern is not used; the file ships with maze-battlegrounds and voidex pre-configured.

## Config Files

| File | Purpose | Modified at runtime? |
|------|---------|---------------------|
| `config.json` | Hub settings: port (3000), statsIntervalMs (2000), maxUploadSizeMb (50) | Yes, via Settings page. Port changes require service restart. |
| `services.json` | Service registry: name, systemd unit, deploy path, repo URL, config file path, group, description | Yes, via Settings page. Changes take effect on next page load. |

## Testing

Tests use Jest. The test suite mocks `child_process.exec` for systemctl tests, and mocks both `Systemctl` and `Stats` classes for integration tests, so tests run on any platform without requiring systemd or `/proc`.

When writing new tests:
- Mock the `services/` layer, not the routes directly. Route integration tests should verify HTTP status codes and that response HTML contains expected content.
- Use `jest.mock()` at the module level. The integration test file (`tests/routes/dashboard.test.js`) shows the pattern for mocking Systemctl, Stats, and DeployService.
- Pure parsing functions (like `parseMeminfo`, `parseCpuPercent`, `parseDf`, `parseTemperature` in `services/stats.js`) can be tested directly without mocks.

## Code Conventions

- Node.js with CommonJS (`require`/`module.exports`), not ES modules.
- Express routes export a router and are mounted in `app.js` with `app.use('/', router)`.
- Service classes are instantiated once in `app.js` and stored via `app.set('name', instance)`. Routes access them via `req.app.get('name')`.
- CSS uses custom properties (CSS variables) defined in `:root` in `public/css/style.css`. The theme is dark with GitHub-inspired colors: `--bg-primary: #0f1117`, `--bg-secondary: #161b22`, `--accent: #58a6ff`.
- Client-side JS files are wrapped in IIFEs with `'use strict'` and expose necessary functions via `window.*` for inline `onclick` handlers in templates.
- Toast notifications use `showToast(message, type)` from `public/js/toast.js`, which is loaded on every page via the footer partial.

## Dependencies

| Package | Purpose |
|---------|---------|
| `express` | Web server and routing |
| `ejs` | Server-side HTML templates |
| `socket.io` | Real-time bidirectional communication |
| `multer` | Multipart file upload handling |
| `adm-zip` | ZIP extraction for uploaded deploy archives |
| `tar` | Tar/gzip extraction for uploaded deploy archives |
| `jest` (dev) | Test framework |

No other runtime dependencies. The project intentionally keeps a minimal dependency footprint for reliability on the Pi.
