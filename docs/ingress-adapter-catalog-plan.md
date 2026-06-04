# План внедрения Ingress Adapter Catalog для SignalOps

> **Current status:** this document is retained as design/implementation notes. The active runtime model now uses `ingress_adapter_catalog` plus `source_channel_adapter_binding`; legacy `config_json.adapterStrategy` and API `adapterKey` values are diagnostics/migration evidence, not runtime-selection truth.

## 0. Короткое решение

Нужно не строить тяжелую “платформу плагинов” сразу, а ввести единый **Ingress Adapter Catalog** для всех входных адаптеров.

Целевая модель для MVP:

```text
Ingress Adapter Catalog
  ├─ declarative adapters из БД / админки / MCP
  ├─ builtin adapters из services/fetchers
  └─ compatibility wrappers для уже существующих RSS/API/website/email paths

Source Channel
  └─ Source Channel Adapter Binding
       └─ adapter_key + adapter_config_json + selection_mode

Fetchers
  └─ Adapter Resolver
       ├─ explicit binding
       ├─ provider default when no valid binding exists
       ├─ match rules / priority recommendation
       └─ provider poller / recipe runtime
```

**MVP-граница:**

- да: декларативные рецепты;
- да: ручные builtin TypeScript-адаптеры;
- да: единый каталог, binding, dry-run, админка, MCP-инструменты;
- нет: sandbox JS/WASM runtime;
- нет: версионирование adapter versions;
- нет: approval workflow как отдельная подсистема;
- нет: сложный scoring engine для выбора.

Главная цель — объединить уже существующие механизмы:

- RSS `adapterStrategy`;
- API `adapterKey`;
- generic API JSON mapping;
- website generic discovery;
- IMAP generic polling;
- discovery adapter research catalog;
- admin channel forms;
- MCP channel/discovery tools.

После внедрения все они должны отражаться в одном месте: **каталог адаптеров + binding канала к адаптеру**.

---

## 1. Архитектурные инварианты

Новый слой должен соблюдать текущие границы системы.

### 1.1. Ingest остается во `services/fetchers`

Ingress adapters — это часть acquisition/ingest слоя. Они не должны становиться UTE TaskPlugins и не должны исполняться Python worker-ами как основной hot ingest.

Правильная граница:

```text
source_channels
  -> services/fetchers
  -> signal_candidates / web_resources / document_observations
  -> outbox_events
  -> relay
  -> q.sequence
  -> workers / UTE
```

### 1.2. Adapter не пишет в БД напрямую

Adapter возвращает только drafts:

```ts
interface IngressAdapterRunResult {
  signal_candidates?: SignalCandidateDraft[];
  resources?: WebResourceDraft[];
  diagnostics?: AdapterDiagnostic[];
  cursorUpdates?: CursorUpdate[];
  providerMetrics?: Record<string, unknown>;
}
```

Persistence остается в fetchers-owned repository layer:

```text
adapter -> drafts -> fetcher validation -> persistSignalCandidate / persistWebsiteResource -> outbox
```

### 1.3. PostgreSQL остается source of truth

Каталог адаптеров, bindings, audit и operator-visible state должны жить в PostgreSQL. Redis/BullMQ не становятся владельцами этих решений.

### 1.4. Website не превращается в RSS shortcut

Для `website` provider canonical path остается:

```text
website channel -> web_resources -> optional projection into signal_candidates
```

Hidden feeds могут быть discovery hint/optimization, но не должны silently менять `provider_type` на `rss`.

### 1.5. Browser fallback остается настройкой website channel

`browserFallbackEnabled` — это bounded capability текущего website provider-а, а не отдельный provider и не отдельный “плагин браузера” на MVP.

### 1.6. Secrets не живут в adapter config

`adapter_config_json` и `source_channels.config_json` остаются non-secret. Секреты и static authorization headers живут отдельно в `source_channels.auth_config_json` или будущем secret store.

### 1.7. Выбор адаптера должен быть sticky

Не выбирать адаптер заново на каждом poll. Иначе возможны flapping, cursor drift и дубли.

Правило:

```text
auto recommendation может предложить adapter;
activation создает binding;
poll использует binding, пока его явно не изменили.
```

---

## 2. Что уже есть и что переносим

### 2.1. RSS feed-ingress adapters

Сейчас в `services/fetchers/src/feed-ingress-adapters.ts` уже есть отдельный adapter layer.

Текущие стратегии:

| Сейчас | Target adapter_key | Runtime | Provider | Output | Что делает |
|---|---|---|---|---|---|
| `generic` | `rss.generic` | `builtin` | `rss` | `signal_candidates` | Обычный RSS/Atom/JSON Feed parse через extractus path. |
| `reddit_search_rss` | `rss.reddit_search_rss` | `builtin` | `rss` | `signal_candidates` | Нормализация Reddit search feed. |
| `hn_comments_feed` | `rss.hn_comments_feed` | `builtin` | `rss` | `signal_candidates` | HN discussion provenance, extraction target URL, suppression comment updates. |
| `google_news_rss` | `rss.google_news_rss` | `builtin` | `rss` | `signal_candidates` | Google News wrapper URL resolution to publisher URL. |

Compatibility behavior:

```text
config_json.adapterStrategy wins;
otherwise infer by fetch_url;
otherwise rss.generic.
```

После миграции:

```text
source_channel_adapter_binding.adapter_key wins;
legacy config_json.adapterStrategy is read only as fallback and migration input.
```

### 2.2. API adapter registry

Сейчас API adapter registry живет как hardcoded `adapterKey` list + registry in `services/fetchers/src/api-adapter-registry.ts`.

Target mapping:

| Сейчас `adapterKey` | Target adapter_key | Runtime | Provider | Output | Notes |
|---|---|---|---|---|---|
| `hn_algolia_search` | `api.hn_algolia_search` | `builtin` | `api` | `signal_candidates` | Official/public JSON API style. |
| `github_issues_search` | `api.github_issues_search` | `builtin` | `api` | `signal_candidates` | GitHub issues/search source. |
| `stack_exchange_search` | `api.stack_exchange_search` | `builtin` | `api` | `signal_candidates` | Stack Exchange API/search. |
| `ddgs_search` | `api.ddgs_search` | `builtin` | `api` | `signal_candidates` | Current DDGS bridge; should stay cautious. |
| `searxng_search` | `api.searxng_search` | `builtin` | `api` | `signal_candidates` | Search adapter. |
| `brave_search` | `api.brave_search` | `builtin` | `api` | `signal_candidates` | Search adapter, needs API key. |
| `tavily_search` | `api.tavily_search` | `builtin` | `api` | `signal_candidates` | Search adapter, needs API key. |
| `exa_search` | `api.exa_search` | `builtin` | `api` | `signal_candidates` | Search adapter, needs API key. |
| `serpapi_google_news_research` | `api.serpapi_google_news_research` | `builtin` | `api` | `signal_candidates` | Research/search lane. |
| `discourse_search` | `api.discourse_search` | `builtin` | `api` | `signal_candidates` | Forum/community search. |
| `greenhouse_job_board` | `api.greenhouse_job_board` | `builtin` | `api` | `signal_candidates` | ATS job board. |
| `lever_postings` | `api.lever_postings` | `builtin` | `api` | `signal_candidates` | ATS job board. |
| `ashby_job_postings` | `api.ashby_job_postings` | `builtin` | `api` | `signal_candidates` | ATS job board. |
| `remotive_jobs` | `api.remotive_jobs` | `builtin` | `api` | `signal_candidates` | Remote jobs. |
| `remoteok_jobs` | `api.remoteok_jobs` | `builtin` | `api` | `signal_candidates` | Remote jobs. |
| `weworkremotely_rss` | `rss.weworkremotely_jobs` or `api.weworkremotely_rss` | `builtin` | `rss` preferred | `signal_candidates` | Prefer RSS provider if the source is actually RSS; keep compatibility alias. |
| `peopleperhour_public_projects_research` | `api.peopleperhour_public_projects_research` | `builtin` | `api` | `signal_candidates` | Research-only marketplace signal. |
| `freelancer_public_projects_research` | `api.freelancer_public_projects_research` | `builtin` | `api` | `signal_candidates` | Research-only marketplace signal. |
| `guru_public_projects_research` | `api.guru_public_projects_research` | `builtin` | `api` | `signal_candidates` | Research-only marketplace signal. |
| `malt_public_projects_research` | `api.malt_public_projects_research` | `builtin` | `api` | `signal_candidates` | Research-only marketplace signal. |
| `contra_public_search_research` | `api.contra_public_search_research` | `builtin` | `api` | `signal_candidates` | Research-only marketplace signal. |
| `upwork_public_signal_research` | `api.upwork_public_signal_research` | `builtin` | `api` | `signal_candidates` | Research-only; no auto-select by default. |
| `linkedin_public_signal_research` | `api.linkedin_public_signal_research` | `builtin` | `api` | `signal_candidates` | Research-only; no auto-select by default. |

Generic API JSON mapping becomes a declarative adapter:

| Сейчас | Target adapter_key | Runtime | Provider | Output |
|---|---|---|---|---|
| API channel without adapterKey, with `itemsPath`, `titleField`, etc. | `api.generic_json_mapping` | `declarative` | `api` | `signal_candidates` |

### 2.3. Website provider

Current website poller is already provider-level generic discovery/extraction.

Target catalog rows:

| Сейчас | Target adapter_key | Runtime | Provider | Output | Notes |
|---|---|---|---|---|---|
| Website cheap/static discovery | `website.generic_discovery` | `builtin` | `website` | `web_resources` | Sitemap/feed/collection/inline_data/download discovery, rough classification, persistence. |
| Browser-assisted fallback | not separate adapter in MVP | capability/config | `website` | `web_resources` | Controlled by `browserFallbackEnabled` and `maxBrowserFetchesPerPoll`. |
| Editorial projection | `website.editorial_projection` optional later | builtin | `website` | `signal_candidates` | Keep as current internal behavior first; do not split until needed. |

MVP binding for every website channel:

```text
adapter_key = website.generic_discovery
```

### 2.4. Email IMAP provider

Target catalog row:

| Сейчас | Target adapter_key | Runtime | Provider | Output | Notes |
|---|---|---|---|---|---|
| Generic IMAP mailbox polling | `email_imap.generic_mailbox` | `builtin` | `email_imap` | `signal_candidates` | No special plugin layer yet; wrap current poller. |

### 2.5. Discovery adapter research catalog

The old static thematic discovery research catalog has been removed. Adapter discovery now needs to join through canonical adapter keys and live catalog/binding surfaces instead of a separate hardcoded product catalog.

Target:

```text
research/source-family metadata -> ingress_adapter_catalog.metadata_json
```

or:

```text
static research catalog joins by adapter_key with ingress_adapter_catalog
```

MVP choice after cutover: keep runtime adapter identity in `ingress_adapter_catalog`; use MCP/admin/API reads for operator discovery and treat any old static catalog rows as historical design notes only.

---

## 3. Target data model

MVP uses **two required tables** and **one optional observability extension**.

### 3.1. `ingress_adapter_catalog`

```sql
create table if not exists ingress_adapter_catalog (
  adapter_key text primary key,
  title text not null,
  description text not null default '',

  runtime_kind text not null,
  provider_type text not null,
  output_mode text not null,
  status text not null default 'active',

  priority int not null default 100,
  match_rules_json jsonb not null default '{}'::jsonb,
  config_schema_json jsonb not null default '{}'::jsonb,
  recipe_json jsonb,
  module_name text,
  metadata_json jsonb not null default '{}'::jsonb,

  is_system boolean not null default false,
  editable boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ingress_adapter_catalog_runtime_check
    check (runtime_kind in ('declarative', 'builtin')),

  constraint ingress_adapter_catalog_provider_check
    check (provider_type in ('rss', 'website', 'api', 'email_imap', 'youtube')),

  constraint ingress_adapter_catalog_output_check
    check (output_mode in ('signal_candidates', 'web_resources', 'mixed')),

  constraint ingress_adapter_catalog_status_check
    check (status in ('active', 'draft', 'disabled', 'archived')),

  constraint ingress_adapter_catalog_match_rules_object_check
    check (jsonb_typeof(match_rules_json) = 'object'),

  constraint ingress_adapter_catalog_config_schema_object_check
    check (jsonb_typeof(config_schema_json) = 'object'),

  constraint ingress_adapter_catalog_metadata_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create index if not exists ingress_adapter_catalog_provider_idx
  on ingress_adapter_catalog (provider_type, status);

create index if not exists ingress_adapter_catalog_runtime_idx
  on ingress_adapter_catalog (runtime_kind, status);
```

Recommended `metadata_json` shape:

```json
{
  "sourceRole": "ats_job_board",
  "researchMode": "official_api",
  "autoSelect": true,
  "risk": {
    "tosRisk": "low",
    "requiresAuth": false,
    "researchOnly": false
  },
  "capabilities": ["fetch:json", "pagination"],
  "legacy": {
    "apiAdapterKey": "greenhouse_job_board",
    "rssAdapterStrategy": null
  }
}
```

### 3.2. `source_channel_adapter_binding`

