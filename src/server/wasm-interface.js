'use strict';

const fs = require('fs');
const path = require('path');
const { Duplex } = require('stream');
const crypto = require('crypto');

// Path to the WASM binary
const WASM_PATH = path.join(__dirname, '../wasm/proxy.wasm');

// Module state
let wasmInstance = null;
let memory = null;
let initialized = false;
let wasmExports = null;

// Configuration settings
let config = {
  enableEncryption: false,
  connectionTimeoutMs: 30000,
  bypassDomains: [],
  dnsResolver: "system",
  maxConnections: 100,
  customHeaders: {},
  proxyMode: "direct"
};

/**
 * Allocates memory in the WASM module and copies a string to it
 * @param {string} str - String to copy into WASM memory
 * @returns {number} - Pointer to the string in WASM memory
 */
function allocateString(str) {
  const encoder = new TextEncoder();
  const encodedString = encoder.encode(str);
  const ptr = wasmExports.allocate(encodedString.length + 1);
  
  // Copy string to WASM memory
  const wasmMemoryArray = new Uint8Array(memory.buffer);
  wasmMemoryArray.set(encodedString, ptr);
  wasmMemoryArray[ptr + encodedString.length] = 0; // Null terminator
  
  return ptr;
}

/**
 * Reads a string from WASM memory
 * @param {number} ptr - Pointer to the string in WASM memory
 * @param {number} length - Length of the string
 * @returns {string} - String read from WASM memory
 */
function readString(ptr, length) {
  const wasmMemoryArray = new Uint8Array(memory.buffer, ptr, length);
  const decoder = new TextDecoder();
  return decoder.decode(wasmMemoryArray);
}

/**
 * Allocates memory in the WASM module and copies a buffer to it
 * @param {Buffer} buffer - Buffer to copy into WASM memory
 * @returns {number} - Pointer to the buffer in WASM memory
 */
function allocateBuffer(buffer) {
  const ptr = wasmExports.allocate(buffer.length);
  
  // Copy buffer to WASM memory
  const wasmMemoryArray = new Uint8Array(memory.buffer);
  wasmMemoryArray.set(buffer, ptr);
  
  return ptr;
}

/**
 * Reads a buffer from WASM memory
 * @param {number} ptr - Pointer to the buffer in WASM memory
 * @param {number} length - Length of the buffer
 * @returns {Buffer} - Buffer read from WASM memory
 */
function readBuffer(ptr, length) {
  return Buffer.from(memory.buffer.slice(ptr, ptr + length));
}

/**
 * Converts a JS object to a format that can be passed to WASM
 * @param {Object} obj - Object to convert
 * @returns {number} - Pointer to the object in WASM memory
 */
function convertObjectToWasm(obj) {
  // Stringify the object
  const jsonString = JSON.stringify(obj);
  
  // Allocate and copy the string
  return allocateString(jsonString);
}

/**
 * Parses a JSON object from WASM memory
 * @param {number} ptr - Pointer to the JSON string in WASM memory
 * @returns {Object} - Parsed object
 */
function parseObjectFromWasm(ptr) {
  // Read the length first (assumed to be stored as uint32 before the string)
  const lengthPtr = new Uint32Array(memory.buffer, ptr - 4, 1);
  const length = lengthPtr[0];
  
  // Read and parse the string
  const jsonString = readString(ptr, length);
  return JSON.parse(jsonString);
}

/**
 * Converts a map of headers to a format that can be passed to WASM
 * @param {Object} headers - Map of headers
 * @returns {number} - Pointer to the headers in WASM memory
 */
function convertHeadersToWasm(headers) {
  return convertObjectToWasm(headers || {});
}

/**
 * Reads and frees a response structure from WASM memory
 * @param {number} responsePtr - Pointer to the response structure
 * @returns {Object} - Response object
 */
