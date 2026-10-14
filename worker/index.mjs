// Cloudflare Worker entry. Static files are embedded at build time (scripts/build-worker.mjs).
import { handle } from '../lib/app.mjs'; import { makePayPal } from '../lib/paypal.mjs'; import ASSETS from './assets.gen.mjs';
// real sandbox orders created by the agent before the order log existed (statuses are fetched live from PayPal)
const SEED = ['63341426WT959112R', '8A042724KN5582905', '34G47858CT720141X', '4W002601KG5945631', '5J840177N2716472D', '34J51112932407314', '81756540HH8186909'];
const kvStore = kv => ({ async put(r) { await kv.put('order:' + r.order_id, JSON.stringify(r)); },
  async list() { const { keys } = await kv.list({ prefix: 'order:', limit: 200 }); return (await Promise.all(keys.map(k => kv.get(k.name, 'json')))).filter(Boolean); } });
const TYPES = { html: 'text/html; charset=utf-8', mjs: 'text/javascript', js: 'text/javascript' };
let pp; const nc = async () => ({ error: 'PayPal sandbox secrets not configured' });
const NOT_CONFIGURED = { createOrder: nc, getOrder: nc, captureOrder: nc };
export default { async fetch(req, env) {
  if (!env.PAYPAL_SANDBOX_CLIENT_ID || !env.PAYPAL_SANDBOX_SECRET) pp = null; else pp ||= makePayPal({ clientId: env.PAYPAL_SANDBOX_CLIENT_ID, secret: env.PAYPAL_SANDBOX_SECRET });   // sandbox host hard-coded + guarded
  const readText = async p => { if (!(p in ASSETS)) throw new Error('missing asset ' + p); return ASSETS[p]; };
  const r = await handle(req, { paypal: pp || NOT_CONFIGURED, readText, store: env.ORDERS ? kvStore(env.ORDERS) : undefined, seed: SEED }); if (r) return r;
  const p = new URL(req.url).pathname;
  if (p in ASSETS) return new Response(ASSETS[p], { headers: { 'content-type': TYPES[p.split('.').pop()], 'cache-control': 'public, max-age=300' } });
  return new Response('{"error":"not found"}', { status: 404, headers: { 'content-type': 'application/json' } });
} };
