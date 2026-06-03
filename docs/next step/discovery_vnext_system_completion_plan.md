# Discovery vNext — инженерная доделка системы

Дата: 2026-06-03  
Статус: практический blueprint для доделки текущей реализации Discovery vNext без доменной привязки в core.

Этот документ собирает решения из ревью текущего кода, тестов, отчёта MCP discovery funnel и обсуждения последних архитектурных рисков. Он отвечает на вопрос: **что именно нужно доделать в системе**, чтобы Discovery перестал регистрировать случайные куски сайтов, научился понимать source scope, сохранил domain-neutral core, получил настоящий MegaLoop и стал пригоден для разных system interests.

Отдельный companion-документ с операционными настройками: `discovery_vnext_system_configuration_playbook.md`.

---

## 0. Executive summary

Текущий vNext-каркас выбран правильно:

```text
DiscoveryBrief
  -> HypothesisBatch / MegaLoop
  -> Candidate acquisition
  -> ProbePlan
  -> ProbeReport
  -> SourceUnderstanding
  -> RoutingDecision
  -> SourceInventory / Channel / AdapterBacklog / ManualReview
```

Но система ещё не завершена в четырёх критичных местах:

1. **Search result ошибочно становится source.**  
   Discovery часто находит конкретный URL: блог-пост, RFP item, PDF, service page, category/search page. Затем этот URL может стать active channel. Правильно: search result — это seed/evidence, а source — это resolved scope: домен, раздел, feed, listing, API endpoint, document collection.

2. **SourceUnderstanding пока понимает источник, но не всегда понимает scope.**  
   Даже хорошая классификация `seller_or_vendor`, `public_authority`, `source_directory` мало помогает, если мы мониторим неправильный URL.

3. **MegaLoop не должен быть domain-specific и не должен зависеть от ручного `maxBatches`.**  
   Он должен быть универсальной стратегией покрытия способов появления сигналов, а не набором линз, которые случайно включили для outsourcing.

4. **Item-level conversion остаётся отдельным bottleneck.**  
   Даже если Discovery нашёл правильный source scope, selected signals появятся только после item-level adapters: PDF/document extraction, portal list→detail, API JSON path mapping, feed/listing extraction.

Главный design invariant:

```text
Search result finds evidence.
SourceScopeResolution finds what to monitor.
SourceUnderstanding explains why it can produce signals.
Routing decides inventory/watch/register/backlog.
MegaLoop universally covers ways signals can appear.
Domain settings describe desired signals and noise.
```

---

## 1. Что уже есть и что не надо выкидывать

Не надо переписывать Discovery vNext с нуля. В текущей реализации уже есть полезные элементы:

- `DiscoveryBrief`;
- `HypothesisBatch`;
- universal lenses list;
- `ProbePlan` / `ProbeReport`;
- `SourceUnderstanding` v2 fields: `sourceVoice`, `artifactFreshnessKind`, `signalProductionMode`;
- `RoutingDecision` with thresholds and auto-register gates;
- `source_inventory` states including `inventory_context`;
- `adapter_backlog`;
- MCP tools for discovery/probe/understand/route/handoff;
- report/evidence artifacts proving MCP flow works;
- strict downstream selection, which should not be weakened.

Что нужно сделать: **достроить недостающие системные boundaries**.

---

## 2. Ключевые инварианты, которые нельзя потерять

### 2.1. Core domain-neutral

В core запрещены доменные enum-ы вроде:

```text
outsourcing_buyer
procurement_portal
rfp_signal
hiring_gap_signal
migration_pressure_signal
```

В core допустимы универсальные роли и формы источников:

```text
public_authority
owner_or_operator
aggregator_or_directory
community_or_ugc
third_party_commentary
seller_or_vendor
recurring_listing
recurring_feed
official_update
static_service_page
source_directory
direct_event_feed
secondary_context
```

Доменная семантика живёт только в:

```text
DiscoveryBrief.desiredSignals
DiscoveryBrief.negativeSignals
interest/profile config
query seeds
policy overrides
eval fixtures
operator examples
```

### 2.2. Search result is not source

URL из поисковой выдачи — это **candidate observation**, а не source identity.

```text
candidateUrl != sourceUrl != sourceChannelUrl
```