function readResponseFromWasm(responsePtr) {
  // Structure: { statusCode: int, headersPtr: ptr, headersLen: int, payloadPtr: ptr, payloadLen: int, isEncrypted: bool, errorPtr: ptr }
  const view = new DataView(memory.buffer, responsePtr, 28);
  
  const statusCode = view.getInt32(0, true);
  const headersPtr = view.getInt32(4, true);
  const headersLen = view.getInt32(8, true);
  const payloadPtr = view.getInt32(12, true);
  const payloadLen = view.getInt32(16, true);
  const isEncrypted = Boolean(view.getInt32(20, true));
  const errorPtr = view.getInt32(24, true);
  
  // Read headers
  let headers = {};
  if (headersPtr !== 0 && headersLen > 0) {
    const headersJson = readString(headersPtr, headersLen);
    headers = JSON.parse(headersJson);
    wasmExports.deallocate(headersPtr);
  }
  
  // Read payload
  let payload = Buffer.alloc(0);
  if (payloadPtr !== 0 && payloadLen > 0) {
    payload = readBuffer(payloadPtr, payloadLen);
    wasmExports.deallocate(payloadPtr);
  }
  
  // Read error
  let error = null;
  if (errorPtr !== 0) {
    // Read null-terminated string
    let errorLen = 0;
    const errView = new Uint8Array(memory.buffer, errorPtr);
    while (errView[errorLen] !== 0 && errorLen < 1024) {
      errorLen++;
    }
    
    error = readString(errorPtr, errorLen);
    wasmExports.deallocate(errorPtr);
  }
  
  // Free the response structure
  wasmExports.deallocate(responsePtr);
  
  return {
    statusCode,
    headers,
    payload,
    isEncrypted,
    error
  };
}

/**
 * Initializes the WASM module
 * @returns {Promise<void>}
 */
async function initialize() {
  if (initialized) {
    return;
  }
  
  try {
    // Check if WASM file exists, if not create placeholder module
    if (!fs.existsSync(WASM_PATH)) {
      console.log('[!] WASM module not found, creating placeholder implementation');
      await createPlaceholderModule();
    }
    
    // Read WASM file
    const wasmBuffer = fs.readFileSync(WASM_PATH);
    
    // Import object with required functions
    const importObject = {
      env: {
        // Memory management
        emscripten_notify_memory_growth: (idx) => {
          memory = wasmInstance.exports.memory;
        },
        
        // Networking utilities
        resolve_dns: (hostnamePtr, callback) => {
          const hostname = readString(hostnamePtr, 1024).split('\0')[0];
          
          // DNS resolution would happen here
          // This is a placeholder, in a real implementation we would use DNS over HTTPS or similar
          setTimeout(() => {
            if (hostname === 'localhost') {
              const ipPtr = allocateString('127.0.0.1');
              wasmExports.invoke_dns_callback(callback, ipPtr, 0);
              wasmExports.deallocate(ipPtr);
            } else {
              const ipPtr = allocateString('0.0.0.0');
              wasmExports.invoke_dns_callback(callback, ipPtr, 0);
              wasmExports.deallocate(ipPtr);
            }
          }, 1);
        },
        
        // Logging functions
        console_log: (msgPtr) => {
          const message = readString(msgPtr, 1024).split('\0')[0];
          console.log(`[WASM] ${message}`);
        },
        
        console_error: (msgPtr) => {
          const message = readString(msgPtr, 1024).split('\0')[0];
          console.error(`[WASM] ${message}`);
        },
        
        // Time functions
        get_current_time_ms: () => {
          return Date.now();
        },
        
        // Crypto functions
        generate_random_bytes: (bufferPtr, length) => {
          const bytes = crypto.randomBytes(length);
          const targetBuffer = new Uint8Array(memory.buffer, bufferPtr, length);
          targetBuffer.set(bytes);
        },
        
        encrypt_data: (dataPtr, dataLen, keyPtr, ivPtr, outputPtr, outputLenPtr) => {
          try {
            const data = new Uint8Array(memory.buffer, dataPtr, dataLen);
            const key = new Uint8Array(memory.buffer, keyPtr, 32); // Assuming AES-256
            const iv = new Uint8Array(memory.buffer, ivPtr, 16);
            
            const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(iv));
            const encryptedData = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);
            
            const outputBuffer = new Uint8Array(memory.buffer, outputPtr, encryptedData.length);
            outputBuffer.set(encryptedData);
            
            const outputLenBuffer = new Uint32Array(memory.buffer, outputLenPtr, 1);
            outputLenBuffer[0] = encryptedData.length;
            
            return 1; // Success
          } catch (error) {
            console.error(`[WASM] Encryption error: ${error.message}`);
            return 0; // Error
          }
        },
        
        decrypt_data: (dataPtr, dataLen, keyPtr, ivPtr, outputPtr, outputLenPtr) => {
          try {
            const data = new Uint8Array(memory.buffer, dataPtr, dataLen);
            const key = new Uint8Array(memory.buffer, keyPtr, 32); // Assuming AES-256
            const iv = new Uint8Array(memory.buffer, ivPtr, 16);
            
            const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(iv));
            const decryptedData = Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]);
            
            const outputBuffer = new Uint8Array(memory.buffer, outputPtr, decryptedData.length);
            outputBuffer.set(decryptedData);
            
            const outputLenBuffer = new Uint32Array(memory.buffer, outputLenPtr, 1);
            outputLenBuffer[0] = decryptedData.length;
            
            return 1; // Success
          } catch (error) {
            console.error(`[WASM] Decryption error: ${error.message}`);
            return 0; // Error
          }
        }
      }
    };
    
    // Instantiate the WASM module
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, importObject);
    wasmInstance = wasmModule.instance;
    memory = wasmInstance.exports.memory;
    wasmExports = wasmInstance.exports;
    
    // Initialize the WASM module
    if (wasmExports.initialize) {
      const configPtr = convertObjectToWasm(config);
      const success = wasmExports.initialize(configPtr);
      if (!success) {
        throw new Error('Failed to initialize WASM module');
      }
    }
    
    initialized = true;
    console.log('[+] WASM module initialized successfully');
  } catch (error) {
    console.error(`[-] Error initializing WASM module: ${error.message}`);
    throw error;
  }
}

