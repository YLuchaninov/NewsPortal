#!/usr/bin/env node

/**
 * validate-feeds.js
 *
 * Проверяет JSON-массивы с RSS/Atom-источниками и удаляет нерабочие.
 *
 * Запуск:
 *   node validate-feeds.js file1.json file2.json
 *
 * Примеры:
 *   node validate-feeds.js it_news_rss_feeds_strict_203.json
 *   node validate-feeds.js it_news_rss_feeds_288.json it_jobs_rss_feeds_1532.json
 *
 * Node.js: 18+
 */

const fs = require("fs/promises");
const path = require("path");

const CONFIG = {
    timeoutMs: 12000,
    concurrency: 12,
    maxRedirects: 5,
    userAgent: "NewsPortalFetchers/manual-mvp feed-validator/1.0",
    accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, application/rdf+xml, text/plain;q=0.8, */*;q=0.5",
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(url) {
    try {
        return new URL(url).toString();
    } catch {
        return null;
    }
}

function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeXmlFeed(body, contentType = "") {
    const text = stripBom(body).trim().slice(0, 5000).toLowerCase();
    const ct = (contentType || "").toLowerCase();

    const xmlishContentType =
        ct.includes("xml") ||
        ct.includes("rss") ||
        ct.includes("atom") ||
        ct.includes("rdf");

    const hasFeedMarkers =
        text.includes("<rss") ||
        text.includes("<feed") ||
        text.includes("<rdf:rdf") ||
        text.includes("<channel");

    const startsLikeXml =
        text.startsWith("<?xml") ||
        text.startsWith("<rss") ||
        text.startsWith("<feed") ||
        text.startsWith("<rdf:rdf");

    const looksLikeHtml =
        text.startsWith("<!doctype html") ||
        text.startsWith("<html") ||
        text.includes("<body") ||
        text.includes("<script");

    const antiBotMarkers = [
        "cf-browser-verification",
        "cloudflare",
        "attention required",
        "captcha",
        "access denied",
        "just a moment",
        "bot verification",
        "please enable javascript",
    ];

    const hasAntiBot = antiBotMarkers.some((m) => text.includes(m));

    if (hasAntiBot) return false;
    if (looksLikeHtml && !hasFeedMarkers) return false;

    return (xmlishContentType && hasFeedMarkers) || startsLikeXml || hasFeedMarkers;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = CONFIG.timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
            redirect: "follow",
            headers: {
                "user-agent": CONFIG.userAgent,
                accept: CONFIG.accept,
                ...(options.headers || {}),
            },
        });
    } finally {
        clearTimeout(timer);
    }
}

async function validateFeed(feed) {
    const url = normalizeUrl(feed.fetchUrl);
    if (!url) {
        return {
            ok: false,
            reason: "invalid_url",
            status: null,
            finalUrl: null,
        };
    }

    // Иногда HEAD ломается на RSS, поэтому сразу GET
    try {
        const res = await fetchWithTimeout(url, {}, CONFIG.timeoutMs);
        const finalUrl = res.url || url;
        const status = res.status;
        const contentType = res.headers.get("content-type") || "";
        const body = await res.text();

        if (!res.ok) {
            return {
                ok: false,
                reason: `http_${status}`,
                status,
                finalUrl,
            };
        }

        if (!body || !body.trim()) {
            return {
                ok: false,
                reason: "empty_body",
                status,
                finalUrl,
            };
        }

        if (!looksLikeXmlFeed(body, contentType)) {
            return {
                ok: false,
                reason: "not_rss_or_atom",
                status,
                finalUrl,
            };
        }

        return {
            ok: true,
            reason: "ok",
            status,
            finalUrl,
        };
    } catch (err) {
        const msg = String(err && err.name ? err.name : err);
        if (msg.includes("AbortError")) {
            return {
                ok: false,
                reason: "timeout",
                status: null,
                finalUrl: null,
            };
        }

        return {
            ok: false,
            reason: `fetch_error:${String(err.message || err)}`,
            status: null,
            finalUrl: null,
        };
    }
}

async function runPool(items, worker, concurrency) {
    const results = new Array(items.length);
    let index = 0;

    async function runner() {
        while (true) {
            const current = index++;
            if (current >= items.length) return;
            results[current] = await worker(items[current], current);
        }
    }

    const runners = Array.from(
        { length: Math.min(concurrency, items.length) },
        () => runner()
    );

    await Promise.all(runners);
    return results;
}

async function processFile(filePath) {
    const fullPath = path.resolve(filePath);
    const raw = await fs.readFile(fullPath, "utf8");
    let feeds = JSON.parse(raw);

    if (!Array.isArray(feeds)) {
        throw new Error(`Файл ${filePath} не содержит JSON-массив`);
    }

    console.log(`\n=== ${path.basename(filePath)} ===`);
    console.log(`Всего записей: ${feeds.length}`);

    const startedAt = Date.now();

    const results = await runPool(
        feeds,
        async (feed, idx) => {
            const result = await validateFeed(feed);
            const prefix = result.ok ? "OK " : "BAD";
            console.log(
                `[${idx + 1}/${feeds.length}] ${prefix} ${feed.fetchUrl} -> ${result.reason}`
            );
            // Небольшая пауза полезна для некоторых сайтов
            await sleep(50);
            return { feed, ...result };
        },
        CONFIG.concurrency
    );

    const valid = [];
    const invalid = [];

    for (const item of results) {
        if (item.ok) {
            valid.push(item.feed);
        } else {
            invalid.push({
                ...item.feed,
                validationError: item.reason,
                validationStatus: item.status,
                validationFinalUrl: item.finalUrl,
            });
        }
    }

    // Убираем дубли по fetchUrl после валидации
    const seen = new Set();
    const dedupedValid = [];
    for (const feed of valid) {
        const key = normalizeUrl(feed.fetchUrl) || feed.fetchUrl;
        if (seen.has(key)) continue;
        seen.add(key);
        dedupedValid.push(feed);
    }

    const dir = path.dirname(fullPath);
    const ext = path.extname(fullPath);
    const base = path.basename(fullPath, ext);

    const cleanFile = path.join(dir, `${base}.cleaned${ext}`);
    const removedFile = path.join(dir, `${base}.removed${ext}`);
    const reportFile = path.join(dir, `${base}.report.json`);

    await fs.writeFile(cleanFile, JSON.stringify(dedupedValid, null, 2), "utf8");
    await fs.writeFile(removedFile, JSON.stringify(invalid, null, 2), "utf8");

    const report = {
        sourceFile: filePath,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        total: feeds.length,
        validBeforeDedup: valid.length,
        validAfterDedup: dedupedValid.length,
        removed: invalid.length,
        removedByReason: invalid.reduce((acc, item) => {
            acc[item.validationError] = (acc[item.validationError] || 0) + 1;
            return acc;
        }, {}),
        outputFiles: {
            cleaned: cleanFile,
            removed: removedFile,
        },
    };

    await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");

    console.log(`\nГотово: ${path.basename(filePath)}`);
    console.log(`Оставлено: ${dedupedValid.length}`);
    console.log(`Удалено: ${invalid.length}`);
    console.log(`cleaned: ${cleanFile}`);
    console.log(`removed: ${removedFile}`);
    console.log(`report:  ${reportFile}`);

    return report;
}

async function main() {
    const files = process.argv.slice(2);

    if (files.length === 0) {
        console.error("Укажи хотя бы один JSON-файл:");
        console.error("  node validate-feeds.js it_news_rss_feeds_strict_203.json");
        process.exit(1);
    }

    const reports = [];
    for (const file of files) {
        try {
            const report = await processFile(file);
            reports.push(report);
        } catch (err) {
            console.error(`\nОшибка при обработке ${file}: ${err.message}`);
        }
    }

    console.log("\n=== ИТОГО ===");
    for (const r of reports) {
        console.log(
            `${path.basename(r.sourceFile)}: ${r.validAfterDedup}/${r.total} оставлено, ${r.removed} удалено`
        );
    }
}

main().catch((err) => {
    console.error("Фатальная ошибка:", err);
    process.exit(1);
});