Нужно различать:

```text
candidateUrl        найденная страница или документ
seedItemUrl         item/context URL, который доказал наличие направления
resolvedSourceUrl   scope, который нужно мониторить
channelUrl          operational projection, если source можно мониторить как channel
```

### 2.3. Source inventory primary, channel optional projection

`source_inventory` — primary truth для найденных source scopes.  
`source_channels` — operational projection для источников, которые действительно можно мониторить.

Правильный порядок:

```text
Candidate
  -> Probe
  -> SourceScopeResolution
  -> SourceUnderstanding
  -> RoutingDecision
  -> SourceInventory
  -> optional SourceChannel / AdapterBacklog / MonitoringState
```

Неправильный порядок:

```text
Search result URL
  -> SourceChannel
```

### 2.4. No yield-based source retention

Отсутствие найденных selected signals не является negative evidence против источника.

```text
zero useful signals observed != weak source
zero useful signals observed == event may not have happened yet
```

Yield/historical hits можно использовать для telemetry, dashboards, temporary polling boost, but not for keep/drop/source capability.

### 2.5. Generator forgets, evaluator remembers

MegaLoop должен использовать controlled amnesia:

```text
generator forgets old context to explore new hypotheses
evaluator remembers all persistent memory to compare and merge
system persists all artifacts
policy gates production effects
```

---

## 3. Новая обязательная сущность: SourceScopeResolution

### 3.1. Зачем

Проблема: Discovery находит куски сайтов, а не source scopes.

`SourceScopeResolution` должен появиться между `ProbeReport` и `SourceUnderstanding`:

```text
ProbeReport
  -> SourceScopeResolution
  -> SourceUnderstanding
  -> RoutingDecision
```

Он отвечает на вопрос:

> Что именно является источником, который нужно мониторить: весь домен, раздел, feed, API endpoint, listing page, document collection или только single item/context page?

### 3.2. Schema

```json
{
  "artifactType": "SourceScopeResolution",
  "schemaVersion": "1.0",
  "candidateUrl": "https://example.com/blog/some-article",
  "resolvedSourceUrl": "https://example.com/blog",
  "sourceScopeType": "section",
  "sourceScopeConfidence": 0.82,
  "seedItemUrl": "https://example.com/blog/some-article",
  "monitoringEntryUrls": [
    "https://example.com/blog",
    "https://example.com/feed.xml"
  ],
  "itemExtractionHints": {
    "itemUrlPattern": "/blog/{slug}",
    "listingUrlPattern": "/blog",
    "datePatternObserved": true,
    "paginationObserved": false,
    "documentLinksObserved": false
  },
  "resolutionEvidence": [
    "Candidate URL looks like an item detail page.",
    "Same-origin parent /blog contains multiple item links.",
    "Feed URL discovered for this section."
  ],
  "notMonitoringReason": null
}
```

### 3.3. Universal source scope types

```text
domain_root
section
feed
api_endpoint
listing_page
search_endpoint
document_collection
single_item
context_page
blocked_or_unusable
unknown
```

Это web/source-structure vocabulary, не доменная taxonomy.

### 3.4. Resolution rules

#### Rule A — item detail page

Если URL выглядит как item detail:

```text
/news/2026/05/title
/blog/some-title
/bid_detail_T2_R14.php
/opportunities/rfp-tenders/website-redesign...
```

не регистрировать item URL как channel. Нужно найти parent scope:

```text
/news
/blog
/bids
/opportunities/rfp-tenders
```

Если parent не найден, оставить `single_item` как item evidence и создать adapter backlog / manual review, но не active website channel.

#### Rule B — PDF/document

PDF/document URL — это item/document artifact, not source.

```text
sourceScopeType = single_item or document_collection
routing = adapter_backlog or item extraction
```

Если есть parent/referrer/listing page, monitoring scope должен быть parent/referrer/listing.

#### Rule C — static service/vendor page

Service page, product landing page, vendor marketing page:

```text
sourceScopeType = context_page
routing = inventory_context
```

Не создавать active channel.

#### Rule D — listing/search page

Если страница содержит recurring list/table/cards/pagination/item links:

```text
sourceScopeType = listing_page or section
routing eligible = cheap_watch / auto_register_probation depending on risk
```

