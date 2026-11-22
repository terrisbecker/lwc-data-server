/**
 * Contract drift check: keeps openapi.yaml and the code in step.
 *
 *   npm run contract:check                                   # static checks only
 *   BASE_URL=http://localhost:3001 npm run contract:check    # + live checks
 *   BASE_URL=… CONTRACT_EMAIL=… CONTRACT_PASSWORD=… npm run contract:check
 *
 * Static checks (no server): every Express route is in the spec and vice versa,
 * requireRole matches x-required-role, every /api and /auth route runs `validate`,
 * the ErrorCode enum matches src/http/error.codes.ts, info.version matches
 * package.json, and src/types/openapi.d.ts is up to date.
 *
 * Live checks are read-only (GETs, plus a login when credentials are given), so
 * they are safe to run against production. They use about 15 of the 100
 * requests/15 min /api budget and 1-2 of the 10/15 min /auth budget.
 */
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import { ErrorCodes } from "../src/http/error.codes";

const ROOT = path.resolve(__dirname, "..");
const SPEC_FILE = path.join(ROOT, "openapi.yaml");
const TYPES_FILE = path.join(ROOT, "src/types/openapi.d.ts");
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const spec: Json = parse(readFileSync(SPEC_FILE, "utf8"));
const results: Array<{ ok: boolean; check: string; detail?: string }> = [];

function record(ok: boolean, check: string, detail?: string): void {
  results.push({ ok, check, detail });
}

// ---------------------------------------------------------------- static checks

interface CodeRoute {
  key: string; // "post /api/pmn/combined-field-data/{id}"
  role?: string;
  validated: boolean;
  file: string;
}

function toOpenApiPath(p: string): string {
  return p.replace(/:(\w+)/g, "{$1}");
}

function join(prefix: string, p: string): string {
  if (p === "/" && prefix) return prefix;
  return `${prefix}${p}`;
}

/** Reads mounts from src/index.ts and routes from every src/**\/*.routes.ts. */
function codeRoutes(): CodeRoute[] {
  const index = readFileSync(path.join(ROOT, "src/index.ts"), "utf8");
  const routes: CodeRoute[] = [];

  // app.get("/health", …) — routes registered on the app itself.
  for (const m of index.matchAll(/app\.(get|post|put|patch|delete)\("([^"]+)"/g)) {
    routes.push({ key: `${m[1]} ${m[2]}`, validated: false, file: "src/index.ts" });
  }

  // app.use("/api/pmn", pmnRouter) and app.use(openapiRouter).
  const prefixes = new Map<string, string>();
  for (const m of index.matchAll(/app\.use\(\s*(?:"([^"]+)"\s*,)?[^;]*?\b(\w+Router)\s*\)/g)) {
    prefixes.set(m[2]!, m[1] ?? "");
  }

  const files = readdirSync(path.join(ROOT, "src"), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".routes.ts"))
    .map((f) => path.join("src", f));

  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    for (const m of source.matchAll(/\b(\w+Router)\.(get|post|put|patch|delete)\("([^"]*)"([^;]*)\);/g)) {
      const [, router, method, routePath, rest] = m as unknown as string[];
      const prefix = prefixes.get(router!);
      if (prefix === undefined) {
        record(false, `route mounted: ${router}`, `${file} defines ${router} but src/index.ts never mounts it`);
        continue;
      }
      routes.push({
        key: `${method} ${toOpenApiPath(join(prefix, routePath!))}`,
        role: rest!.match(/requireRole\("(\w+)"\)/)?.[1],
        validated: /\bvalidate\b/.test(rest!),
        file,
      });
    }
  }
  return routes;
}

function specOperations(): Map<string, Json> {
  const ops = new Map<string, Json>();
  for (const [p, item] of Object.entries<Json>(spec.paths ?? {})) {
    for (const method of METHODS) {
      if (item[method]) ops.set(`${method} ${p}`, item[method]);
    }
  }
  return ops;
}

function checkRoutes(): void {
  const code = codeRoutes();
  const ops = specOperations();
  const codeKeys = new Set(code.map((r) => r.key));

  for (const route of code) {
    const op = ops.get(route.key);
    if (!op) {
      record(false, `documented: ${route.key}`, `in ${route.file} but not in openapi.yaml`);
      continue;
    }
    const specRole = op["x-required-role"];
    record(
      specRole === route.role,
      `role: ${route.key}`,
      specRole === route.role ? undefined : `code requires ${route.role ?? "none"}, spec says ${specRole ?? "none"}`,
    );
    if (/^\w+ \/(api|auth)\//.test(route.key)) {
      record(route.validated, `validated: ${route.key}`, route.validated ? undefined : `add \`validate\` in ${route.file}`);
    }
  }
  for (const key of ops.keys()) {
    if (!codeKeys.has(key)) record(false, `implemented: ${key}`, "in openapi.yaml but no matching route in the code");
  }
  record(true, `routes compared: ${code.length} in code, ${ops.size} in spec`);
}

