"use client";

import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ tipos (forma de las rutas API) */

type TxLink = { hash: string; url: string } | null;
type Status =
  | "QUOTED"
  | "DENIED"
  | "EXPIRED"
  | "RESERVED"
  | "CHECKOUT"
  | "COMPLETED"
  | "RELEASED"
  | "NEEDS_REVIEW";

type Purchase = {
  quoteId: string;
  status: Status;
  product: string;
  merchant: string;
  amountUsd: string | null;
  policyId: string;
  denyReason: string | null;
  expiresAt: string;
  reservationId: string | null;
  reserveTx: TxLink;
  checkoutId: string | null;
  approvalUrl: string | null;
  reapStatus: string | null;
  orderId: string | null;
  chargedUsd: string | null;
  confirmTx: TxLink;
  releaseTx: TxLink;
  error: string | null;
};

type Quote = Purchase & {
  breakdown: { subtotal: string; shipping: string; tax: string; total: string };
  candidates: { n: number; name: string; merchant: string | null; price: string | null }[];
};

type PolicyStatus = {
  policyId: string;
  contract: { address: string; url: string };
  owner: string;
  agent: string;
  merchants: string[];
  totalUsd: string;
  perPurchaseUsd: string;
  spentUsd: string;
  remainingUsd: string;
  charges: number;
  maxCharges: number;
  expiresAt: string;
  revoked: boolean;
  accessRequired?: boolean;
  purchases: Purchase[];
};

/* ------------------------------------------------------------------ utilidades */

class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

let demoKey = ""; // shared key for the protected endpoints (buy / finalize), set from the form

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "content-type": "application/json", ...(demoKey ? { "x-demo-key": demoKey } : {}) },
          body: JSON.stringify(body),
        },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json?.error?.code ?? "ERROR", json?.error?.message ?? `HTTP ${res.status}`);
  }
  return json as T;
}