#### Rule E — feed

Если найден валидный feed:

```text
sourceScopeType = feed
resolvedSourceUrl = feed URL
providerType = rss
```

RSS channel можно создавать только после feed validation.

#### Rule F — API endpoint

API endpoint не превращать в website channel:

```text
sourceScopeType = api_endpoint
routing = adapter_backlog or API adapter
```

### 3.5. Resolver signals

Resolver должен использовать:

- URL path depth;
- date/slug patterns;
- file extension;
- query params and pagination params;
- canonical link;
- breadcrumbs;
- sitemap siblings;
- RSS/Atom/JSON feed discovery;
- same-origin link density;
- listing/table/card detection;
- presence of one article body vs many item links;
- document links;
- nav section links;
- page title/body role hints.

### 3.6. Важное уточнение: не всегда full site

Цель — не “всегда весь сайт”. Цель:

> максимально широкий безопасный scope, который сохраняет signal density.

Иногда это:

```text
domain_root
```

Иногда лучше:

```text
/news
/procurement
/notices
/opportunities
/changelog
/blog
/search?category=software
/api/notices/search
```

Full domain может быть хуже, если тащит careers/contact/legal/marketing noise.

---

## 4. Изменить SourceUnderstanding так, чтобы он принимал SourceScopeResolution

### 4.1. Новый input contract

`SourceUnderstanding` должен строиться из:

```text
DiscoveryBrief
Candidate
ProbeReport
SourceScopeResolution
optional previous memory / feedback summary
```

Не только из `ProbeReport + Candidate`.

### 4.2. Обязательные поля SourceUnderstanding v2/v3

```json
{
  "artifactType": "SourceUnderstanding",
  "schemaVersion": "2.0",
  "sourceUrl": "https://example.com/blog",
  "seedItemUrl": "https://example.com/blog/some-article",
  "sourceScopeType": "section",
  "sourceVoice": "public_authority | owner_or_operator | aggregator_or_directory | community_or_ugc | third_party_commentary | seller_or_vendor | unknown",
  "sourceVoiceEvidence": [],
  "artifactFreshnessKind": "recurring_listing | recurring_feed | official_update | dataset_or_registry | community_thread | documentation_or_guide | evergreen_article | static_service_page | search_or_category_wrapper | profile_or_homepage | unknown",
  "artifactFreshnessEvidence": [],
  "signalProductionMode": "direct_event_feed | direct_request_or_listing | official_update | source_directory | precursor_context | secondary_context | unlikely | unknown",
  "signalProductionEvidence": [],
  "technicalObservability": 0.0,
  "technicalObservabilityEvidence": [],
  "risk": {},
  "canProduceSignals": [],
  "notExpectedToProduce": [],
  "negativeRoleEvidence": [],
  "reasonToKeep": "...",
  "reasonNotToAutoRegister": "...",
  "yieldIndependent": true
}
```

### 4.3. Domain-neutral, interest-conditioned

`SourceUnderstanding` остаётся domain-neutral по структуре, но interest-conditioned по capability:

```text
Generic understanding:
  sourceVoice
  artifactFreshnessKind
  signalProductionMode
  sourceScopeType
  observability
  risk

Interest-conditioned capability:
  canProduceSignals[] references DiscoveryBrief.desiredSignals
```

Не hardcode:

```text
rfp_signal
outsourcing_buyer
procurement_portal
```

Использовать:

```text
signalId from DiscoveryBrief
desired signal description
source can/cannot produce this signal because...
```

### 4.4. Hard universal rules

#### Seller/static/context pages

If:

```text
sourceVoice in [seller_or_vendor, third_party_commentary]
AND artifactFreshnessKind in [static_service_page, evergreen_article, documentation_or_guide]
AND sourceScopeType in [single_item, context_page]
```

then:

```text
signalProductionMode = secondary_context or unlikely
recommendedRouting = inventory_context
autoRegisterAllowed = false
```

#### Single item

If:

```text
sourceScopeType = single_item
```

then:

```text
autoRegisterAllowed = false
unless resolved parent feed/section/listing exists
```

#### Source directory

If:

```text
sourceVoice = aggregator_or_directory
signalProductionMode = source_directory
```

then:

```text
allow cheap_watch/probation only if listing/search/feed/page stability is observed
otherwise manual_review or adapter_backlog
```

#### Official update/context

Official pages that are not item feeds can be useful but slow:

```text
sourceVoice = public_authority
signalProductionMode = official_update or precursor_context
routing = cheap_watch or inventory_context
```

not necessarily selected lead source.

---

## 5. Изменить RoutingDecision

### 5.1. Routing must consume sourceScopeType

New routing inputs:

```text
SourceUnderstanding
SourceScopeResolution
providerType
accessPattern
policy
```

### 5.2. New hard gates

```text
sourceScopeType in [single_item, context_page] -> no auto_register_probation
sourceScopeType = blocked_or_unusable -> blocked/manual
sourceScopeType = api_endpoint -> adapter_backlog/API adapter
sourceScopeType = feed -> eligible only if feed valid
sourceScopeType = document_collection -> adapter_backlog or document watcher
sourceScopeType in [section, listing_page, domain_root] -> eligible if signalProductionMode/sourceVoice/freshness/risk pass
```

### 5.3. Auto-register eligibility

Auto-register/probation only if:

```text
signalProductionMode in [direct_event_feed, direct_request_or_listing, official_update, source_directory]
artifactFreshnessKind in [recurring_listing, recurring_feed, official_update, dataset_or_registry]
sourceScopeType in [section, feed, listing_page, api_endpoint, document_collection, domain_root]
sourceVoice not in [seller_or_vendor, third_party_commentary]
accessPattern = public
technicalObservability >= threshold
routingConfidence >= threshold
risk <= threshold
```

### 5.4. New state: inventory_context

Already exists in migration; make sure routing uses it consistently.

Use `inventory_context` for:

- static explainer pages;
- vendor guides;
- seller landing pages;
- query expansion evidence;
- source discovery hints;
- official context pages that are not item streams.

---

## 6. Изменить handoff

### 6.1. Current bug pattern

Current handoff uses:

```text
source_understanding.sourceUrl
```

as the channel URL. That can be a random search result page.

### 6.2. Required behavior

Use:

```text
SourceScopeResolution.resolvedSourceUrl
```

for operational channel URL.

Use original search result as:

```text
seedItemUrl
evidenceUrl
```

### 6.3. Handoff payload

```json
{
  "url": "https://example.com/opportunities",
  "source_url": "https://example.com/opportunities",
  "seed_item_url": "https://example.com/opportunities/rfp-123",
  "provider_type": "website",
  "evaluation_json": {
    "sourceScopeResolution": {},
    "sourceUnderstanding": {},
    "routingDecision": {},
    "seedEvidence": {
      "candidateUrl": "https://example.com/opportunities/rfp-123"
    }
  }
}
```

### 6.4. No direct handoff for PDFs/context/single items

```text
PDF -> adapter_backlog / document item extraction
single_item -> parent section/feed resolution first
context_page -> inventory_context
```

---

## 7. Source identity model

### 7.1. Identity key

Use:

```text
provider_type + canonical_domain + resolvedSourceUrl
```

Do not use:

```text
runId
signal pack key
raw candidate URL
```

### 7.2. Relationships

Run/interest/hypothesis/candidate links should be relationships:

```text
source_inventory_source_evidence
source_inventory_discovery_runs
source_inventory_interest_fit
```

not part of the stable source identity.

### 7.3. Existing sources re-resolution

Add maintenance job:

```text
source_inventory.resolve_scopes
```

It should:

1. take existing `source_inventory` and `source_channels`;
2. run `SourceScopeResolution`;
3. mark old item/context entries as seed evidence;
4. update/create resolved scope inventory;
5. pause/delete active channel projection when source is context-only;
6. move PDFs/API/challenge sources to adapter backlog/manual.

---

## 8. MegaLoop v2 — universal coverage strategy

### 8.1. Problem

Current default generator configs include only a subset of universal lenses:

```text
official_owners
documents_and_reports
datasets_and_apis
announcements_and_newsrooms
adversarial_missing_sources
```

This can miss hidden-signal lenses:

```text
registries_and_directories
change_logs_and_updates
public_discussions
marketplaces_and_listings
local_language_forms
weird_public_artifacts
```

