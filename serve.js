/* Grove Clash — zero-dependency static server (Node fallback for
   environments without Python). Standard library only. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8000', 10);
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.md': 'text/plain', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.toml': 'text/plain',
};

http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('Grove Clash is serving on http://0.0.0.0:' + PORT);
  console.log('Open the webview/preview pane, then CLICK the game once so it gets keyboard focus.');
});
