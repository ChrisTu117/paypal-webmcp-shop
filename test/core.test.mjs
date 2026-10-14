import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { scanCatalog, buildTools, readiness, toOpenAITools } from '../converter/core.mjs';
import { makeMockPayPal, makePayPal, summarize } from '../lib/paypal.mjs'; import { htmlDoc, createServer } from '../server.mjs'; import { mockPlanner } from '../lib/planner.mjs';
const html = fs.readFileSync(new URL('../shop/original.html', import.meta.url), 'utf8');
const cat = scanCatalog(htmlDoc(html)); const parse = r => JSON.parse(r.content[0].text);
test('scans JSON-LD catalog', () => { assert.equal(cat.length, 4); assert.deepEqual(cat[1], { id: 'jasmine-100', name: 'Jasmine Pearls 100g', description: 'Hand-rolled green tea scented with jasmine', price: 9.5, currency: 'USD', inStock: true }); assert.equal(cat[3].inStock, false); });
test('microdata fallback', () => {
  const el = { querySelector: s => ({ sku: 'a1', name: 'Mug', price: '5', priceCurrency: 'EUR' })[s.match(/"(\w+)"/)[1]] ? { getAttribute: () => ({ sku: 'a1', name: 'Mug', price: '5', priceCurrency: 'EUR' })[s.match(/"(\w+)"/)[1]] } : null };
  const doc = { querySelectorAll: s => s.includes('itemtype') ? [el] : [] }; assert.deepEqual(scanCatalog(doc)[0], { id: 'a1', name: 'Mug', description: '', price: 5, currency: 'EUR', inStock: true });
});
test('tools: search, add, out-of-stock, checkout, status', async () => {
  const pp = makeMockPayPal(); const t = Object.fromEntries(buildTools(cat, pp).map(x => [x.name, x]));
  assert.equal(parse(await t.search_products.execute({ query: 'jasmine' }))[0].id, 'jasmine-100');
  assert.equal(parse(await t.search_products.execute({ query: '', max_price: 10 })).length, 1);
  assert.match(parse(await t.add_to_cart.execute({ id: 'gaiwan' })).error, /out of stock/);
  assert.equal(parse(await t.create_checkout.execute({})).error, 'cart is empty');
  await t.add_to_cart.execute({ id: 'jasmine-100', qty: 2 }); assert.equal(parse(await t.add_to_cart.execute({ id: 'oolong-100' })).total, 31);
  const o = parse(await t.create_checkout.execute({})); assert.equal(o.status, 'CREATED'); assert.equal(o.total, '31.00 USD');
  assert.equal(parse(await t.get_order_status.execute({ order_id: o.order_id })).status, 'CREATED');
});
test('readiness before/after', () => { assert.equal(readiness({ catalog: cat, hasPayPalButton: true }).score, 45); assert.equal(readiness({ catalog: cat, tools: buildTools(cat, {}), hasPayPalButton: true }).score, 100); });
test('openai tool conversion', () => { const f = toOpenAITools(buildTools(cat, {}))[0]; assert.equal(f.type, 'function'); assert.equal(f.function.parameters.required[0], 'query'); });
test('paypal client refuses live host and builds correct order body', async () => {
  assert.throws(() => makePayPal({ base: 'https://api-m.paypal.com' }), /non-sandbox/); const calls = [];
  const fetchImpl = async (u, i) => { calls.push([u, i]); return { json: async () => u.endsWith('token') ? { access_token: 'T', expires_in: 3600 } : { id: 'O1', status: 'CREATED', links: [{ rel: 'approve', href: 'https://x/approve' }] } }; };
  const o = await makePayPal({ clientId: 'a', secret: 'b', fetchImpl }).createOrder([{ id: 'oolong-100', name: 'Oolong', price: 12, qty: 2 }]);
  assert.deepEqual(o, { order_id: 'O1', status: 'CREATED', approve_url: 'https://x/approve', total: undefined, environment: 'sandbox', create_time: undefined, items: [] });
  const body = JSON.parse(calls[1][1].body); assert.equal(body.purchase_units[0].amount.value, '24.00'); assert.equal(body.purchase_units[0].items[0].quantity, '2');
  assert.match(summarize({ name: 'INVALID_REQUEST' }).error, /INVALID/);
});
test('server prices from catalog, ignores client prices', async () => {
  const srv = createServer({ paypal: makeMockPayPal() }).listen(0); const base = `http://localhost:${srv.address().port}`;
  const o = await (await fetch(base + '/api/orders', { method: 'POST', body: JSON.stringify({ lines: [{ id: 'puer-cake', qty: 1, price: 0.01 }, { id: 'bogus' }] }) })).json();
  assert.equal(o.total, '38.00 USD'); assert.equal((await fetch(base + '/../../etc/passwd')).status, 404); srv.close();
});
test('mock planner reaches checkout', async () => {
  const pp = makeMockPayPal(); const tools = buildTools(cat, pp); const p = mockPlanner(); const msgs = [{ role: 'user', content: 'buy 2 jasmine and one oolong' }];
  for (let i = 0; i < 10; i++) { const m = await p.next(msgs); msgs.push(m); if (!m.tool_calls) break; for (const c of m.tool_calls) msgs.push({ role: 'tool', content: (await tools.find(t => t.name === c.function.name).execute(JSON.parse(c.function.arguments))).content[0].text }); }
  assert.match(msgs.at(-1).content, /MOCK1 is CREATED \(31\.00 USD\)/);
});

