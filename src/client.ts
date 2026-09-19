import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChoiceQuestion, Entry, SystemOneResponse } from "./types.ts";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const CACHE_DIR = join(process.cwd(), ".cache");

/** Read the key from TYPESAFE_API_KEY, or from the file TYPESAFE_API_KEY_FILE points at. */
export function apiKey(): string {
  const direct = process.env.TYPESAFE_API_KEY?.trim();
  if (direct) return direct;

  const path = process.env.TYPESAFE_API_KEY_FILE?.trim();
  if (path && existsSync(path)) {
    const line = readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("#"));
    if (line) return line;
  }
  throw new Error("missing TypeSafe API key -- set TYPESAFE_API_KEY or TYPESAFE_API_KEY_FILE (see .env.example)");
}

export const defaultModel = (): string => process.env.JEV_MODEL?.trim() || "jev-latest";

export const usage = { requests: 0, cached: 0, inputTokens: 0, outputTokens: 0, models: new Set<string>() };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 6;

/**
 * Send one state plus a map of Choice questions.
 *
 * Cached on disk by request hash. Jev is exactly deterministic, so a cache hit
 * is not an approximation of the answer, it is the answer -- re-running the
 * collector costs nothing and returns identical numbers.
 */
export async function ask(
  state: Entry,
  questions: Record<string, ChoiceQuestion>,
): Promise<SystemOneResponse> {
  const body = { state, model: defaultModel(), questions };
  const key = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const file = join(CACHE_DIR, key + ".json");

  if (existsSync(file)) {
    usage.cached++;
    const hit = JSON.parse(readFileSync(file, "utf8")).response as SystemOneResponse;
    if (hit.model) usage.models.add(hit.model);
    return hit;
  }

  const response = await request(body);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify({ request: body, response }));
  return response;
}

async function request(body: unknown, attempt = 0): Promise<SystemOneResponse> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(500 * 2 ** attempt + Math.random() * 500);
      return request(body, attempt + 1);
    }
    throw error;
  }

  if (res.status === 429 || res.status === 529 || res.status >= 500) {
    if (attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get("retry-after") ?? 0);
      await sleep((retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** attempt) + Math.random() * 200);
      return request(body, attempt + 1);
    }
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`TypeSafe ${res.status}: ${text.slice(0, 500)}`);

  const parsed = JSON.parse(text) as SystemOneResponse;
  if (parsed.model) usage.models.add(parsed.model);
  usage.requests++;
  usage.inputTokens += parsed.usage?.input_tokens ?? 0;
  usage.outputTokens += parsed.usage?.output_tokens ?? 0;
  return parsed;
}
