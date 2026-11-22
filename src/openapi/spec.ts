import { readFileSync } from "fs";
import path from "path";

/**
 * The OpenAPI contract at the repo root. Resolved from the working directory, the
 * same convention dotenv uses for `.env`: nodemon runs from the repo root and PM2
 * sets `cwd: __dirname` in ecosystem.config.js.
 */
export const SPEC_PATH = path.join(process.cwd(), "openapi.yaml");

/**
 * Read once at startup. A missing spec throws here, at boot, rather than on the
 * first request (fail-closed, like the JWT_SECRET check).
 */
export const SPEC_TEXT = readFileSync(SPEC_PATH, "utf8");

/**
 * The first `servers[].url` — the public base URL. Pulled out with a regex because
 * no YAML parser is a runtime dependency (devDependencies are pruned in prod).
 * Fails at boot, like SPEC_TEXT, if the spec stops declaring one.
 */
const serverUrl = /^servers:\s*\n\s*-\s*url:\s*(\S+)/m.exec(SPEC_TEXT)?.[1];
if (!serverUrl) {
  throw new Error(`No servers[0].url found in ${SPEC_PATH}.`);
}
export const SPEC_SERVER_URL: string = serverUrl;
