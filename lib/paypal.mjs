// PayPal Orders v2 client — SANDBOX ONLY (live host is refused).
const BASE = 'https://api-m.sandbox.paypal.com';
export function makePayPal({ clientId = process.env.PAYPAL_SANDBOX_CLIENT_ID, secret = process.env.PAYPAL_SANDBOX_SECRET, fetchImpl = fetch, base = BASE } = {}) {
  if (!/sandbox/.test(base)) throw new Error('refusing non-sandbox PayPal host');
  let tok, exp = 0;
  async function token() {
    if (tok && Date.now() < exp) return tok;
    const r = await fetchImpl(base + '/v1/oauth2/token', { method: 'POST', body: 'grant_type=client_credentials',
      headers: { authorization: 'Basic ' + btoa(`${clientId}:${secret}`), 'content-type': 'application/x-www-form-urlencoded' } });
    const j = await r.json(); if (!j.access_token) throw new Error('PayPal OAuth failed: ' + (j.error || r.status));
    tok = j.access_token; exp = Date.now() + (j.expires_in - 60) * 1000; return tok;
  }
  const call = async (path, init = {}) => { const r = await fetchImpl(base + path, { ...init, headers: { authorization: 'Bearer ' + await token(), 'content-type': 'application/json', ...(init.headers || {}) } }); return r.json(); };
  return {
    async createOrder(lines, { currency = 'USD', returnUrl, cancelUrl } = {}) {
      const total = lines.reduce((s, l) => s + l.price * l.qty, 0).toFixed(2);
      const body = { intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: currency, value: total, breakdown: { item_total: { currency_code: currency, value: total } } },
        items: lines.map(l => ({ name: l.name.slice(0, 127), sku: l.id, quantity: String(l.qty), unit_amount: { currency_code: currency, value: l.price.toFixed(2) } })) }],
        payment_source: { paypal: { experience_context: { user_action: 'PAY_NOW', return_url: returnUrl, cancel_url: cancelUrl } } } };
      return summarize(await call('/v2/checkout/orders', { method: 'POST', body: JSON.stringify(body), headers: { 'PayPal-Request-Id': crypto.randomUUID(), Prefer: 'return=representation' } }));
    },
    async getOrder(id) { return summarize(await call('/v2/checkout/orders/' + encodeURIComponent(id))); },
    async captureOrder(id) { return summarize(await call(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, { method: 'POST', body: '{}', headers: { 'PayPal-Request-Id': crypto.randomUUID(), Prefer: 'return=representation' } })); },
  };
}
export function summarize(o) {
  if (!o.id) return { error: o.message || o.name || 'PayPal error', details: o.details };
  const link = (o.links || []).find(l => l.rel === 'payer-action' || l.rel === 'approve');
  const pu = (o.purchase_units || [])[0] || {};
  return { order_id: o.id, status: o.status, approve_url: link?.href, total: pu.amount && `${pu.amount.value} ${pu.amount.currency_code}`, environment: 'sandbox', create_time: o.create_time, items: (pu.items || []).map(i => ({ id: i.sku, name: i.name, qty: +i.quantity, price: +i.unit_amount?.value })), ...(pu.payments?.captures?.[0] ? { capture_id: pu.payments.captures[0].id, capture_status: pu.payments.captures[0].status } : {}) };
}
export function makeMockPayPal() {
  const orders = new Map(); let n = 0;
  return {
    async createOrder(lines) { const id = 'MOCK' + (++n); const total = lines.reduce((s, l) => s + l.price * l.qty, 0).toFixed(2); orders.set(id, { id, status: 'CREATED', total, items: lines.map(l => ({ id: l.id, name: l.name, qty: l.qty, price: l.price })) });
      return { order_id: id, status: 'CREATED', approve_url: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`, total: total + ' USD', environment: 'mock' }; },
    async getOrder(id) { const o = orders.get(id); return o ? { order_id: id, status: o.status, total: o.total + ' USD', environment: 'mock', items: o.items } : { error: 'not found' }; },
    async captureOrder(id) { const o = orders.get(id); if (o) o.status = 'COMPLETED'; return this.getOrder(id); },
    approve(id) { const o = orders.get(id); if (o) o.status = 'APPROVED'; },
  };
}
