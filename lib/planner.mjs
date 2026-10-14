// Planners return OpenAI-style assistant messages.
export function openAIPlanner({ base = process.env.LLM_BASE_URL || 'https://api.z.ai/api/paas/v4/', model = process.env.LLM_MODEL || 'glm-4.7-flash', key = process.env.LLM_API_KEY } = {}) {
  return { name: `openai_compat:${model}`, async next(messages, tools) {
    const models = model.split(',').map(x => x.trim()); let lastErr;
    for (let i = 0; i < 6; i++) { const mdl = models[i % models.length];
      let r; try { r = await fetch(base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ model: mdl, messages, tools, tool_choice: 'auto', temperature: 0.2, thinking: { type: 'disabled' } }), signal: AbortSignal.timeout(120000) }); } catch (e) { lastErr = e.message; continue; }
      if (r.ok) { const m = (await r.json()).choices[0].message; return { role: 'assistant', content: m.content || '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) }; }
      if (r.status !== 429 && r.status < 500) throw new Error('LLM HTTP ' + r.status + ' ' + await r.text());
      lastErr = 'HTTP ' + r.status; await new Promise(s => setTimeout(s, 3000 * (i + 1)));
    } throw new Error('LLM retries exhausted: ' + lastErr); } };
}
// Deterministic offline planner (for tests / no key): parses "N <item>" phrases, searches, adds, checks out.
export function mockPlanner() {
  let id = 0; const call = (name, args) => ({ role: 'assistant', content: '', tool_calls: [{ id: 'c' + (++id), type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
  const nums = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
  return { name: 'mock', next(messages) {
    const user = messages.find(m => m.role === 'user').content.toLowerCase();
    const wants = [...user.matchAll(/\b(\d+|a|an|one|two|three|four|five)\s+(?:bags? of |boxes? of |packs? of )?([a-z-]+)/g)].map(m => ({ qty: +m[1] || nums[m[1]], word: m[2] })).filter(w => !['link', 'paypal'].includes(w.word));
    const st = this.st ||= { i: 0, phase: 'search' }; const last = messages.at(-1);
    if (st.phase === 'add') { const hits = JSON.parse(last.content.match(/\{.*\}|\[.*\]/s)?.[0] || '[]'); const hit = [].concat(hits).find(p => p.inStock); st.phase = 'search'; st.i++;
      if (hit) return call('add_to_cart', { id: hit.id, qty: wants[st.i - 1].qty }); }
    if (st.phase === 'search' && st.i < wants.length) { st.phase = 'add'; return call('search_products', { query: wants[st.i].word }); }
    if (st.phase !== 'done' && st.phase !== 'checkout') { st.phase = 'checkout'; return call('create_checkout', {}); }
    if (st.phase === 'checkout') { st.phase = 'done'; const o = JSON.parse(last.content.match(/\{.*\}/s)?.[0] || '{}');
      return { role: 'assistant', content: o.approve_url ? `Order ${o.order_id} is ${o.status} (${o.total}). Open to pay: ${o.approve_url}` : 'Checkout failed: ' + last.content }; }
    return { role: 'assistant', content: 'done' };
  } };
}
