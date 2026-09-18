// Unit-checks src/http/log.ts redaction. Run: npx ts-node scripts/test-redaction.ts
// No server or DB needed.
import { redact, summarizeCause } from "../src/http/log";

let fails = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`PASS  ${label}`);
  else {
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    fails++;
  }
}
function scrubs(label: string, input: string, secret: string) {
  const out = redact(input);
  check(label, !out.includes(secret), `still present in: ${out}`);
}

scrubs("connection string", "connect ECONNREFUSED postgresql://lwc:hunter2@db.internal:5432/lwc_data", "hunter2");
scrubs("password= in text", 'failed with password=s3cr3tvalue trailing', "s3cr3tvalue");
scrubs("bearer token", "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def", "eyJhbGciOiJIUzI1NiJ9.abc.def");
scrubs("aws access key", "InvalidAccessKeyId: AKIAIOSFODNN7EXAMPLE is not valid", "AKIAIOSFODNN7EXAMPLE");
scrubs("presigned signature", "GET https://b.s3.amazonaws.com/k?X-Amz-Signature=deadbeefcafe&x=1", "deadbeefcafe");
scrubs("api key", "request failed: api_key=abcd1234efgh", "abcd1234efgh");

// Non-secret text must survive untouched.
check("leaves ordinary text alone", redact("Unique constraint failed on the fields: (`email`)") === "Unique constraint failed on the fields: (`email`)");

// Cause chain: depth cap, truncation, Prisma code surfacing.
const inner: Error & { code?: string } = new Error("x".repeat(500));
inner.name = "PrismaClientKnownRequestError";
inner.code = "P2002";
const mid = new Error("middle layer") as Error & { cause?: unknown };
mid.cause = inner;
const outer = new Error("outer layer") as Error & { cause?: unknown };
outer.cause = mid;

const chain = summarizeCause(outer);
check("walks the cause chain", chain.length === 3, `got ${chain.length}`);
check("surfaces the prisma code", chain[2]?.code === "P2002", JSON.stringify(chain[2]?.code));
check("truncates long messages", (chain[2]?.message.length ?? 0) <= 301, `len ${chain[2]?.message.length}`);
check("respects the depth cap", summarizeCause(outer, 2).length === 2);
check("handles a missing cause", summarizeCause(undefined).length === 0);
check("handles a non-Error cause", summarizeCause("plain string")[0]?.name === "string");

console.log();
if (fails === 0) console.log("All checks passed.");
else {
  console.log(`${fails} check(s) failed.`);
  process.exit(1);
}
