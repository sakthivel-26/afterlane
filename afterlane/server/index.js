import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { createGzip } from 'node:zlib';
import { attachRooms } from './rooms.js';
import { loadModelAssets } from './model-assets.js';

const client = fileURLToPath(new URL('../client/', import.meta.url));
const vendor = fileURLToPath(new URL('../node_modules/three/', import.meta.url));
const types = { html:'text/html', js:'text/javascript', css:'text/css', glb:'model/gltf-binary', wav:'audio/wav', jpg:'image/jpeg', json:'application/json', apk:'application/vnd.android.package-archive' };
const compressible = new Set(['html','js','css','glb','json']);
const {versions,footprints} = await loadModelAssets();
const modelVersions = JSON.stringify(versions);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (path === '/model-versions.json') {
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(modelVersions);
      return;
    }
    const version = versions[path];
    const requestedVersion = url.searchParams.get('v');
    if (requestedVersion && path.startsWith('/models/') && requestedVersion !== version) throw new Error('Model changed');
    const thirdParty = path.startsWith('/three/');
    const root = resolve(thirdParty ? vendor : client);
    const file = resolve(root, '.' + (thirdParty ? path.slice(6) : path === '/' ? '/index.html' : path));
    const st = await stat(file);
    if (!file.startsWith(root + sep) || !st.isFile()) throw new Error('Missing file');
    const ext = file.split('.').pop();
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (ext === 'apk') {
      res.setHeader('Content-Disposition', 'attachment; filename="Afterlane.apk"');
      res.setHeader('Cache-Control', 'no-cache');
    }
    if (version) {
      res.setHeader('ETag','"'+version+'"');
      if (requestedVersion === version) res.setHeader('Cache-Control','public, max-age=31536000, immutable');
    }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    const acceptsGzip = /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
    if (acceptsGzip && compressible.has(ext)) {
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      const gzip = createGzip({ level: 4 });
      gzip.on('error', () => res.destroy());
      stream.pipe(gzip).pipe(res);
      return;
    }
    res.setHeader('Content-Length', st.size);
    stream.pipe(res);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
const port = Number(process.env.PORT || 3000);
attachRooms(server,footprints);
server.listen(port, '0.0.0.0', () => console.log('Afterlane running at http://localhost:' + server.address().port));
