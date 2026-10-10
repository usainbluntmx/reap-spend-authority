import { randomUUID } from "node:crypto";

export type EnrollmentStatus =
  | "REQUIRES_ACTION"
  | "ACTIVE"
  | "FAILED"
  | "EXPIRED"
  | "REVOKED";

export interface Enrollment {
  id: string;
  status: EnrollmentStatus;
  source?: string;
  owner: { type: string; id: string; email?: string; name?: string };
  paymentMethod?: {
    type: "CARD";
    network: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
  } | null;
  nextAction: { type: "REDIRECT"; url: string; expiresAt?: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export class ReapError extends Error {
  status: number;
  code: string;
  detail: unknown;
  constructor(status: number, code: string, message: string, detail: unknown) {
    super(`[${status}] ${code}: ${message}`);
    this.name = "ReapError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function baseUrl(): string {
  return (process.env.REAP_BASE_URL ?? "https://sg.sandbox.api.reap.global").replace(/\/$/, "");
}

function apiVersion(): string {
  return process.env.REAP_VERSION ?? "2025-02-14";
}

interface RequestOptions {
  body?: unknown;
  idempotent?: boolean;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

export async function reapFetch<T>(
  method: "GET" | "POST",
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const apiKey = process.env.REAP_API_KEY;
  if (!apiKey) throw new Error("Falta REAP_API_KEY en frontend/.env.local");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Reap-Version": apiVersion(),
    Accept: "application/json",
    ...options.headers,
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotent) {
    headers["Idempotency-Key"] = options.idempotencyKey ?? randomUUID();
  }

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json: { error?: { code?: string; message?: string; detail?: unknown } } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new ReapError(
      res.status,
      json?.error?.code ?? "UNKNOWN",
      json?.error?.message ?? text.slice(0, 300),
      json?.error?.detail ?? null,
    );
  }
  return json as unknown as T;
}

export function createEnrollment(params: {
  ownerId: string;
  email: string;
  returnUrl: string;
}): Promise<Enrollment> {
  return reapFetch<Enrollment>("POST", "/agentic/enrollments", {
    idempotent: true,
    body: {
      source: "EXTERNAL",
      owner: { type: "CLIENT_REFERENCE", id: params.ownerId, email: params.email },
      presentation: { type: "REDIRECT", returnUrl: params.returnUrl },
    },
  });
}

export function getEnrollment(id: string): Promise<Enrollment> {
  return reapFetch<Enrollment>("GET", `/agentic/enrollments/${id}`);
}