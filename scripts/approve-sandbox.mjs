// Demo helper (SANDBOX ONLY): open a PayPal sandbox approve link, log in as the sandbox buyer, approve,
// then verify APPROVED and capture through our server's guarded capture endpoint.
// Usage: PAYPAL_SANDBOX_BUYER_EMAIL=... PAYPAL_SANDBOX_BUYER_PASSWORD=... node scripts/approve-sandbox.mjs [ORDER_ID]
import { chromium } from 'playwright'; import { createServer } from '../server.mjs';
const EMAIL = process.env.PAYPAL_SANDBOX_BUYER_EMAIL, PW = process.env.PAYPAL_SANDBOX_BUYER_PASSWORD;
if (!PW || !EMAIL) throw new Error('set PAYPAL_SANDBOX_BUYER_EMAIL and PAYPAL_SANDBOX_BUYER_PASSWORD');
const LIVE = process.env.LIVE?.replace(/\/$/, ''); const srv = LIVE ? null : createServer().listen(+process.env.PORT || 8787); const base = LIVE || `http://localhost:${srv.address().port}`;
const j = async (p, i) => { const r = await fetch(base + p, i); return { code: r.status, body: await r.json() }; };
let id = process.argv[2], o = id && (await j('/api/orders/' + id)).body;
if (!o || o.error || !['PAYER_ACTION_REQUIRED', 'CREATED', 'APPROVED'].includes(o.status)) {
  o = (await j('/api/orders', { method: 'POST', body: JSON.stringify({ lines: [{ id: 'jasmine-100', qty: 2 }, { id: 'oolong-100', qty: 1 }] }) })).body; id = o.order_id;
}
console.log('order', id, o.status, o.total ?? '');
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: process.env.HEADED !== '1', slowMo: +process.env.SLOWMO || 0 });
const page = await b.newPage({ viewport: { width: 1100, height: 900 } }); let n = 0;
const shot = async name => { const f = `out/approve-${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log('shot', f); };
const stopIf = async () => { const t = (await page.innerText('body').catch(() => '')) || '';
  const m = t.match(/captcha|security challenge|verify it's you|one-time code|security code|confirm it's you|add a card|link a card|card number/i);
  const fr = page.locator('iframe[src*="captcha" i]:visible, iframe[title*="challenge" i]:visible');
  if (m || await fr.count()) { await shot('STOP-challenge'); throw new Error('STOP: captcha/2FA/card prompt (' + (m ? m[0] : 'visible challenge iframe') + '), see screenshot'); } };
try {
  if (o.status !== 'APPROVED') {
    await page.goto(`https://www.sandbox.paypal.com/checkoutnow?token=${id}`, { waitUntil: 'domcontentloaded' });
    if (!/sandbox\.paypal\.com/.test(page.url())) throw new Error('not a sandbox URL: ' + page.url());
    await page.waitForSelector('#email, #password', { timeout: 45000 }); await shot('login');
    if (await page.isVisible('#email')) { await page.fill('#email', EMAIL); if (await page.isVisible('#btnNext')) await page.click('#btnNext'); }
    await page.waitForSelector('#password', { state: 'visible', timeout: 30000 }); await stopIf();
    await page.fill('#password', PW); await page.click('#btnLogin');
    const pay = page.locator('#payment-submit-btn, [data-testid="submit-button-initial"], button:has-text("Complete Purchase"), button:has-text("Pay Now"), button:has-text("Continue to Review"), button:has-text("Continue")').first();
    await Promise.race([pay.waitFor({ timeout: 60000 }), page.waitForURL(u => u.href.startsWith(base), { timeout: 60000 })]).catch(() => {});
    await stopIf(); await shot('review');
    if (/paypal\.com/.test(page.url())) { await pay.click(); await page.waitForURL(u => u.href.startsWith(base), { timeout: 60000 }).catch(e => { if (!/ERR_CONNECTION_REFUSED/.test(e.message)) throw e; }); }
    console.log('returned to', page.url().replace(/token=[^&]+/, 'token=…'));
    await page.waitForLoadState('domcontentloaded').catch(() => {}); await shot('returned-to-shop');
  }
  const st = (await j('/api/orders/' + id)).body; console.log('status after approval:', st.status);
  const cap = await j(`/api/orders/${id}/capture`, { method: 'POST' }); console.log('capture ->', cap.code, JSON.stringify(cap.body));
} finally { await b.close(); srv?.close(); }
