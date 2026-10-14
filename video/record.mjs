// Records the demo against the LIVE site. Scene timings come from video/script.json (narration lengths).
import { chromium } from 'playwright'; import fs from 'node:fs';
const LIVE = 'https://paypal-webmcp-shop.sandbricks.workers.dev';
const S = Object.fromEntries(JSON.parse(fs.readFileSync('video/script.json')).map(s => [s.id, s]));
const T = JSON.parse(fs.readFileSync('out/agent-transcript.json'));
const EMAIL = process.env.PAYPAL_SANDBOX_BUYER_EMAIL, PW = process.env.PAYPAL_SANDBOX_BUYER_PASSWORD; if (!EMAIL || !PW) throw new Error('buyer env missing');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--enable-features=WebMCPTesting'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }, recordVideo: { dir: 'video/raw', size: { width: 1280, height: 720 } } });
const page = await ctx.newPage(); const t0 = Date.now(); const marks = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function scene(id, fn) { const st = Date.now(); marks.push({ id, start: (st - t0) / 1000 }); await fn(); const m = marks.at(-1); const left = S[id].dur * 1000 - (Date.now() - t0 - m.start * 1000); if (left > 0) await sleep(left); else console.log('overflow', id, -left); m.end = (Date.now() - t0) / 1000; }
const CSS = `#ov{position:fixed;right:16px;top:70px;width:470px;max-height:600px;overflow:hidden;background:#0b1e3a;color:#e8f0ff;font:14px/1.45 ui-monospace,monospace;border-radius:12px;padding:14px 16px;box-shadow:0 8px 30px #0006;z-index:99999;white-space:pre-wrap}#ov b{color:#ffc439}#bn{position:fixed;left:0;right:0;top:0;background:#003087;color:#fff;font:600 20px system-ui;padding:10px 18px;z-index:99999}`;
const banner = (title, sub = '') => page.evaluate(([t, s, css]) => { if (!document.getElementById('dcss')) { const st = document.createElement('style'); st.id = 'dcss'; st.textContent = css; document.head.append(st); }
  let bn = document.getElementById('bn') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'bn' })); bn.innerHTML = t + (s ? ` <span style="font-weight:400;opacity:.8;font-size:15px">· ${s}</span>` : ''); document.body.style.paddingTop = '40px'; }, [title, sub, CSS]);
const ov = (html, append = false) => page.evaluate(([h, a]) => { let o = document.getElementById('ov') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'ov' })); o.innerHTML = a ? o.innerHTML + h : h; o.scrollTop = 1e6; }, [html, append]);
const card = (h1, lines) => page.setContent(`<body style="margin:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 90px;background:linear-gradient(135deg,#003087,#009cde);color:#fff;font-family:system-ui"><div style="font-size:54px;font-weight:800;margin-bottom:24px">${h1}</div>${lines.map(l => `<div style="font-size:26px;margin:8px 0;opacity:.95">${l}</div>`).join('')}</body>`);
const callTool = async (n, a) => { const out = await page.evaluate(async ([n, a]) => { const t = (await document.modelContext.getTools()).find(x => x.name === n); const r = await document.modelContext.executeTool(t, JSON.stringify(a)); return typeof r === 'string' ? r : JSON.stringify(r); }, [n, a]); return JSON.parse(JSON.parse(out).content[0].text); };
const toolsList = () => page.evaluate(async () => { const mc = document.modelContext; return mc ? (await mc.getTools()).map(t => t.name) : null; });

await scene('s1', async () => { await card('ShopBridge', ['Small PayPal shops are invisible to AI agents.', 'One script tag makes them agent-orderable via <b>WebMCP</b>.', '<span style="opacity:.75">PayPal AI Hackathon 2026 · PayPal sandbox demo</span>']); });
await scene('s2', async () => { await page.goto(LIVE + '/original'); await banner('Original shop', LIVE.replace('https://', '') + '/original'); await sleep(2500);
  const t = await toolsList(); await ov(`<b>document.modelContext.getTools()</b>\n\n→ ${JSON.stringify(t)}\n\n<b>${t.length} tools</b> — an agent can only scrape the UI.`); });
await scene('s3', async () => { await page.goto(LIVE + '/'); await page.waitForFunction(() => window.__webmcpShop); await banner('Same shop + 1 script tag', '&lt;script type="module" src="/converter/inject.mjs"&gt;');
  await ov('<b>&lt;script type="module" src="/converter/inject.mjs"&gt;</b>\n\nreads existing schema.org product data…'); await sleep(3000);
  const t = await toolsList(); await ov(`\n\n<b>document.modelContext.getTools()</b>\n${t.map(n => '  ✓ ' + n).join('\n')}\n\n<b>${t.length} WebMCP tools registered</b>`, true); });