```sql
create table if not exists source_channel_adapter_binding (
  channel_id uuid primary key references source_channels(channel_id) on delete cascade,
  adapter_key text not null references ingress_adapter_catalog(adapter_key),
  config_json jsonb not null default '{}'::jsonb,
  selection_mode text not null default 'manual',
  enabled boolean not null default true,
  selected_by text,
  selection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint source_channel_adapter_binding_mode_check
    check (selection_mode in ('manual', 'mcp', 'auto', 'migration', 'builtin_default')),

  constraint source_channel_adapter_binding_config_object_check
    check (jsonb_typeof(config_json) = 'object')
);

create index if not exists source_channel_adapter_binding_adapter_idx
  on source_channel_adapter_binding(adapter_key);
```

### 3.3. Optional: adapter observability in `channel_fetch_runs`

Add after basic binding works:

```sql
alter table channel_fetch_runs
  add column if not exists adapter_key text,
  add column if not exists adapter_runtime_kind text,
  add column if not exists adapter_selection_mode text;

create index if not exists channel_fetch_runs_adapter_started_idx
  on channel_fetch_runs(adapter_key, started_at desc)
  where adapter_key is not null;
```

This makes fetch history and admin diagnostics adapter-aware without changing core persistence.

### 3.4. Audit

Use existing `audit_log` rather than creating a new audit table.

Events to write:

```text
ingress_adapter.created
ingress_adapter.updated
ingress_adapter.disabled
ingress_adapter.dry_run
ingress_adapter.binding.created
ingress_adapter.binding.updated
ingress_adapter.binding.deleted
ingress_adapter.recommendation.generated
```

---

## 4. Adapter descriptor

Every adapter in the catalog should expose a minimal descriptor. This descriptor is useful for admin UI, MCP, dry-run, recommendation and documentation.

```ts
export interface IngressAdapterDescriptor {
  adapterKey: string;
  title: string;
  description: string;
  runtime: 'declarative' | 'builtin';
  providerType: 'rss' | 'website' | 'api' | 'email_imap' | 'youtube';
  outputMode: 'signal_candidates' | 'web_resources' | 'mixed';
  priority: number;
  status: 'active' | 'draft' | 'disabled' | 'archived';
  match: AdapterMatchRules;
  configSchema: Record<string, unknown>;
  recipe?: DeclarativeIngressRecipe;
  metadata?: Record<string, unknown>;
}

export interface AdapterMatchRules {
  urlHostContains?: string[];
  urlPathContains?: string[];
  urlPathExcludes?: string[];
  contentType?: string[];
  jsonPathExists?: string[];
  htmlSelectorExists?: string[];
  providerConfigFlags?: Record<string, unknown>;
  allowAutoSelect?: boolean;
}
```

### Example: Greenhouse builtin descriptor

```json
{
  "adapterKey": "api.greenhouse_job_board",
  "title": "Greenhouse Job Board API",
  "description": "Reads public Greenhouse job board endpoints and emits job posting signal_candidate drafts.",
  "runtime": "builtin",
  "providerType": "api",
  "outputMode": "signal_candidates",
  "priority": 200,
  "status": "active",
  "match": {
    "urlHostContains": ["greenhouse.io", "boards-api.greenhouse.io"],
    "allowAutoSelect": true
  },
  "configSchema": {
    "type": "object",
    "properties": {
      "boardToken": { "type": "string" },
      "endpoint": { "type": "string", "format": "uri" },
      "maxItems": { "type": "integer", "default": 50 }
    }
  },
  "metadata": {
    "sourceRole": "ats_job_board",
    "researchMode": "official_api",
    "risk": { "tosRisk": "low", "researchOnly": false }
  }
}
```

### Example: generic JSON API declarative recipe

```json
{
  "adapterKey": "api.generic_json_mapping",
  "title": "Generic JSON API Mapping",
  "description": "Fetches a JSON endpoint and maps items into signal_candidate drafts using JSONPath-like field selectors.",
  "runtime": "declarative",
  "providerType": "api",
  "outputMode": "signal_candidates",
  "priority": 20,
  "status": "active",
  "match": {
    "contentType": ["application/json"],
    "allowAutoSelect": false
  },
  "configSchema": {
    "type": "object",
    "required": ["endpoint", "itemsPath", "titleField", "urlField"],
    "properties": {
      "endpoint": { "type": "string", "format": "uri" },
      "itemsPath": { "type": "string" },
      "titleField": { "type": "string" },
      "leadField": { "type": "string" },
      "bodyField": { "type": "string" },
      "urlField": { "type": "string" },
      "publishedAtField": { "type": "string" },
      "externalIdField": { "type": "string" },
      "languageField": { "type": "string" },
      "maxItems": { "type": "integer", "default": 50 }
    }
  },
  "recipe": {
    "request": {
      "method": "GET",
      "url": "{{config.endpoint}}"
    },
    "items": "{{config.itemsPath}}",
    "map": {
      "externalId": "{{config.externalIdField}}",
      "url": "{{config.urlField}}",
      "title": "{{config.titleField}}",
      "lead": "{{config.leadField}}",
      "body": "{{config.bodyField}}",
      "publishedAt": "{{config.publishedAtField}}",
      "language": "{{config.languageField}}"
    }
  }
}
```

---

## 5. Adapter resolution rules

MVP resolver must be deterministic and simple.

### 5.1. Resolution order

```text
1. Active explicit binding
   source_channel_adapter_binding.channel_id

2. Legacy compatibility fallback
   rss config_json.adapterStrategy
   api config_json.api.adapterKey / config_json.adapter.adapterKey / config_json.adapterKey

3. Candidate recommendation
   provider_type + match_rules_json + priority

4. Tie handling
   if multiple top candidates have same priority, do not auto-bind;
   return recommendations to admin/MCP.

5. Default provider adapter
   rss.generic
   website.generic_discovery
   api.generic_json_mapping only if generic mapping config exists
   email_imap.generic_mailbox
```

### 5.2. No per-poll auto-selection

Resolver can recommend, but poll execution should use a concrete selected adapter.

Recommended behavior:

```text
on channel create/import:
  resolve recommendation
  if exactly one safe candidate -> create binding with selection_mode='auto' or 'migration'
  otherwise leave unbound and show recommendations

on poll:
  if binding exists -> use binding
  else -> legacy fallback / provider default
```

### 5.3. Pseudo-code

```ts
async function resolveAdapterBinding(channel: SourceChannelRow): Promise<ResolvedAdapterBinding> {
  const explicit = await adapterBindingRepository.findActive(channel.channelId);
  if (explicit) {
    return { source: 'binding', binding: explicit };
  }

  const legacy = await resolveLegacyAdapterBinding(channel);
  if (legacy) {
    return { source: 'legacy_config', binding: legacy };
  }

  const recommendation = await recommendAdapterForChannel(channel);
  if (recommendation.autoBindable) {
    return { source: 'recommended_default', binding: recommendation.toEphemeralBinding() };
  }

  return { source: 'provider_default', binding: defaultAdapterForProvider(channel.providerType) };
}
```