### 8.2. Required universal lenses

The universal lens set should be default baseline:

```text
official_owners
registries_and_directories
documents_and_reports
datasets_and_apis
announcements_and_newsrooms
change_logs_and_updates
public_discussions
marketplaces_and_listings
local_language_forms
weird_public_artifacts
adversarial_missing_sources
```

### 8.3. Memory modes

```text
blind
thin
gap_only
locale
artifact_lens
adversarial
full_evaluator_only
```

### 8.4. Replace maxBatches with coverage policy

`maxBatches` is an implementation limit, not strategy.

Use:

```json
{
  "loopStrategy": "universal_broad_coverage",
  "coveragePolicy": {
    "requiredLensCoverage": [
      "official_owners",
      "registries_and_directories",
      "documents_and_reports",
      "datasets_and_apis",
      "announcements_and_newsrooms",
      "change_logs_and_updates",
      "public_discussions",
      "marketplaces_and_listings",
      "local_language_forms",
      "weird_public_artifacts",
      "adversarial_missing_sources"
    ],
    "minHypothesesPerLens": 5,
    "minQueriesPerHypothesis": 3,
    "minProbeCandidatesPerLens": 5
  }
}
```

### 8.5. No silent under-coverage

If a run does not cover all required lenses:

```text
status = completed_with_coverage_gap
warnings = [hidden_lens_not_executed, missing_required_lenses]
```

### 8.6. Adaptive budget allocation

After minimum coverage, extra budget goes to:

```text
high novelty
high source-scope confidence
under-covered lens
high query quality
adapter backlog opportunity
low duplicate rate
high source-worthy result mix
```

Stop only when:

```text
low novelty across N batches
mostly duplicate candidates
mostly blocked/context-only results
budget exhausted
coverage complete
```

### 8.7. Hypothesis output must include expected scopes

Each hypothesis should include:

```json
{
  "sourceRoleDescription": "...",
  "expectedArtifacts": ["listing", "document"],
  "expectedSourceScopeTypes": ["section", "listing_page", "feed", "api_endpoint"],
  "badIfScopeIs": ["single_item", "static_service_page", "context_page"],
  "queryFamilies": [],
  "negativePatterns": [],
  "whyThisCouldWork": "..."
}
```

---

## 9. Full-run completion

Full run must execute end-to-end:

```text
DiscoveryBrief
  -> MegaLoop
  -> Candidate acquisition
  -> Candidate dedupe
  -> ProbePlan
  -> ProbeReport
  -> SourceScopeResolution
  -> SourceUnderstanding
  -> RoutingDecision
  -> SourceInventory / Handoff / AdapterBacklog
```

Scripts should not be the main orchestration layer.

### 9.1. Probe selection fixes

Use per-lens and per-hypothesis coverage:

```text
maxProbeCandidatesPerRun
maxProbeCandidatesPerLens
maxProbeCandidatesPerHypothesis
maxProbeCandidatesPerDomain
```

Do not group all candidates by batch artifact only. Need individual `hypothesisId`.

### 9.2. Coverage summary

Full-run summary should include:

```json
{
  "candidateCount": 300,
  "probedCount": 80,
  "probeCoverage": 0.266,
  "executedLenses": [],
  "missingLenses": [],
  "sourceScopeTypes": {},
  "routingDecisionCounts": {},
  "warnings": []
}
```

---

## 10. QueryQuality v2

### 10.1. Problem

Candidate count is not query quality.

A bad query can return many:

- vendor pages;
- SEO guides;
- advice articles;
- wrapper/search pages;
- duplicates.

### 10.2. Result mix

Every query attempt should produce:

```json
{
  "resultMix": {
    "primaryOrOwnerSources": 0,
    "officialSources": 0,
    "recurringListings": 0,
    "sourceDirectories": 0,
    "datasetsOrApis": 0,
    "secondaryExplainers": 0,
    "sellerVendorPages": 0,
    "seoNoise": 0,
    "deadOrBlocked": 0,
    "duplicates": 0
  },
  "quality": "useful_for_acquisition | useful_for_query_expansion | needs_refinement | noisy | exhausted",
  "recommendedRefinement": "..."
}
```

### 10.3. Query purpose

Track query purpose:

```text
find_direct_sources
find_source_directories
find_terminology
find_documents
find_discussions
find_official_owners
find_local_language_forms
```

A query can be useful for terminology even if it finds no direct source.

---

## 11. Item-level adapters and conversion layer

Discovery can find sources faster than product can convert them into selected item-level signals.

Required adapters:

### 11.1. PDF/document item adapter

Extract:

```text
title
issuer/buyer/owner
publication date
deadline
scope/body
document URL
source page/referrer URL
evidence snippets
language
geo
```

### 11.2. Portal list→detail adapter

Pattern:

```text
listing/search page
  -> item links
  -> item details
  -> attachments/documents
  -> article/resource observation
```

### 11.3. Declarative JSON numeric array paths

Support:

```text
tender.documents.0.url
awards.0.suppliers.0.name
items.0.description
```

or helpers:

```text
firstDocumentUrl
firstNoticeUrl
firstBuyerName
```

### 11.4. API/source priority

Prioritize:

1. already-proven official APIs;
2. public procurement APIs;
3. official portals with list→detail;
4. document/PDF collections;
5. marketplaces/discussions after safety/quality gates.

---

## 12. Feedback, audit and safety

### 12.1. Typed feedback

Do not use one generic `mark_useful`.

Add separate feedback types:

```text
source_scope_correct
source_scope_wrong
source_understanding_correct
source_understanding_wrong
routing_correct
routing_wrong
source_useful_as_inventory
source_not_useful
lead_useful
lead_false_positive
adapter_gap_confirmed
adapter_gap_wrong
```

### 12.2. Audit lineage

Every selected content item should be explainable back to:

```text
system interest
DiscoveryBrief
HypothesisBatch
candidate
ProbeReport
SourceScopeResolution
SourceUnderstanding
RoutingDecision
source inventory/channel
article/resource observation
final selection result
content item
```

### 12.3. Security/risk

Add risk fields to SourceUnderstanding/SourceScopeResolution:

```text
promptInjectionRisk
seoSpamRisk
ugcManipulationRisk
authOrCaptchaRisk
crawlBlastRadius
legalRisk
unsupportedAdapterRisk
```

UGC/discussions can be sensors, but not authoritative sources without corroboration.

---

## 13. Admin/MCP surface changes

### 13.1. Admin must show source scope

Source detail page should display:

```text
candidateUrl
resolvedSourceUrl
sourceScopeType
seedItemUrl
monitoringEntryUrls
sourceVoice
artifactFreshnessKind
signalProductionMode
routingDecision
why kept
why not auto-registered
adapter need
coverage contribution
lineage
```

### 13.2. Admin actions

Add actions:

```text
Re-resolve source scope
Promote resolved scope to channel
Demote channel to inventory_context
Move to adapter backlog
Confirm source scope
Reject source scope
Pause rollback group
```

### 13.3. MCP tools

Add/ensure:

```text
discovery.scope.resolve_preview
discovery.scope.resolve_apply
discovery.source_inventory.resolve_scopes
discovery.source_inventory.explain
discovery.routing.rollback_group
discovery.feedback.submit
```

---

## 14. Tests and acceptance criteria

### 14.1. SourceScopeResolution tests

Required fixtures:

```text
single article URL resolves to section/feed
PDF URL becomes document item/backlog
vendor service page becomes context_page
blog guide becomes context_page
listing page remains listing_page
feed URL remains feed
API URL becomes api_endpoint
search page becomes search_endpoint/listing if public and stable
blocked/challenge page becomes blocked_or_unusable/manual
```

### 14.2. MegaLoop tests

```text
full run covers all universal lenses
missing hidden lenses produces warning
no domain-specific lens names in core
controlled-amnesia generators do not receive full memory
comparator receives persistent memory
rediscovery count works
```

### 14.3. Routing tests

```text
single_item cannot auto-register
context_page cannot auto-register
seller static page -> inventory_context
valid feed -> RSS eligible
invalid RSS guess -> no RSS channel
api_endpoint -> adapter_backlog
source_directory -> cheap_watch/probation only with listing/search observability
```

### 14.4. QueryQuality tests

```text
many seller pages -> noisy
few official sources -> useful_for_acquisition
secondary explainers -> useful_for_query_expansion, not acquisition success
duplicates reduce quality
```

