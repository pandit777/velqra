import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 10000;
const distDirectory = path.join(__dirname, 'dist');
const configuredBackendOrigin = process.env.BACKEND_ORIGIN ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

if (!configuredBackendOrigin) {
  throw new Error('BACKEND_ORIGIN must be configured for the frontend proxy');
}

const backend = new URL(configuredBackendOrigin);
if (!['http:', 'https:'].includes(backend.protocol) ||
    backend.username || backend.password || backend.pathname !== '/' ||
    backend.search || backend.hash) {
  throw new Error('BACKEND_ORIGIN must be an HTTP(S) origin without credentials or a path');
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
if (process.env.NODE_ENV === 'production') {
  securityHeaders['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
}

const applySecurityHeaders = (res) => {
  for (const [name, value] of Object.entries(securityHeaders)) {
    res.setHeader(name, value);
  }
};

const sendJson = (res, status, body) => {
  applySecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const proxyRequest = (req, res) => {
  let upstreamUrl;
  try {
    upstreamUrl = new URL(req.url, backend);
  } catch {
    return sendJson(res, 400, { success: false, message: 'Invalid request URL' });
  }
  if (upstreamUrl.origin !== backend.origin) {
    return sendJson(res, 400, { success: false, message: 'Invalid request URL' });
  }

  const headers = { ...req.headers, host: backend.host };
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  headers['x-forwarded-for'] = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  const transport = backend.protocol === 'https:' ? https : http;
  const upstream = transport.request(upstreamUrl, {
    method: req.method,
    headers
  }, (upstreamResponse) => {
    const responseHeaders = { ...upstreamResponse.headers };
    for (const [name, value] of Object.entries(securityHeaders)) {
      responseHeaders[name.toLowerCase()] = value;
    }
    delete responseHeaders.connection;
    delete responseHeaders['keep-alive'];
    delete responseHeaders['proxy-authenticate'];
    delete responseHeaders['proxy-authorization'];
    delete responseHeaders.te;
    delete responseHeaders.trailer;
    delete responseHeaders['transfer-encoding'];
    delete responseHeaders.upgrade;
    res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
    upstreamResponse.pipe(res);
  });

  upstream.setTimeout(120000, () => {
    upstream.destroy(new Error('Upstream timeout'));
  });
  upstream.on('error', (error) => {
    console.error('Backend proxy error:', error.code || 'upstream error');
    if (!res.headersSent) {
      sendJson(res, 502, { success: false, message: 'Backend service is temporarily unavailable' });
    } else {
      res.destroy();
    }
  });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => {
    if (!res.writableEnded) upstream.destroy();
  });
  req.pipe(upstream);
};

const sendFile = (req, res, filePath, stat) => {
  applySecurityHeaders(res);
  res.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) sendJson(res, 500, { success: false, message: 'Unable to load page' });
    else res.destroy();
  });
  stream.pipe(res);
};

const serveFrontend = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 404, { success: false, message: 'Route not found' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return sendJson(res, 400, { success: false, message: 'Invalid request path' });
  }

  const relativePath = pathname.replace(/^[/\\]+/, '');
  const requestedFile = path.resolve(distDirectory, relativePath);
  const relativeToDist = path.relative(distDirectory, requestedFile);
  if (relativeToDist.startsWith('..') || path.isAbsolute(relativeToDist)) {
    return sendJson(res, 404, { success: false, message: 'Not found' });
  }

  try {
    const stat = await fs.promises.stat(requestedFile);
    if (stat.isFile()) return sendFile(req, res, requestedFile, stat);
    if (path.extname(pathname)) return sendJson(res, 404, { success: false, message: 'Not found' });
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
      console.error('Frontend file error:', error.code || 'file error');
      return sendJson(res, 500, { success: false, message: 'Unable to load page' });
    }
    if (path.extname(pathname)) return sendJson(res, 404, { success: false, message: 'Not found' });
  }

  const indexFile = path.join(distDirectory, 'index.html');
  try {
    const stat = await fs.promises.stat(indexFile);
    sendFile(req, res, indexFile, stat);
  } catch (error) {
    console.error('Frontend build error:', error.code || 'missing build');
    sendJson(res, 503, { success: false, message: 'Frontend build is unavailable' });
  }
};

const server = http.createServer((req, res) => {
  const pathname = (req.url || '').split('?')[0];
  if (pathname === '/health') {
    return sendJson(res, 200, { status: 'OK' });
  }
  if (pathname === '/api' || pathname.startsWith('/api/') ||
      pathname === '/uploads' || pathname.startsWith('/uploads/')) {
    return proxyRequest(req, res);
  }
  serveFrontend(req, res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Frontend and same-origin API proxy listening on port ${port}`);
});