/**
 * Creates a placeholder WASM module for testing
 * @returns {Promise<void>}
 */
async function createPlaceholderModule() {
  // This function would generate a minimal WASM module for testing
  // In a real implementation, this would be a precompiled module
  
  console.log('[+] Creating placeholder WASM module');
  
  // Ensure directory exists
  const wasmDir = path.dirname(WASM_PATH);
  if (!fs.existsSync(wasmDir)) {
    fs.mkdirSync(wasmDir, { recursive: true });
  }
  
  // In a real implementation, we would compile a C/Rust source to WASM
  // For now, we'll create a dummy binary file
  const dummyWasm = Buffer.from([
    0x00, 0x61, 0x73, 0x6D, // Magic number (\0asm)
    0x01, 0x00, 0x00, 0x00  // Version 1
    // ... more WASM binary data would follow
  ]);
  
  fs.writeFileSync(WASM_PATH, dummyWasm);
  
  // In a real implementation, we'd create a proper WASM module with exports
  wasmExports = {
    memory: new WebAssembly.Memory({ initial: 10 }),
    allocate: (size) => 0, // Dummy implementation
    deallocate: (ptr) => {}, // Dummy implementation
    handle_request: (reqId, url, method, headers, payload, encrypted) => 0, // Dummy implementation
    invoke_dns_callback: (callback, ipPtr, error) => {}, // Dummy implementation
    initialize: (configPtr) => 1 // Dummy implementation returning success
  };
  
  memory = wasmExports.memory;
  initialized = true;
}

/**
 * Handles a proxy request by forwarding it to the WASM module
 * @param {string} requestId - Unique ID for the request
 * @param {string} destinationUrl - URL to proxy to
 * @param {string} method - HTTP method
 * @param {Object} headers - Request headers
 * @param {Buffer} payload - Request payload
 * @param {boolean} isEncrypted - Whether the payload is encrypted
 * @returns {Promise<Object>} - Response object
 */