### 14.5. No-domain-hardcode tests

Core files must not contain domain-specific classes. Domain vocabulary allowed only in:

```text
tests/evals
fixtures
examples
domain packs
operator docs
```

### 14.6. End-to-end acceptance

A clean run should prove:

```text
all universal lenses executed
source scopes resolved
random page fragments not registered as channels
source inventory contains resolved scopes
adapter backlog created for PDFs/API/portals
selected content comes only from item-level observations
seller/context pages do not become selected
```

---

## 15. What we almost lost / must not forget

This section captures concerns that can be easily missed.

### 15.1. Source scope is different from source understanding

`SourceUnderstanding` tells what a source is and can produce.  
`SourceScopeResolution` tells what URL/scope to monitor.

Both are necessary.

### 15.2. Full site is not always better

Monitor the widest safe signal-dense scope, not always the entire domain.

### 15.3. Source inventory is not selected content

Inventory/backlog/probation success must not be counted as lead/signal success.

### 15.4. Adapter backlog is success, not failure

If Discovery finds high-potential PDF/API/portal sources, adapter backlog is a valid output.

### 15.5. Channel is an operational projection

Do not create a channel before scope, risk, and signal mode are known.

### 15.6. Hidden signals need universal lens coverage

`maxBatches=2` or similar shortcuts should produce explicit coverage warnings.

### 15.7. Domain-specific examples must stay in eval/config

Outsourcing/procurement/job board/security can be eval domains, not core logic.

### 15.8. LLM should patch typed artifacts, not decide in prose

LLM output must be schema-validated, conflict-checked, and applied as a canonical patch only if accepted.

### 15.9. Historical yield must not decide source retention

Past hit count is telemetry only.

### 15.10. Existing bad channels need cleanup path

Without `source_inventory.resolve_scopes`, old page-fragment channels will remain and pollute operator view.

### 15.11. Robots/politeness/blast radius

Broad source scopes need crawl guardrails:

```text
robots respect
crawl delay
max pages per scope
same-origin constraints
no login/CAPTCHA bypass
```

### 15.12. Evidence chain matters

Every auto-routed source should explain:

```text
why found
what hypothesis/lens found it
what URL was seed evidence
what scope is monitored
why auto-routed
what policy version applied
how to rollback
```

---

## 16. Implementation order

### Phase 1 — urgent guardrails

1. Add `SourceScopeResolution` artifact.
2. Use resolved scope in handoff.
3. Block auto-register for `single_item`, `context_page`, PDF/document item URLs.
4. Add `inventory_context` routing consistently.
5. Add invalid-RSS fallback.
6. Add source identity based on resolved scope.

### Phase 2 — MegaLoop coverage

1. Expand universal default lenses.
2. Replace silent `maxBatches` behavior with coverage policy.
3. Add missing-lens warnings.
4. Add per-lens probe minimum.
5. Add comparator memory and rediscovery count.

### Phase 3 — SourceUnderstanding v2/v3

1. Add evidence fields.
2. Add source scope input.
3. Add LLM validated patch flow.
4. Add source role eval fixtures.

### Phase 4 — item conversion

1. PDF/document item adapter.
2. Portal list→detail adapter.
3. API numeric path helpers.
4. Reindex/backfill proof.

### Phase 5 — admin/MCP/evals

1. Source scope UI.
2. Re-resolution tools.
3. Typed feedback tools.
4. End-to-end acceptance.

---

## 17. Final target architecture

```text
System Interest
  -> DiscoveryBrief
  -> Universal MegaLoop
      controlled-amnesia generators
      persistent-memory comparator
      universal lens coverage
  -> Candidate acquisition
  -> ProbePlan
  -> ProbeReport
  -> SourceScopeResolution
  -> SourceUnderstanding
  -> RoutingDecision
  -> SourceInventory
      inventory / inventory_context / cheap_watch / probation / manual / adapter_backlog
  -> Optional operational projection
      RSS / Website / API / Document adapter / Portal adapter
  -> Item-level observations
  -> Strict downstream filtering
  -> Selected content
```

This keeps Discovery universal, source-aware, scope-aware, and suitable for different domains without hardcoding any domain into core.
