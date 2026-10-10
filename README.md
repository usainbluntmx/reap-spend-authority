# reap-spend-authority

**An onchain spending policy that decides when an AI agent may buy through the Reap Agentic Payments API.**

Built for the Reap x AIBM Agentic Buildathon — track: *Best Bridge Between Onchain and Real World*. Sandbox only, no real funds.

- Demo video: `<VIDEO_URL>`
- Repo: `<REPO_URL>`
- Live demo: `<LIVE_URL>` (buying needs a demo key, see submission notes; quoting and policy checks are public)

## The problem

Agents can now buy real goods with a card. But "the agent has a card" is not a spending policy. Who set the limit? Was it checked before the money moved? Can the owner stop it? Where is the audit trail?

## The idea

`SpendAuthority` is a smart contract (Ink Sepolia) where the **owner** writes the rules and the **agent** can only act inside them:

- total budget, per-purchase cap, max number of charges, expiry
- merchant allowlist (hashed, case-insensitive)
- revocable at any time by the owner

A small gateway sits between the agent and Reap. The policy is checked against the quote's **`finalAmount`** (item + shipping + tax), not the catalog price, so the agent can't be surprised by shipping.

## Flow

```
agent ──query──▶ gateway ──▶ Reap: search, details, quote (finalAmount)
                    │
                    ├─ SpendAuthority.check()        free view call → verdict
                    │     denied → stop, no checkout opened
                    ├─ SpendAuthority.reserve()      tx: budget locked onchain
                    ├─ Reap: create checkout         human approves on Reap's hosted page
                    └─ poll Reap
                          COMPLETED        → SpendAuthority.confirm(orderId)   (frees any difference)
                          FAILED / EXPIRED → SpendAuthority.release()          (budget returned)
```

Every step emits events carrying `quoteId`, `checkoutId` and Reap `orderId`, so the onchain log is a complete audit trail of what the agent bought and why it was allowed.

## Real evidence (Ink Sepolia, chain 763373)

| What | Value |
|---|---|
| Contract | `0xcE9A8305391747f8bF34B18Ae37a434c59060Ce2` |
| Owner | `0x9dabBF114698bd9bFBF6222b9FD6Cd967ECD3850` |
| Agent | `0x79D379be56d410924340e2aB4F57E4CA00b993e8` |
| Policy #1 | 100 USD total · 40 USD per purchase · 3 charges · 48 h · merchant "Bad Ass Coffee of Hawaii" |
| Live policy #3 | 1000 USD total · 40 USD per purchase · 50 charges · 30 days · same merchant. Create tx `0x18ce0dc6da20f448448878d0a6473be02c0b3ef1bc6377b89ab64a2a8e34a948` |
| Create policy tx | `0xe4d4a11d3683bdbc363f39bb52ef648f364eae82f1a415c7ba02534ef3e8fe3f` |
| Reserve tx | `0x9fe9dad8ba9f55c3db74f8b30e5dac80fb84fd83a7e3a81a8d96aae1f8d5b038` |
| Confirm tx | `0x9d716e5a3217a45345820aa843d126471896808a29c12a70b6f47d05b000957a` |
| Reap order #1 | `ord_01M4HTG358NATV8P3C4YQV7FAN` — Vanilla Macnut coffee, 27.67 USD |
| Reap order #2 | `ord_01M4HX2BZET32E6WB0EVNA73XB` — Vanilla Macnut coffee, 27.67 USD (reserve `0x4ad7…b9a9`, confirm `0xa329…f35a`; full hashes: `<TX_RESERVE_2>`, `<TX_CONFIRM_2>`) |
| Denied case | 100% Kona French Roast, 78.16 USD → `OverPerPurchaseCap`, no checkout opened |

Explorer: https://explorer-sepolia.inkonchain.com

## Trust model — what this is and is not

Being honest about the limits:

