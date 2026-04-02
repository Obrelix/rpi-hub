#!/bin/bash
set -e

INSTALL_DIR="/home/obrelix/rpi-hub"
SERVICE_FILE="rpi-hub.service"

echo "=== RPi Hub Installer ==="

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "Node.js not found. Installing..."
  sudo apt update
  sudo apt install -y nodejs npm
fi

echo "Node.js version: $(node --version)"

# Create install directory
echo "Installing to ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"

# Copy project files
rsync -av --exclude='node_modules' --exclude='.git' --exclude='tests' ./ "${INSTALL_DIR}/"

# Install dependencies
echo "Installing npm dependencies..."
cd "${INSTALL_DIR}"
npm install --production

# Install systemd service
echo "Installing systemd service..."
sudo cp "${INSTALL_DIR}/${SERVICE_FILE}" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable rpi-hub

echo ""
echo "=== Installation complete! ==="
echo ""
echo "Start the hub:    sudo systemctl start rpi-hub"
echo "View logs:         sudo journalctl -u rpi-hub -f"
echo "Access dashboard:  http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "Edit services.json to configure managed services."
