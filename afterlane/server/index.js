import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { attachRooms } from './rooms.js';
import { loadModelAssets } from './model-assets.js';

const client = fileURLToPath(new URL('../client/', import.meta.url));
const vendor = fileURLToPath(new URL('../node_modules/three/', import.meta.url));
const types = { html:'text/html', js:'text/javascript', css:'text/css', glb:'model/gltf-binary', wav:'audio/wav', jpg:'image/jpeg' };
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
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error('Missing file');
    res.setHeader('Content-Type', types[file.split('.').pop()] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (version) res.setHeader('ETag','"'+version+'"');
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
const port = Number(process.env.PORT || 3000);
attachRooms(server,footprints);
server.listen(port, '0.0.0.0', () => console.log('Afterlane running at http://localhost:' + server.address().port));