await scene('s4', async () => { await page.goto(LIVE + '/report'); await banner('Agent-readiness report', 'AG Grid · /original vs /'); await page.waitForFunction(() => window.__report, null, { timeout: 20000 }); });
let order;
await scene('s5', async () => { await page.goto(LIVE + '/'); await page.waitForFunction(() => window.__webmcpShop); await banner('AI agent → WebMCP tools', `planned by ${T.planner.split(':')[1].split(',')[0]} · model thinking time cut`);
  await ov(`<b>User:</b> ${T.request}\n`); await sleep(2500);
  for (const m of T.messages.filter(m => m.role === 'assistant' && m.tool_calls)) for (const c of m.tool_calls) {
    const args = JSON.parse(c.function.arguments || '{}');
    const out = await page.evaluate(async ([n, a]) => { const t = (await document.modelContext.getTools()).find(x => x.name === n); const r = await document.modelContext.executeTool(t, JSON.stringify(a)); return typeof r === 'string' ? r : JSON.stringify(r); }, [c.function.name, args]);
    const inner = JSON.parse(JSON.parse(out).content[0].text); let short;
    if (c.function.name === 'search_products') short = inner.map(p => `${p.name} $${p.price}`).join(', ');
    else if (c.function.name === 'add_to_cart') short = `cart total $${inner.total}`;
    else if (c.function.name === 'create_checkout') { order = inner; short = `order <b>${inner.order_id}</b> ${inner.status}\n   ${inner.total} · sandbox approve link ready`; }
    else short = JSON.stringify(inner).slice(0, 80);
    await ov(`\n<b>→ ${c.function.name}</b>(${JSON.stringify(args)})\n   ${short}`, true); await sleep(2300);
  }
  await ov(`\n\n<b>Agent:</b> Total $31.00. Please approve the payment on PayPal — I never pay by myself.`, true); });
if (!order?.approve_url) throw new Error('no order');
await scene('s6', async () => {
  // PayPal sometimes ignores the language switch for this CN sandbox buyer; retry with fresh cookies and keep only the final attempt in the cut.
  for (let attempt = 1; ; attempt++) { try {
    marks.at(-1).start = (Date.now() - t0) / 1000;
    await page.goto(order.approve_url + '&locale.x=en_US&country.x=US', { waitUntil: 'domcontentloaded' }); if (!/sandbox\.paypal\.com/.test(page.url())) throw new Error('not sandbox');
    await page.waitForSelector('#email, #password', { timeout: 45000 });
    const en = page.locator('a:has-text("English"), button:has-text("English")').first(); if (await en.count()) { await Promise.all([page.waitForNavigation({ timeout: 15000 }).catch(() => {}), en.click().catch(() => {})]); await sleep(1500); await page.waitForSelector('#email, #password', { timeout: 30000 }); }
    if (await page.isVisible('#email')) { await page.type('#email', EMAIL, { delay: 25 }); if (await page.isVisible('#btnNext')) await page.click('#btnNext'); }
    await page.waitForSelector('#password', { state: 'visible' }); await page.fill('#password', PW); await page.click('#btnLogin');
    const pay = page.locator('#payment-submit-btn, [data-testid="submit-button-initial"]').first(); await pay.waitFor({ timeout: 35000 });
    const label = (await pay.innerText()).trim(); console.log('attempt', attempt, 'review button:', label);
    const vis = await page.innerText('body'); if (/captcha|one-time code|security code|card number/i.test(vis)) { await page.screenshot({ path: 'out/video-STOP.png' }); throw new Error('STOP challenge'); }
    if (!/[\u4e00-\u9fff]/.test(label) || attempt >= 6) { await sleep(2000); await pay.click(); break; }
    } catch (e) { if (/STOP/.test(e.message) || attempt >= 6) throw e; console.log('attempt', attempt, 'failed:', e.message.split('\n')[0]); await page.screenshot({ path: `out/retry-fail-${attempt}.png` }).catch(() => {}); }
    await ctx.clearCookies(); await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} }).catch(() => {});
  }
  await page.waitForURL(u => u.href.startsWith(LIVE), { timeout: 60000 }); });
await scene('s7', async () => { await page.waitForFunction(() => window.__webmcpShop); await banner('Back in the shop', 'buyer approved on PayPal sandbox');
  const st = await callTool('get_order_status', { order_id: order.order_id });
  await ov(`<b>→ get_order_status</b>\n   ${st.order_id}: <b>${st.status}</b>\n`); await sleep(2500);
  const cap = await callTool('capture_order', { order_id: order.order_id });
  await ov(`\n<b>→ capture_order</b>\n   status <b>${cap.status}</b>\n   capture id <b>${cap.capture_id}</b>\n   ${cap.total} · ${cap.environment}`, true); order.capture = cap; });
await scene('s7b', async () => { await page.goto(LIVE + '/dashboard'); await page.waitForFunction(() => window.__dash?.ready, null, { timeout: 30000 }); await banner('Merchant dashboard', 'AG Grid + AG Charts · live PayPal status');
  await page.evaluate(() => { document.body.style.zoom = '0.72'; document.querySelector('.charts').style.height = '230px'; }); await sleep(4000); await page.evaluate(id => { const row = [...document.querySelectorAll('.ag-row')].find(r => r.textContent.includes(id)); if (row) row.style.outline = '3px solid #ffc439'; }, order.order_id);
  await page.evaluate(() => document.querySelector('.ag-body-horizontal-scroll-viewport, .ag-center-cols-viewport')?.scrollBy({ left: 700, behavior: 'smooth' })); });
await scene('s8', async () => { await card('Safe by design', ['✓ Server re-prices every order from the shop\'s own catalog', '✓ PayPal client refuses any non-sandbox host · agent never pays', '✓ Built from public PayPal + WebMCP specs (no official Store Sync onboarding)', '✓ vs AutoShop: retrofits existing PayPal shops, not a permission layer',
  '<br><b>github.com/ChrisTu117/paypal-webmcp-shop</b>', '<b>paypal-webmcp-shop.sandbricks.workers.dev</b>']); });
const total = (Date.now() - t0) / 1000; const vpath = await page.video().path(); await ctx.close(); await b.close();
fs.writeFileSync('video/marks.json', JSON.stringify({ marks, total, video: vpath, order: { id: order.order_id, capture_id: order.capture?.capture_id, status: order.capture?.status } }, null, 1)); console.log(JSON.stringify({ marks, total, order: order.order_id, cap: order.capture?.capture_id, st: order.capture?.status }));
