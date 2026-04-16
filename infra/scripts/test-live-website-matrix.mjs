import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const composeArgs = [
  "compose",
  "--env-file",
  ".env.dev",
  "-f",
  "infra/docker/compose.yml",
  "-f",
  "infra/docker/compose.dev.yml",
];

const LIVE_GROUP_VARIANTS = {
  baseline: [
    {
      key: "static_editorial",
      label: "Static editorial newsroom",
      browserValidation: "never",
      sites: [
        {
          candidateName: "European Commission Digital Strategy News",
          fetchUrl: "https://digital-strategy.ec.europa.eu/en/news",
          collectionSeedUrls: ["https://digital-strategy.ec.europa.eu/en/news"],
          allowedUrlPatterns: ["/en/news", "/press-", "/news/"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/en/news/.+"],
        },
        {
          candidateName: "EEA Newsroom",
          fetchUrl: "https://www.eea.europa.eu/en/newsroom/news",
          collectionSeedUrls: ["https://www.eea.europa.eu/en/newsroom"],
          allowedUrlPatterns: ["/newsroom/", "/news/"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "EUAA Press Releases",
          fetchUrl: "https://www.euaa.europa.eu/news-events/press-releases",
          collectionSeedUrls: ["https://www.euaa.europa.eu/news-events"],
          allowedUrlPatterns: ["/news-events/", "/press-releases", "/news/"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/press-releases/.+"],
        },
        {
          candidateName: "Competition Policy Latest News",
          fetchUrl: "https://competition-policy.ec.europa.eu/state-aid/latest-news_en",
          collectionSeedUrls: ["https://competition-policy.ec.europa.eu/state-aid/latest-news_en"],
          allowedUrlPatterns: ["/latest-news", "/press-release", "/state-aid/"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/latest-news.+"],
        },
      ],
    },
    {
      key: "documents_downloads",
      label: "Documents and download-heavy portal",
      browserValidation: "never",
      sites: [
        {
          candidateName: "EBRD Procurement Notices",
          fetchUrl: "https://www.ebrd.com/home/work-with-us/project-procurement/procurement-notices.html",
          collectionSeedUrls: [
            "https://www.ebrd.com/work-with-us/project-procurement/procurement-notices.html",
          ],
          allowedUrlPatterns: ["/procurement/", "/notices", "/project-procurement", "/document"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/newsroom"],
        },
        {
          candidateName: "EIB Project Procurement",
          fetchUrl: "https://www.eib.org/en/about/procurement/project-procurement",
          collectionSeedUrls: ["https://www.eib.org/en/about/procurement"],
          allowedUrlPatterns: ["/procurement", "/project-procurement", "/files/"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "World Bank Project Procurement",
          fetchUrl: "https://www.worldbank.org/procurement",
          collectionSeedUrls: [
            "https://projects.worldbank.org/en/projects-operations/opportunities",
            "https://www.worldbank.org/en/programs/project-procurement",
          ],
          allowedUrlPatterns: [
            "/procurement",
            "/opportunities",
            "/projects-operations",
            "/document",
          ],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "UNICEF Tajikistan Supply and Procurement",
          fetchUrl: "https://www.unicef.org/tajikistan/supply-and-procurement",
          collectionSeedUrls: ["https://www.unicef.org/tajikistan/supply-and-procurement"],
          allowedUrlPatterns: ["/supply-and-procurement", "/documents/", "/procurement", "/tender"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
      ],
    },
    {
      key: "public_changelog",
      label: "Public changelog and release-notes surface",
      browserValidation: "conditional",
      sites: [
        {
          candidateName: "WorkOS Changelog",
          fetchUrl: "https://workos.com/changelog",
          collectionSeedUrls: ["https://workos.com/changelog"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "Auth0 Changelog",
          fetchUrl: "https://auth0.com/changelog",
          collectionSeedUrls: ["https://auth0.com/changelog"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "Raycast Windows Changelog",
          fetchUrl: "https://www.raycast.com/changelog/windows",
          collectionSeedUrls: ["https://www.raycast.com/changelog/windows"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "Resend Changelog",
          fetchUrl: "https://resend.com/changelog",
          collectionSeedUrls: ["https://resend.com/changelog"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
      ],
    },
    {
      key: "browser_candidate",
      label: "Browser-assisted public website candidate",
      browserValidation: "required",
      sites: [
        {
          candidateName: "Grafbase Changelog",
          fetchUrl: "https://grafbase.com/changelog",
          collectionSeedUrls: ["https://grafbase.com/changelog"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedListingUrlPatterns: ["/changelog$"],
          curatedEditorialUrlPatterns: ["/changelog/.+"],
        },
        {
          candidateName: "Browserbase Changelog",
          fetchUrl: "https://www.browserbase.com/changelog",
          collectionSeedUrls: ["https://www.browserbase.com/changelog"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "Sentry Changelog",
          fetchUrl: "https://sentry.io/changelog/",
          collectionSeedUrls: ["https://sentry.io/changelog/"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "Intercom Changes",
          fetchUrl: "https://www.intercom.com/changes",
          collectionSeedUrls: ["https://www.intercom.com/changes"],
          allowedUrlPatterns: ["/changes"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
      ],
    },
  ],
  alt_2026_04_16: [
    {
      key: "static_editorial",
      label: "Static editorial newsroom",
      browserValidation: "never",
      sites: [
        {
          candidateName: "National Archives Press Releases",
          fetchUrl: "https://www.archives.gov/press/press-releases",
          collectionSeedUrls: ["https://www.archives.gov/press/press-releases"],
          allowedUrlPatterns: ["/press/press-releases", "/press-releases/"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/press/press-releases/.+"],
        },
        {
          candidateName: "DOJ Press Releases",
          fetchUrl: "https://www.justice.gov/news/press-releases",
          collectionSeedUrls: ["https://www.justice.gov/news/press-releases"],
          allowedUrlPatterns: ["/news/press-releases", "/press-releases"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/news/press-releases/.+"],
        },
        {
          candidateName: "ESA Newsroom",
          fetchUrl: "https://www.esa.int/Newsroom",
          collectionSeedUrls: ["https://www.esa.int/Newsroom"],
          allowedUrlPatterns: ["/Newsroom", "/Press_Releases", "/News_Archive"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "IMF News",
          fetchUrl: "https://www.imf.org/en/news",
          collectionSeedUrls: ["https://www.imf.org/en/news"],
          allowedUrlPatterns: ["/en/news", "/en/News/Articles/"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/en/News/Articles/.+"],
        },
      ],
    },
    {
      key: "documents_downloads",
      label: "Documents and download-heavy portal",
      browserValidation: "never",
      sites: [
        {
          candidateName: "ECB Tenders",
          fetchUrl: "https://www.ecb.europa.eu/ecb/jobsproc/tenders/html/index.en.html",
          collectionSeedUrls: ["https://www.ecb.europa.eu/ecb/jobsproc/tenders/html/index.en.html"],
          allowedUrlPatterns: ["/jobsproc", "/tenders", "\\.pdf$", "/procurement"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedDocumentUrlPatterns: ["\\.pdf$", "/pdf/"],
        },
        {
          candidateName: "EASA Procurement",
          fetchUrl: "https://www.easa.europa.eu/en/the-agency/procurement",
          collectionSeedUrls: ["https://www.easa.europa.eu/en/the-agency/procurement"],
          allowedUrlPatterns: ["/procurement", "/document-library", "/sites/default/files", "\\.pdf$"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedDocumentUrlPatterns: ["\\.pdf$", "/sites/default/files/"],
        },
        {
          candidateName: "EMSA Procurement",
          fetchUrl: "https://www.emsa.europa.eu/procurement.html",
          collectionSeedUrls: ["https://www.emsa.europa.eu/procurement.html"],
          allowedUrlPatterns: ["/procurement", "/tender", "/attachments", "\\.pdf$"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedDocumentUrlPatterns: ["\\.pdf$", "/attachments/"],
        },
        {
          candidateName: "EUROCONTROL Procurement",
          fetchUrl: "https://www.eurocontrol.int/procurement",
          collectionSeedUrls: ["https://www.eurocontrol.int/procurement"],
          allowedUrlPatterns: ["/procurement", "/call", "/tender", "\\.pdf$"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedDocumentUrlPatterns: ["\\.pdf$"],
        },
      ],
    },
    {
      key: "public_changelog",
      label: "Public changelog and release-notes surface",
      browserValidation: "conditional",
      sites: [
        {
          candidateName: "Supabase Changelog",
          fetchUrl: "https://supabase.com/changelog",
          collectionSeedUrls: ["https://supabase.com/changelog"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "Vercel Changelog",
          fetchUrl: "https://vercel.com/changelog",
          collectionSeedUrls: ["https://vercel.com/changelog"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "PlanetScale Changelog",
          fetchUrl: "https://planetscale.com/changelog",
          collectionSeedUrls: ["https://planetscale.com/changelog"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
        {
          candidateName: "Render Changelog",
          fetchUrl: "https://render.com/changelog",
          collectionSeedUrls: ["https://render.com/changelog"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
      ],
    },
    {
      key: "browser_candidate",
      label: "Browser-assisted public website candidate",
      browserValidation: "required",
      sites: [
        {
          candidateName: "Linear Changelog",
          fetchUrl: "https://linear.app/changelog",
          collectionSeedUrls: ["https://linear.app/changelog"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedListingUrlPatterns: ["/changelog$"],
          curatedEditorialUrlPatterns: ["/changelog/.+"],
        },
        {
          candidateName: "Framer Updates",
          fetchUrl: "https://www.framer.com/updates",
          collectionSeedUrls: ["https://www.framer.com/updates"],
          allowedUrlPatterns: ["/updates"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedListingUrlPatterns: ["/updates$"],
          curatedEditorialUrlPatterns: ["/updates/.+"],
        },
        {
          candidateName: "Webflow Updates",
          fetchUrl: "https://webflow.com/updates",
          collectionSeedUrls: ["https://webflow.com/updates"],
          allowedUrlPatterns: ["/updates"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedListingUrlPatterns: ["/updates$"],
          curatedEditorialUrlPatterns: ["/updates/.+"],
        },
        {
          candidateName: "ClickUp Changelog",
          fetchUrl: "https://clickup.canny.io/changelog",
          collectionSeedUrls: ["https://clickup.canny.io/changelog"],
          allowedUrlPatterns: ["/changelog"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
        },
      ],
    },
  ],
  doj_analogs_2026_04_16: [
    {
      key: "static_editorial",
      label: "DOJ-like government press-release cohort",
      browserValidation: "never",
      sites: [
        {
          candidateName: "National Archives Press Releases",
          fetchUrl: "https://www.archives.gov/press/press-releases",
          collectionSeedUrls: ["https://www.archives.gov/press/press-releases"],
          allowedUrlPatterns: ["/press/press-releases", "/press-releases/"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/press/press-releases/.+"],
        },
        {
          candidateName: "FBI Press Releases",
          fetchUrl: "https://www.fbi.gov/news/press-releases",
          collectionSeedUrls: ["https://www.fbi.gov/news/press-releases"],
          allowedUrlPatterns: ["/news/press-releases", "/press-releases/"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/jobs"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/news/press-releases/.+"],
        },
        {
          candidateName: "DOL News Releases",
          fetchUrl: "https://www.dol.gov/newsroom/releases",
          collectionSeedUrls: ["https://www.dol.gov/newsroom/releases"],
          allowedUrlPatterns: ["/newsroom/releases", "/newsroom/releases/.+"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/newsroom/releases/.+"],
        },
        {
          candidateName: "Treasury Press Releases",
          fetchUrl: "https://home.treasury.gov/news/press-releases",
          collectionSeedUrls: ["https://home.treasury.gov/news/press-releases"],
          allowedUrlPatterns: ["/news/press-releases", "/news/press-releases/.+"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/news/press-releases/.+"],
        },
        {
          candidateName: "HHS Press Room",
          fetchUrl: "https://www.hhs.gov/press-room/index.html",
          collectionSeedUrls: ["https://www.hhs.gov/press-room/index.html"],
          allowedUrlPatterns: ["/press-room", "/press-room/.+"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/press-room/.+"],
        },
        {
          candidateName: "FTC Press Releases",
          fetchUrl: "https://www.ftc.gov/news-events/news/press-releases",
          collectionSeedUrls: ["https://www.ftc.gov/news-events/news/press-releases"],
          allowedUrlPatterns: ["/news-events/news/press-releases", "/news-events/news/press-releases/.+"],
          blockedUrlPatterns: ["/login", "/privacy", "/terms", "/contact", "/careers"],
          curatedPreferCollectionDiscovery: true,
          curatedEditorialUrlPatterns: ["/news-events/news/press-releases/.+"],
        },
      ],
    },
  ],
};

const WEBSITE_DEFAULTS = {
  language: "en",
  pollIntervalSeconds: 900,
  maxPollIntervalSeconds: 14400,
  requestTimeoutMs: 12000,
  totalPollTimeoutMs: 70000,
  maxResourcesPerPoll: 15,
  crawlDelayMs: 1000,
  sitemapDiscoveryEnabled: true,
  feedDiscoveryEnabled: true,
  collectionDiscoveryEnabled: true,
  downloadDiscoveryEnabled: true,
  browserFallbackEnabled: false,
};

function log(message) {
  console.log(`[live-website-matrix] ${message}`);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
    }
    const error = new Error(
      `Command failed (${command} ${args.join(" ")}): exit code ${result.status ?? "unknown"}`
    );
    error.command = command;
    error.args = args;
    error.stdout = result.stdout ?? "";
    error.stderr = result.stderr ?? "";
    throw error;
  }

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runCompose(...args) {
  return runCommand("docker", [...composeArgs, ...args]);
}

function parseCliArgs(argv) {
  const options = {
    variant: "baseline",
    groups: new Set(),
    sites: new Set(),
  };

  for (const arg of argv) {
    if (arg.startsWith("--variant=")) {
      const value = arg.slice("--variant=".length).trim();
      if (value) {
        options.variant = value;
      }
      continue;
    }
    if (arg.startsWith("--group=")) {
      const value = arg.slice("--group=".length).trim();
      if (value) {
        options.groups.add(value);
      }
      continue;
    }
    if (arg.startsWith("--site=")) {
      const value = arg.slice("--site=".length).trim().toLowerCase();
      if (value) {
        options.sites.add(value);
      }
      continue;
    }
    if (arg === "--help") {
      console.log(
        [
          "Usage: node infra/scripts/test-live-website-matrix.mjs [--variant=<variantKey>] [--group=<groupKey>] [--site=<candidateName>]",
          `  --variant selects the live-site matrix. Available: ${Object.keys(
            LIVE_GROUP_VARIANTS
          ).join(", ")}.`,
          "  --group can be repeated to limit the run to one or more live groups.",
          "  --site can be repeated to limit the run to one or more exact candidate names.",
        ].join("\n")
      );
      process.exit(0);
    }
  }

  return options;
}

function selectLiveGroups(variantKey, filters) {
  const variant = LIVE_GROUP_VARIANTS[variantKey];
  if (!variant) {
    throw new Error(
      `Unknown live matrix variant "${variantKey}". Available variants: ${Object.keys(
        LIVE_GROUP_VARIANTS
      ).join(", ")}.`
    );
  }

  return variant.map((group) => {
    if (filters.groups.size > 0 && !filters.groups.has(group.key)) {
      return null;
    }
    const sites =
      filters.sites.size > 0
        ? group.sites.filter((site) => filters.sites.has(site.candidateName.toLowerCase()))
        : group.sites;
    if (sites.length === 0) {
      return null;
    }
    return {
      ...group,
      sites,
    };
  }).filter(Boolean);
}

async function readEnvFile(relativePath) {
  const content = await readFile(path.join(repoRoot, relativePath), "utf8");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex < 0) {
          return [line, ""];
        }
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

function requireConfigured(env, key) {
  const value = String(env[key] ?? "").trim();
  if (!value || value === "replace-me") {
    throw new Error(`.env.dev must set ${key} before live website validation can run.`);
  }
  return value;
}

function readAllowlistEntries(env) {
  return String(env.ADMIN_ALLOWLIST_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function buildAdminAliasEmail(email, runId) {
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === email.length - 1) {
    return email;
  }
  return `${email.slice(0, atIndex)}+live-website-matrix-${runId}${email.slice(atIndex)}`;
}

function selectAdminEmail(allowlistEntries, runId) {
  const domainEntry = allowlistEntries.find((entry) => entry.startsWith("@"));
  if (domainEntry) {
    return `live-website-matrix-${runId}${domainEntry}`;
  }

  const explicitEmail = allowlistEntries[0];
  if (!explicitEmail) {
    throw new Error("ADMIN_ALLOWLIST_EMAILS must include at least one email or @domain entry.");
  }
  return buildAdminAliasEmail(explicitEmail, runId);
}

function extractCookie(setCookies) {
  const cookie = Array.isArray(setCookies) ? setCookies[0] : setCookies;
  if (!cookie) {
    throw new Error("Expected Set-Cookie header but none was returned.");
  }
  return cookie.split(";")[0];
}

function parseJsonResponse(text, responseMeta) {
  const json = text ? JSON.parse(text) : null;
  if (responseMeta.status < 200 || responseMeta.status >= 300) {
    const message =
      typeof json?.error === "string"
        ? json.error
        : `HTTP ${responseMeta.status} ${responseMeta.statusText}`;
    throw new Error(message);
  }
  return json;
}

async function sendRequest(url, { method = "GET", headers = {}, body = "", timeoutMs = 10000 } = {}) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          Connection: "close",
          ...headers,
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            statusText: response.statusMessage ?? "",
            headers: response.headers,
            text,
          });
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out waiting for ${url}.`));
    });
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

async function postForm(url, payload, { cookie } = {}) {
  const target = new URL(url);
  const body = new URLSearchParams(
    Object.entries(payload).map(([key, value]) => [key, String(value)])
  ).toString();
  const response = await sendRequest(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Origin: target.origin,
      Referer: `${target.origin}/`,
      ...(cookie ? { Cookie: cookie } : {}),
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body).toString(),
    },
    body,
    timeoutMs: 20000,
  });

  return {
    cookie: response.headers["set-cookie"] ? extractCookie(response.headers["set-cookie"]) : null,
    json: parseJsonResponse(response.text, response),
  };
}

async function fetchJson(url, { cookie, timeoutMs = 10000 } = {}) {
  const response = await sendRequest(url, {
    headers: cookie ? { Cookie: cookie } : {},
    timeoutMs,
  });
  return parseJsonResponse(response.text, response);
}

async function fetchHtml(url, { cookie, timeoutMs = 10000 } = {}) {
  const response = await sendRequest(url, {
    headers: cookie ? { Cookie: cookie } : {},
    timeoutMs,
  });
  if (response.status !== 200) {
    throw new Error(`Expected ${url} to respond with 200, got ${response.status}.`);
  }
  return response.text;
}

async function waitFor(label, producer, predicate, { timeoutMs = 180000, intervalMs = 3000 } = {}) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await producer();
      if (predicate(value)) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const reason = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}.${reason}`);
}

async function ensureFirebasePasswordUser(apiKey, email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const errorMessage = String(payload?.error?.message ?? "unknown");
    if (errorMessage !== "EMAIL_EXISTS") {
      throw new Error(`Firebase admin bootstrap failed: ${errorMessage}`);
    }
  }
}

async function signInFirebasePasswordUser(apiKey, email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const errorMessage = String(payload?.error?.message ?? "unknown");
    if (
      errorMessage === "EMAIL_NOT_FOUND" ||
      errorMessage === "INVALID_LOGIN_CREDENTIALS" ||
      errorMessage === "INVALID_PASSWORD"
    ) {
      return null;
    }
    throw new Error(`Firebase admin sign-in failed: ${errorMessage}`);
  }

  return payload;
}

async function deleteFirebasePasswordUser(apiKey, email, password) {
  const session = await signInFirebasePasswordUser(apiKey, email, password);
  if (!session?.idToken) {
    return false;
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: session.idToken }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const errorMessage = String(payload?.error?.message ?? "unknown");
    throw new Error(`Firebase admin cleanup failed: ${errorMessage}`);
  }

  return true;
}

function clearCrawlPolicyCache(domain) {
  runCompose(
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "newsportal",
    "-d",
    "newsportal",
    "-c",
    `delete from crawl_policy_cache where domain = '${domain.replaceAll("'", "''")}';`
  );
}

function triggerChannelRun(channelId) {
  return runCommand(
    "docker",
    [
      ...composeArgs,
      "exec",
      "-T",
      "fetchers",
      "pnpm",
      "--filter",
      "@newsportal/fetchers",
      "run:once",
      channelId,
    ],
    { capture: true }
  );
}

function pickDomain(rawUrl) {
  return new URL(rawUrl).hostname;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asInt(value, fallback = 0) {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asFloat(value, fallback = 0) {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return ["1", "true", "yes", "y"].includes(normalized);
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    if (!key) {
      continue;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function buildChannelPayload(runId, groupKey, site, overrides = {}) {
  return {
    providerType: "website",
    name: `Live ${groupKey} ${site.candidateName} ${runId}`,
    fetchUrl: site.fetchUrl,
    language: site.language ?? WEBSITE_DEFAULTS.language,
    isActive: "true",
    adaptiveEnabled: "true",
    pollIntervalSeconds: String(site.pollIntervalSeconds ?? WEBSITE_DEFAULTS.pollIntervalSeconds),
    maxPollIntervalSeconds: String(
      site.maxPollIntervalSeconds ?? WEBSITE_DEFAULTS.maxPollIntervalSeconds
    ),
    requestTimeoutMs: String(site.requestTimeoutMs ?? WEBSITE_DEFAULTS.requestTimeoutMs),
    totalPollTimeoutMs: String(site.totalPollTimeoutMs ?? WEBSITE_DEFAULTS.totalPollTimeoutMs),
    maxResourcesPerPoll: String(site.maxResourcesPerPoll ?? WEBSITE_DEFAULTS.maxResourcesPerPoll),
    crawlDelayMs: String(site.crawlDelayMs ?? WEBSITE_DEFAULTS.crawlDelayMs),
    sitemapDiscoveryEnabled: String(
      site.sitemapDiscoveryEnabled ?? WEBSITE_DEFAULTS.sitemapDiscoveryEnabled
    ),
    feedDiscoveryEnabled: String(site.feedDiscoveryEnabled ?? WEBSITE_DEFAULTS.feedDiscoveryEnabled),
    collectionDiscoveryEnabled: String(
      site.collectionDiscoveryEnabled ?? WEBSITE_DEFAULTS.collectionDiscoveryEnabled
    ),
    downloadDiscoveryEnabled: String(
      site.downloadDiscoveryEnabled ?? WEBSITE_DEFAULTS.downloadDiscoveryEnabled
    ),
    browserFallbackEnabled: String(
      site.browserFallbackEnabled ?? WEBSITE_DEFAULTS.browserFallbackEnabled
    ),
    collectionSeedUrls: asArray(site.collectionSeedUrls).join("\n"),
    allowedUrlPatterns: asArray(site.allowedUrlPatterns).join("\n"),
    blockedUrlPatterns: asArray(site.blockedUrlPatterns).join("\n"),
    curatedPreferCollectionDiscovery: String(Boolean(site.curatedPreferCollectionDiscovery)),
    curatedPreferBrowserFallback: String(Boolean(site.curatedPreferBrowserFallback)),
    curatedEditorialUrlPatterns: asArray(site.curatedEditorialUrlPatterns).join("\n"),
    curatedListingUrlPatterns: asArray(site.curatedListingUrlPatterns).join("\n"),
    curatedEntityUrlPatterns: asArray(site.curatedEntityUrlPatterns).join("\n"),
    curatedDocumentUrlPatterns: asArray(site.curatedDocumentUrlPatterns).join("\n"),
    curatedDataFileUrlPatterns: asArray(site.curatedDataFileUrlPatterns).join("\n"),
    ...overrides,
  };
}

async function listFetchRuns(channelId) {
  return fetchJson(
    `http://127.0.0.1:8000/maintenance/fetch-runs?channel_id=${encodeURIComponent(
      channelId
    )}&page=1&pageSize=5`,
    { timeoutMs: 20000 }
  );
}

async function waitForLatestCompletedFetchRun(channelId, previousStartedAt = null) {
  const payload = await waitFor(
    `fetch run for ${channelId}`,
    () => listFetchRuns(channelId),
    (value) => {
      const run = asArray(value?.items)[0];
      if (!run || !run.started_at) {
        return false;
      }
      if (previousStartedAt && String(run.started_at) === String(previousStartedAt)) {
        return false;
      }
      return Boolean(run.completed_at ?? run.outcome_kind);
    },
    { timeoutMs: 240000, intervalMs: 3000 }
  );
  return asArray(payload.items)[0];
}

async function listResources(channelId, pageSize = 100) {
  return fetchJson(
    `http://127.0.0.1:8000/maintenance/web-resources?channelId=${encodeURIComponent(
      channelId
    )}&page=1&pageSize=${pageSize}`,
    { timeoutMs: 20000 }
  );
}

function shouldExpectResources(fetchRun) {
  const metrics = asObject(fetchRun?.provider_metrics_json);
  return (
    asInt(fetchRun?.fetched_item_count, 0) > 0 ||
    asInt(fetchRun?.new_article_count, 0) > 0 ||
    asInt(metrics.finalAcceptedCount, 0) > 0 ||
    asInt(metrics.staticAcceptedCount, 0) > 0 ||
    asInt(metrics.browserAcceptedCount, 0) > 0
  );
}

async function waitForResourcesIfExpected(channelId, fetchRun) {
  const initial = await listResources(channelId);
  if (!shouldExpectResources(fetchRun)) {
    return initial;
  }
  if (asArray(initial.items).length > 0) {
    return initial;
  }
  return waitFor(
    `resources for ${channelId}`,
    () => listResources(channelId),
    (value) => asArray(value?.items).length > 0,
    { timeoutMs: 180000, intervalMs: 5000 }
  );
}

function sumConditionalRequestHits(metrics) {
  const hits = asObject(metrics.conditionalRequestHits);
  return {
    homepage: asInt(hits.homepage, 0),
    sitemap: asInt(hits.sitemap, 0),
    feed: asInt(hits.feed, 0),
    robots: asInt(hits.robots, 0),
    llms: asInt(hits.llms, 0),
    total:
      asInt(hits.homepage, 0) +
      asInt(hits.sitemap, 0) +
      asInt(hits.feed, 0) +
      asInt(hits.robots, 0) +
      asInt(hits.llms, 0),
  };
}

function browserRecommendationSeen(fetchRun) {
  const metrics = asObject(fetchRun?.provider_metrics_json);
  return asBoolean(metrics.browserRecommended) || asInt(metrics.browserOnlyAcceptedCount, 0) > 0;
}

function chooseResourceIdsForInspection(items) {
  const selected = [];
  const seen = new Set();
  const push = (item) => {
    const resourceId = String(item?.resource_id ?? "");
    if (!resourceId || seen.has(resourceId)) {
      return;
    }
    seen.add(resourceId);
    selected.push(resourceId);
  };

  for (const item of items.filter((entry) => String(entry.resource_kind ?? "") === "editorial").slice(0, 3)) {
    push(item);
  }
  for (const item of items.filter((entry) => !entry.projected_article_id).slice(0, 3)) {
    push(item);
  }
  for (const item of items.filter((entry) => entry.projected_article_id).slice(0, 3)) {
    push(item);
  }
  for (const item of items.slice(0, 6)) {
    push(item);
  }

  return selected;
}

async function verifyAdminResourcePages(cookie, channelId, resourceId) {
  const listHtml = await fetchHtml(
    `http://127.0.0.1:4322/resources?channelId=${encodeURIComponent(channelId)}`,
    { cookie, timeoutMs: 20000 }
  );
  if (!listHtml.includes(channelId)) {
    throw new Error(`Admin resources page for ${channelId} did not include the channel id.`);
  }

  const detailHtml = await fetchHtml(
    `http://127.0.0.1:4322/resources/${encodeURIComponent(resourceId)}`,
    { cookie, timeoutMs: 20000 }
  );
  if (!detailHtml.includes(resourceId)) {
    throw new Error(`Admin resource detail ${resourceId} did not include the resource id.`);
  }
}

async function inspectResourceDetails(resourceIds) {
  const details = [];
  for (const resourceId of resourceIds) {
    try {
      const detail = await fetchJson(
        `http://127.0.0.1:8000/maintenance/web-resources/${encodeURIComponent(resourceId)}`,
        { timeoutMs: 20000 }
      );
      details.push(detail);
    } catch (error) {
      details.push({
        resource_id: resourceId,
        inspection_error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return details;
}

function summarizeResources(items, details) {
  const transitionSamples = [];
  let projectedCount = 0;
  let browserProvenanceCount = 0;
  let extractorInvokedCount = 0;
  let extractorImprovedBodyCount = 0;
  let bodyChangedCount = 0;
  let positiveBodyUpliftCount = 0;
  let maxBodyUpliftChars = 0;
  let maxBodyUpliftRatio = 0;
  let classificationTransitionCount = 0;
  let challengeHintCount = 0;

  for (const item of items) {
    if (item.projected_article_id) {
      projectedCount += 1;
    }
  }

  for (const detail of details) {
    const classification = asObject(detail.classification_json);
    const transition = asObject(classification.transition);
    const attrs = asObject(detail.attributes_json);
    const editorialExtraction = asObject(attrs.editorialExtraction);
    const rawPayloadString = JSON.stringify(detail.raw_payload_json ?? {});

    if (asBoolean(transition.kindChanged)) {
      classificationTransitionCount += 1;
      transitionSamples.push({
        resourceId: detail.resource_id,
        fromKind: transition.fromKind ?? null,
        toKind: transition.toKind ?? null,
        reasonSource: transition.reasonSource ?? null,
      });
    }
    if (/browserassisted|browsercapturesource|browserseedurl|browserpageurl/i.test(rawPayloadString)) {
      browserProvenanceCount += 1;
    }
    if (/browserchallengekind/i.test(rawPayloadString)) {
      challengeHintCount += 1;
    }
    if (asBoolean(editorialExtraction.articleExtractorInvoked)) {
      extractorInvokedCount += 1;
    }
    if (asBoolean(editorialExtraction.extractorImprovedBody)) {
      extractorImprovedBodyCount += 1;
    }
    if (asBoolean(editorialExtraction.bodyChanged)) {
      bodyChangedCount += 1;
    }
    const upliftChars = asInt(editorialExtraction.bodyUpliftChars, 0);
    const upliftRatio = asFloat(editorialExtraction.bodyUpliftRatio, 0);
    if (upliftChars > 0) {
      positiveBodyUpliftCount += 1;
    }
    if (upliftChars > maxBodyUpliftChars) {
      maxBodyUpliftChars = upliftChars;
    }
    if (upliftRatio > maxBodyUpliftRatio) {
      maxBodyUpliftRatio = upliftRatio;
    }
  }

  return {
    total: items.length,
    projectedCount,
    resourceOnlyCount: items.length - projectedCount,
    resourceKindCounts: countBy(items, (item) => String(item.resource_kind ?? "unknown")),
    discoverySourceCounts: countBy(items, (item) => String(item.discovery_source ?? "unknown")),
    classificationTransitionCount,
    transitionSamples: transitionSamples.slice(0, 8),
    browserProvenanceCount,
    challengeHintCount,
    articleExtractorInvokedCount: extractorInvokedCount,
    extractorImprovedBodyCount,
    bodyChangedCount,
    positiveBodyUpliftCount,
    maxBodyUpliftChars,
    maxBodyUpliftRatio,
  };
}

function buildRunSnapshot(fetchRun, resourcesPayload, details) {
  const metrics = asObject(fetchRun?.provider_metrics_json);
  const items = asArray(resourcesPayload?.items);
  return {
    startedAt: fetchRun?.started_at ?? null,
    completedAt: fetchRun?.completed_at ?? null,
    outcomeKind: fetchRun?.outcome_kind ?? null,
    httpStatus: fetchRun?.http_status ?? null,
    fetchedItemCount: asInt(fetchRun?.fetched_item_count, 0),
    newArticleCount: asInt(fetchRun?.new_article_count, 0),
    duplicateSuppressedCount: asInt(fetchRun?.duplicate_suppressed_count, 0),
    errorText: fetchRun?.error_text ?? null,
    providerMetrics: metrics,
    conditionalRequestHits: sumConditionalRequestHits(metrics),
    resourceSummary: summarizeResources(items, details),
    sampleResourceIds: details.map((detail) => detail.resource_id).filter(Boolean),
    browserRecommended: asBoolean(metrics.browserRecommended),
    browserAttempted: asBoolean(metrics.browserAttempted),
    browserChallengeKind: metrics.browserChallengeKind ?? null,
    browserOnlyAcceptedCount: asInt(metrics.browserOnlyAcceptedCount, 0),
    staticAcceptedCount: asInt(metrics.staticAcceptedCount, 0),
    finalAcceptedCount: asInt(metrics.finalAcceptedCount, 0),
    resourceKindCounts: asObject(metrics.resourceKindCounts),
    modeCounts: asObject(metrics.modeCounts),
  };
}

async function triggerAndCapture(channelId, cookie, previousStartedAt = null) {
  triggerChannelRun(channelId);
  const fetchRun = await waitForLatestCompletedFetchRun(channelId, previousStartedAt);
  const resourcesPayload = await waitForResourcesIfExpected(channelId, fetchRun);
  const items = asArray(resourcesPayload.items);
  const selectedResourceIds = chooseResourceIdsForInspection(items);
  if (selectedResourceIds.length > 0) {
    await verifyAdminResourcePages(cookie, channelId, selectedResourceIds[0]);
  }
  const details = await inspectResourceDetails(selectedResourceIds);
  return buildRunSnapshot(fetchRun, resourcesPayload, details);
}

async function deleteOrArchiveChannel(cookie, channelId) {
  try {
    await postForm(
      "http://127.0.0.1:4322/bff/admin/channels",
      {
        intent: "delete",
        channelId,
        providerType: "website",
      },
      { cookie }
    );
    return true;
  } catch (error) {
    log(
      `Best-effort channel cleanup for ${channelId} failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

function classifySiteOutcome(groupKey, staticRun, assistedRun, repeatRun) {
  const baseline = staticRun?.resourceSummary ?? {};
  const repeat = repeatRun?.conditionalRequestHits ?? {};
  const assisted = assistedRun?.resourceSummary ?? {};

  if (groupKey === "static_editorial") {
    if ((baseline.resourceKindCounts?.editorial ?? 0) > 0) {
      return "observed_expected_shape";
    }
    return "observed_partial_or_empty_shape";
  }

  if (groupKey === "documents_downloads") {
    const docLike =
      (baseline.resourceKindCounts?.document ?? 0) +
      (baseline.resourceKindCounts?.data_file ?? 0) +
      (baseline.resourceKindCounts?.listing ?? 0) +
      (baseline.resourceKindCounts?.entity ?? 0);
    if (docLike > 0 && (baseline.resourceOnlyCount ?? 0) > 0) {
      return "observed_expected_shape";
    }
    return "observed_partial_or_empty_shape";
  }

  if (groupKey === "public_changelog") {
    const totalKinds =
      (baseline.resourceKindCounts?.editorial ?? 0) +
      (baseline.resourceKindCounts?.listing ?? 0) +
      (assisted.resourceKindCounts?.editorial ?? 0) +
      (assisted.resourceKindCounts?.listing ?? 0);
    if (totalKinds > 0) {
      return "observed_expected_shape";
    }
    return "observed_partial_or_empty_shape";
  }

  if (groupKey === "browser_candidate") {
    if (
      asInt(assistedRun?.browserOnlyAcceptedCount, 0) > 0 ||
      (assisted.browserProvenanceCount ?? 0) > 0
    ) {
      return "observed_expected_shape";
    }
    if (assistedRun?.browserChallengeKind || staticRun?.browserChallengeKind) {
      return "observed_truthful_unsupported_or_blocked";
    }
    if ((repeat.total ?? 0) > 0 || (staticRun?.browserRecommended ?? false)) {
      return "observed_partial_or_empty_shape";
    }
    return "observed_partial_or_empty_shape";
  }

  return "observed_partial_or_empty_shape";
}

function buildFailureDetails(error) {
  const stderr =
    error instanceof Error && typeof error.stderr === "string" ? error.stderr : "";
  const stdout =
    error instanceof Error && typeof error.stdout === "string" ? error.stdout : "";
  const combined = [error instanceof Error ? error.message : String(error), stderr, stdout]
    .filter(Boolean)
    .join("\n");

  const upstreamStatusMatch = combined.match(/upstream returned (\d{3})/i);
  const hardFailureStatusMatch = combined.match(/httpStatus:\s*(\d{3})/i);
  const challengeMatch = combined.match(
    /browserChallengeKind:\s*'([^']+)'|unsupported ([a-z0-9_]+)|captcha|cloudflare_js_challenge/i
  );

  let challengeKind = null;
  if (challengeMatch) {
    challengeKind =
      challengeMatch[1] ??
      challengeMatch[2] ??
      (/captcha/i.test(challengeMatch[0]) ? "captcha" : challengeMatch[0]);
  }

  const httpStatus = upstreamStatusMatch?.[1] ?? hardFailureStatusMatch?.[1] ?? null;
  const truthfulBlocked =
    /authentication failed/i.test(combined) ||
    /robots\.txt/i.test(combined) ||
    /unsupported unsupported_block/i.test(combined) ||
    /browser-assisted discovery stopped/i.test(combined) ||
    /upstream returned 401/i.test(combined) ||
    /upstream returned 403/i.test(combined) ||
    /captcha/i.test(combined) ||
    /cloudflare_js_challenge/i.test(combined);

  return {
    verdict: truthfulBlocked ? "observed_truthful_unsupported_or_blocked" : "unexpected_failure",
    httpStatus: httpStatus ? Number.parseInt(httpStatus, 10) : null,
    challengeKind,
    stdout: stdout || null,
    stderr: stderr || null,
  };
}

async function runSiteValidation(runId, cookie, group, site) {
  clearCrawlPolicyCache(pickDomain(site.fetchUrl));

  let channelId = "";
  let capturedError = null;
  const create = await postForm(
    "http://127.0.0.1:4322/bff/admin/channels",
    buildChannelPayload(runId, group.key, site),
    { cookie }
  );
  channelId = String(create.json?.channelId ?? "");
  if (!channelId) {
    throw new Error(`Creating ${site.candidateName} did not return a channelId.`);
  }

  let cleanupAttempted = false;
  let cleanupSucceeded = false;
  let result = null;

  try {
    const staticRun = await triggerAndCapture(channelId, cookie);

    let assistedRun = null;
    const needsBrowserValidation =
      group.browserValidation === "required" ||
      (group.browserValidation === "conditional" && browserRecommendationSeen(staticRun));
    if (needsBrowserValidation) {
      const update = await postForm(
        "http://127.0.0.1:4322/bff/admin/channels",
        buildChannelPayload(runId, group.key, site, {
          channelId,
          browserFallbackEnabled: "true",
        }),
        { cookie }
      );
      if (String(update.json?.channelId ?? channelId) !== channelId) {
        throw new Error(`Updating ${site.candidateName} returned an unexpected channel id.`);
      }
      assistedRun = await triggerAndCapture(channelId, cookie, staticRun.startedAt);
    }

    const repeatRun = await triggerAndCapture(
      channelId,
      cookie,
      (assistedRun ?? staticRun).startedAt
    );

    result = {
      candidateName: site.candidateName,
      groupKey: group.key,
      groupLabel: group.label,
      channelId,
      fetchUrl: site.fetchUrl,
      browserValidation: group.browserValidation,
      staticRun,
      assistedRun,
      repeatRun,
      verdict: classifySiteOutcome(group.key, staticRun, assistedRun, repeatRun),
    };
  } catch (error) {
    capturedError = error;
  } finally {
    cleanupAttempted = true;
    cleanupSucceeded = await deleteOrArchiveChannel(cookie, channelId);
  }

  if (capturedError) {
    if (capturedError && typeof capturedError === "object") {
      capturedError.cleanupAttempted = cleanupAttempted;
      capturedError.cleanupSucceeded = cleanupSucceeded;
      capturedError.channelId = channelId;
    }
    throw capturedError;
  }

  return {
    ...result,
    cleanupAttempted,
    cleanupSucceeded,
  };
}

function summarizeGroupResults(results) {
  return {
    totalSites: results.length,
    verdictCounts: countBy(results, (item) => String(item.verdict ?? "unknown")),
    browserAttemptedCount: results.filter(
      (item) => item.staticRun?.browserAttempted || item.assistedRun?.browserAttempted
    ).length,
    browserOnlyAcceptedCount: results.reduce(
      (sum, item) => sum + asInt(item.assistedRun?.browserOnlyAcceptedCount, 0),
      0
    ),
    total304Hits: results.reduce(
      (sum, item) => sum + asInt(item.repeatRun?.conditionalRequestHits?.total, 0),
      0
    ),
    sitesWithPositiveBodyUplift: results.filter(
      (item) =>
        asInt(item.staticRun?.resourceSummary?.positiveBodyUpliftCount, 0) > 0 ||
        asInt(item.assistedRun?.resourceSummary?.positiveBodyUpliftCount, 0) > 0 ||
        asInt(item.repeatRun?.resourceSummary?.positiveBodyUpliftCount, 0) > 0
    ).length,
  };
}

function buildOverallSummary(activeLiveGroups, siteResults) {
  const byGroup = {};
  for (const group of activeLiveGroups) {
    const matches = siteResults.filter((item) => item.groupKey === group.key);
    byGroup[group.key] = summarizeGroupResults(matches);
  }
  return {
    totalSites: siteResults.length,
    verdictCounts: countBy(siteResults, (item) => String(item.verdict ?? "unknown")),
    total304Hits: siteResults.reduce(
      (sum, item) => sum + asInt(item.repeatRun?.conditionalRequestHits?.total, 0),
      0
    ),
    totalBrowserOnlyAccepted: siteResults.reduce(
      (sum, item) => sum + asInt(item.assistedRun?.browserOnlyAcceptedCount, 0),
      0
    ),
    cleanupResiduals: siteResults
      .filter((item) => item.cleanupSucceeded !== true)
      .map((item) => ({
        channelId: item.channelId,
        candidateName: item.candidateName,
      })),
    groups: byGroup,
  };
}

async function main() {
  const filters = parseCliArgs(process.argv.slice(2));
  const runId = randomUUID();
  const variantKey = filters.variant;
  const env = await readEnvFile(".env.dev");
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY");
  const adminEmail = selectAdminEmail(readAllowlistEntries(env), runId);
  const adminPassword = `LiveWebsiteMatrix!${runId.slice(0, 10)}`;
  const evidencePath = `/tmp/newsportal-live-website-matrix-${variantKey}-${runId}.json`;
  const activeLiveGroups = selectLiveGroups(variantKey, filters);

  if (activeLiveGroups.length === 0) {
    throw new Error("The requested --group/--site filters did not match any live website candidates.");
  }

  let adminCookie = null;
  try {
    await ensureFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);

    log("Signing in through the admin app.");
    const adminSignIn = await postForm("http://127.0.0.1:4322/bff/auth/sign-in", {
      email: adminEmail,
      password: adminPassword,
    });
    adminCookie = adminSignIn.cookie;
    if (!adminCookie) {
      throw new Error("Admin sign-in did not return a session cookie.");
    }

    const adminSession = await fetchJson("http://127.0.0.1:4322/bff/session", {
      cookie: adminCookie,
    });
    if (!adminSession?.session?.roles?.includes?.("admin")) {
      throw new Error("Admin session does not contain the admin role after allowlist bootstrap.");
    }

    const siteResults = [];
    for (const group of activeLiveGroups) {
      log(`Running variant ${variantKey}, group ${group.key} with ${group.sites.length} live sites.`);
      for (const site of group.sites) {
        log(`Running ${group.key}: ${site.candidateName}`);
        try {
          const result = await runSiteValidation(runId, adminCookie, group, site);
          siteResults.push(result);
        } catch (error) {
          const failure = buildFailureDetails(error);
        siteResults.push({
          candidateName: site.candidateName,
          groupKey: group.key,
          groupLabel: group.label,
          channelId: error?.channelId ?? null,
          fetchUrl: site.fetchUrl,
          verdict: failure.verdict,
          error: error instanceof Error ? error.message : String(error),
          errorStdout: failure.stdout,
          errorStderr: failure.stderr,
          failureHttpStatus: failure.httpStatus,
          failureChallengeKind: failure.challengeKind,
          cleanupAttempted: Boolean(error?.cleanupAttempted),
          cleanupSucceeded: Boolean(error?.cleanupSucceeded),
        });
      }
    }
    }

    const report = {
      runId,
      variantKey,
      generatedAt: new Date().toISOString(),
      evidencePath,
      absoluteRunDate: new Date().toISOString().slice(0, 10),
      liveGroups: activeLiveGroups.map((group) => ({
        key: group.key,
        label: group.label,
        browserValidation: group.browserValidation,
        sites: group.sites.map((site) => ({
          candidateName: site.candidateName,
          fetchUrl: site.fetchUrl,
        })),
      })),
      summary: buildOverallSummary(activeLiveGroups, siteResults),
      siteResults,
    };

    await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));

    if (siteResults.some((item) => item.verdict === "unexpected_failure")) {
      process.exitCode = 1;
    }
  } finally {
    await deleteFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword).catch(() => false);
  }
}

await main();
