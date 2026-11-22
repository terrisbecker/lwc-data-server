import type { Request, Response } from "express";
import { LOGO_ASCII, LOGO_SVG } from "./logo";
import { version } from "../../package.json";
import { SPEC_SERVER_URL } from "../openapi/spec";
import { API_RATE_LIMIT } from "../middleware/rate.limit";

/**
 * GET / — a plain front page for people who open the API root in a browser or
 * curl it from a terminal. Like /health it is public, unauthenticated, not rate
 * limited, and deliberately outside the JSON envelope.
 *
 * Terminals get the ASCII logo; browsers get the real SVG logo with clickable
 * links. Content is fully static (no request data is reflected), so the HTML
 * variant needs no escaping beyond the hand-written markup below.
 */

const BASE = SPEC_SERVER_URL;
const REPO = "https://github.com/terrisbecker/lwc-data-server";

const HEADING = "L A C A M A S   W A T E R S H E D   C O U N C I L";

/**
 * "~~~ Data API v1.1.0 ~~~", tilde-padded to the heading's width so the two lines
 * stay aligned whatever the version string's length. The version is read from
 * package.json so it can't drift.
 */
function rule(label: string, width: number): string {
  const text = ` ${label} `;
  const left = Math.floor((width - text.length) / 2);
  return `${"~".repeat(left)}${text}${"~".repeat(width - text.length - left)}`;
}

const TITLE = [HEADING, rule(`Data API v${version}`, HEADING.length)];

/** "15 minutes", or seconds when the window isn't a whole number of minutes. */
function windowLabel(ms: number): string {
  const unit = ms % 60_000 === 0 ? { n: ms / 60_000, word: "minute" } : { n: ms / 1000, word: "second" };
  return `${unit.n} ${unit.word}${unit.n === 1 ? "" : "s"}`;
}

const EXAMPLES = [
  `curl ${BASE}/api/pmn/combined-field-data`,
  `curl ${BASE}/api/pmn/combined-field-data?hasScum=true`,
  `curl ${BASE}/api/phosphate-data`,
];

const LINKS: Array<[label: string, url: string]> = [
  ["Docs", `${BASE}/docs`],
  ["Source", REPO],
  ["Issues", `${REPO}/issues`],
];

const link = (url: string) => `<a href="${url}">${url}</a>`;

/** Body below the title; `withLinks` wraps every URL in an anchor for the HTML page. */
function body(withLinks: boolean): string {
  const wrap = withLinks ? link : (url: string) => url;
  return [
    "Reading data is free. No account or API key is required.",
    `Request rates are limited to ${API_RATE_LIMIT.max} per ${windowLabel(API_RATE_LIMIT.windowMs)} per IP address.`,
    "",
    " Examples:",
    ...EXAMPLES.map((cmd) => {
      const url = cmd.match(/https:\/\/[^"\s]+/)![0];
      return `   $ ${cmd.replace(url, wrap(url))}`;
    }),
    "",
    " Links:",
    ...LINKS.map(([label, url]) => `   ${label.padEnd(7)} ${wrap(url)}`),
    "",
  ].join("\n");
}

const TEXT = `\n${LOGO_ASCII}\n\n${TITLE.map((l) => `   ${l}`).join("\n")}\n\n${body(false)}`;

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LWC Data API</title>
<style>
  body { margin: 0; padding: 24px 16px; background: #0f1a1c; color: #cfe8e4; }
  main { max-width: 52rem; margin: 0 auto; }
  svg { display: block; width: 180px; height: auto; margin: 0 auto 16px; }
  pre { width: fit-content; max-width: 100%; margin: 0 auto; font: 14px/1.4 ui-monospace, Menlo, Consolas, monospace; overflow-x: auto; }
  pre.title { margin-bottom: 1.4em; text-align: center; }
  a { color: #7fd1c4; }
</style>
</head>
<body><main>
${LOGO_SVG}
<pre class="title">${TITLE.join("\n")}</pre>
<pre>${body(true)}</pre>
</main></body>
</html>
`;

export function home(_req: Request, res: Response): void {
  res.format({
    "text/plain": () => res.send(TEXT),
    "text/html": () => res.send(HTML),
    default: () => res.type("text/plain").send(TEXT),
  });
}
