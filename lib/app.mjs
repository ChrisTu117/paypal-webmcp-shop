// Runtime-agnostic request handler (Node + Cloudflare Workers). Returns a Response, or null for static files.
import { scanCatalog } from '../converter/core.mjs';
export const INJECT_TAG = '<script type="module" src="/converter/inject.mjs"></script>';
export const injectConverter = html => html.replace('</body>', `<!-- the whole conversion: one tag -->\n${INJECT_TAG}\n</body>`);
export function htmlDoc(html) { return { querySelectorAll: sel => sel.includes('ld+json') ? [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => ({ textContent: m[1] })) : [] }; }
const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { 'content-type': 'application/json' } });
const html = s => new Response(s, { headers: { 'content-type': 'text/html; charset=utf-8' } });
export async function handle(req, { paypal, readText }) {
  const u = new URL(req.url); const origin = u.origin;
  try {
    if (u.pathname === '/' ) return html(injectConverter(await readText('/shop/original.html')));
    if (u.pathname === '/original') return html(await readText('/shop/original.html'));
    if (u.pathname === '/report') return html(await readText('/report/index.html'));
    if (u.pathname === '/api/orders' && req.method === 'POST') {
      const { lines = [] } = await req.json().catch(() => ({}));
      const cat = scanCatalog(htmlDoc(await readText('/shop/original.html')));   // server-side pricing: never trust client prices
      const priced = (Array.isArray(lines) ? lines : []).slice(0, 20).map(l => ({ ...cat.find(p => p.id === l?.id), qty: Math.max(1, Math.min(99, l?.qty | 0)) })).filter(l => l.id && l.inStock);
      if (!priced.length) return json(400, { error: 'no valid lines' });
      return json(200, await paypal.createOrder(priced, { returnUrl: origin + '/?paid=1', cancelUrl: origin + '/?cancel=1' }));
    }
    const c = u.pathname.match(/^\/api\/orders\/([\w-]{1,40})\/capture$/);
    if (c && req.method === 'POST') { const o = await paypal.getOrder(c[1]);
      if (o.status !== 'APPROVED') return json(409, { error: `order not approved by buyer (status ${o.status || o.error})`, order_id: c[1], status: o.status });
      return json(200, await paypal.captureOrder(c[1])); }
    const m = u.pathname.match(/^\/api\/orders\/([\w-]{1,40})$/); if (m && req.method === 'GET') return json(200, await paypal.getOrder(m[1]));
    if (u.pathname.startsWith('/api/')) return json(404, { error: 'not found' });
    return null;
  } catch (e) { return json(500, { error: e.message }); }
}
