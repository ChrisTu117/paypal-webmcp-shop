import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { handle, htmlDoc } from './lib/app.mjs'; import { makePayPal, makeMockPayPal } from './lib/paypal.mjs';
export { htmlDoc };
const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const STATIC = ['/converter/core.mjs', '/converter/inject.mjs', '/vendor/ag-grid-community.min.js', '/shop/original.html', '/report/index.html'];
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript' };
export function createServer({ paypal = process.env.PAYPAL_MOCK === '1' ? makeMockPayPal() : makePayPal() } = {}) {
  const readText = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
  return http.createServer(async (req, res) => {
    const url = `http://${req.headers.host}${req.url}`; let body;
    if (!['GET', 'HEAD'].includes(req.method)) { body = ''; for await (const c of req) body += c; }
    const r = await handle(new Request(url, { method: req.method, body, headers: { 'content-type': 'application/json' } }), { paypal, readText });
    if (r) { res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(await r.text()); }
    const p = new URL(url).pathname;
    if (!STATIC.includes(p)) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"not found"}'); }
    res.writeHead(200, { 'content-type': types[path.extname(p)] }); res.end(readText(p));
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const port = +process.env.PORT || 8787; createServer().listen(port, () => console.log(`shop on http://localhost:${port}  (paypal: ${process.env.PAYPAL_MOCK === '1' ? 'mock' : 'sandbox'})`)); }
