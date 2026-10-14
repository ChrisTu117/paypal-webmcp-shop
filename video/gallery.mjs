import { chromium } from 'playwright'; import fs from 'node:fs';
const img = f => 'data:image/png;base64,' + fs.readFileSync('out/gsrc/' + f).toString('base64');
const shell = (title, sub, body) => `<body style="margin:0;width:1800px;height:1200px;background:linear-gradient(135deg,#003087,#009cde);font-family:system-ui;color:#fff;display:flex;flex-direction:column;padding:50px 60px;box-sizing:border-box">
<div style="font-size:60px;font-weight:800">${title}</div><div style="font-size:30px;opacity:.9;margin:8px 0 34px">${sub}</div><div style="flex:1;display:flex;gap:30px;align-items:center;justify-content:center;overflow:hidden;min-height:0">${body}</div></body>`;
const pic = (f, w, label) => `<figure style="margin:0;text-align:center"><img src="${img(f)}" style="width:${w}px;max-height:930px;object-fit:contain;border-radius:14px;box-shadow:0 12px 40px #0007">${label ? `<figcaption style="font-size:28px;margin-top:16px;font-weight:600">${label}</figcaption>` : ''}</figure>`;
const G = [
 ['1-one-script-tag', shell('One script tag → agent-ready', 'Same PayPal shop. Original page: 0 WebMCP tools. With ShopBridge: 7 tools.', pic('r23.png', 820, '/original · 0 tools') + pic('r38.png', 820, '/ · 7 WebMCP tools'))],
 ['2-readiness-report', shell('Agent-readiness: 45 → 100', 'Both pages scanned live and scored in AG Grid', pic('r49.png', 1420))],
 ['3-agent-checkout', shell('AI agent orders via WebMCP', 'GLM-4.7-flash plans tool calls → PayPal Orders v2 (sandbox) → buyer approves on PayPal', pic('r75.png', 820, 'Agent calls page tools') + pic('r85.png', 820, 'Buyer approves (sandbox)'))],
 ['5-merchant-dashboard', shell('Merchant dashboard', 'Every agent order with its WebMCP tool calls, live PayPal status, revenue · AG Grid + AG Charts', pic('dash.png', 1420))],
 ['4-captured', shell('Approved → captured → COMPLETED', 'capture_order only works after buyer approval · server-side pricing · sandbox only', pic('r95.png', 1420))],
];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const p = await b.newPage({ viewport: { width: 1800, height: 1200 } });
for (const [n, h] of G) { await p.setContent(h); await p.screenshot({ path: `out/gallery/${n}.png` }); console.log(`out/gallery/${n}.png`); }
await b.close();
