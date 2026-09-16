#!/usr/bin/env node
/**
 * Compose healthcheck probe — node:alpine has no wget/curl by default.
 * Exit 0 only when GET /api/health returns HTTP 200.
 */
const http = require('http');
const port = process.env.PORT || 5000;

const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
  res.resume();
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on('error', () => process.exit(1));
req.setTimeout(4000, () => {
  req.destroy();
  process.exit(1);
});
