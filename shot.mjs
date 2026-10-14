import { chromium } from 'playwright'; import { createServer } from './server.mjs'; import { makeMockPayPal } from './lib/paypal.mjs';
const LIVE = process.env.LIVE; const s = LIVE ? null : createServer({ paypal: makeMockPayPal() }).listen(0); const u = LIVE || `http://localhost:${s.address().port}`;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--enable-features=WebMCPTesting'] }); const p = await b.newPage();
await p.goto(u + '/'); await p.waitForFunction(() => window.__webmcpShop); console.log('shop:', JSON.stringify(await p.evaluate(() => ({ ...window.__webmcpShop, catalog: undefined, before: __webmcpShop.before.score, after: __webmcpShop.after.score }))));
await p.screenshot({ path: 'out/shop.png', fullPage: true });
await p.goto(u + '/report'); await p.waitForFunction(() => window.__report, null, { timeout: 20000 }); await p.waitForSelector('.ag-row'); console.log('report:', JSON.stringify(await p.evaluate(() => window.__report))); await p.screenshot({ path: 'out/report.png', fullPage: true });
await b.close(); s?.close();
