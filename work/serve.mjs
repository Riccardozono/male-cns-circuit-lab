import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = resolve(fileURLToPath(new URL('../outputs/', import.meta.url)));
const port = Number(process.env.MALE_CNS_PORT || 5173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const server = createServer((request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const filePath = resolve(publicRoot, relative);
    if (filePath !== publicRoot && !filePath.startsWith(publicRoot + sep)) {
      response.writeHead(403); response.end('Forbidden'); return;
    }
    const stat = statSync(filePath);
    if (!stat.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`MAL-E CNS / Circuit Lab → http://127.0.0.1:${port}`);
  console.log(`Serving ${publicRoot}`);
});