async function handleProxyRequest(requestId, destinationUrl, method, headers, payload, isEncrypted) {
  if (!initialized) {
    throw new Error('WASM module not initialized');
  }
  
  // If we're using the placeholder implementation, provide mock responses
  if (!wasmInstance) {
    return mockProxyResponse(requestId, destinationUrl, method);
  }
  
  try {
    // Allocate memory for request parameters
    const requestIdPtr = allocateString(requestId);
    const urlPtr = allocateString(destinationUrl);
    const methodPtr = allocateString(method);
    const headersPtr = convertHeadersToWasm(headers);
    
    // Payload may be null or undefined
    let payloadPtr = 0;
    let payloadLen = 0;
    
    if (payload && payload.length > 0) {
      payloadPtr = allocateBuffer(payload);
      payloadLen = payload.length;
    }
    
    // Call WASM function
    const responsePtr = wasmExports.handle_request(
      requestIdPtr,
      urlPtr,
      methodPtr,
      headersPtr,
      payloadPtr,
      payloadLen,
      isEncrypted ? 1 : 0
    );
    
    // Free allocated memory
    wasmExports.deallocate(requestIdPtr);
    wasmExports.deallocate(urlPtr);
    wasmExports.deallocate(methodPtr);
    // Headers are freed by the WASM function
    
    if (payloadPtr !== 0) {
      wasmExports.deallocate(payloadPtr);
    }
    
    // Parse response
    if (responsePtr === 0) {
      throw new Error('WASM module returned null response');
    }
    
    return readResponseFromWasm(responsePtr);
  } catch (error) {
    console.error(`[-] Error handling proxy request: ${error.message}`);
    return {
      statusCode: 500,
      headers: {},
      payload: Buffer.from(`Error: ${error.message}`),
      isEncrypted: false,
      error: error.message
    };
  }
}

/**
 * Mock response generator for testing without actual WASM module
 * @param {string} requestId - Request ID
 * @param {string} destinationUrl - URL that was requested
 * @param {string} method - HTTP method used
 * @returns {Object} - Mock response
 */
function mockProxyResponse(requestId, destinationUrl, method) {
  console.log(`[+] Generating mock response for: ${method} ${destinationUrl}`);
  
  // Generate a mock response based on the URL
  let statusCode = 200;
  let headers = {
    'content-type': 'application/json',
    'server': 'mock-proxy/1.0',
    'x-request-id': requestId
  };
  
  // Generate response payload
  let payload;
  if (destinationUrl.includes('error')) {
    statusCode = 500;
    payload = Buffer.from(JSON.stringify({
      error: 'Internal Server Error',
      requestId
    }));
  } else if (destinationUrl.includes('notfound')) {
    statusCode = 404;
    payload = Buffer.from(JSON.stringify({
      error: 'Not Found',
      requestId
    }));
  } else {
    payload = Buffer.from(JSON.stringify({
      success: true,
      message: `Mocked response for ${method} ${destinationUrl}`,
      requestId,
      timestamp: new Date().toISOString()
    }));
  }
  
  return {
    statusCode,
    headers,
    payload,
    isEncrypted: false,
    error: null
  };
}

/**
 * Configures the WASM module with the provided settings
 * @param {Object} configOptions - Configuration options
 * @returns {Promise<boolean>} - Whether configuration was successful
 */
async function configure(configOptions) {
  if (!initialized) {
    throw new Error('WASM module not initialized');
  }
  
  // Update local config
  config = {
    ...config,
    enableEncryption: configOptions.enable_encryption || config.enableEncryption,
    connectionTimeoutMs: configOptions.connection_timeout_ms || config.connectionTimeoutMs,
    bypassDomains: configOptions.bypass_domains || config.bypassDomains,
    dnsResolver: configOptions.dns_resolver || config.dnsResolver,
    maxConnections: configOptions.max_connections || config.maxConnections,
    customHeaders: configOptions.custom_headers || config.customHeaders,
    proxyMode: configOptions.proxy_mode || config.proxyMode
  };
  
  // If we're using the placeholder implementation, just return success
  if (!wasmInstance) {
    return true;
  }
  
  try {
    // Convert config to WASM-friendly format
    const configPtr = convertObjectToWasm(config);
    
    // Call WASM function
    const success = wasmExports.configure(configPtr);
    
    // Free allocated memory
    // Assume the WASM function takes ownership of the config object
    
    return success === 1;
  } catch (error) {
    console.error(`[-] Error configuring WASM module: ${error.message}`);
    return false;
  }
}

