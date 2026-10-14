# Devpost submission — PayPal AI Hackathon 2026

## Project name
ShopBridge — WebMCP for PayPal shops

## Tagline / elevator pitch (≤60 chars)
One script tag makes any PayPal shop AI-agent-orderable   ← 55 chars

## Links
- Live demo (hosted, free, no login): https://paypal-webmcp-shop.sandbricks.workers.dev  (`/original`, `/`, `/report`, `/dashboard`)
- Code (public, MIT): https://github.com/ChrisTu117/paypal-webmcp-shop
- Demo video (YouTube, public, 2:02): https://youtu.be/wr9jTVVn1Ko

## Built with
`paypal-orders-api-v2` `paypal-sandbox` `webmcp` `chrome` `javascript` `node.js` `cloudflare-workers` `playwright` `ag-grid` `ag-charts` `cloudflare-workers-kv` `glm-4.7-flash` `z.ai` `schema.org` `json-ld` `openai-function-calling` `kokoro-tts`

---

## About the project

### Inspiration
Millions of small merchants sell through a simple PayPal checkout button. AI shopping agents are arriving fast, but on these sites they have to guess their way through buttons and forms, and often fail. Big platforms are getting agent-native integrations; the long tail of small PayPal shops is not. We wanted the smallest possible step for a small merchant: **paste one script tag**.

### What it does
ShopBridge turns an existing PayPal shop into one that AI agents can order from directly, using **WebMCP** (`document.modelContext.registerTool`), the emerging web standard for exposing structured tools to in-browser agents.

1. **Converter (one `<script>` tag).** Reads the product data the shop already publishes (schema.org JSON-LD, with a microdata fallback) and registers 7 WebMCP tools: `search_products`, `get_product`, `add_to_cart`, `view_cart`, `create_checkout`, `get_order_status`, `capture_order`.
2. **PayPal checkout for agents.** `create_checkout` creates a **PayPal Orders v2** order (sandbox) and returns the approval link. The agent never pays: a human buyer approves on PayPal. `capture_order` completes the order only after approval; the server refuses otherwise (HTTP 409).
3. **AI agent runner.** Playwright opens Chrome with WebMCP, reads the page's tools, converts them to OpenAI-style function calling, lets **GLM-4.7-flash** plan the shopping task from natural language ("2 bags of jasmine tea and one oolong"), and executes each call as a real WebMCP tool inside the page.
4. **Agent-readiness report (AG Grid).** Loads the original page and the converted page live, reads their tools, and scores both: the sample shop goes from **45 → 100**.
5. **Merchant dashboard (AG Grid + AG Charts).** Every order is logged (Cloudflare Workers KV) with its channel (AI agent vs. PayPal button), items, amount and **the exact WebMCP tool calls that produced it** (e.g. `search_products → add_to_cart → create_checkout → capture_order`). Statuses and capture IDs are refreshed live from PayPal Orders v2. KPIs, orders-by-status donut, captured revenue by day, units by product.

**Safety by design:** prices are always recomputed on the server from the shop's own catalog (client prices ignored, out-of-stock items dropped); the PayPal client refuses any non-sandbox host; credentials live only as Cloudflare Worker secrets.

### How we built it
- **Converter:** dependency-free ES modules (`converter/core.mjs`, `converter/inject.mjs`). The same catalog scanner runs in the browser and on the server, so the server prices orders from the shop's own markup.
- **Backend:** one runtime-agnostic request handler (`lib/app.mjs`) that runs on Node locally and on **Cloudflare Workers** in production; PayPal OAuth + Orders v2 create / get / capture with idempotency keys.
- **Agent:** Playwright + Chrome (`--enable-features=WebMCPTesting`), CDP `WebMCP.enable` / `toolsAdded`, `modelContext.getTools()` / `executeTool()`; Z.ai **GLM-4.7-flash** through an OpenAI-compatible API with retry and model fallback; a deterministic offline planner for tests.
- **Report & dashboard:** AG Grid Community + AG Charts Community (both MIT, bundled locally; no Enterprise features). The dashboard reads an order log in Workers KV and refreshes non-final orders from PayPal.
- **Tests:** 12 Node tests: catalog scanning, every tool, out-of-stock handling, capture-only-after-approval, live-host refusal, server-side pricing, file allowlist, planner flow, order log + dashboard.
- **Standards:** implemented from **public** documentation only: the WebMCP spec/explainer and PayPal's public WebMCP and Store Sync docs. **We have no official Store Sync onboarding**, so ShopBridge does not call Store Sync's merchant Cart API; it follows the same idea (agent cart → PayPal Orders v2) directly in the merchant's page.

