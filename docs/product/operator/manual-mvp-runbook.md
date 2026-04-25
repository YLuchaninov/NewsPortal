# Manual MVP Runbook

Этот документ собирает operator-facing manual flow для локального MVP baseline.

Краткий framing:

- Для кого: для оператора или разработчика, которому нужен полный локальный продуктовый walkthrough без погружения в agent/runtime-core docs.
- Что покрывает: bootstrap, web/admin flow, source ingest, delivery checks, public API, moderation, repair, cleanup/reset и optional manual lanes.
- Что вне scope: внутренняя агентная система разработки, runtime-core process rules и subsystem contracts кроме тех, на которые runbook ссылается как на вспомогательную truth.
- Prerequisites: `pnpm install`, Docker Compose, `.env.dev`, Firebase setup и доступ к реальным обязательным env для выбранных manual lanes.
- Expected result: локальный compose baseline поднимается, ключевые продуктовые surfaces работают end-to-end, а оператор понимает как честно завершить cleanup/reset.

Он нужен, чтобы:

- поднять локальный stack без чтения chat history;
- понять, какие поверхности реально готовы к ручному прогону в текущем репозитории;
- пройти canonical MVP path через `web`, `admin`, public API и delivery surfaces;
- не смешать repeatable local fixture flow с code-present, но пока не operator-ready зонами;
- корректно завершить прогон и cleanup/reset state.

Для stateful fixture discipline и cleanup truth также сверяйся с [.aidp/contracts/test-access-and-fixtures.md](../../../.aidp/contracts/test-access-and-fixtures.md).

## Scope

Этот runbook покрывает:

- canonical local compose baseline;
- anonymous user flow в `web`;
- allowlisted admin sign-in;
- RSS and website ingest as the current internal product-testing source paths;
- system-selected collection, `/matches`, content detail, reactions, notification history, notification feedback, preferences, interests и notification-channel setup;
- admin channels, automation/outbox tooling, templates, moderation, user interests, reindex/backfill и article enrichment retry;
- public read API;
- local `email_digest` через Mailpit;
- optional local `web_push`;
- optional Telegram delivery smoke, parked outside the required local product-testing contour;
- explicit cleanup/reset guidance.

Этот runbook не делает вид, что уже покрывает все code-present surfaces:

- `youtube` ingest присутствует в architecture truth, но в текущем committed admin/operator surface все еще нет first-class CRUD flow для него.
- API source ingestion, inbound Email IMAP ingestion and Telegram ingestion are parked for the current internal local product testing contour. They should not be treated as blocking findings unless a separate active item opens them.
- Discovery живет в репозитории, но остается отдельным opt-in capability и не считается частью canonical safe-by-default MVP manual baseline.

## Coverage Matrix

| Surface | Status in current repo | How to verify manually |
| --- | --- | --- |
| `web` anonymous bootstrap, system-selected collection, `/matches`, interests, settings, notification history, notification feedback, reactions | operator-ready | sections `Web flow`, `Delivery checks`, and `Public API checks` |
| `admin` sign-in, dashboard, RSS/website channels, website resource observability, automation/outbox tooling, templates, moderation, reindex, user interests | operator-ready for current product contour | sections `Admin flow`, `Automation and outbox`, and `Moderation and repair` |
| RSS ingest | operator-ready | sections `Fixture channels` and `Admin flow` |
| Website ingest | operator-ready with dedicated create/edit flow plus `/resources` browse/detail follow-through; public JS-heavy sites may use opt-in browser fallback | sections `Admin flow`, `Website channels and hard sites`, and `Public API checks` |
| API source ingest | parked for current internal product testing | do not include in mandatory local contour |
| Email IMAP ingest | parked for current internal product testing | do not include in mandatory local contour |
| Automation / sequence and outbox operator tooling | operator-ready | section `Automation and outbox` |
| Content detail and enrichment retry | operator-ready | section `Moderation and repair` |
| Public API read surfaces | operator-ready | section `Public API checks` |
| Email digest via Mailpit | operator-ready | section `Delivery checks` |
| `web_push` receipt | optional, manual-only | section `Optional web push` |
| Telegram delivery | optional/manual and not required for current contour | section `Optional Telegram` |
| Discovery | optional, disabled by default | section `Optional discovery` |
| `youtube` source ingest | code-present, not operator-ready from current admin baseline | treat as a follow-up gap, not as a silent part of this run |

