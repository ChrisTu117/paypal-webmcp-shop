// Runtime-agnostic request handler (Node + Cloudflare Workers). Returns a Response, or null for static files.
import { scanCatalog } from '../converter/core.mjs';
export const INJECT_TAG = '<script type="module" src="/converter/inject.mjs"></script>';
export const injectConverter = html => html.replace('</body>', `<!-- the whole conversion: one tag -->\n${INJECT_TAG}\n</body>`);
export function htmlDoc(html) { return { querySelectorAll: sel => sel.includes('ld+json') ? [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => ({ textContent: m[1] })) : [] }; }
const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { 'content-type': 'application/json' } });
const html = s => new Response(s, { headers: { 'content-type': 'text/html; charset=utf-8' } });
export function memoryStore() { const m = new Map(); return { async put(r) { m.set(r.order_id, r); }, async list() { return [...m.values()]; } }; }
const FINAL = new Set(['COMPLETED', 'VOIDED']);
const SOURCES = new Set(['webmcp-agent', 'paypal-button', 'pre-log']);
export async function handle(req, { paypal, readText, store = memoryStore(), seed = [] }) {
  const u = new URL(req.url); const origin = u.origin;
  try {
    if (u.pathname === '/' ) return html(injectConverter(await readText('/shop/original.html')));
    if (u.pathname === '/original') return html(await readText('/shop/original.html'));
    if (u.pathname === '/report') return html(await readText('/report/index.html'));
    if (u.pathname === '/dashboard') return html(await readText('/dashboard/index.html'));
    if (u.pathname === '/api/dashboard/orders' && req.method === 'GET') {
      const recs = new Map((await store.list()).map(r => [r.order_id, r]));
      for (const id of seed) if (!recs.has(id)) recs.set(id, { order_id: id, source: 'pre-log', tools: [] });
      const rows = await Promise.all([...recs.values()].slice(-60).map(async r => {
        if (FINAL.has(r.status) && r.items) return r;
        const o = await paypal.getOrder(r.order_id); if (o.error) return { ...r, status: r.status || 'UNKNOWN' };
        const n = { ...r, status: o.status, total: o.total, items: o.items?.length ? o.items : r.items, created: r.created || o.create_time, capture_id: o.capture_id || r.capture_id, updated: new Date().toISOString() };
        if (r.source !== 'pre-log' || FINAL.has(n.status)) await store.put(n); return n; }));
      return json(200, rows.sort((a, b) => String(b.created).localeCompare(String(a.created))));
    }
    if (u.pathname === '/api/orders' && req.method === 'POST') {
      const { lines = [], source, tools } = await req.json().catch(() => ({}));
      const cat = scanCatalog(htmlDoc(await readText('/shop/original.html')));   // server-side pricing: never trust client prices
      const priced = (Array.isArray(lines) ? lines : []).slice(0, 20).map(l => ({ ...cat.find(p => p.id === l?.id), qty: Math.max(1, Math.min(99, l?.qty | 0)) })).filter(l => l.id && l.inStock);
      if (!priced.length) return json(400, { error: 'no valid lines' });
      const o = await paypal.createOrder(priced, { returnUrl: origin + '/?paid=1', cancelUrl: origin + '/?cancel=1' });
      if (o.order_id) await store.put({ order_id: o.order_id, status: o.status, total: o.total || priced.reduce((t, l) => t + l.price * l.qty, 0).toFixed(2) + ' USD',
        items: priced.map(l => ({ id: l.id, name: l.name, qty: l.qty, price: l.price })), created: new Date().toISOString(),
        source: SOURCES.has(source) ? source : 'paypal-button', tools: (Array.isArray(tools) ? tools : []).filter(t => /^[a-z_]{1,40}$/.test(t)).slice(-20) });
      return json(200, o);
    }
    const c = u.pathname.match(/^\/api\/orders\/([\w-]{1,40})\/capture$/);
    if (c && req.method === 'POST') { const o = await paypal.getOrder(c[1]);
      if (o.status !== 'APPROVED') return json(409, { error: `order not approved by buyer (status ${o.status || o.error})`, order_id: c[1], status: o.status });
      const cap = await paypal.captureOrder(c[1]); const r = (await store.list()).find(x => x.order_id === c[1]);
      if (r && cap.status) await store.put({ ...r, status: cap.status, capture_id: cap.capture_id, tools: [...(r.tools || []), 'capture_order'] });
      return json(200, cap); }
    const m = u.pathname.match(/^\/api\/orders\/([\w-]{1,40})$/); if (m && req.method === 'GET') return json(200, await paypal.getOrder(m[1]));
    if (u.pathname.startsWith('/api/')) return json(404, { error: 'not found' });
    return null;
  } catch (e) { return json(500, { error: e.message }); }
}