### Challenges we ran into
- WebMCP is brand new: Chrome-only, behind a flag, and its API changed between versions. We probed `registerTool` / `executeTool` / the CDP events in Chrome 154 before designing around them.
- Measuring "before" honestly: the report loads both pages one after the other in the same tab, because loading them in parallel let tools from one page show up in the other.
- Keeping the agent safe: the agent must never be able to pay or set prices, so payment approval stays with the human on PayPal and pricing stays on the server.
- Free-tier LLM latency and rate limits (HTTP 429): added retries and model fallback. In the demo video the model's thinking time is cut.

### Accomplishments that we're proud of
- A real end-to-end flow on the live site: natural language → WebMCP tools → PayPal sandbox order → buyer approval → capture **COMPLETED**.
- Zero changes to the merchant's existing page beyond one tag; it reuses markup most shops already have for SEO.
- A measurable readiness score merchants can understand.

### What we learned
- Structured product data that shops already publish for SEO is almost enough to make them agent-ready; the missing piece is actions (cart, checkout), which WebMCP provides.
- A clean split works well: the agent prepares, the human approves on PayPal, the server enforces.

### What's next
- Shopify / WooCommerce / Wix plugins and a hosted script for no-code merchants.
- Use PayPal Store Sync officially once onboarded (catalog ingestion + Cart API), and PayPal's agent toolkit where it fits.
- Shipping, tax and variants in the tools; agent-vs-human conversion analytics in the dashboard.
- Readiness scanning for any URL as a free audit tool.

### Try it out
- **Hosted:** open https://paypal-webmcp-shop.sandbricks.workers.dev in **Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled**. The status line shows the registered tools; `/report` shows the readiness score; `/dashboard` shows the merchant order log; `/original` is the unconverted shop.
- **Run the agent locally:** see README (`node agent.mjs "..."`). Without an LLM key it falls back to a deterministic planner.
- **Approving a sandbox payment:** use any PayPal **sandbox personal** account (every PayPal developer account has one under Testing Tools → Sandbox Accounts). Everything runs on PayPal's **sandbox**; no real money moves.

---

## Testing instructions (form field)
Hosted demo, free, no login: https://paypal-webmcp-shop.sandbricks.workers.dev (Chrome 149+ with chrome://flags/#enable-webmcp-testing). Pages: `/original` (0 tools), `/` (7 WebMCP tools), `/report` (AG Grid readiness 45→100), `/dashboard` (merchant order log, AG Grid + AG Charts). Agent: clone the repo, `npm install`, `node agent.mjs "Buy 2 jasmine teas and one oolong"` (set `LLM_API_KEY` for GLM, or run without it for the offline planner; `PAYPAL_MOCK=1` runs fully offline). Payment approval: PayPal **sandbox test** buyer account — email and password are in SUBMISSION-private.md (kept out of git; paste that version into the form). Sandbox only.

## AI tools statement (form field)
- **GLM-4.7-flash (Z.ai)**, through an OpenAI-compatible API: the runtime shopping agent. It receives the page's WebMCP tools as function definitions and plans the calls (search → cart → PayPal checkout).
- **Kokoro-82M** (open-source TTS, run locally): the demo video's voice-over.
- **AI coding assistant:** used to help write code, tests and docs; the author directed, reviewed and tested everything.
- **Sponsor tool:** AG Grid Community + AG Charts Community: readiness report and merchant dashboard.

## Significant work during the submission period
New project: idea, code, deployment, repo and video were all created during the submission period (Oct 2026). Repo history starts 2026-10-14.

## Prize category picks
Rules: a project can win at most one Grand/Honorable Mention prize plus one Sponsor prize. Most of these are judged on all eligible entries, so picks only matter if the form asks.
| Pick | Why |
|---|---|
| **Best Use of Agentic Commerce** (primary) | The whole project is agentic commerce: an AI agent discovers products, builds a cart and creates a PayPal order through standard WebMCP tools, with human approval and server-enforced pricing. |
| **Best Use of PayPal + AI** | PayPal Orders v2 (create / get / capture) is the core of the transaction path; AI plans every step. |
| **Best Use of AG Grid** (sponsor) | AG Grid + AG Charts power the merchant dashboard (order log with live PayPal status, agent tool-call trace, KPIs, status/revenue/product charts) and the before/after readiness report. |
| Channel3 | **Not eligible yet:** requires using Channel3 tools (product data API). We don't use Channel3. |
| Render | Not used (deployed on Cloudflare Workers). |