/**
 * Creates a bidirectional tunnel stream
 * @param {string} targetHost - Target host to connect to
 * @param {number} targetPort - Target port to connect to
 * @param {string} tunnelType - Type of tunnel (http, socks5, ssh)
 * @param {Object} authParams - Authentication parameters
 * @returns {stream.Duplex} - Bidirectional stream for tunnel data
 */
function createTunnel(targetHost, targetPort, tunnelType, authParams) {
  if (!initialized) {
    throw new Error('WASM module not initialized');
  }
  
  console.log(`[+] Creating ${tunnelType} tunnel to ${targetHost}:${targetPort}`);
  
  // Create a duplex stream for bidirectional communication
  const stream = new Duplex({
    readableHighWaterMark: 64 * 1024,
    writableHighWaterMark: 64 * 1024,
    readableObjectMode: false,
    writableObjectMode: false,
    
    write(chunk, encoding, callback) {
      // Forward data to the tunnel
      try {
        if (!wasmInstance) {
          // Mock implementation
          // Echo back the data with some delay to simulate network
          setTimeout(() => {
            stream.push(chunk);
          }, 50);
          callback();
          return;
        }
        
        // Real implementation would forward to WASM
        const dataPtr = allocateBuffer(chunk);
        const success = wasmExports.tunnel_send(tunnelHandle, dataPtr, chunk.length);
        wasmExports.deallocate(dataPtr);
        
        if (success !== 1) {
          callback(new Error('Failed to send data to tunnel'));
          return;
        }
        
        callback();
      } catch (error) {
        callback(error);
      }
    },
    
    read(size) {
      // Data is pushed from the WASM callback
    }
  });
  
  // If we're using the placeholder implementation, just return the stream
  if (!wasmInstance) {
    return stream;
  }
  
  // Real implementation would create a tunnel in WASM
  try {
    const hostPtr = allocateString(targetHost);
    const typePtr = allocateString(tunnelType);
    const authPtr = convertObjectToWasm(authParams || {});
    
    // Register data callback
    const dataCallback = (dataPtr, dataLen) => {
      const data = readBuffer(dataPtr, dataLen);
      stream.push(data);
    };
    
    // Register close callback
    const closeCallback = (errorPtr) => {
      if (errorPtr !== 0) {
        const errorMsg = readString(errorPtr, 1024).split('\0')[0];
        stream.emit('error', new Error(errorMsg));
      }
      stream.push(null); // End the stream
    };
    
    // Create the tunnel
    const tunnelHandle = wasmExports.create_tunnel(
      hostPtr,
      targetPort,
      typePtr,
      authPtr,
      dataCallback,
      closeCallback
    );
    
    // Free allocated memory
    wasmExports.deallocate(hostPtr);
    wasmExports.deallocate(typePtr);
    // Auth params are freed by the WASM function
    
    if (tunnelHandle === 0) {
      throw new Error('Failed to create tunnel');
    }
    
    // Store tunnel handle for cleanup
    stream.tunnelHandle = tunnelHandle;
    
    // Handle stream closing
    stream.on('end', () => {
      if (wasmExports.close_tunnel) {
        wasmExports.close_tunnel(tunnelHandle);
      }
    });
    
    return stream;
  } catch (error) {
    console.error(`[-] Error creating tunnel: ${error.message}`);
    stream.emit('error', error);
    stream.push(null);
    return stream;
  }
}

module.exports = {
  initialize,
  handleProxyRequest,
  configure,
  createTunnel
};