## Prerequisites

Required local baseline:

1. `pnpm install`
2. Docker Compose access
3. `.env.dev` copied from `.env.example`
4. Firebase auth setup completed via [firebase_setup.md](./setup/firebase_setup.md)

Required envs for the canonical local MVP path:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_WEB_API_KEY`
- `ADMIN_ALLOWLIST_EMAILS`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_BASE_URL`
- `APP_SECRET`
- `PUBLIC_API_SIGNING_KEY`

Expected local defaults that should normally stay unchanged:

- `EMAIL_DIGEST_SMTP_URL=smtp://mailpit:1025`
- `NEWSPORTAL_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`
- `NEWSPORTAL_WEB_APP_BASE_URL=http://127.0.0.1:4321/`
- `NEWSPORTAL_ADMIN_APP_BASE_URL=http://127.0.0.1:4322/`
- `DISCOVERY_ENABLED=0`

Optional envs for extra manual surfaces:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`
- `TELEGRAM_BOT_TOKEN`
- discovery envs from `README.md` if you intentionally test discovery live enable

## Environment Setup Notes

### Firebase

Use [firebase_setup.md](./setup/firebase_setup.md). The current repo needs only:

- `Anonymous` sign-in for end users
- `Email/Password` sign-in for admins
- at least one email in `ADMIN_ALLOWLIST_EMAILS`

For a repeatable manual run, prefer a dedicated admin mailbox or a `+alias` of an allowlisted address.

### Gemini / LLM

The local MVP path assumes a real Gemini key when you want system-interest gray-zone reviews and normal runtime behavior. If `GEMINI_API_KEY` is missing, manual ingest checks can degrade into environment blockers instead of product findings.

### Web Push

`web_push` is optional for the baseline and manual-only even when configured.

To enable it:

1. Generate a valid VAPID key pair with your normal web-push tooling.
2. Set `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_VAPID_SUBJECT` in `.env.dev`.
3. Restart the compose stack.
4. In the browser, allow notifications for `http://127.0.0.1:4321`.

Without these envs, the web settings page should truthfully show that the VAPID key is not configured.

### Telegram

Telegram is optional for the baseline.

To enable it:

1. Create or reuse a Telegram bot and set `TELEGRAM_BOT_TOKEN`.
2. Send at least one message from the target Telegram account to the bot.
3. Obtain the target `chat_id`.
4. Restart the compose stack after updating `.env.dev`.

The web UI only stores the chat id; the actual send path still depends on a valid bot token.

## Local Startup

1. Start the canonical stack:

   ```sh
   pnpm dev:mvp:internal
   ```

2. Confirm baseline health:

   - `http://127.0.0.1:4321/api/health`
   - `http://127.0.0.1:4322/api/health`
   - `http://127.0.0.1:8000/health`
   - `http://127.0.0.1:8080/health`
   - `http://127.0.0.1:8025/`

3. If the stack has stale schema/data drift after major migration changes, stop and use the reset guidance at the end of this document before trusting manual findings.

## Fixture Channels

You have two honest choices for RSS channels.

### Option A: Deterministic local fixture feed

Use repo-local feed URLs that the fetcher can reach inside compose:

```text
http://web:4321/internal-mvp-feed.xml?run=manual-a
http://web:4321/internal-mvp-feed.xml?run=manual-b
```

This is the most repeatable local path and does not depend on external publishers.

Recommended import payload shape:

```json
[
  {
    "name": "Manual MVP Local RSS A",
    "providerType": "rss",
    "fetchUrl": "http://web:4321/internal-mvp-feed.xml?run=manual-a",
    "language": "en",
    "pollIntervalSeconds": 300,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 3600,
    "maxItemsPerPoll": 20,
    "requestTimeoutMs": 5000,
    "userAgent": "NewsPortalFetchers/manual-mvp",
    "preferContentEncoded": true,
    "isActive": true
  },
  {
    "name": "Manual MVP Local RSS B",
    "providerType": "rss",
    "fetchUrl": "http://web:4321/internal-mvp-feed.xml?run=manual-b",
    "language": "en",
    "pollIntervalSeconds": 86400,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 259200,
    "maxItemsPerPoll": 20,
    "requestTimeoutMs": 5000,
    "userAgent": "NewsPortalFetchers/manual-mvp",
    "preferContentEncoded": true,
    "isActive": true
  }
]
```

