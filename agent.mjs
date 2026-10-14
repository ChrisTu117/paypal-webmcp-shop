// Agent runner: Chrome (WebMCP flag) -> read page tools -> LLM function-calling -> execute tools in the page.
import { chromium } from 'playwright'; import { createServer } from './server.mjs'; import { toOpenAITools } from './converter/core.mjs';
import { mockPlanner, openAIPlanner } from './lib/planner.mjs';
const request = process.argv.slice(2).join(' ') || 'Buy me 2 bags of jasmine tea and one oolong, then give me the PayPal link to pay.';
const LIVE = process.env.LIVE?.replace(/\/$/, ''); const srv = LIVE ? null : createServer().listen(0); const SHOP = LIVE || `http://localhost:${srv.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--enable-features=WebMCPTesting'] });
const page = await browser.newPage(); const cdp = await page.context().newCDPSession(page);
const cdpTools = []; cdp.on('WebMCP.toolsAdded', e => cdpTools.push(...(e.tools || [])));
await cdp.send('WebMCP.enable').catch(e => console.log('[cdp] WebMCP.enable failed:', e.message));
await page.goto(SHOP + '/'); await page.waitForFunction(() => window.__webmcpShop);
const tools = await page.evaluate(async () => (await document.modelContext.getTools()).map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })));
console.log(`[page] ${tools.length} WebMCP tools: ${tools.map(t => t.name).join(', ')}  (CDP toolsAdded saw ${cdpTools.length})`);
const exec = (name, args) => page.evaluate(async ([n, a]) => { const t = (await document.modelContext.getTools()).find(x => x.name === n); if (!t) return JSON.stringify({ error: 'no tool ' + n });
  const r = await document.modelContext.executeTool(t, JSON.stringify(a)); return typeof r === 'string' ? r : JSON.stringify(r); }, [name, args]);
const planner = process.env.LLM_API_KEY ? openAIPlanner() : mockPlanner();
console.log(`[agent] planner=${planner.name}\n[user] ${request}`);
const messages = [{ role: 'system', content: 'You are a shopping agent. Use only the website tools. Use exact product ids from search results. Finish by calling create_checkout and give the user the approve_url; never claim payment is done.' }, { role: 'user', content: request }];
let final;
for (let step = 0; step < 12 && !final; step++) {
  let msg; try { msg = await planner.next(messages, toOpenAITools(tools)); } catch (e) {
    const o = messages.filter(m => m.role === 'tool').map(m => m.content).reverse().find(c => c.includes('approve_url'));
    console.log('[agent] LLM error:', e.message); final = o ? 'LLM unavailable; checkout result: ' + o : 'aborted'; break; }
  messages.push(msg);
  if (!msg.tool_calls?.length) { final = msg.content; break; }
  for (const c of msg.tool_calls) { const args = JSON.parse(c.function.arguments || '{}'); const out = await exec(c.function.name, args);
    console.log(`[tool] ${c.function.name}(${JSON.stringify(args)}) -> ${out.slice(0, 300)}`); messages.push({ role: 'tool', tool_call_id: c.id, content: out }); }
}
console.log('[agent final]', final);
import('node:fs').then(fs => fs.writeFileSync('out/agent-transcript.json', JSON.stringify({ planner: planner.name, request, at: new Date().toISOString(), messages }, null, 1)));
await page.screenshot({ path: 'out/shop-after-agent.png', fullPage: true });
await browser.close(); srv?.close();
