# ShopBridge — one script tag makes a small PayPal shop orderable by AI agents (WebMCP + PayPal)

**Live demo:** https://paypal-webmcp-shop.sandbricks.workers.dev — [original shop](https://paypal-webmcp-shop.sandbricks.workers.dev/original) · [agent-ready shop](https://paypal-webmcp-shop.sandbricks.workers.dev/) · [readiness report](https://paypal-webmcp-shop.sandbricks.workers.dev/report) · [merchant dashboard](https://paypal-webmcp-shop.sandbricks.workers.dev/dashboard)
Built for the PayPal AI Hackathon 2026. **PayPal sandbox only** — no real money moves.

> **Implemented from public specs, no official onboarding.** We built this from PayPal's public WebMCP / Store Sync documentation and the public WebMCP spec (`document.modelContext.registerTool`). We do not have PayPal Store Sync onboarding, and this is not an official PayPal product.

## What it is
Millions of small shops already sell with a PayPal button, but AI agents have to guess their way through the UI. ShopBridge reads the product data the shop already publishes (schema.org JSON-LD / microdata) and, with **one `<script>` tag**, exposes it to agents as WebMCP tools:

| tool | does |
|---|---|
| `search_products`, `get_product` | catalog lookup (price, currency, stock) |
| `add_to_cart`, `view_cart` | cart, refuses out-of-stock items |
| `create_checkout` | creates a **PayPal Orders v2 (sandbox)** order, returns the approve link for the human buyer |
| `get_order_status` | CREATED / APPROVED / COMPLETED |
| `capture_order` | captures **only after** the buyer approved (server returns 409 otherwise) |

Safety: prices are re-read from the shop's own catalog on the server (client prices ignored); the PayPal client refuses any non-sandbox host; the agent never pays — a human approves on PayPal.

**Agent-readiness report** (`/report`, AG Grid): loads the *original* page and the *converted* page live and scores both (sample shop: **45 → 100**).

## Try it
Chrome 149+ with WebMCP enabled (`chrome://flags/#enable-webmcp-testing`, or `--enable-features=WebMCPTesting`). Open the live link; the status line shows the registered tools.

### Run locally
```bash
npm install
export PAYPAL_SANDBOX_CLIENT_ID=... PAYPAL_SANDBOX_SECRET=...     # PayPal sandbox REST app
npm start                                                         # http://localhost:8787  (PAYPAL_MOCK=1 = offline)
npm test
```

### Run the AI agent
```bash
export LLM_API_KEY=...            # Z.ai key; LLM_BASE_URL / LLM_MODEL optional (default glm-4.7-flash)
node agent.mjs "Buy me 2 bags of jasmine tea and one oolong, then give me the PayPal link to pay."
```
Playwright opens Chrome with WebMCP, reads the page's tools (`document.modelContext.getTools()`, also CDP `WebMCP.enable`/`toolsAdded`), converts them to OpenAI function calling, lets the LLM plan, and executes each call in the page via `executeTool`. Without `LLM_API_KEY` a deterministic offline planner is used.

Buyer approval + capture for the demo (sandbox buyer account): `PAYPAL_SANDBOX_BUYER_EMAIL=... PAYPAL_SANDBOX_BUYER_PASSWORD=... node scripts/approve-sandbox.mjs`

### Add it to your shop
```html
<script type="module" src="https://YOUR_HOST/converter/inject.mjs"></script>
```
plus a backend for `/api/orders` holding your PayPal credentials (`lib/app.mjs` runs on Node and on Cloudflare Workers; `node scripts/build-worker.mjs` builds `dist/worker.mjs`).

## How it differs from AutoShop
[AutoShop](https://devpost.com/software/autoshop) (WebMCP Challenge) is a seller-controlled *authority layer* for agentic commerce: what agents are permitted to do. ShopBridge is a *retrofit converter* for **existing PayPal shops**: no rebuild, no new catalog — it reuses the shop's existing product markup and PayPal checkout, adds a measurable before/after readiness score, and ends every agent flow in a real PayPal Orders v2 approve → capture.

## AI tools statement
- Runtime AI: Z.ai GLM (`glm-4.7-flash`) through an OpenAI-compatible API plans the shopping agent's tool calls.
- Development: code and docs were written with the help of an AI coding assistant, then reviewed and tested by the author.

## License
MIT — see [LICENSE](LICENSE).