### Option B: Real external RSS feeds

Use [infra/scripts/manual-rss-bundle.template.json](../../../infra/scripts/manual-rss-bundle.template.json) and replace the placeholder URLs with real feeds. Keep `"providerType": "rss"` on every row; the shared bulk importer now requires row-level `providerType` instead of guessing from the screen mode.

If you want to pre-clean a large candidate list, use your own validation helper or spreadsheet workflow. The repo does not currently ship a canonical validator script for real-feed bundles.

## Admin Flow

1. Open `http://127.0.0.1:4322/sign-in`.
2. Sign in with an allowlisted Firebase email/password.
3. Verify that signed-out admin pages redirect back to `/sign-in?next=...`.
4. Open `/channels` and either:
   - create one RSS channel manually, or
   - create one website channel manually, or
   - bulk import the deterministic local fixture bundle / your real RSS bundle, making sure every JSON row includes the correct `providerType`.
5. For a protected RSS or website source, use the `Authorization header` field only when static fetcher auth is enough:
   - enter the full raw header value such as `Bearer ...` or `Basic ...`
   - edit screens must show only `Configured` / `Not configured`, not the secret itself
   - leaving the field empty during edit preserves the stored value
   - entering a new value replaces it
   - the clear checkbox removes it
   - for `website`, the header applies only to same-origin source requests; interactive login and cookie/session auth remain unsupported
6. Confirm the channels page exposes:
   - create
   - import
   - scheduling actions
7. Check scheduling health on `/channels`:
   - `next due`
   - `overdue`
   - recent failures
   - fetch history
8. Visit:
   - `/resources`
   - `/automation`
   - `/templates/llm`
   - `/templates/interests`
   - `/reindex`
   - `/articles`
9. If you created a website channel, open `/resources` or the per-channel `Resources` link from `/channels`.
10. Confirm the resources surface shows:
   - projected editorial rows with article links
   - resource-only entity/document rows that stay visible even without article projection
   - detail drilldown for at least one specific resource
    - if you want a dedicated website-only checklist instead of the broader MVP runbook, continue with [WEBSITE_SOURCES_TESTING.md](./examples/WEBSITE_SOURCES_TESTING.md)
11. Confirm the dashboard shows the system-selected collection summary plus operational cards.
12. Open the editorial item list and confirm per-item reaction counters are visible.

Truthful current limitation:

- current mandatory internal product testing covers `rss` and `website` channel flows.
- API source ingestion, inbound Email IMAP ingestion, Telegram ingestion and `youtube` are parked/future lanes for this cycle.
- local `email_digest` remains in scope because it is outbound delivery through Mailpit, not inbound Email IMAP ingestion.

## Automation and outbox

1. Open `/automation`.
2. Confirm the operator surface shows:
   - summary cards for sequences, runs, and pending outbox traffic
   - create/edit/archive controls for sequence definitions
   - plugin catalog visibility
   - recent run list plus task-run drilldown
   - recent outbox event visibility
3. Create one draft or active sequence with a small task graph, save it, then edit it and confirm the updated definition renders back on the page.
4. Archive the test sequence and confirm it leaves the active list.
5. If you intentionally pause the worker, request one manual run and confirm a `pending` run can be cancelled from the same page.
6. If the worker stays active, request one manual run and confirm the page surfaces the resulting run status plus task-run detail instead of asking you to drop down to raw maintenance API calls.
7. Trigger one adjacent operator action such as reindex enqueue and confirm `/automation` reflects recent outbox traffic afterward.

## Website channels and hard sites

Use this section only when you intentionally verify the website lane.

If you want a dedicated operator-only walkthrough for this subsystem, use [WEBSITE_SOURCES_TESTING.md](./examples/WEBSITE_SOURCES_TESTING.md). The checklist below stays as the compact MVP-runbook version.

