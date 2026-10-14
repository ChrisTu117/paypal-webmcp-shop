// Shop -> WebMCP converter core. DOM-free logic so it can be unit-tested in Node.
// Implemented from PayPal's public WebMCP / Store Sync docs; not an official PayPal SDK.

/** Extract schema.org Product entries from JSON-LD blocks and microdata. */
export function scanCatalog(doc) {
  const out = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data; try { data = JSON.parse(s.textContent); } catch { continue; }
    const items = [].concat(data['@graph'] || data).flatMap(d => d['@type'] === 'ItemList' ? (d.itemListElement || []).map(e => e.item || e) : [d]);
    for (const d of items) if (d && d['@type'] === 'Product') out.push(normalize(d));
  }
  if (!out.length) {
    for (const el of doc.querySelectorAll('[itemtype$="schema.org/Product"]')) {
      const g = p => { const n = el.querySelector(`[itemprop="${p}"]`); return n && (n.getAttribute('content') ?? n.textContent.trim()); };
      out.push(normalize({ sku: g('sku'), name: g('name'), description: g('description'), offers: { price: g('price'), priceCurrency: g('priceCurrency'), availability: g('availability') } }));
    }
  }
  return out.filter(p => p.id && p.name && Number.isFinite(p.price));
}

function normalize(d) {
  const o = [].concat(d.offers || {})[0] || {};
  return {
    id: String(d.sku || d.productID || d['@id'] || d.name || '').trim(),
    name: d.name, description: d.description || '',
    price: Number(o.price), currency: o.priceCurrency || 'USD',
    inStock: !o.availability || /InStock/i.test(o.availability),
  };
}

const txt = v => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v) }] });

/** Build WebMCP tool descriptors. api = { createOrder(cart)->order, getOrder(id)->order }. */
export function buildTools(catalog, api, cart = new Map()) {
  const byId = id => catalog.find(p => p.id === id);
  const lines = () => [...cart].map(([id, qty]) => ({ ...byId(id), qty }));
  const total = () => lines().reduce((s, l) => s + l.price * l.qty, 0);
  return [
    { name: 'search_products', description: 'Search the shop catalog by keyword. Returns matching products with id, name, price, currency and stock.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'keyword; empty string lists all' }, max_price: { type: 'number' } }, required: ['query'] },
      execute: async ({ query = '', max_price }) => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return txt(catalog.filter(p => (!words.length || words.some(w => (p.name + ' ' + p.description).toLowerCase().includes(w))) && (max_price == null || p.price <= max_price)));
      } },
    { name: 'get_product', description: 'Get full details of one product by id.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: async ({ id }) => txt(byId(id) || { error: `unknown product ${id}` }) },
    { name: 'add_to_cart', description: 'Add a product to the cart (or change its quantity). Returns the cart.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, qty: { type: 'integer', minimum: 1 } }, required: ['id'] },
      execute: async ({ id, qty = 1 }) => {
        const p = byId(id); if (!p) return txt({ error: `unknown product ${id}` });
        if (!p.inStock) return txt({ error: `${p.name} is out of stock` });
        cart.set(id, Math.max(1, Math.floor(qty))); return txt({ cart: lines(), total: +total().toFixed(2) });
      } },
    { name: 'view_cart', description: 'Show current cart lines and total.', inputSchema: { type: 'object', properties: {} },
      execute: async () => txt({ cart: lines(), total: +total().toFixed(2) }) },
    { name: 'create_checkout', description: 'Create a PayPal (sandbox) order for the cart. Returns order id and the approval link the human buyer must open to pay. The agent never pays by itself.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        if (!cart.size) return txt({ error: 'cart is empty' });
        const o = await api.createOrder(lines()); return txt(o);
      } },
    { name: 'get_order_status', description: 'Get the status of a PayPal order by id (CREATED, APPROVED, COMPLETED...).',
      inputSchema: { type: 'object', properties: { order_id: { type: 'string' } }, required: ['order_id'] },
      execute: async ({ order_id }) => txt(await api.getOrder(order_id)) },
    { name: 'capture_order', description: 'Capture (complete) a PayPal order AFTER the human buyer approved it. Fails unless status is APPROVED.',
      inputSchema: { type: 'object', properties: { order_id: { type: 'string' } }, required: ['order_id'] },
      execute: async ({ order_id }) => txt(await api.captureOrder(order_id)) },
  ];
}

/** Agent-readiness score for a page snapshot. */
export function readiness({ catalog, tools = [], hasPayPalButton = false }) {
  const names = new Set(tools.map(t => t.name));
  const checks = [
    ['Machine-readable catalog (schema.org)', catalog.length > 0, 20],
    ['Prices + currency on every product', catalog.length > 0 && catalog.every(p => Number.isFinite(p.price) && p.currency), 10],
    ['Stock/availability exposed', catalog.length > 0 && catalog.every(p => typeof p.inStock === 'boolean'), 5],
    ['PayPal checkout present', hasPayPalButton, 10],
    ['WebMCP search tool', names.has('search_products'), 15],
    ['WebMCP cart tool', names.has('add_to_cart'), 15],
    ['WebMCP checkout -> PayPal order', names.has('create_checkout'), 15],
    ['WebMCP order status', names.has('get_order_status'), 5],
    ['WebMCP capture after approval', names.has('capture_order'), 5],
  ];
  const rows = checks.map(([check, pass, weight]) => ({ check, pass, weight, points: pass ? weight : 0 }));
  return { score: rows.reduce((s, r) => s + r.points, 0), rows };
}

/** Convert WebMCP tools to OpenAI function-calling format. */
export const toOpenAITools = tools => tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: typeof t.inputSchema === 'string' ? JSON.parse(t.inputSchema) : (t.inputSchema || { type: 'object', properties: {} }) } }));