### 5.4. Recommendation result

```ts
interface AdapterRecommendation {
  adapterKey: string;
  title: string;
  priority: number;
  matchedRules: string[];
  failedRules: string[];
  autoBindable: boolean;
  reason: string;
}
```

This is enough for admin UI and MCP. No complex score required in MVP.

---

## 6. Fetchers implementation plan

### 6.1. New directory layout

```text
services/fetchers/src/ingress-adapters/
  types.ts
  catalog.ts
  resolver.ts
  match-rules.ts
  declarative-api-runtime.ts
  run-bound-adapter.ts
  builtin/
    rss/
      generic.ts
      reddit-search-rss.ts
      hn-comments-feed.ts
      google-news-rss.ts
    api/
      registry-wrapper.ts
      generic-json-mapping.ts
    website/
      generic-discovery.ts
    email-imap/
      generic-mailbox.ts
```

### 6.2. Keep old code, wrap it first

Do **not** rewrite provider pollers during the first stage. Wrap existing code:

```text
rss.* adapters -> call current feed-ingress-adapters.ts
api.* adapters -> call current api-adapter-registry.ts
api.generic_json_mapping -> reuse current generic API mapping code
website.generic_discovery -> call current pollWebsiteProviderChannel
email_imap.generic_mailbox -> call current pollEmailImapProviderChannel
```

This makes the migration mostly additive.

### 6.3. Modify `pollLoadedChannel`

Current shape is provider switch. New shape:

```ts
private async pollLoadedChannel(channel: SourceChannelRow, startedAt: string): Promise<void> {
  const resolved = await resolveAdapterBinding(channel, this.pool);

  if (resolved.binding) {
    await pollWithIngressAdapter(channel, startedAt, resolved, {
      pool: this.pool,
      userAgent: this.userAgent,
      requestTimeoutMs: this.requestTimeoutMs,
      maxItemsPerPoll: this.maxItemsPerPoll
    });
    return;
  }

  await pollWithLegacyProviderSwitch(channel, startedAt);
}
```

For the first rollout, `pollWithIngressAdapter` may still delegate to existing provider functions. The important change is that metrics and selection are adapter-aware.

### 6.4. Builtin adapter interface

```ts
export interface BuiltinIngressAdapter {
  descriptor: IngressAdapterDescriptor;

  poll(input: BuiltinIngressAdapterPollInput): Promise<BuiltinIngressAdapterPollResult>;

  dryRun?(input: BuiltinIngressAdapterDryRunInput): Promise<IngressAdapterDryRunResult>;
}
```

MVP wrappers can have a thin `poll()` implementation:

```ts
export const websiteGenericDiscoveryAdapter: BuiltinIngressAdapter = {
  descriptor: WEBSITE_GENERIC_DISCOVERY_DESCRIPTOR,
  async poll(input) {
    return pollWebsiteProviderChannel(input.channel, input.startedAt, input.runtimeOptions);
  }
};
```

### 6.5. Declarative API runtime

Only implement the declarative runtime for generic HTTP JSON in MVP.

Supported features:

```text
GET request
static headers from non-secret config only
items selector
field mapping
max items
simple pagination if already supported by current generic API path
```

Not supported in MVP:

```text
custom code
browser execution
arbitrary imports
auth secrets in recipe
complex joins
side effects
```

### 6.6. Dry-run endpoint inside fetchers

Add an internal fetchers endpoint:

```text
POST /internal/ingress-adapters/dry-run
```

Input:

```json
{
  "adapterKey": "api.generic_json_mapping",
  "channelId": "optional-existing-channel-id",
  "providerType": "api",
  "fetchUrl": "https://example.com/jobs.json",
  "config": {},
  "limit": 5
}
```

Output:

```json
{
  "adapterKey": "api.generic_json_mapping",
  "status": "ok",
  "itemsPreview": [
    { "title": "...", "url": "...", "externalId": "..." }
  ],
  "diagnostics": [],
  "providerMetrics": {
    "fetchedItemCount": 5,
    "validDraftCount": 5
  }
}
```

Dry-run must not write signal_candidates, resources, cursors or outbox rows.

### 6.7. Fetch run metrics

Every poll should include adapter metadata in `channel_fetch_runs`:

```json
{
  "adapterKey": "rss.google_news_rss",
  "adapterRuntimeKind": "builtin",
  "adapterSelectionMode": "migration",
  "legacyAdapterStrategy": "google_news_rss",
  "adapterDiagnostics": []
}
```

For website resources, also preserve existing website metrics:

```json
{
  "staticAcceptedCount": 12,
  "browserAttempted": false,
  "browserOnlyAcceptedCount": 0,
  "resourceKindCounts": {
    "editorial": 8,
    "document": 4
  }
}
```

---

## 7. `packages/contracts` changes

Add shared types in `packages/contracts/src/source.ts` or a new `packages/contracts/src/ingress-adapters.ts`.

Recommended new exports:

```ts
export const INGRESS_ADAPTER_RUNTIME_KINDS = ['declarative', 'builtin'] as const;
export const INGRESS_ADAPTER_OUTPUT_MODES = ['signal_candidates', 'web_resources', 'mixed'] as const;
export const INGRESS_ADAPTER_STATUSES = ['active', 'draft', 'disabled', 'archived'] as const;

export type IngressAdapterRuntimeKind = (typeof INGRESS_ADAPTER_RUNTIME_KINDS)[number];
export type IngressAdapterOutputMode = (typeof INGRESS_ADAPTER_OUTPUT_MODES)[number];
export type IngressAdapterStatus = (typeof INGRESS_ADAPTER_STATUSES)[number];

export interface SourceChannelAdapterBindingContract {
  channelId: string;
  adapterKey: string;
  config: Record<string, unknown>;
  selectionMode: 'manual' | 'mcp' | 'auto' | 'migration' | 'builtin_default';
  enabled: boolean;
}
```

Compatibility:

```text
Keep API_ADAPTER_KEYS and FEED_INGRESS_ADAPTER_STRATEGIES during migration.
Mark them legacy in comments after the catalog is live.
Do not remove until admin UI, MCP, fetchers and tests use catalog paths.
```

---

## 8. Database migration and seed plan

### 8.1. Migration A: catalog tables

Create:

```text
ingress_adapter_catalog
source_channel_adapter_binding
optional channel_fetch_runs adapter columns
```

### 8.2. Migration B: seed system adapters

Seed all existing builtin adapters with `is_system=true` and `editable=false`.

Example seed row:

```sql
insert into ingress_adapter_catalog (
  adapter_key,
  title,
  description,
  runtime_kind,
  provider_type,
  output_mode,
  priority,
  match_rules_json,
  config_schema_json,
  module_name,
  metadata_json,
  is_system,
  editable
) values (
  'rss.google_news_rss',
  'Google News RSS',
  'RSS adapter that resolves Google News wrapper URLs to publisher URLs.',
  'builtin',
  'rss',
  'signal_candidates',
  150,
  '{"urlHostContains":["news.google.com"],"urlPathContains":["/rss"],"allowAutoSelect":true}'::jsonb,
  '{}'::jsonb,
  'builtin.rss.google_news_rss',
  '{"legacy":{"rssAdapterStrategy":"google_news_rss"}}'::jsonb,
  true,
  false
) on conflict (adapter_key) do update set
  title = excluded.title,
  description = excluded.description,
  match_rules_json = excluded.match_rules_json,
  metadata_json = excluded.metadata_json,
  updated_at = now();
```

### 8.3. Migration C: backfill bindings

Backfill order:

```text
1. RSS channels
2. API channels
3. Website channels
4. Email IMAP channels
```

RSS example:

```sql
insert into source_channel_adapter_binding (
  channel_id,
  adapter_key,
  config_json,
  selection_mode,
  selected_by,
  selection_reason
)
select
  channel_id,
  case
    when config_json ->> 'adapterStrategy' = 'reddit_search_rss' then 'rss.reddit_search_rss'
    when config_json ->> 'adapterStrategy' = 'hn_comments_feed' then 'rss.hn_comments_feed'
    when config_json ->> 'adapterStrategy' = 'google_news_rss' then 'rss.google_news_rss'
    when fetch_url ilike '%news.google.com/rss%' then 'rss.google_news_rss'
    when fetch_url ilike '%hnrss.org%' then 'rss.hn_comments_feed'
    when fetch_url ilike '%reddit.com/search.rss%' then 'rss.reddit_search_rss'
    else 'rss.generic'
  end as adapter_key,
  '{}'::jsonb,
  'migration',
  'migration',
  'Backfilled from legacy RSS adapterStrategy/fetch_url inference'
from source_channels
where provider_type = 'rss'
on conflict (channel_id) do nothing;
```

API example:

```sql
insert into source_channel_adapter_binding (
  channel_id,
  adapter_key,
  config_json,
  selection_mode,
  selected_by,
  selection_reason
)
select
  channel_id,
  case
    when coalesce(
      config_json #>> '{api,adapterKey}',
      config_json #>> '{adapter,adapterKey}',
      config_json #>> '{adapterKey}'
    ) is not null
    then 'api.' || coalesce(
      config_json #>> '{api,adapterKey}',
      config_json #>> '{adapter,adapterKey}',
      config_json #>> '{adapterKey}'
    )
    else 'api.generic_json_mapping'
  end as adapter_key,
  '{}'::jsonb,
  'migration',
  'migration',
  'Backfilled from legacy API adapterKey or generic mapping config'
from source_channels
where provider_type = 'api'
on conflict (channel_id) do nothing;
```

Website example:

```sql
insert into source_channel_adapter_binding (
  channel_id,
  adapter_key,
  config_json,
  selection_mode,
  selected_by,
  selection_reason
)
select
  channel_id,
  'website.generic_discovery',
  '{}'::jsonb,
  'migration',
  'migration',
  'Default website discovery adapter'
from source_channels
where provider_type = 'website'
on conflict (channel_id) do nothing;
```

Email example:

```sql
insert into source_channel_adapter_binding (
  channel_id,
  adapter_key,
  config_json,
  selection_mode,
  selected_by,
  selection_reason
)
select
  channel_id,
  'email_imap.generic_mailbox',
  '{}'::jsonb,
  'migration',
  'migration',
  'Default IMAP mailbox adapter'
from source_channels
where provider_type = 'email_imap'
on conflict (channel_id) do nothing;
```

---

## 9. API / FastAPI plan

Add maintenance endpoints only. Do not expose this in public `/api/*`.

### 9.1. Adapter catalog endpoints

```text
GET    /maintenance/ingress-adapters
GET    /maintenance/ingress-adapters/{adapterKey}
POST   /maintenance/ingress-adapters
PATCH  /maintenance/ingress-adapters/{adapterKey}
POST   /maintenance/ingress-adapters/{adapterKey}/dry-run
POST   /maintenance/ingress-adapters/recommend
```

Rules:

```text
POST/PATCH allowed only for runtime_kind='declarative'.
Builtin system adapters are read-only from API.
Disabled/archived adapters cannot be bound to new channels.
Dry-run requires admin or MCP internal role.
```

### 9.2. Channel binding endpoints

```text
GET    /maintenance/channels/{channelId}/adapter-binding
PUT    /maintenance/channels/{channelId}/adapter-binding
DELETE /maintenance/channels/{channelId}/adapter-binding
GET    /maintenance/channels/{channelId}/adapter-recommendations
```

Binding request:

```json
{
  "adapterKey": "api.greenhouse_job_board",
  "config": {
    "boardToken": "example"
  },
  "selectionMode": "manual"
}
```

### 9.3. Read model additions

Channel read should include:

```json
{
  "adapterBinding": {
    "adapterKey": "rss.google_news_rss",
    "title": "Google News RSS",
    "runtimeKind": "builtin",
    "selectionMode": "migration",
    "enabled": true
  },
  "adapterRecommendations": []
}
```

Fetch run read should include:

```json
{
  "adapterKey": "website.generic_discovery",
  "adapterRuntimeKind": "builtin",
  "adapterSelectionMode": "migration"
}
```

---

## 10. Admin UI plan

### 10.1. New navigation

Add:

```text
Admin -> Sources -> Ingress Adapters
```

or under existing Channels section:

```text
Admin -> Channels -> Adapters
```

### 10.2. Adapter list page

Route:

```text
/admin/ingress-adapters
```

Columns:

```text
Adapter key
Title
Provider
Runtime
Output
Status
Priority
System/editable
Active bindings count
Recent error rate, if available
```

Filters:

```text
provider_type
runtime_kind
status
output_mode
system/custom
research_only
```

### 10.3. Adapter detail page

Route:

```text
/admin/ingress-adapters/[adapterKey]
```

Sections:

```text
Descriptor
Match rules
Config schema
Recipe JSON, if declarative
Metadata/risk
Active channel bindings
Dry-run panel
Audit events
```

For builtin adapters:

```text
read-only descriptor;
show module_name;
show “defined in code, requires rebuild/restart to change”.
```

For declarative adapters:

```text
edit form;
validate button;
dry-run button;
disable/archive actions.
```

### 10.4. Create declarative adapter page

Route:

```text
/admin/ingress-adapters/new
```

Fields:

```text
adapterKey
title
description
providerType
outputMode
priority
match rules JSON
config schema JSON
recipe JSON
status: draft/active
```

The create flow should force:

```text
Validate -> Dry-run -> Save active
```

For MVP, allow save as draft without dry-run.