1. Create a public or static-header-authenticated `website` channel from a homepage/section/sitemap source that does not require interactive login.
2. If the source requires header auth, fill `Authorization header` with the full raw value; the fetcher will reuse it only for same-origin requests.
3. Start with the cheap/static website path first.
4. If the site is public but JS-heavy and static discovery misses the real resources, opt in to browser assistance with `browserFallbackEnabled`.
5. Leave `maxBrowserFetchesPerPoll=2` unless you have a bounded reason to widen browser work during one poll.
6. After polling, open `/resources` and confirm:
   - the expected resources were discovered;
   - projected editorial rows and resource-only rows are both visible;
   - browser-assisted rows show truthful provenance rather than looking identical to static rows.
7. Treat login walls, CAPTCHA pages and similar anti-bot blocks as out of scope for the MVP; explicit failure is the expected result.
8. Before trusting this lane as part of acceptance, run `pnpm test:hard-sites:compose`.

## Web Flow

1. Open `http://127.0.0.1:4321/`.
2. Start an anonymous session.
3. Open `/settings` and verify:
   - theme preference saves
   - notification preferences save
   - channel connect forms are visible
4. Open `/interests` or use the interest management surface from the main shell.
5. Create at least one interest with:
   - positive texts
   - negative texts
   - places
   - allowed languages
   - priority
6. Wait until the interest compile status becomes `compiled`.
7. Connect an `email_digest` channel with an inbox you control for the local run.
8. Confirm:
   - `/` shows the system-selected collection
   - `/matches` fills only with system-approved content items that also matched the user interest
   - primary navigation for reading goes to `/content/{content_item_id}`
   - the original source URL remains visible as a secondary action
9. On either `/` or `/matches`, submit one `like` or `dislike` and confirm the visible counters update.
10. Open `/notifications` after delivery activity exists and confirm the history page renders the persisted notification rows.
11. Submit one `helpful` or `not_helpful` feedback action from the notification history page and confirm the action succeeds.

## Public API Checks

These are the minimum public-read checks for the current MVP baseline:

1. `GET /collections/system-selected?page=1&pageSize=20`
   - returns paginated system-selected content items
   - includes source `url`
   - includes `like_count` and `dislike_count`
2. `GET /content-items/{content_item_id}`
   - returns the content-item detail projection
3. `GET /content-items/{content_item_id}/explain`
   - returns explain/debug detail for operator inspection
4. `GET /channels`
   - reflects persisted channel rows
   - exposes only safe auth summary such as `has_authorization_header`, never the raw `Authorization` secret
5. `GET /dashboard/summary`
   - stays consistent with the system-selected collection totals

User-bound read surfaces require a real `user_id` from the active session and are easiest to check after the web flow is live:

- `GET /users/{user_id}/interests`
- `GET /users/{user_id}/matches`
- `GET /users/{user_id}/notifications`

## Moderation and Repair

Run these checks after at least one editorial item is visible in the system-selected collection.

1. Open the admin article list.
2. Open one article detail page at `/articles/{doc_id}`.
3. Confirm the page shows:
   - article title
   - enrichment debug information
   - `Retry enrichment`
4. Block the article.
5. Confirm `GET /maintenance/articles/{doc_id}` reports `visibility_state = blocked`.
6. Unblock the article.
7. Confirm `visibility_state = visible` again.
8. Create an admin-managed user interest for the same `user_id`.
9. Wait for it to compile.
10. Verify the historical auto-sync behavior:
    - the historical article gains the expected interest match
    - no retro notification is sent
    - no retro suppression row is created
11. Queue a backfill from `/reindex`.
12. If you want historical article repair to also replay fetchers-owned enrichment, enable `Also rerun fetchers-owned article enrichment`. Leave `Force rerun even already enriched articles` off unless you intentionally want a broad rerun.
13. Verify the backfill completes without changing historical match cardinality or creating retro notifications.
14. If enrichment replay was enabled, verify the repaired article now shows truthful `enriched` or `skipped` state, and that skipped replay can still persist feed HTML/media without resending notifications.
15. Trigger `Retry enrichment` on a fresh article and confirm the retry queues and completes without deleting notification history.

