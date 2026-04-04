#!/usr/bin/env python3
"""Display hotspot credentials on the LED matrix."""

import signal
import sys
import time

sys.path.insert(0, "/home/obrelix/rpi-rgb-led-matrix/bindings/python")

from rgbmatrix import RGBMatrix, RGBMatrixOptions, graphics

# --- configuration ---
ROWS = 64
COLS = 128
CHAIN = 1
GPIO_MAPPING = "adafruit-hat"
SLOWDOWN = 3
PANEL_TYPE = "FM6126A"
BRIGHTNESS = 60

FONT_DIR = "/home/obrelix/rpi-rgb-led-matrix/fonts"

# --- colors ---
COLOR_LABEL = (100, 100, 120)   # muted blue-grey for labels
COLOR_VALUE = (80, 180, 255)    # bright blue for values
COLOR_URL   = (60, 200, 100)    # green for the URL

# --- content ---
LINES = [
    ("SSID:", "RPi-Hub",               COLOR_LABEL, COLOR_VALUE),
    ("PSW:",  "rpihub1234",            COLOR_LABEL, COLOR_VALUE),
    ("Web:",  "http://10.42.0.1:3000", COLOR_LABEL, COLOR_URL),
]


def main():
    # Load fonts BEFORE creating RGBMatrix (privilege drop restriction)
    font_label = graphics.Font()
    font_label.LoadFont(f"{FONT_DIR}/5x8.bdf")

    font_value = graphics.Font()
    font_value.LoadFont(f"{FONT_DIR}/7x13.bdf")

    # Create matrix
    options = RGBMatrixOptions()
    options.rows = ROWS
    options.cols = COLS
    options.chain_length = CHAIN
    options.hardware_mapping = GPIO_MAPPING
    options.gpio_slowdown = SLOWDOWN
    options.panel_type = PANEL_TYPE

    matrix = RGBMatrix(options=options)
    matrix.brightness = BRIGHTNESS
    canvas = matrix.CreateFrameCanvas()

    # Handle graceful shutdown
    running = True

    def shutdown(signum, frame):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    # Draw the info
    while running:
        canvas.Clear()

        y_offset = 4  # top padding
        line_spacing = 20  # vertical space per line

        for label, value, label_color, value_color in LINES:
            # Draw label
            lc = graphics.Color(*label_color)
            y = y_offset + 8  # baseline for 5x8 font
            graphics.DrawText(canvas, font_label, 2, y, lc, label)

            # Draw value on the next line, indented
            vc = graphics.Color(*value_color)
            y_val = y + 12  # baseline for 7x13 font below label
            graphics.DrawText(canvas, font_value, 4, y_val, vc, value)

            y_offset += line_spacing

        canvas = matrix.SwapOnVSync(canvas)
        time.sleep(1)

    # Cleanup
    canvas.Clear()
    matrix.SwapOnVSync(canvas)


if __name__ == "__main__":
    main()