function checkErrorCodes(): void {
  const inSpec = new Set<string>(spec.components?.schemas?.ErrorCode?.enum ?? []);
  const inCode = new Set<string>(Object.values(ErrorCodes));
  const missing = [...inCode].filter((c) => !inSpec.has(c));
  const extra = [...inSpec].filter((c) => !inCode.has(c));
  record(
    missing.length === 0 && extra.length === 0,
    "ErrorCode enum matches src/http/error.codes.ts",
    [missing.length ? `missing from spec: ${missing.join(", ")}` : "", extra.length ? `not in code: ${extra.join(", ")}` : ""]
      .filter(Boolean)
      .join("; ") || undefined,
  );
}

function checkVersion(): void {
  const { version } = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const specVersion = spec.info?.version;
  record(specVersion === version, "info.version matches package.json", specVersion === version ? undefined : `spec ${specVersion}, package.json ${version}`);
}

function checkTypes(): void {
  const dir = mkdtempSync(path.join(tmpdir(), "contract-check-"));
  try {
    const out = path.join(dir, "openapi.d.ts");
    execFileSync(path.join(ROOT, "node_modules/.bin/openapi-typescript"), [SPEC_FILE, "-o", out], {
      cwd: ROOT,
      stdio: "pipe",
    });
    const fresh = readFileSync(out, "utf8") === readFileSync(TYPES_FILE, "utf8");
    record(fresh, "src/types/openapi.d.ts is up to date", fresh ? undefined : "run `npm run openapi:types` and commit");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ live checks

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
// The whole document is registered once so every "#/components/…" ref resolves
// against it; individual schemas are then compiled by JSON pointer.
ajv.addSchema(spec, "spec");

const pointer = (...parts: string[]) => parts.map((p) => p.replace(/~/g, "~0").replace(/\//g, "~1")).join("/");

/** Resolves a response (following a components/responses $ref) to a JSON-schema pointer. */
function responseSchemaRef(opPath: string, method: string, status: number): string | null | undefined {
  const responses = spec.paths?.[opPath]?.[method]?.responses;
  if (!responses) return undefined;
  let base = pointer("paths", opPath, method, "responses", String(status));
  let response = responses[String(status)];
  if (!response) return undefined;
  if (response.$ref) {
    base = response.$ref.replace(/^#\//, "");
    response = base.split("/").reduce((node: Json, key: string) => node?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], spec);
  }
  if (!response?.content?.["application/json"]?.schema) return null; // documented, no JSON body
  return `spec#/${base}/${pointer("content", "application/json", "schema")}`;
}

interface Probe {
  name: string;
  path: string;
  /** Spec operation to check against; omit for undocumented paths (error envelope only). */
  op?: { path: string; method: string };
  init?: RequestInit;
  expectStatus: number | number[];
  expectCode?: string;
  /** Asserts the error body carries no `details` (the deliberately vague 404). */
  noDetails?: boolean;
}

async function runProbe(baseUrl: string, probe: Probe): Promise<Json> {
  const label = `live: ${probe.name}`;
  let res: Response;
  try {
    res = await fetch(new URL(probe.path, baseUrl), probe.init);
  } catch (err) {
    record(false, label, `request failed: ${(err as Error).message}`);
    return undefined;
  }
  const problems: string[] = [];
  const expected = ([] as number[]).concat(probe.expectStatus);
  if (!expected.includes(res.status)) problems.push(`status ${res.status}, expected ${expected.join("|")}`);
  if (!res.headers.get("x-request-id")) problems.push("no X-Request-Id header");

  const text = await res.text();
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  const body = isJson && text ? JSON.parse(text) : undefined;

  if (probe.op) {
    const ref = responseSchemaRef(probe.op.path, probe.op.method, res.status);
    if (ref === undefined) problems.push(`status ${res.status} is not documented for ${probe.op.method} ${probe.op.path}`);
    else if (ref && isJson) {
      const valid = ajv.validate({ $ref: ref }, body);
      if (!valid) problems.push(`body: ${ajv.errorsText(ajv.errors, { separator: "; " })}`);
    }
  } else if (isJson && !ajv.validate({ $ref: "spec#/components/schemas/ErrorEnvelope" }, body)) {
    problems.push(`body: ${ajv.errorsText(ajv.errors, { separator: "; " })}`);
  }
  if (probe.expectCode && body?.error?.code !== probe.expectCode) {
    problems.push(`code ${body?.error?.code ?? "none"}, expected ${probe.expectCode}`);
  }
  if (probe.noDetails && body?.error && "details" in body.error) problems.push("error.details must be absent");

  record(problems.length === 0, label, problems.join("; ") || undefined);
  return body;
}

async function checkLive(baseUrl: string): Promise<void> {
  const json = { "Content-Type": "application/json" };
  const probes: Probe[] = [
    { name: "GET /", path: "/", op: { path: "/", method: "get" }, init: { headers: { Accept: "text/plain" } }, expectStatus: 200 },
    { name: "GET /health", path: "/health", op: { path: "/health", method: "get" }, expectStatus: 200 },
    { name: "GET /openapi.yaml", path: "/openapi.yaml", op: { path: "/openapi.yaml", method: "get" }, expectStatus: 200 },
    { name: "GET /docs", path: "/docs", op: { path: "/docs", method: "get" }, expectStatus: 200 },
    { name: "list PMN", path: "/api/pmn/combined-field-data", op: { path: "/api/pmn/combined-field-data", method: "get" }, expectStatus: 200 },
    { name: "list PMN ?hasScum=true", path: "/api/pmn/combined-field-data?hasScum=true", op: { path: "/api/pmn/combined-field-data", method: "get" }, expectStatus: 200 },
    { name: "list PMN ?hasScum=maybe → 400", path: "/api/pmn/combined-field-data?hasScum=maybe", op: { path: "/api/pmn/combined-field-data", method: "get" }, expectStatus: 400, expectCode: "INVALID_FIELD" },
    { name: "list phosphate", path: "/api/phosphate-data", op: { path: "/api/phosphate-data", method: "get" }, expectStatus: 200 },
    { name: "bad token → 401", path: "/api/phosphate-data", op: { path: "/api/phosphate-data", method: "get" }, init: { headers: { Authorization: "Bearer not-a-jwt" } }, expectStatus: 401, expectCode: "TOKEN_INVALID" },
    { name: "scum photo bad id → 400", path: "/api/pmn/scum-photos/not-a-uuid/url", op: { path: "/api/pmn/scum-photos/{uploadId}/url", method: "get" }, expectStatus: 400, expectCode: "INVALID_ID" },
    { name: "scum photo unknown id → vague 404", path: `/api/pmn/scum-photos/${randomUUID()}/url`, op: { path: "/api/pmn/scum-photos/{uploadId}/url", method: "get" }, expectStatus: 404, expectCode: "PMN_SCUM_PHOTO_NOT_FOUND", noDetails: true },
    { name: "uploads without token → 401", path: "/api/uploads", op: { path: "/api/uploads", method: "get" }, expectStatus: 401, expectCode: "UNAUTHORIZED" },
    { name: "unknown route → 404", path: "/api/no-such-route", expectStatus: 404, expectCode: "ROUTE_NOT_FOUND" },
    { name: "login malformed JSON → 400", path: "/auth/login", op: { path: "/auth/login", method: "post" }, init: { method: "POST", headers: json, body: "{not json" }, expectStatus: 400, expectCode: "MALFORMED_JSON" },
  ];
  for (const probe of probes) await runProbe(baseUrl, probe);

  const email = process.env.CONTRACT_EMAIL;
  const password = process.env.CONTRACT_PASSWORD;
  if (!email || !password) {
    record(true, "live: authenticated GETs skipped (set CONTRACT_EMAIL and CONTRACT_PASSWORD)");
    return;
  }
  const login = await runProbe(baseUrl, {
    name: "login",
    path: "/auth/login",
    op: { path: "/auth/login", method: "post" },
    init: { method: "POST", headers: json, body: JSON.stringify({ email, password }) },
    expectStatus: 200,
  });
  const token: string | undefined = login?.data?.token;
  if (!token) return;
  const roles: string[] = login.data.user?.roles ?? [];
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  await runProbe(baseUrl, { name: "list own uploads", path: "/api/uploads", op: { path: "/api/uploads", method: "get" }, init: auth, expectStatus: 200 });
  await runProbe(baseUrl, {
    name: `list users as ${roles.join(",") || "no role"}`,
    path: "/api/users",
    op: { path: "/api/users", method: "get" },
    init: auth,
    expectStatus: roles.includes("admin") ? 200 : 403,
  });
}

// ------------------------------------------------------------------------ main

async function main(): Promise<void> {
  checkRoutes();
  checkErrorCodes();
  checkVersion();
  checkTypes();

  const baseUrl = process.env.BASE_URL;
  if (baseUrl) await checkLive(baseUrl);
  else record(true, "live checks skipped (set BASE_URL)");

  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check}${r.detail ? `\n      ${r.detail}` : ""}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