### 10.5. Channel edit page

Add an “Ingress adapter” card to channel edit pages.

For all providers:

```text
Current adapter binding
Change adapter button
Recommended adapters
Adapter config form generated from config_schema_json
Dry-run selected adapter
```

RSS-specific change:

```text
Current RSS adapterStrategy dropdown becomes catalog-driven.
Legacy adapterStrategy field remains hidden/compatibility only after migration.
```

API-specific change:

```text
Current adapterKey dropdown becomes catalog-driven.
Generic JSON mapping fields are shown when adapter_key = api.generic_json_mapping.
```

Website-specific change:

```text
Show website.generic_discovery binding.
Keep browserFallbackEnabled, collection seeds, allow/block patterns as website channel config.
Do not present browser fallback as provider switch.
```

### 10.6. Bulk import

Update bulk import schema to accept:

```json
{
  "name": "Example",
  "providerType": "rss",
  "fetchUrl": "https://example.com/feed.xml",
  "adapterKey": "rss.generic",
  "adapterConfig": {}
}
```

Compatibility:

```text
Accept old adapterStrategy.
Map old adapterStrategy -> adapterKey.
Show deprecation note in validation preview.
```

### 10.7. Resource/signal_candidate/fetch-run surfaces

Show adapter badges in:

```text
/admin/channels
/admin/channels/[channelId]/edit
/admin/resources
/admin/resources/[resourceId]
/admin/signal-candidates/[docId]
/admin/observability or fetch runs page
```

Example badge:

```text
Ingress adapter: website.generic_discovery · builtin · migration binding
```

---

## 11. MCP plan

MCP should get the same powers as admin UI, but only through maintenance APIs.

### 11.1. New tools

```text
ingress.adapters.list
ingress.adapters.read
ingress.adapters.create_declarative
ingress.adapters.update_declarative
ingress.adapters.dry_run
ingress.adapters.recommend_for_channel
ingress.bindings.read
ingress.bindings.set
ingress.bindings.delete
```

### 11.2. MCP limits

MCP can create and edit only:

```text
runtime_kind = declarative
editable = true
```

MCP cannot:

```text
upload arbitrary code;
edit builtin module_name;
write secrets into adapter config;
bypass dry-run/validation;
force hidden website -> RSS conversion;
auto-enable research_only adapters unless explicitly allowed by operator policy.
```

### 11.3. Existing MCP channel tools

Update existing tools:

```text
channels.bulk_onboard.plan
channels.bulk_onboard.apply
channels.create
channels.update
discovery.probation.handoff
```

to include:

```json
{
  "recommendedAdapterKey": "api.greenhouse_job_board",
  "adapterSelectionReason": "Provider type api and host matches greenhouse.io",
  "adapterConfig": {}
}
```

### 11.4. MCP guide updates

Update MCP operating guidance:

```text
For RSS/API channels, inspect adapter binding before judging channel health.
For website channels, verify fetch_runs and web_resources before signal_candidate selection outcomes.
For research_only adapters, treat output as acquisition signal only unless explicitly promoted.
```

---

## 12. Discovery/control-plane plan

### 12.1. Adapter research catalog

Current static research catalog should be mapped to canonical adapter keys.

Target options:

**MVP:**

```text
Keep ADAPTER_RESEARCH_CATALOG as code;
replace old adapterKey strings with canonical adapter_key values;
join/read adapter metadata from catalog when available.
```

**Post-MVP:**

```text
Move research catalog rows into ingress_adapter_catalog.metadata_json
or separate discovery_adapter_research_profiles table keyed by adapter_key.
```

### 12.2. Source family and bottleneck reads

Update SQL reads that currently do:

```sql
coalesce(sc.config_json #>> '{api,adapterKey}', sc.config_json #>> '{adapter,adapterKey}', sc.config_json #>> '{adapterKey}')
```

to prefer:

```sql
source_channel_adapter_binding.adapter_key
```

Fallback to legacy config only while migration is incomplete.

### 12.3. Promotion flow

When discovery promotes candidate into `source_channels`:

```text
1. create source_channels row
2. emit source.channel.sync.requested as today
3. compute adapter recommendation
4. create source_channel_adapter_binding if exactly one safe candidate
5. otherwise store recommendations for operator review
```

### 12.4. Quality metrics separation

Do not choose adapters by downstream selected-content yield.

Adapter/source quality should use generic intake metrics:

```text
fetch health
freshness
unique item ratio
duplicate pressure
field coverage
valid draft count
resource kind mix
```

Downstream selection results belong to matching/selection, not adapter quality.

---

## 13. Manual plugin addition

### 13.1. Manual declarative adapter through admin

Operator flow:

```text
Admin -> Ingress Adapters -> New Adapter
  -> runtime = declarative
  -> fill descriptor
  -> fill config schema
  -> fill recipe JSON
  -> validate
  -> dry-run
  -> save active
  -> bind to channel
```

This is the main “manual plugin” path for non-developers and MCP.

### 13.2. Manual builtin adapter in repo

Developer flow:

```text
1. Add adapter implementation:
   services/fetchers/src/ingress-adapters/builtin/api/my-adapter.ts

2. Add descriptor:
   services/fetchers/src/ingress-adapters/builtin/api/my-adapter.manifest.ts

3. Register in builtin catalog:
   services/fetchers/src/ingress-adapters/builtin/index.ts

4. Add seed row or descriptor sync.

5. Add unit/smoke tests.

6. Rebuild/restart fetchers.
```

Example:

```ts
export const descriptor: IngressAdapterDescriptor = {
  adapterKey: 'api.my_vendor_jobs',
  title: 'My Vendor Jobs API',
  description: 'Reads My Vendor public jobs API.',
  runtime: 'builtin',
  providerType: 'api',
  outputMode: 'signal_candidates',
  priority: 180,
  status: 'active',
  match: {
    urlHostContains: ['api.myvendor.example'],
    allowAutoSelect: true
  },
  configSchema: {
    type: 'object',
    required: ['endpoint'],
    properties: {
      endpoint: { type: 'string', format: 'uri' }
    }
  },
  metadata: {
    sourceRole: 'jobs',
    risk: { tosRisk: 'low', researchOnly: false }
  }
};
```

### 13.3. Manual SQL seed/import

For deployment-owned adapters, allow SQL seed or migration rows:

```text
database/seeds/ingress-adapters.sql
```

This is useful for system adapters but not the preferred path for operator-created recipes.

### 13.4. No manual arbitrary code upload in MVP

Do not allow admin/MCP to upload JS/TS code as runtime plugin in MVP.

Reason:

```text
Need sandbox, dependency policy, SSRF guard, secret isolation, CPU/memory limits, artifact verification.
```

That is a separate post-MVP project.

---

## 14. Migration of existing UI and config fields

