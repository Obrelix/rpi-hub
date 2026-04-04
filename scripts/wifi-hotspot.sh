#!/bin/bash
# wifi-hotspot.sh — Fallback hotspot monitor for RPi Hub
#
# If no WiFi connection is established within TIMEOUT seconds,
# activates the "RPi-Hub" hotspot so the Pi remains reachable.
# While in hotspot mode, periodically scans for known networks
# and switches back when one is found.
#
# Also manages the LED matrix: stops the current led-panel service,
# displays hotspot credentials on the matrix, and restores the
# previous service when WiFi reconnects.

HOTSPOT_CON="RPi-Hub"
TIMEOUT=120        # seconds without WiFi before activating hotspot
SCAN_INTERVAL=60   # seconds between scans while in hotspot mode
CHECK_INTERVAL=10  # seconds between connectivity checks

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DISPLAY_SCRIPT="$SCRIPT_DIR/hotspot-display.py"
DISPLAY_PID=""
PREV_LED_SERVICE=""

# LED panel services (from services.json group: led-panel)
LED_SERVICES="rpi-radio voidex maze-battlegrounds"

is_wifi_connected() {
  nmcli -t -f TYPE,STATE device status 2>/dev/null | grep -q "^wifi:connected"
}

is_hotspot_active() {
  nmcli -t -f NAME connection show --active 2>/dev/null | grep -qF "$HOTSPOT_CON"
}

hotspot_exists() {
  nmcli -t -f NAME connection show 2>/dev/null | grep -qF "$HOTSPOT_CON"
}

# Find which led-panel service is currently running
get_active_led_service() {
  for svc in $LED_SERVICES; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
      echo "$svc"
      return
    fi
  done
}

start_matrix_display() {
  if [ ! -f "$DISPLAY_SCRIPT" ]; then
    echo "[wifi-hotspot] Display script not found at $DISPLAY_SCRIPT"
    return
  fi

  # Save and stop current LED service
  PREV_LED_SERVICE="$(get_active_led_service)"
  if [ -n "$PREV_LED_SERVICE" ]; then
    echo "[wifi-hotspot] Stopping $PREV_LED_SERVICE to use the matrix"
    systemctl stop "$PREV_LED_SERVICE" 2>/dev/null
    sleep 1
  fi

  # Start the display script
  echo "[wifi-hotspot] Showing hotspot info on LED matrix"
  python3 "$DISPLAY_SCRIPT" &
  DISPLAY_PID=$!
}

stop_matrix_display() {
  # Kill the display script
  if [ -n "$DISPLAY_PID" ] && kill -0 "$DISPLAY_PID" 2>/dev/null; then
    echo "[wifi-hotspot] Stopping LED matrix display"
    kill "$DISPLAY_PID" 2>/dev/null
    wait "$DISPLAY_PID" 2>/dev/null
    DISPLAY_PID=""
  fi

  # Restore previous LED service
  if [ -n "$PREV_LED_SERVICE" ]; then
    echo "[wifi-hotspot] Restoring $PREV_LED_SERVICE"
    systemctl start "$PREV_LED_SERVICE" 2>/dev/null
    PREV_LED_SERVICE=""
  fi
}

activate_hotspot() {
  echo "[wifi-hotspot] No WiFi connection — activating hotspot"
  nmcli connection up "$HOTSPOT_CON" 2>/dev/null
  start_matrix_display
}

try_known_networks() {
  # Deactivate hotspot first so wlan0 can scan in station mode
  nmcli connection down "$HOTSPOT_CON" 2>/dev/null
  sleep 2

  # Let NetworkManager auto-connect to any known network
  nmcli device wifi rescan ifname wlan0 2>/dev/null
  sleep 10

  if is_wifi_connected; then
    echo "[wifi-hotspot] Connected to known network, hotspot deactivated"
    stop_matrix_display
    return 0
  else
    echo "[wifi-hotspot] No known network found, re-activating hotspot"
    nmcli connection up "$HOTSPOT_CON" 2>/dev/null
    return 1
  fi
}

cleanup() {
  echo "[wifi-hotspot] Shutting down"
  stop_matrix_display
  exit 0
}

trap cleanup SIGTERM SIGINT

# --- main loop ---

if ! hotspot_exists; then
  echo "[wifi-hotspot] Hotspot profile '$HOTSPOT_CON' not found — exiting"
  exit 1
fi

echo "[wifi-hotspot] Monitor started (timeout=${TIMEOUT}s, scan=${SCAN_INTERVAL}s)"

no_conn_seconds=0

while true; do
  if is_hotspot_active; then
    # In hotspot mode — periodically try known networks
    sleep "$SCAN_INTERVAL"
    try_known_networks
  elif is_wifi_connected; then
    # Connected normally — reset counter
    no_conn_seconds=0
    sleep "$CHECK_INTERVAL"
  else
    # Not connected and not in hotspot mode — count up
    no_conn_seconds=$((no_conn_seconds + CHECK_INTERVAL))
    if [ "$no_conn_seconds" -ge "$TIMEOUT" ]; then
      activate_hotspot
      no_conn_seconds=0
    fi
    sleep "$CHECK_INTERVAL"
  fi
done