const money = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "—" : `$${Number(v).toFixed(2)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const TERMINAL: Status[] = ["COMPLETED", "RELEASED", "NEEDS_REVIEW"];

const DENY_TEXT: Record<string, string> = {
  OverPerPurchaseCap: "The order total exceeds the per-purchase cap.",
  OverTotalCap: "This purchase would exceed the total budget.",
  MaxChargesReached: "The maximum number of purchases was already reached.",
  MerchantNotAllowed: "This merchant is not on the policy's allowlist.",
  Expired: "The policy has expired.",
  Revoked: "The owner revoked this policy.",
  PolicyNotFound: "The policy could not be found onchain.",
};

/* ------------------------------------------------------------------ piezas visuales */

type Tone = "green" | "red" | "amber" | "blue" | "gray";
const TONES: Record<Tone, string> = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  red: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  blue: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  gray: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function Chip({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {children}
    </section>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200"
    >
      {children}
    </a>
  );
}

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

/* ------------------------------------------------------------------ tarjeta de politica */

function PolicyCard({ policy }: { policy: PolicyStatus }) {
  const total = Number(policy.totalUsd);
  const spent = Number(policy.spentUsd);
  const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;
  const expired = Date.parse(policy.expiresAt) < Date.now();
  const hoursLeft = Math.max(0, Math.round((Date.parse(policy.expiresAt) - Date.now()) / 3_600_000));
  const state: { label: string; tone: Tone } = policy.revoked
    ? { label: "Revoked", tone: "red" }
    : expired
      ? { label: "Expired", tone: "amber" }
      : { label: "Active", tone: "green" };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Spending policy #{policy.policyId}</h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Set by the owner onchain. The agent cannot spend outside these rules.
          </p>
        </div>
        <Chip tone={state.tone}>{state.label}</Chip>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Budget used</span>
          <span className="font-medium">
            {money(policy.spentUsd)} <span className="text-zinc-400">of {money(policy.totalUsd)}</span>
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{money(policy.remainingUsd)} remaining</p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">Per-purchase cap</dt>
          <dd className="mt-0.5 font-medium">{money(policy.perPurchaseUsd)}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">Purchases</dt>
          <dd className="mt-0.5 font-medium">
            {policy.charges} / {policy.maxCharges}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">Expires</dt>
          <dd className="mt-0.5 font-medium">{expired ? "Expired" : `in ${hoursLeft} h`}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">Allowed merchants</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {policy.merchants.map((m) => (
              <Chip key={m}>{m}</Chip>
            ))}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <span>
          Contract <ExtLink href={policy.contract.url}>{short(policy.contract.address)}</ExtLink>
        </span>
        <span>
          Owner <span className="font-mono">{short(policy.owner)}</span>
        </span>
        <span>
          Agent <span className="font-mono">{short(policy.agent)}</span>
        </span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ tracker de la compra */

type StepState = "done" | "active" | "pending" | "failed";
type Step = { label: string; state: StepState; detail?: React.ReactNode };

function buildSteps(p: Purchase): Step[] {
  const reap = p.reapStatus ?? "REQUIRES_ACTION";
  const completed = p.status === "COMPLETED";
  const released = p.status === "RELEASED";
  const review = p.status === "NEEDS_REVIEW";
  const processing = reap === "PROCESSING" || reap === "COMPLETED" || completed;

  const steps: Step[] = [
    { label: "Policy check", state: "done", detail: "Approved by the onchain policy" },
    {
      label: "Budget reserved onchain",
      state: p.reserveTx ? "done" : "active",
      detail: p.reserveTx ? <ExtLink href={p.reserveTx.url}>{short(p.reserveTx.hash)}</ExtLink> : undefined,
    },
    {
      label: "Payment approved in Reap",
      state: released ? "failed" : processing ? "done" : "active",
      detail: released ? `Reap status: ${reap}` : processing ? undefined : "Waiting for you to approve the charge",
    },
    {
      label: "Reap processing the payment",
      state: completed ? "done" : released ? "pending" : reap === "PROCESSING" ? "active" : "pending",
    },
  ];

  if (released) {
    steps.push({
      label: "Budget released onchain",
      state: "done",
      detail: p.releaseTx ? <ExtLink href={p.releaseTx.url}>{short(p.releaseTx.hash)}</ExtLink> : undefined,
    });
  } else {
    steps.push({
      label: "Purchase confirmed onchain",
      state: completed ? "done" : review ? "failed" : "pending",
      detail: completed ? (
        <span className="flex flex-wrap items-center gap-x-3">
          <span>
            Order <span className="font-mono text-xs">{p.orderId}</span>
          </span>
          {p.confirmTx && <ExtLink href={p.confirmTx.url}>{short(p.confirmTx.hash)}</ExtLink>}
        </span>
      ) : undefined,
    });
  }
  return steps;
}

function StepIcon({ state }: { state: StepState }) {
  const base = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold";
  if (state === "done") return <span className={`${base} bg-emerald-500 text-white`}>✓</span>;
  if (state === "failed") return <span className={`${base} bg-red-500 text-white`}>✕</span>;
  if (state === "active")
    return (
      <span className={`${base} border border-zinc-300 dark:border-zinc-600`}>
        <Spinner />
      </span>
    );
  return <span className={`${base} border border-zinc-200 text-zinc-300 dark:border-zinc-700 dark:text-zinc-600`}>•</span>;
}

function Tracker({ purchase }: { purchase: Purchase }) {
  const steps = buildSteps(purchase);
  const waitingApproval =
    purchase.status === "CHECKOUT" && purchase.approvalUrl && (purchase.reapStatus ?? "REQUIRES_ACTION") === "REQUIRES_ACTION";

  return (
    <div className="mt-5 border-t border-zinc-100 pt-5 dark:border-zinc-800">
      <ol className="space-y-4">
        {steps.map((s) => (
          <li key={s.label} className="flex gap-3">
            <StepIcon state={s.state} />
            <div className="min-w-0 text-sm">
              <p className={s.state === "pending" ? "text-zinc-400 dark:text-zinc-500" : "font-medium"}>{s.label}</p>
              {s.detail && <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>

      {waitingApproval && (
        <div className="mt-5 rounded-xl bg-sky-50 p-4 text-sm dark:bg-sky-500/10">
          <p className="font-medium text-sky-900 dark:text-sky-200">Approve the charge in Reap</p>
          <p className="mt-1 text-sky-800/80 dark:text-sky-300/80">
            Reap shows a hosted page where you review and approve the payment. Sandbox: verify with the passkey prompt (OTP <span className="font-mono">456789</span> if asked).
            This page updates by itself when you finish.
          </p>
          <a href={purchase.approvalUrl!} target="_blank" rel="noreferrer" className={`${btnPrimary} mt-3`}>
            Open approval page ↗
          </a>
        </div>
      )}

      {purchase.status === "COMPLETED" && (
        <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
          Done. Reap charged <strong>{money(purchase.chargedUsd)}</strong> and the order reference is recorded onchain.
        </p>
      )}
      {purchase.status === "RELEASED" && (
        <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          The payment did not complete, so the reserved budget was released. Nothing was charged.
        </p>
      )}
      {purchase.status === "NEEDS_REVIEW" && (
        <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200">
          This purchase needs manual review. {purchase.error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pagina */

export default function AgentPage() {
  const [policy, setPolicy] = useState<PolicyStatus | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [query, setQuery] = useState("badass coffee");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [active, setActive] = useState<Purchase | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState("");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("demoKey") ?? "";
      demoKey = saved;
      setKey(saved);
    } catch {}
  }, []);

  function changeKey(v: string) {
    demoKey = v.trim();
    setKey(v);
    try {
      sessionStorage.setItem("demoKey", demoKey);
    } catch {}
  }

  const loadPolicy = useCallback(async () => {
    try {
      setPolicy(await api<PolicyStatus>("/api/policy"));
      setPolicyError(null);
    } catch (e) {
      setPolicyError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    loadPolicy();
    const id = setInterval(loadPolicy, 15_000);
    return () => clearInterval(id);
  }, [loadPolicy]);

  // Mientras Reap procesa, se consulta /api/finalize hasta llegar a un estado final.
  const trackedId = active?.quoteId;
  const trackedStatus = active?.status;
  useEffect(() => {
    if (!trackedId || !trackedStatus || TERMINAL.includes(trackedStatus)) return;
    let stopped = false;
    const tick = async () => {
      try {
        const next = await api<Purchase>("/api/finalize", { quoteId: trackedId });
        if (stopped) return;
        setActive(next);
        if (TERMINAL.includes(next.status)) loadPolicy();
      } catch (e) {
        if (!stopped) setError(errMsg(e));
      }
    };
    const id = setInterval(tick, 3500);
    tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [trackedId, trackedStatus, loadPolicy]);

  async function ask(pick = 0) {
    if (!query.trim()) return;
    setQuoting(true);
    setError(null);
    setActive(null);
    try {
      setQuote(await api<Quote>("/api/quote", { query, pick }));
      loadPolicy();
    } catch (e) {
      setQuote(null);
      setError(errMsg(e));
    } finally {
      setQuoting(false);
    }
  }

  async function buy() {
    if (!quote) return;
    setBuying(true);
    setError(null);
    try {
      const p = await api<Purchase>("/api/buy", { quoteId: quote.quoteId });
      setActive(p);
      loadPolicy();
    } catch (e) {
      setError(errMsg(e));
      loadPolicy();
    } finally {
      setBuying(false);
    }
  }

  function reset() {
    setQuote(null);
    setActive(null);
    setError(null);
  }

  const denied = quote?.status === "DENIED";
  const approved = quote?.status === "QUOTED";
  const finished = active && TERMINAL.includes(active.status);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-10 sm:px-6">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="blue">Ink Sepolia</Chip>
            <Chip tone="amber">Reap sandbox · no real money</Chip>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Spend Authority</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            An AI agent buys with a real card flow, but an onchain policy decides what it is allowed to spend. Every
            reservation, charge and release is recorded with the Reap quote, checkout and order IDs.
          </p>
        </header>

        {policy ? (
          <PolicyCard policy={policy} />
        ) : (
          <Card>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {policyError ? `Could not load the policy: ${policyError}` : "Loading policy from Ink Sepolia…"}
            </p>
          </Card>
        )}

        <Card>
          <h2 className="text-base font-semibold">Ask the agent to buy something</h2>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. badass coffee"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-400"
            />
            <button type="submit" disabled={quoting || buying || !query.trim()} className={`${btnPrimary} shrink-0`}>
              {quoting ? <Spinner /> : null}
              {quoting ? "Getting quote…" : "Get quote"}
            </button>
          </form>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}

          {quote && (
            <div className="mt-5 border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{quote.product}</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{quote.merchant}</p>
                </div>
                <p className="text-lg font-semibold">{quote.breakdown.total.replace(" USD", "")}</p>
              </div>

              <dl className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
                <div className="flex justify-between">
                  <dt>Items</dt>
                  <dd>{quote.breakdown.subtotal}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Shipping</dt>
                  <dd>{quote.breakdown.shipping}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Tax</dt>
                  <dd>{quote.breakdown.tax}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                The policy is checked against the full order total, not the catalog price.
              </p>

              {denied && (
                <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200">
                  <p className="font-medium">Blocked by the onchain policy</p>
                  <p className="mt-1">
                    {DENY_TEXT[quote.denyReason ?? ""] ?? quote.denyReason} No budget was reserved and no checkout was
                    opened in Reap.
                  </p>
                </div>
              )}

              {approved && !active && (
                <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <p className="font-medium">Approved by the onchain policy</p>
                  <p className="mt-1">Buying will reserve {quote.breakdown.total} of the budget onchain first.</p>
                  {policy?.accessRequired && (
                    <input
                      type="password"
                      value={key}
                      onChange={(e) => changeKey(e.target.value)}
                      placeholder="Demo access key"
                      aria-label="Demo access key"
                      className="mt-3 block w-full max-w-xs rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-400 dark:border-emerald-500/30 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  )}
                  <button onClick={buy} disabled={buying} className={`${btnPrimary} mt-3`}>
                    {buying ? <Spinner /> : null}
                    {buying ? "Reserving budget onchain…" : "Reserve budget & open checkout"}
                  </button>
                </div>
              )}

              {active && <Tracker purchase={active} />}

              {quote.candidates.length > 1 && !active && (
                <div className="mt-5">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Other results</p>
                  <ul className="mt-2 space-y-1">
                    {quote.candidates.map((c) => (
                      <li key={c.n}>
                        <button
                          onClick={() => ask(c.n)}
                          disabled={quoting}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                        >
                          <span className="truncate">{c.name}</span>
                          <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{c.price?.split(" - ")[0]}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(denied || finished) && (
                <button onClick={reset} className={`${btnSecondary} mt-5`}>
                  New request
                </button>
              )}
            </div>
          )}
        </Card>

        {policy && policy.purchases.length > 0 && (
          <Card>
            <h2 className="text-base font-semibold">Recent purchases</h2>
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
              {policy.purchases.map((p) => {
                const tone: Tone =
                  p.status === "COMPLETED"
                    ? "green"
                    : p.status === "DENIED" || p.status === "NEEDS_REVIEW"
                      ? "red"
                      : p.status === "RELEASED" || p.status === "EXPIRED"
                        ? "amber"
                        : "blue";
                const link = p.confirmTx ?? p.releaseTx ?? p.reserveTx;
                return (
                  <li key={p.quoteId} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.product}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {money(p.amountUsd)}
                        {p.orderId ? ` · ${p.orderId}` : ""}
                        {p.denyReason ? ` · ${p.denyReason}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {link && <ExtLink href={link.url}>tx ↗</ExtLink>}
                      <Chip tone={tone}>{p.status.replace("_", " ").toLowerCase()}</Chip>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <footer className="pb-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Reap Agentic Payments · SpendAuthority on Ink Sepolia
        </footer>
      </div>
    </main>
  );
}