### 14.1. RSS `adapterStrategy`

Current field:

```text
source_channels.config_json.adapterStrategy
```

Target:

```text
source_channel_adapter_binding.adapter_key
```

Compatibility:

```text
adapterStrategy remains readable;
admin displays it as legacy;
new writes go to binding;
old field can stay for old scripts until final cleanup.
```

Mapping:

```text
generic -> rss.generic
reddit_search_rss -> rss.reddit_search_rss
hn_comments_feed -> rss.hn_comments_feed
google_news_rss -> rss.google_news_rss
```

### 14.2. API `adapterKey`

Current possible locations:

```text
config_json.api.adapterKey
config_json.adapter.adapterKey
config_json.adapterKey
```

Target:

```text
source_channel_adapter_binding.adapter_key = api.<legacy_adapterKey>
```

Compatibility:

```text
read old locations;
write new binding;
show old key only in diagnostics.
```

### 14.3. Generic API mapping config

Current config fields such as:

```text
itemsPath
titleField
leadField
bodyField
urlField
publishedAtField
externalIdField
languageField
pagination
```

Target:

```text
adapter_key = api.generic_json_mapping
binding.config_json or channel.config_json contains mapping config
```

Recommended MVP choice:

```text
Keep mapping config in source_channels.config_json during first stage.
Binding config can override it.
Later move adapter-specific mapping into binding.config_json.
```

### 14.4. Website config

Keep website controls in source channel config:

```text
maxResourcesPerPoll
requestTimeoutMs
totalPollTimeoutMs
crawlDelayMs
sitemapDiscoveryEnabled
feedDiscoveryEnabled
collectionDiscoveryEnabled
downloadDiscoveryEnabled
collectionSeedUrls
allowedUrlPatterns
blockedUrlPatterns
browserFallbackEnabled
maxBrowserFetchesPerPoll
```

Binding just says:

```text
adapter_key = website.generic_discovery
```

Do not duplicate all website config into adapter binding on MVP.

### 14.5. Discovery adapter research

Replace legacy `adapterKey` terminology in operator surfaces with:

```text
ingress adapter key
```

But keep backward-compatible payload fields for MCP until old prompts/tools are updated.

---

## 15. Rollout stages

### Stage 1 — Passive catalog

Deliver:

```text
- catalog table
- seed all existing adapters
- GET /maintenance/ingress-adapters
- admin read-only list
- no fetcher behavior change
```

Proof:

```text
- catalog contains RSS/API/website/email rows
- existing ingest tests still pass
```

### Stage 2 — Binding table and backfill

Deliver:

```text
- source_channel_adapter_binding table
- migration backfills all existing channels
- channel read model includes binding
- admin channel pages show binding read-only
```

Proof:

```text
- RSS channels mapped to rss.*
- API channels mapped to api.* or api.generic_json_mapping
- website channels mapped to website.generic_discovery
- email_imap channels mapped to email_imap.generic_mailbox
```

### Stage 3 — Fetchers resolver

Deliver:

```text
- fetchers resolve binding before legacy provider config
- existing provider pollers wrapped
- channel_fetch_runs records adapter metadata
- fallback to old behavior if no binding exists
```

Proof:

```text
- RSS smoke unchanged
- website smoke unchanged
- API smoke if available
- fetch runs show adapter_key
```

### Stage 4 — Admin control

Deliver:

```text
- adapter list/detail
- channel adapter binding edit
- catalog-driven RSS/API selector
- dry-run panel for declarative adapters
```

Proof:

```text
- admin can change channel adapter binding
- old adapterStrategy/API adapterKey no longer primary write path
```

### Stage 5 — MCP control

Deliver:

```text
- MCP adapter list/read/dry-run/bind tools
- MCP create/update declarative adapter
- bulk onboarding plans include adapter recommendation
```

Proof:

```text
- MCP creates a declarative API adapter
- dry-run succeeds without DB writes
- binding is created and fetcher uses it
```

### Stage 6 — Declarative recipe runtime

Deliver:

```text
- api.generic_json_mapping powered by recipe runtime
- admin/MCP can create additional JSON API recipes
- validation + dry-run
```

Proof:

```text
- old generic API mapping still works
- new declarative adapter works
```

### Stage 7 — Discovery/control-plane cleanup

Deliver:

```text
- source family/bottleneck reads prefer binding.adapter_key
- thematic discovery research catalog uses canonical adapter keys
- promotion creates adapter binding where safe
```

Proof:

```text
- discovery promoted source has binding
- research_only adapters do not become auto-selected unless allowed
```

### Stage 8 — Legacy deprecation

Deliver:

```text
- old adapterStrategy and adapterKey fields marked deprecated
- docs updated
- old admin dropdowns removed or converted
```

Do not delete legacy config readers until:

```text
- all migrations pass on existing DB
- all smokes pass
- MCP tools no longer write old fields
```

### Stage 9 — Post-MVP options

Possible later additions:

```text
- adapter_versions
- sandbox_js / WASM runtime
- approval workflow
- rollback by version
- visual recipe builder
- richer selector/probe scoring
```

---

## 16. Tests and acceptance

### 16.1. New unit tests

```text
services/fetchers/src/ingress-adapters/resolver.test.ts
services/fetchers/src/ingress-adapters/match-rules.test.ts
services/fetchers/src/ingress-adapters/declarative-api-runtime.test.ts
packages/contracts/src/ingress-adapters.test.ts
```

Test cases:

```text
- explicit binding wins
- legacy rss adapterStrategy maps correctly
- legacy api adapterKey maps correctly
- provider default fallback works
- tie recommendation does not auto-bind
- disabled adapter is not recommended
- research_only adapter is not auto-selected
- declarative runtime maps JSON items to signal_candidate drafts
```

### 16.2. Migration tests

Add migration smoke assertions:

```text
- ingress_adapter_catalog exists
- source_channel_adapter_binding exists
- all system adapter keys seeded
- existing channels have bindings after backfill
- no binding points to missing adapter_key
```

### 16.3. API tests

```text
GET /maintenance/ingress-adapters
GET /maintenance/ingress-adapters/{adapterKey}
POST /maintenance/ingress-adapters for declarative adapter
PATCH /maintenance/ingress-adapters/{adapterKey}
POST /maintenance/ingress-adapters/{adapterKey}/dry-run
GET/PUT/DELETE /maintenance/channels/{channelId}/adapter-binding
```

### 16.4. Admin tests

```text
- adapter list renders
- adapter detail renders builtin read-only
- declarative adapter create form validates
- channel edit shows adapter binding
- RSS channel edit uses catalog-backed options
- website channel still shows resources/projection behavior
```

### 16.5. MCP tests

```text
- ingress.adapters.list
- ingress.adapters.create_declarative
- ingress.adapters.dry_run
- ingress.bindings.set
- channels.bulk_onboard.plan includes adapter recommendation
```