- Reap **mandates are not available yet** in the sandbox (`MANDATES_AVAILABLE=false`), so Reap itself cannot enforce our policy.
- The gateway holds both the Reap API key and the agent key. A **compromised gateway could bypass the contract** and call Reap directly. The contract is not a hard guarantee over Reap; it is the owner-set budget ledger and the audit trail the gateway commits to.
- What the contract does give: limits set by the owner (not the agent), budget accounting with reserve/confirm/release, an immutable public trail, and instant revocation.
- A human still approves each charge on Reap's hosted card page.
- Once Reap mandates exist, the same policy terms can be mirrored there and the gap closes.

Other limits: sandbox only · purchases stored in a JSON file (`.data/purchases.json`) · amounts in USD cents only · public RPC can lag (reads and simulations are retried, writes never are) · Reap may return the same quote for ~15 min, so reused quotes are rejected (`QUOTE_REUSED`) rather than overwritten · no LLM in the loop yet — the gateway exposes plain HTTP tools; an MCP wrapper is the natural next step.

## Repo layout

```
backend/    Hardhat: SpendAuthority.sol, tests (15), deploy / create-policy / revoke-policy scripts
frontend/   Next.js: /agent UI, /api/{quote,buy,finalize,policy}, lib/ (reap-shop, policy, gateway, store), CLI scripts
docs/DEMO.md   demo shot list
docs/DEPLOY.md  Dokploy deployment guide (Dockerfile in frontend/)
```

## Run it

Requirements: Node 20+, a funded Ink Sepolia wallet, a Reap sandbox API key.

```bash
# backend
cd backend && npm install
cp .env.example .env            # PRIVATE_KEY, INK_SEPOLIA_RPC_URL
npx hardhat test                # 15 passing
npx hardhat run scripts/deploy-spend-authority.ts --network inkSepolia
npx hardhat run scripts/create-policy.ts --network inkSepolia
# owner can stop the agent at any time:
npx hardhat run scripts/revoke-policy.ts --network inkSepolia

# frontend
cd ../frontend && npm install
# create .env.local (see below), then enroll a card once:
npm run reap-enroll && npm run reap-check
npm run dev                     # http://localhost:3000 → /agent
# or from the terminal:
npm run agent-run -- "badass coffee"
npm run agent-status
```

`create-policy.ts` knobs: `TOTAL_USD`, `PER_PURCHASE_USD`, `MAX_CHARGES`, `HOURS`, `MERCHANTS`, `AGENT_FUND_ETH`.

### Environment

| Where | Variable | Purpose |
|---|---|---|
| frontend | `REAP_API_KEY` | Reap sandbox key |
| frontend | `REAP_BASE_URL`, `REAP_VERSION` | Reap endpoint and version (`2025-02-14`) |
| frontend | `DEMO_USER_ID`, `DEMO_USER_EMAIL` | Enrolled user |
| frontend | `GATEWAY_PRIVATE_KEY` | Agent key (signs reserve/confirm/release) |
| frontend | `GATEWAY_RPC_URL` | Optional RPC override |
| frontend | `DEMO_SHIP_*` | Optional shipping address defaults |
| frontend | `DEMO_ACCESS_KEY` | If set, `/api/buy` and `/api/finalize` require header `x-demo-key` (the UI shows a key field) |
| frontend | `REAP_ENROLLMENT_ID` | Enrollment id; overrides `.data/enrollment.json` (handy in containers) |
| frontend | `REAP_RETURN_URL` | Where Reap redirects after approval (default example.com; e.g. `http://localhost:3000/agent`) |
| frontend | `REAL_APPROVAL=1` | Disable the sandbox simulate header |
| frontend | `NEXT_PUBLIC_REOWN_PROJECT_ID` | Optional; `/agent` does not use the wallet modal |
| backend | `PRIVATE_KEY`, `INK_SEPOLIA_RPC_URL` | Owner/deployer wallet and RPC |

Never commit `.env`, `.env.local` or `.data/`.

## Rules compliance

Sandbox only; no real payments; Reap Agentic Payments API used for search, quote, checkout and order status; all onchain activity on a testnet; no credentials in the repo.

## What's next

MCP wrapper so any LLM agent can call the gateway as a tool · mirror policy into Reap mandates when available · multi-policy / multi-agent support · stablecoin-denominated budgets · replace the JSON store with a database.