test('capture: server refuses unless APPROVED, then completes', async () => {
  const pp = makeMockPayPal(); const srv = createServer({ paypal: pp }).listen(0); const base = `http://localhost:${srv.address().port}`;
  const o = await (await fetch(base + '/api/orders', { method: 'POST', body: JSON.stringify({ lines: [{ id: 'jasmine-100', qty: 2 }, { id: 'oolong-100', qty: 1 }] }) })).json();
  let r = await fetch(`${base}/api/orders/${o.order_id}/capture`, { method: 'POST' }); assert.equal(r.status, 409); assert.equal((await r.json()).status, 'CREATED');
  pp.approve(o.order_id); r = await fetch(`${base}/api/orders/${o.order_id}/capture`, { method: 'POST' }); assert.equal(r.status, 200); assert.equal((await r.json()).status, 'COMPLETED');
  assert.equal((await fetch(`${base}/api/orders/NOPE/capture`, { method: 'POST' })).status, 409); srv.close();
});
test('capture tool calls api.captureOrder', async () => { let got; const t = buildTools(cat, { captureOrder: async id => (got = id, { status: 'COMPLETED' }) }).find(x => x.name === 'capture_order');
  assert.equal(parse(await t.execute({ order_id: 'X1' })).status, 'COMPLETED'); assert.equal(got, 'X1'); });
test('"/" is injected, "/original" is untouched; static allowlist', async () => {
  const srv = createServer({ paypal: makeMockPayPal() }).listen(0); const base = `http://localhost:${srv.address().port}`;
  assert.match(await (await fetch(base + '/')).text(), /converter\/inject\.mjs/); assert.doesNotMatch(await (await fetch(base + '/original')).text(), /inject\.mjs/);
  assert.equal((await fetch(base + '/vendor/ag-grid-community.min.js')).status, 200); assert.equal((await fetch(base + '/package.json')).status, 404); srv.close();
});
test('order log: agent source + tools recorded, capture updates log, dashboard lists', async () => {
  const pp = makeMockPayPal(); const srv = createServer({ paypal: pp }).listen(0); const base = `http://localhost:${srv.address().port}`;
  const o = await (await fetch(base + '/api/orders', { method: 'POST', body: JSON.stringify({ lines: [{ id: 'jasmine-100', qty: 2 }], source: 'webmcp-agent', tools: ['search_products', 'add_to_cart', 'create_checkout', 'bad tool!'] }) })).json();
  await fetch(base + '/api/orders', { method: 'POST', body: JSON.stringify({ lines: [{ id: 'oolong-100', qty: 1 }], source: 'evil' }) });
  pp.approve(o.order_id); await fetch(`${base}/api/orders/${o.order_id}/capture`, { method: 'POST' });
  const rows = await (await fetch(base + '/api/dashboard/orders')).json(); const a = rows.find(r => r.order_id === o.order_id);
  assert.equal(rows.length, 2); assert.equal(a.status, 'COMPLETED'); assert.equal(a.source, 'webmcp-agent');
  assert.deepEqual(a.tools, ['search_products', 'add_to_cart', 'create_checkout', 'capture_order']); assert.equal(a.items[0].qty, 2);
  assert.equal(rows.find(r => r.order_id !== o.order_id).source, 'paypal-button'); assert.equal((await fetch(base + '/dashboard')).status, 200); srv.close();
});