### 16.6. Existing gates to keep green

```sh
pnpm lint
pnpm typecheck
pnpm unit_tests
pnpm test:migrations:smoke
pnpm test:feed-ingress-adapters:smoke
pnpm test:ingest:compose
pnpm test:ingest:multi:compose
pnpm test:website:compose
pnpm test:website:admin:compose
pnpm test:hard-sites:compose
pnpm test:mcp:compose
```

If API/email operator tests exist later, add them to adapter catalog acceptance.

---

## 17. Risks and safeguards

### 17.1. Adapter flapping

Risk:

```text
system chooses different adapter for same channel across polls
```

Safeguard:

```text
binding is sticky;
recommendation does not mutate active binding automatically after channel is live.
```

### 17.2. Cursor mismatch

Risk:

```text
old adapter cursor is incompatible with new adapter
```

MVP safeguard:

```text
on binding change, show warning and allow cursor reset;
record adapter_key in cursor_json when new runtime updates cursor.
```

Future:

```text
cursor schema per adapter.
```

### 17.3. Secrets leakage

Risk:

```text
admin/MCP writes API keys into recipe/config_json
```

Safeguard:

```text
config schema cannot define secret fields in MVP;
use auth_config_json or future secret references;
redact known secret-like keys in dry-run diagnostics.
```

### 17.4. Research adapters polluting production

Risk:

```text
research_only marketplace/search adapters become normal production sources accidentally
```

Safeguard:

```text
metadata.risk.researchOnly = true;
match.allowAutoSelect = false;
admin shows warning;
MCP cannot auto-bind without explicit operator policy.
```

### 17.5. Website hidden RSS conversion

Risk:

```text
website source silently becomes RSS because feed discovered
```

Safeguard:

```text
provider_type remains website;
adapter remains website.generic_discovery;
feed hints remain discovery inputs only;
web_resources remains truth surface.
```

### 17.6. Builtin adapter changes not visible in compose

Risk:

```text
developer adds adapter file but running fetchers container does not pick it up
```

Safeguard:

```text
admin page shows runtime=builtin and module_name;
docs say builtin adapters require rebuild/restart;
seed/sync command validates catalog vs registered modules on startup.
```

### 17.7. Declarative recipe too weak

Risk:

```text
some source cannot be expressed in declarative runtime
```

Safeguard:

```text
promote to builtin adapter path;
do not introduce sandbox until repeated real need appears.
```

---

## 18. Implementation checklist by subsystem

### Database

```text
[ ] create ingress_adapter_catalog
[ ] create source_channel_adapter_binding
[ ] add optional channel_fetch_runs adapter fields
[ ] seed builtin adapters
[ ] backfill existing channel bindings
[ ] add migration smoke checks
```

### packages/contracts

```text
[ ] add ingress adapter types
[ ] add descriptor schema
[ ] add binding contract
[ ] keep legacy API_ADAPTER_KEYS / FEED_INGRESS_ADAPTER_STRATEGIES
[ ] add mapping helpers legacy -> adapter_key
```

### services/fetchers

```text
[ ] create ingress-adapters directory
[ ] implement catalog repository
[ ] implement resolver
[ ] wrap existing RSS adapters
[ ] wrap existing API registry
[ ] wrap generic API mapping as declarative runtime
[ ] wrap website generic poller
[ ] wrap email IMAP generic poller
[ ] update pollLoadedChannel
[ ] record adapter metadata in fetch runs
[ ] add dry-run endpoint
[ ] add unit tests
```

### services/api

```text
[ ] list/read adapter catalog
[ ] create/update declarative adapters
[ ] read/update/delete channel binding
[ ] adapter recommendation endpoint
[ ] dry-run proxy to fetchers internal endpoint
[ ] update channel read models
[ ] update fetch run read models
[ ] add audit events
```

### apps/admin

```text
[ ] adapter list page
[ ] adapter detail page
[ ] declarative adapter create/edit page
[ ] channel adapter binding card
[ ] catalog-backed RSS adapter select
[ ] catalog-backed API adapter select
[ ] dry-run UI
[ ] adapter badges on channels/resources/signal-candidates/fetch runs
```

### services/mcp

```text
[ ] adapter list/read tools
[ ] create/update declarative adapter tools
[ ] dry-run tool
[ ] binding read/set/delete tools
[ ] update channel create/update tools to accept adapterKey
[ ] update bulk onboarding to include adapter recommendations
[ ] update discovery promotion to create binding
[ ] update guides/prompts around website/resource truth and research_only adapters
```

### packages/control-plane

```text
[ ] source family reads prefer source_channel_adapter_binding.adapter_key
[ ] bottleneck reads prefer binding.adapter_key
[ ] thematic discovery catalog uses canonical adapter keys
[ ] promotion flow creates binding
[ ] source quality metrics stay independent from final selection yield
```

### Documentation

```text
[ ] docs/contracts/ingress-adapter-catalog.md
[ ] README manual notes update
[ ] WEBSITE_SOURCES_TESTING add adapter binding references
[ ] EXAMPLES bulk import examples accept adapterKey
[ ] MCP guide updates
```

---

## 19. Final target state

After migration, every channel has an explicit or default adapter path:

```text
RSS channel
  -> source_channel_adapter_binding.adapter_key = rss.*
  -> fetchers RSS wrapper
  -> signal_candidates
  -> signal_candidate.ingest.requested

API channel
  -> source_channel_adapter_binding.adapter_key = api.* or api.generic_json_mapping
  -> fetchers API wrapper / declarative recipe
  -> signal_candidates
  -> signal_candidate.ingest.requested

Website channel
  -> source_channel_adapter_binding.adapter_key = website.generic_discovery
  -> fetchers website poller
  -> web_resources
  -> resource.ingest.requested
  -> optional signal_candidate projection

Email channel
  -> source_channel_adapter_binding.adapter_key = email_imap.generic_mailbox
  -> fetchers IMAP poller
  -> signal_candidates
  -> signal_candidate.ingest.requested
```

Admin sees:

```text
which adapter is used;
why it was selected;
whether it is builtin or declarative;
which channels use it;
how recent fetches behaved;
how to dry-run or rebind.
```

MCP sees:

```text
adapter catalog;
capabilities/config schema;
recommendations;
dry-run previews;
controlled declarative creation;
binding actions.
```

Developers can still add manual code plugins:

```text
repo builtin adapter -> rebuild/restart -> catalog seed/sync -> admin/MCP binding
```

Operators and MCP can add no-code plugins:

```text
declarative adapter -> validate -> dry-run -> bind -> fetchers use it
```

This gives plugin-like behavior without introducing unsafe dynamic code execution or a large new sandbox subsystem in the MVP.