## Delivery Checks

### Email digest

1. Keep `EMAIL_DIGEST_SMTP_URL=smtp://mailpit:1025`.
2. After a matched fresh article appears, open Mailpit at `http://127.0.0.1:8025/`.
3. Confirm the local email sink received the expected digest/delivery message.

### Optional web push

1. Verify `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_PRIVATE_KEY` are configured.
2. Open the web settings page in a browser that can receive notifications locally.
3. Connect the `web_push` channel and allow notifications.
4. Trigger a fresh article that matches the active user interest.
5. Confirm:
   - the subscription row is persisted
   - the browser receives the push
   - the service worker shows the notification
6. Treat browser receipt as manual-only proof; it is intentionally outside the automated acceptance suite.

### Optional Telegram

1. Set `TELEGRAM_BOT_TOKEN`.
2. In the web settings page, connect a Telegram channel with a real `chat_id`.
3. Trigger a fresh matching article.
4. Confirm the message arrives in Telegram.

If the bot token or chat id is missing, delivery failure is an environment issue, not a product regression.

## Optional Discovery

Discovery is not part of the canonical safe-by-default MVP path.

Only test it if you intentionally opt in:

1. Follow the discovery env/bootstrap section in [README.md](../../../README.md) and use [DISCOVERY_MODE_TESTING.md](./examples/DISCOVERY_MODE_TESTING.md) as the dedicated operator handbook for this subsystem.
2. Enable `DISCOVERY_ENABLED=1`.
3. Run `pnpm test:discovery-enabled:compose` before trusting a live manual run.
4. Run `pnpm test:discovery:examples:compose` if you want the shipped Example B/C profile-backed proof lane and the emitted `manualReplaySettings` that can then be replayed through the discovery overview and focused routes under `/admin/discovery`.
5. Run `pnpm test:discovery:admin:compose` if you also want the bounded admin/operator acceptance contour for missions, candidates, feedback, recall state, promotion wiring, and visible profile/version fields before manual clicking.
6. If discovery approves a public JS-heavy website candidate with browser assistance recommended, keep the resulting source as `website` and verify any browser provenance on `/resources` instead of treating it as RSS.

Keep discovery findings separate from the core MVP run because the committed baseline still ships with discovery disabled.

## Cleanup and Reset

### Normal shutdown

Use:

```sh
pnpm dev:mvp:internal:down
```

This keeps volumes and is the default choice after a normal manual run.

### When to use a full reset

Use:

```sh
pnpm dev:mvp:internal:down:volumes
```

only when one of these is true:

- migrations changed and the existing DB state is no longer trustworthy;
- repeated manual runs left enough residue that feed, auth, or delivery findings are ambiguous;
- you need a clean-room rerun of the entire local MVP baseline.

This is destructive for local state and should be treated as an intentional reset, not a routine stop command.

### Stateful cleanup checklist

Before closing a manual test cycle, check whether you created temporary artifacts that should not persist:

- Firebase proof admin users or `+alias` identities
- temporary RSS channels
- temporary user interests
- `web_push` subscriptions or notification channels
- Telegram channels bound to a temporary chat id

If the artifact existed only for the current run, remove it or record the residue in `.aidp/work.md` during an active implementation item.

## Truthful Residual Gaps

These are still real after this runbook:

- umbrella automated acceptance remains RSS-first;
- dedicated website operator acceptance now exists separately via `pnpm test:website:admin:compose`, and that smoke now self-bootstraps the compose baseline instead of requiring a manual restart after `pnpm integration_tests`;
- dedicated admin/operator proof for current `website` source CRUD and resources lives in `pnpm test:website:admin:compose`; `api`, inbound `email_imap` and Telegram ingestion are parked outside the mandatory contour;
- sequence/outbox operator tooling lives in `node infra/scripts/test-automation-admin-flow.mjs`;
- browser receipt for `web_push` remains manual-only;
- `youtube` remains code-present but outside the committed admin/operator baseline;
- the repo does not ship a canonical real external RSS bundle;
- cross-browser and cross-platform push behavior remains outside the local baseline.
