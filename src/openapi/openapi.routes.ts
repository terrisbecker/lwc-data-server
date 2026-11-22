import { Router, type Request, type Response } from "express";
import helmet from "helmet";
import { SPEC_TEXT } from "./spec";

export const openapiRouter = Router();

// Pinned exact version plus SRI, so a compromised or republished CDN file can't run
// on this origin. To upgrade: bump the version and recompute the hash with
//   curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A
const REDOC_URL = "https://cdn.jsdelivr.net/npm/redoc@2.5.4/bundles/redoc.standalone.js";
const REDOC_SRI = "sha384-w447zOpYfw/1Tv/5AK9NfHTlQIqE3RVR6KY62jCyy9zNDgO64cMwGGP1Fj0zJVf5";

const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LWC Data API docs</title>
<style>body { margin: 0; }</style>
</head>
<body>
<redoc spec-url="/openapi.yaml"></redoc>
<script src="${REDOC_URL}" integrity="${REDOC_SRI}" crossorigin="anonymous"></script>
</body>
</html>
`;

// Redoc needs the CDN script, a blob: worker for search, inline styles and Google
// Fonts. This policy replaces the global helmet() CSP header on /docs only.
const docsCsp = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
    workerSrc: ["'self'", "blob:"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'self'"],
    // Would rewrite the /openapi.yaml fetch to https on a plain-http local server.
    // Production is already https behind nginx, so nothing is lost there.
    upgradeInsecureRequests: null,
  },
});

openapiRouter.get("/openapi.yaml", (_req: Request, res: Response) => {
  res.type("application/yaml").send(SPEC_TEXT);
});

openapiRouter.get("/docs", docsCsp, (_req: Request, res: Response) => {
  res.type("html").send(DOCS_HTML);
});
