# RPi Hub

Web dashboard for managing Raspberry Pi services. Start, stop, and monitor systemd services from any device on the local network. Built for managing LED matrix applications (RPi Radio, Maze Battlegrounds, Voidex) but works with any systemd service.

## Features

- **Dashboard** -- service cards with live status, start/stop/restart controls, system stats (CPU, temperature, memory, disk)
- **Radio widget** -- play/pause, next/prev, volume, station select, mode switching for RPi Radio
- **Stations page** -- full playlist editor with inline editing, drag-and-drop reorder, CSV import/export, and per-station play buttons
- **Log viewer** -- live-streaming journalctl output for any managed service
- **System info** -- hardware and OS details
- **Deploy** -- git pull and file upload for managed services
- **Settings** -- hub configuration, service registry management, config file editor
- **Service groups** -- mutual exclusion (only one LED panel service runs at a time)
- **Real-time updates** -- Socket.io for live stats, service status changes, and radio control

## Screenshots

The dashboard runs at `http://<pi-ip>:3000` and works on any browser.

## Quick Start

### Install

```bash
git clone https://github.com/Obrelix/rpi-hub.git
cd rpi-hub
chmod +x install.sh
./install.sh
```

The install script installs Node.js if needed, copies files to `/home/obrelix/rpi-hub/`, installs npm dependencies, and sets up the systemd service.

### Run as a service

```bash
sudo systemctl start rpi-hub
sudo journalctl -u rpi-hub -f
```

### Run in development

```bash
npm install
npm start
```

The hub runs on port 3000 by default (configurable in `config.json`).

### Run tests

```bash
npm test
```

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Service cards, system stats, radio widget |
| Stations | `/stations` | Radio station playlist editor |
| Logs | `/logs` | Live journalctl log viewer |
| System | `/system` | Hardware and OS information |
| Deploy | `/deploy` | Git pull and file upload for services |
| Settings | `/settings` | Hub config, service registry, config file editor |

## Project Structure

```
server.js                Entry point: HTTP server + Socket.io
app.js                   Express app, middleware, routes

routes/
  dashboard.js           GET /, service start/stop/restart API
  stations.js            GET /stations
  logs.js                GET /logs
  system.js              GET /system
  deploy.js              GET /deploy, POST deploy endpoints
  settings.js            GET /settings, config management API

views/
  layout.ejs             Shared layout (nav, head)
  dashboard.ejs          Dashboard with stats, radio widget, service grid
  stations.ejs           Station management page
  logs.ejs               Log viewer
  system.ejs             System info
  deploy.ejs             Deploy page
  settings.ejs           Settings page
  partials/footer.ejs    Shared footer (Socket.io, toast, page script)

public/
  js/
    dashboard.js         Stats display, service control buttons
    radio-widget.js      Radio playback controls (Socket.io)
    stations.js          Station table: inline edit, drag-drop, CSV, save
    logs.js              Log streaming
    deploy.js            Deploy actions
    toast.js             Toast notification utility
  css/
    style.css            GitHub-dark theme

sockets/
  index.js               Socket.io setup orchestrator
  radio.js               Radio command relay (browser <-> rpi-radio)
  stats.js               System stats broadcast
  logs.js                Journalctl log streaming

services/
  registry.js            Service registry (services.json CRUD)
  systemctl.js           systemctl CLI wrapper
  stats.js               CPU, temperature, memory, disk metrics
  deploy.js              Git pull + file upload handling
```

## Service Registry

Services are registered in `services.json`:

```json
{
  "rpi-radio": {
    "name": "RPi Radio",
    "unit": "rpi-radio.service",
    "deployPath": "/home/obrelix/rpi-radio",
    "repo": "https://github.com/Obrelix/rpi-radio.git",
    "configFile": "/home/obrelix/rpi-radio/config.json",
    "group": "led-panel",
    "description": "Internet radio with LED matrix visualizer"
  }
}
```

**Fields:**
- `name` -- display name
- `unit` -- systemd unit name
- `deployPath` -- filesystem path for deploy operations
- `repo` -- git repository URL for pull-based deploys
- `configFile` -- path to editable config file (shown in Settings)
- `group` -- service group for mutual exclusion (e.g., `led-panel`)
- `description` -- shown on the dashboard

Services in the same `group` are mutually exclusive. Starting one automatically stops others in the group.

## Configuration

### config.json

```json
{
  "port": 3000,
  "statsIntervalMs": 2000,
  "maxUploadSizeMb": 50
}
```

- `port` -- HTTP server port
- `statsIntervalMs` -- how often to broadcast system stats (milliseconds)
- `maxUploadSizeMb` -- max file upload size for deploy

## Socket.io Events

### System

| Event | Direction | Description |
|-------|-----------|-------------|
| `stats` | server -> browser | CPU, temp, memory, disk (every `statsIntervalMs`) |
| `service-status-changed` | server -> browser | After start/stop/restart |
| `toast` | server -> browser | Notification message |
| `log-line` | server -> browser | Live journalctl output |

### Radio Relay

rpi-hub relays commands between dashboard browsers and the rpi-radio service:

| Event | Direction | Description |
|-------|-----------|-------------|
| `radio:play` | browser -> rpi-radio | Play station (optionally by index) |
| `radio:pause` | browser -> rpi-radio | Pause playback |
| `radio:next` / `radio:prev` | browser -> rpi-radio | Navigate stations |
| `radio:volume` | browser -> rpi-radio | Set volume 0-100 |
| `radio:mode` | browser -> rpi-radio | Switch visualization mode |
| `radio:stations-update` | browser -> rpi-radio | Replace full station list (save) |
| `radio:stations-export` | browser -> rpi-radio | Request station list |
| `radio:status` | rpi-radio -> browser | Playback state, volume, index |
| `radio:now-playing` | rpi-radio -> browser | Station name, track, bitrate |
| `radio:stations` | rpi-radio -> browser | Full station list |

## Managed Services

Currently registered:

| Service | Description | Group |
|---------|-------------|-------|
| [RPi Radio](https://github.com/Obrelix/rpi-radio) | Internet radio with LED matrix visualizer | led-panel |
| [Maze Battlegrounds](https://github.com/Obrelix/RPI-Maze-Battlegrounds) | 1v1 tactical shooter on LED matrix | led-panel |
| Voidex | Clock and weather display on LED matrix | led-panel |

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express 5
- **Templates:** EJS
- **Real-time:** Socket.io
- **Frontend:** Vanilla JS (no frameworks)
- **Styling:** Custom CSS (GitHub-dark theme)

## License

MIT
