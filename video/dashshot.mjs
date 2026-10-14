import { chromium } from 'playwright'; import { createServer } from '/workspace/paypal-webmcp/server.mjs'; import { makeMockPayPal } from '/workspace/paypal-webmcp/lib/paypal.mjs';
const u = process.env.LIVE || (() => { const pp = makeMockPayPal(); const s = createServer({ paypal: pp }).listen(8799); return 'http://localhost:8799'; })();
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
p.on('pageerror', e => console.log('pageerror', e.message)); p.on('console', m => m.type() === 'error' && console.log('console', m.text()));
await p.goto(u + '/dashboard'); await p.waitForFunction(() => window.__dash?.ready, null, { timeout: 30000 }); await p.waitForTimeout(1500);
console.log(JSON.stringify(await p.evaluate(() => window.__dash)), await p.$$eval('canvas', c => c.length), 'canvases');
await p.screenshot({ path: process.env.OUT || '/workspace/paypal-webmcp/out/dashboard-local.png' }); await b.close(); process.exit(0);
