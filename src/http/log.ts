import type { ErrorCode } from "./error.codes";

export interface LogContext {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
  status: number;
  code: ErrorCode;
}

const MAX_CAUSE_DEPTH = 3;
const MAX_MESSAGE_CHARS = 300;

/**
 * Scrub secrets that routinely appear inside driver and SDK error text before it
 * reaches the log. This is defence in depth — none of this output is ever sent to
 * a client — but logs get shipped, grepped and pasted into tickets.
 */
const REDACTIONS: Array<[RegExp, string]> = [
  [/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]"],
  // Bearer must run before the generic key=value rule below: that rule would
  // otherwise consume the literal "Bearer" as the value and leave the token.
  [/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]"],
  [/\b(password|pwd|secret|token|authorization|apikey|api_key)\b\s*[=:]\s*\S+/gi, "$1=[redacted]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted-aws-key]"],
  [/X-Amz-Signature=[^&\s"']+/gi, "X-Amz-Signature=[redacted]"],
  [/X-Amz-Credential=[^&\s"']+/gi, "X-Amz-Credential=[redacted]"],
];

export function redact(text: string): string {
  return REDACTIONS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

function truncate(text: string): string {
  return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}…` : text;
}

interface CauseSummary {
  name: string;
  code?: string;
  message: string;
}

/**
 * Walk the `.cause` chain, emitting a redacted, truncated summary per link.
 *
 * Prisma's `PrismaClientKnownRequestError` carries the useful part (`P2002`,
 * `P2025`, …) in `code`, so that is surfaced directly. The full error object is
 * never logged — it can hold the connection string and the raw query.
 */
export function summarizeCause(err: unknown, depth = MAX_CAUSE_DEPTH): CauseSummary[] {
  const chain: CauseSummary[] = [];
  let current: unknown = err;

  while (current !== undefined && current !== null && chain.length < depth) {
    if (current instanceof Error) {
      const code = (current as { code?: unknown }).code;
      const summary: CauseSummary = {
        name: current.name,
        message: truncate(redact(current.message)),
      };
      if (typeof code === "string") summary.code = code;
      chain.push(summary);
      current = (current as { cause?: unknown }).cause;
    } else {
      chain.push({ name: typeof current, message: truncate(redact(String(current))) });
      break;
    }
  }

  return chain;
}

/**
 * One structured JSON line per failed request, keyed by requestId so a client's
 * thin 500 body can be traced to the full server-side detail.
 */
export function logError(ctx: LogContext, err: unknown): void {
  const entry: Record<string, unknown> = {
    level: "error",
    ...ctx,
    name: err instanceof Error ? err.name : typeof err,
    message: err instanceof Error ? redact(err.message) : redact(String(err)),
  };

  if (err instanceof Error && err.stack) entry.stack = err.stack;

  const cause = summarizeCause((err as { cause?: unknown })?.cause);
  if (cause.length > 0) entry.cause = cause;

  console.error(JSON.stringify(entry));
}
