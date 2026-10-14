// Drop-in snippet: <script type="module" src="/converter/inject.mjs"></script>
import { scanCatalog, buildTools, readiness } from './core.mjs';
const trace = [];
const api = {
  createOrder: async lines => (await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: lines.map(l => ({ id: l.id, qty: l.qty })), source: 'webmcp-agent', tools: trace }) })).json(),
  captureOrder: async id => (await fetch('/api/orders/' + encodeURIComponent(id) + '/capture', { method: 'POST' })).json(),
  getOrder: async id => (await fetch('/api/orders/' + encodeURIComponent(id))).json(),
};
const catalog = scanCatalog(document);
const before = readiness({ catalog, hasPayPalButton: !!document.querySelector('[data-paypal-button],#paypal-button') });
const tools = buildTools(catalog, api);
const mc = document.modelContext || navigator.modelContext;
if (mc) for (const t of tools) mc.registerTool({ ...t, execute: async args => { trace.push(t.name); return t.execute(args); } });
window.__webmcpShop = { catalog, tools: tools.map(t => t.name), registered: !!mc, before, after: readiness({ catalog, tools: mc ? tools : [], hasPayPalButton: before.rows[3].pass }) };
document.dispatchEvent(new CustomEvent('webmcp-shop-ready', { detail: window.__webmcpShop }));
