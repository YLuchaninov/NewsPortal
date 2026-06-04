# Discovery vNext — P0–P1 план доделки без доменной привязки

Дата: 2026-06-03  
Статус: engineering execution plan для ближайших P0–P1 работ.  
Фокус: правильный `SourceScopeResolution`, корректная связка `scope -> understanding -> routing -> handoff`, качество full-run, и переход от source discovery к item-level conversion без доменного hardcode.

---

## 0. Контекст и текущий статус

Новая реализация уже движется в правильном направлении:

- MCP-only product flow технически работает;
- Discovery умеет находить source families и сохранять route/backlog outcomes;
- `SourceScopeResolution` как концепт уже появился в runtime/reporting;
- source inventory / adapter backlog / routing стали полезными промежуточными слоями;
- settings-only polishing может снижать шум без изменений core;
- core должен оставаться domain-neutral.

Но текущий proof не закрывает главное качество:

- source discovery / routing частично доказаны;
- stable high-quality item-level selected signals из broad web discovery не доказаны;
- broad discovery может увеличивать selected/counts, но verification показывает context/listing/noise;
- automatic conversion from discovered source surfaces to item-level leads не доказан;
- official adapters механически ближе к цели, но quality verification / item mapping / evidence normalization требуют follow-up.

Главный инженерный вывод:

```text
Discovery now finds possible source surfaces.
The next work is to resolve source scopes correctly,
then convert source scopes into item-level observations,
then verify selected quality.
```

---

## 1. Неприкосновенные инварианты

### 1.1. Core domain-neutral

В core запрещены доменные enum-ы, branching logic и special cases вроде:

```text
outsourcing_buyer
procurement_portal
rfp_signal
hiring_gap_signal
security_advisory_source
research_grant_source
```

В core допустимы только универсальные категории:

```text
sourceVoice:
  public_authority
  owner_or_operator
  aggregator_or_directory
  community_or_ugc
  third_party_commentary
  seller_or_vendor
  unknown

artifactFreshnessKind:
  recurring_listing
  recurring_feed
  official_update
  dataset_or_registry
  community_thread
  documentation_or_guide
  evergreen_article
  static_service_page
  search_or_category_wrapper
  profile_or_homepage
  unknown

signalProductionMode:
  direct_event_feed
  direct_request_or_listing
  official_update
  source_directory
  precursor_context
  secondary_context
  unlikely
  unknown

sourceScopeType:
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

Доменная семантика живёт только в:

```text
DiscoveryBrief.desiredSignals
DiscoveryBrief.negativeSignals
system interest configs
positive/negative prototypes
query seeds
policy overrides
eval fixtures
operator examples
```

### 1.2. Search result is not source

Найденный URL — это evidence/seed, а не источник.

Нужно всегда различать:

```text
candidateUrl        URL из search/provider result
seedItemUrl         item/context/document URL, который доказал направление
resolvedSourceUrl   scope, который можно мониторить
channelUrl          operational projection, если source можно превратить в channel
```

Неверно:

```text
search result URL -> source_channel.url
```

Верно:

```text
search result URL
  -> ProbeReport
  -> SourceScopeResolution
  -> SourceUnderstanding
  -> RoutingDecision
  -> source_inventory
  -> optional channel / adapter backlog / manual review
```

### 1.3. Source inventory is primary truth

`source_inventory` — primary truth для найденных source scopes.  
`source_channels` — optional operational projection.

Канал создаётся только если:

- source scope устойчивый;
- scope можно безопасно мониторить;
- scope не является single item/context/static page;
- routing policy разрешает handoff;
- adapter/fetch/extraction path существует или явно создаётся как probation.

### 1.4. No yield-based source rejection

`recent selected count`, `useful hits per window`, `historical yield` не участвуют в keep/drop source.  
Они используются только для telemetry, dashboards, temporary polling boost и diagnostics.

```text
zero useful signals observed != weak source
zero useful signals observed == event may not have happened yet
```

---

## 2. P0 цель

P0 должен сделать систему безопасной и честной:

```text
1. Не регистрировать случайные URL как источники.
2. Не считать context/listing pages качественными item-level signals.
3. Делать full-run fail-visible, когда quality не доказано.
4. Подготовить правильную основу для item-level adapters.
```

P0 не обязан сразу дать много selected signals.  
P0 обязан прекратить ложные success states.

---

# P0.1 — Правильный SourceScopeResolution

## 3. Зачем нужен SourceScopeResolution

Проблема текущей системы: discovery находит фрагменты сайтов.

Примеры фрагментов:

```text
/some-blog-post
/single-rfp-page
/file.pdf
/search?q=...
/vendor-service-page
/category/listing-wrapper
```

Эти URL могут быть полезным evidence, но не всегда являются source scope.

`SourceScopeResolution` должен отвечать на вопрос:

> Что именно нужно мониторить: этот URL, родительский раздел, feed, API endpoint, listing page, document collection, весь домен, или ничего?

## 4. Artifact: SourceScopeResolution

### 4.1. Required schema

```json
{
  "artifactType": "SourceScopeResolution",
  "schemaVersion": "1.0",
  "candidateUrl": "https://example.org/news/2026/05/signal-title",
  "seedItemUrl": "https://example.org/news/2026/05/signal-title",
  "resolvedSourceUrl": "https://example.org/news",
  "sourceScopeType": "section",
  "sourceScopeConfidence": 0.86,
  "monitoringEntryUrls": [
    "https://example.org/news",
    "https://example.org/news/feed.xml"
  ],
  "scopeCandidates": [
    {
      "url": "https://example.org/news/2026/05",
      "type": "section",
      "score": 0.42,
      "rejectedReason": "date_bucket_parent_without_listing_evidence"
    },
    {
      "url": "https://example.org/news",
      "type": "section",
      "score": 0.86,
      "selected": true
    }
  ],
  "itemExtractionHints": {
    "itemUrlPatterns": ["/news/{yyyy}/{mm}/{slug}"],
    "listingUrlPatterns": ["/news"],
    "paginationObserved": true,
    "dateOrVersionObserved": true,
    "documentLinksObserved": false,
    "feedDiscovered": true,
    "apiHintsObserved": false
  },
  "resolutionEvidence": [
    "Candidate URL looks like an item detail page.",
    "Higher parent /news contains multiple sibling item links.",
    "Feed was discovered for the section."
  ],
  "notMonitoringReason": null,
  "warnings": []
}
```

### 4.2. Required persistence

Persist as typed artifact and denormalized latest fields on inventory/candidate where useful:

```text
discovery_artifacts:
  artifact_type = SourceScopeResolution
  json
  parent_artifact_id = ProbeReport artifact
  run_id
  candidate_id
  policy_version

source_inventory latest fields:
  latest_source_scope_resolution_artifact_id
  source_scope_type
  source_scope_confidence
  resolved_source_url
  seed_item_url
```

If schema fields already exist, verify migrations are present and acceptance tests assert them.

---

## 5. SourceScopeResolution algorithm

### 5.1. Inputs

```text
candidateUrl
ProbeReport
DiscoveryBrief
HypothesisBatch/Hypothesis metadata
previous source inventory memory
optional fetched HTML/page metadata
optional sitemap/feed discovery results
optional referring/search result metadata
```

`DiscoveryBrief` is allowed as input, but only as generic desired signal/artifact expectation.  
No domain-specific branching is allowed.

### 5.2. Step 1 — Normalize candidate URL

Normalize:

```text
scheme/host casing
tracking params removal
trailing slash consistency
fragment removal unless fragment identifies item in API/search result
known wrapper normalization
canonical link if fetched page provides rel=canonical
```

Record:

```text
canonicalCandidateUrl
originalCandidateUrl
normalizationEvidence
```

### 5.3. Step 2 — Initial candidate URL shape classification

Classify URL shape without domain vocabulary:

```text
file_document:
  .pdf, .doc, .docx, .xls, .xlsx, content-type document

feed_like:
  .rss, .xml, /feed, application/rss+xml, valid Atom/RSS/JSON Feed

api_like:
  /api/, JSON content-type, structured endpoint, query returns JSON array/object

search_or_category:
  query params q/search/category/tag/filter/page, many result links, low item body

single_item_like:
  slug/date/id detail page, one title/body/date, few sibling links

listing_like:
  many same-origin item links, pagination, cards/table rows, dates/statuses

context_like:
  static guide/service/about/explainer, low update/listing evidence

blocked_or_challenged:
  captcha, verification page, login wall, access denied
```

This is structural, not domain-specific.

### 5.4. Step 3 — Collect structural evidence

Probe should collect at least:

```text
content type
HTTP status / redirects
canonical URL
rel=alternate feed links
sitemap links if cheaply discoverable
breadcrumbs
schema.org / microdata hints
OpenGraph type
page title/meta description
main nav links
same-origin link graph sample
number of candidate item links
number of parent/section links
pagination links
date/version/status markers
document links
API/JSON hints
access/challenge indicators
robots/llms hints if available
```

The resolver must not need full crawling. It needs bounded structural sampling.

### 5.5. Step 4 — Generate scope candidates

From one `candidateUrl`, generate possible scopes:

```text
exact candidate URL
validated feed URL
validated API endpoint
current page as listing/search endpoint
parent path level 1
parent path level 2
section root path
sitemap sibling cluster parent
breadcrumb target
canonical section link
site/domain root
referring/source page when candidate is document/file
```

Each candidate gets:

```text
url
type
scopeWidth
probeCost
expectedNoiseRisk
recurringEvidence
itemExtractionPotential
hypothesisAlignment
```

### 5.6. Step 5 — Score scope candidates

Score dimensions:

```text
recurringStructureScore:
  many sibling item links, pagination, feed, sitemap cluster, dates/statuses

itemExtractionPotential:
  item URL patterns, document links, detail pages, structured fields

specificityScore:
  specific enough to avoid whole-site noise

scopeWidthScore:
  wide enough to produce future items, not just one page

noiseBlastRadiusPenalty:
  full domain/legal/contact/careers/vendor pages/noisy category risk

accessStabilityScore:
  public, stable URLs, no hard auth/challenge

hypothesisFitScore:
  expectedArtifacts/sourceScopeTypes from hypothesis match observed scope

memoryScore:
  known existing inventory/source duplicates, known good/bad scope evidence
```

Example scoring rule:

```text
finalScopeScore =
  recurringStructureScore * 0.25
  + itemExtractionPotential * 0.20
  + specificityScore * 0.15
  + scopeWidthScore * 0.15
  + accessStabilityScore * 0.10
  + hypothesisFitScore * 0.10
  + memoryScore * 0.05
  - noiseBlastRadiusPenalty
```

No yield/historical selected count in this score.

### 5.7. Step 6 — Choose widest safe validated scope

Selection rule:

```text
Prefer the widest scope that is:
  - structurally validated;
  - likely to produce future items/artifacts;
  - not too broad/noisy;
  - technically monitorable;
  - aligned with expected artifact/source scope.
```

Priority order when evidence is strong:

```text
feed > api_endpoint > listing_page > section > document_collection > domain_root
```

But a narrower listing can beat domain root if domain root is noisy.

### 5.8. Step 7 — Prevent false parent resolution

Immediate parent is not automatically correct.

Bad example:

```text
/news/2026/05/title -> /news/2026/05
```

This is only valid if `/news/2026/05` has listing evidence.

Otherwise climb:

```text
/news/2026/05/title
  -> /news/2026/05  [date bucket, no listing evidence]
  -> /news/2026     [archive? validate]
  -> /news          [section root, validate]
  -> feed if discovered
```

### 5.9. Step 8 — Document/PDF handling

If candidate is a document:

```text
sourceScopeType = single_item or document_collection depending evidence
seedItemUrl = document URL
resolvedSourceUrl = referring collection/listing page if known
routing = adapter_backlog or item_extraction, not website channel
```

Never create ordinary website channel from a PDF URL.

### 5.10. Step 9 — Context/static page handling

If candidate is static guide/service/about/vendor page:

```text
sourceScopeType = context_page
resolvedSourceUrl = candidate URL or parent context section
routing = inventory_context
channel handoff = forbidden
```

If parent `/blog` has recurring structure, parent can be source scope, but the original page remains `seedItemUrl`, not selected proof.

### 5.11. Step 10 — API/search endpoint handling

If candidate is API/search endpoint:

```text
sourceScopeType = api_endpoint or search_endpoint
routing = adapter_backlog unless adapter exists
channel handoff = API adapter only, not website channel
```

Search endpoint should not be product success unless it produces item-level observations.

---

## 6. SourceScopeResolution routing matrix

| sourceScopeType | Default routing | Channel allowed? | Notes |
| --- | --- | --- | --- |
| `feed` | `cheap_watch` / `auto_register_probation` | Yes, if feed valid | Preferred when verified. |
| `api_endpoint` | `adapter_backlog` or API adapter | Only through adapter | Do not register as website. |
| `listing_page` | `cheap_watch` / `probation` | Yes, if stable and public | Needs item extraction path. |
| `section` | `cheap_watch` / `probation` | Yes, if recurring evidence | Avoid too-broad sections. |
| `document_collection` | `adapter_backlog` / document monitor | Only through document adapter | PDFs/docs are item artifacts. |
| `search_endpoint` | `adapter_backlog` / manual | Rarely | Needs bounded query/list-detail logic. |
| `domain_root` | manual/probation only | Only if small/validated | Avoid noisy full-domain crawl. |
| `single_item` | item extraction / inventory evidence | No ordinary channel | Find parent/source first. |
| `context_page` | `inventory_context` | No | Useful as evidence/query expansion, not source channel. |
| `blocked_or_unusable` | `manual_review` / `blocked` | No | Challenge/auth/CAPTCHA/paywall. |
| `unknown` | manual/deep probe | No auto | Needs more evidence. |

---

# P0.2 — Handoff must use resolved scope

## 7. Current anti-pattern

Do not use:

```text
source_understanding.sourceUrl
candidate.canonicalUrl
ProbeReport.candidateUrl
```

as channel URL directly.

## 8. Required handoff rule

Use:

```text
channel.url = SourceScopeResolution.resolvedSourceUrl
channel.seed_url = SourceScopeResolution.seedItemUrl
channel.evaluation_json.sourceScopeResolution = artifact json/link
channel.evaluation_json.sourceUnderstanding = artifact json/link
channel.evaluation_json.routingDecision = artifact json/link
```

If `sourceScopeType` forbids channel handoff, `RoutingDecision` must enforce it even if score is high.

---

# P0.3 — Full-run quality gates

## 9. Full-run must be fail-visible

Add summary warnings:

```text
probe_coverage_too_low
missing_required_lenses
all_selected_context_only
zero_high_quality_selected
official_adapter_quality_unproven
adapter_conversion_missing
scope_resolution_low_confidence
handoff_attempted_from_forbidden_scope_type
```

## 10. Status semantics

Run statuses:

```text
passed_mechanical
passed_with_quality_gap
completed_with_coverage_gap
mechanically_passed_quality_failed
failed_validation
```

If selected count grows but quality verification says all selected are context/listing/noise:

```text
status = mechanically_passed_quality_failed
```

If scope/routing works but selected item conversion is zero:

```text
status = partially_proven
```

---

# P0.4 — Candidate probing must be per real hypothesis

## 11. Problem

If candidates only store `hypothesis_artifact_id`, and that ID points to a batch artifact, then `maxProbeCandidatesPerHypothesis` is actually applied per batch.

## 12. Required fix

Add explicit:

```text
discovery_candidates.hypothesis_id
discovery_candidates.hypothesis_batch_artifact_id
discovery_candidates.lens
discovery_candidates.memory_mode
```

Probe selection keys:

```text
per run
per lens
per individual hypothesis
per domain
per source scope type
```

Acceptance:

```text
A run with 10 hypotheses and maxProbeCandidatesPerHypothesis=3 can probe up to 30 candidates before run/domain/lens caps.
```

---

# P0.5 — Immediate tests for SourceScopeResolution

## 13. Required unit tests

### 13.1. Detail page resolves to section/feed, not date bucket

```text
/news/2026/05/title
  -> /news or feed if validated
  != /news/2026/05 unless parent has listing evidence
```

### 13.2. Blog guide becomes context or parent section with evidence

```text
/blog/how-to-choose-x
  -> context_page if static/explainer and no recurring evidence
  -> /blog only if parent has recurring item structure
```

### 13.3. PDF/document never becomes website channel

```text
/files/request.pdf
  -> single_item/document_collection
  -> adapter_backlog or item extraction
  -> channel handoff forbidden
```

### 13.4. Listing page remains listing page

```text
/opportunities
  -> listing_page
  -> channel allowed only if item links/pagination/date evidence exists
```

### 13.5. Feed URL wins

```text
/page with rel=alternate feed
  -> feed preferred over HTML section if valid
```

### 13.6. API endpoint routes to adapter

```text
/api/search
  -> api_endpoint
  -> adapter_backlog or API channel
  -> not website channel
```

### 13.7. Context/static page cannot auto-register

```text
/service-page or evergreen explainer
  -> context_page
  -> inventory_context
  -> no channel handoff
```

### 13.8. Blocked/challenged page

```text
verification/login/CAPTCHA page
  -> blocked_or_unusable
  -> manual_review or blocked
```

### 13.9. No domain terms in resolver

Test core resolver source does not branch on domain-specific terms.  
Allowed structural terms: `feed`, `api`, `listing`, `document`, `section`, `thread`, `changelog`, `news`, `blog`, `dataset`, `registry` as web/source forms.

---

# P0.6 — Item-level conversion first

## 14. Why

Broad web discovery is useful for recall/backlog. It is not proof of product quality until item-level observations exist.

## 15. P0 item-level adapter targets, domain-neutral form

Implement generic adapter capabilities:

```text
API list -> item detail -> item observation
HTML listing -> item detail -> item observation
Document collection -> document item extraction -> item observation
PDF/document -> title/date/body/issuer/deadline/scope/evidence snippets
JSON path mapping with numeric arrays
firstDocumentUrl / firstItemUrl / firstIssuerName helpers
```

These are domain-neutral adapter forms.

## 16. Required item observation fields

```text
title
source_url
item_url
document_url if any
issuer/owner/entity if present
published_at or observed_at
deadline_or_end_date if present
body/scope/description
evidence_snippets
language
geo if derivable
raw_payload_json
source_scope_artifact_id
source_understanding_artifact_id
```

No domain-specific field names in generic schema. Domain-specific extraction can live in adapter config or mapping profile.

---

# P1.1 — SourceUnderstanding as validated canonical artifact

## 17. P1 objective

After P0 scope correctness, make `SourceUnderstanding` stronger.

## 18. Required SourceUnderstanding v2 schema

```json
{
  "artifactType": "SourceUnderstanding",
  "schemaVersion": "2.0",
  "sourceUrl": "https://example.org/news",
  "sourceScopeResolutionArtifactId": "...",
  "sourceVoice": "public_authority",
  "sourceVoiceEvidence": [],
  "artifactFreshnessKind": "recurring_listing",
  "artifactFreshnessEvidence": [],
  "signalProductionMode": "direct_event_feed",
  "signalProductionEvidence": [],
  "technicalObservability": {
    "canPollCheaply": true,
    "hasStableUrls": true,
    "hasDatesOrVersions": true,
    "hasListingsOrFeeds": true,
    "requiresBrowser": false,
    "requiresAuth": false
  },
  "risk": {
    "spamRisk": "low",
    "legalRisk": "low",
    "authOrCaptchaRisk": "low",
    "promptInjectionRisk": "medium"
  },
  "canProduceSignals": [
    {
      "desiredSignalRef": "signal_1",
      "capability": "medium",
      "directness": "direct",
      "reason": "The source publishes recurring item artifacts that can contain this signal type.",
      "evidence": []
    }
  ],
  "notExpectedToProduce": [],
  "reasonToKeep": "...",
  "reasonNotToAutoRegister": null,
  "yieldIndependent": true
}
```

## 19. LLM SourceUnderstanding as patch, not attachment

If LLM is used:

```text
deterministic understanding
  -> LLM structured proposal
  -> schema validation
  -> conflict check
  -> accepted patch
  -> canonical SourceUnderstanding v2
```

LLM must not directly bypass routing policy.

Conflict rules:

```text
hard structural evidence wins over LLM
blocked/access/challenge evidence wins over LLM
LLM can downgrade sourceVoice/signalProductionMode when page is context/static/seller-like
LLM can request deep_probe/manual_review when uncertain
```

---

# P1.2 — MegaLoop universal coverage refinement

## 20. Objective

Make MegaLoop optimal for any domain through universal coverage policy, not domain tuning.

## 21. Required universal lenses

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

## 22. Required memory modes

```text
blind
thin
gap_only
locale
artifact_lens
adversarial
full_evaluator_only
```

## 23. Coverage policy replaces raw maxBatches

Use:

```json
{
  "loopStrategy": "universal_broad_coverage",
  "coveragePolicy": {
    "requiredLensCoverage": ["..."],
    "minHypothesesPerLens": 5,
    "minQueriesPerHypothesis": 3,
    "minProbeCandidatesPerLens": 5
  },
  "adaptivePolicy": {
    "allocateExtraBudgetTo": [
      "highNovelty",
      "highSourceScopeConfidence",
      "underCoveredLens",
      "highQueryQuality",
      "adapterBacklogOpportunity"
    ],
    "stopWhen": [
      "lowNoveltyAcrossThreeBatches",
      "mostlyDuplicateCandidates",
      "mostlyBlockedOrContextOnly",
      "budgetExhausted"
    ]
  }
}
```

If required lenses are not covered:

```text
status = completed_with_coverage_gap
warnings += missing_required_lenses
```

---

# P1.3 — QueryQuality result mix from probe/scope outcomes

## 24. Result mix categories

```text
official_or_owner_sources
recurring_listings
feeds
api_endpoints
document_collections
source_directories
item_details
context_pages
seller_or_vendor_pages
search_or_category_wrappers
blocked_or_unusable
duplicates
unknown
```

## 25. Query quality decision

```text
useful_for_source_acquisition:
  produces source-worthy scopes: feed/api/listing/section/document_collection

useful_for_item_discovery:
  produces item details/documents with extractable parent scopes

useful_for_query_expansion:
  mostly context pages but adds terminology/source hints

noisy:
  mostly seller/context/wrapper pages

exhausted:
  mostly duplicates/known sources
```

Query quality should be computed after `SourceScopeResolution`, not only from raw search results.

---

# P1.4 — Re-resolution job for existing inventory/channels

## 26. Job

```text
maintenance.discovery.source_scope_reresolve
```

Inputs:

```text
source_inventory entries
source_channels created from discovery
latest ProbeReport/SourceUnderstanding artifacts
optional fresh bounded probe
```

Actions:

```text
single_item -> parent/listing/feed if validated, otherwise item extraction/backlog
context_page -> inventory_context, pause channel projection
document/pdf -> document adapter backlog or item observation
feed -> RSS/feed channel if valid
api_endpoint -> adapter backlog/API channel
listing/section -> cheap_watch/probation if valid
blocked -> manual/blocked
```

Acceptance:

```text
No active ordinary website channel should have sourceScopeType in:
  single_item
  context_page
  blocked_or_unusable

No PDF/document URL should be active ordinary website channel.
```

---

# P1.5 — Verification gates

## 27. Required proof gates

### 27.1. Source discovery gate

```text
>= N source families with evidence
>= required lens coverage
>= X% candidates with SourceScopeResolution
>= Y% routed/backlog outcomes explainable
0 unsafe auto-register from forbidden scope types
```

### 27.2. Conversion gate

```text
source scope -> item-level observations created
item observations have source/item/document URLs
item observations have evidence snippets
adapter gaps decrease
```

### 27.3. Selection quality gate

```text
selected count is not enough
operator.report.verify highQualityCount is required
context_only/listing/noise selected items fail proof
```

### 27.4. Domain-neutrality gate

```text
core source resolver, understanding, routing, MegaLoop modules contain no domain-specific enums/branches
```

---

# 28. P0–P1 implementation order

## P0 order

```text
1. Add/finalize SourceScopeResolution artifact/schema/persistence.
2. Implement scope ascent resolver with structural evidence.
3. Make handoff use resolvedSourceUrl only.
4. Add routing guardrails by sourceScopeType.
5. Add candidate.hypothesis_id and fix probe caps.
6. Add full-run warnings and status semantics.
7. Add SourceScopeResolution unit tests.
8. Add first generic item-level adapter improvements.
```

## P1 order

```text
1. SourceUnderstanding v2 canonical schema.
2. LLM understanding as validated patch.
3. Universal MegaLoop coverage policy.
4. QueryQuality from scope/result mix.
5. Re-resolution job for existing sources/channels.
6. Verification gates wired into operator/report.
```

---

# 29. What not to do

Do not:

```text
- weaken downstream selection to increase selected count;
- count source directories/context/listing pages as product proof;
- register candidateUrl directly as channelUrl;
- tune MegaLoop by adding domain-specific lenses;
- add domain-specific source classes into core;
- reject sources by zero yield;
- treat LLM proposal as authoritative without validation;
- treat mechanical run pass as quality pass.
```

---

# 30. Final target architecture after P1

```text
DiscoveryBrief
  -> Universal MegaLoop with coverage policy
  -> Candidate acquisition
  -> ProbePlan
  -> ProbeReport
  -> SourceScopeResolution
  -> SourceUnderstanding v2
  -> RoutingDecision
  -> SourceInventory
  -> optional:
       cheap watch
       probation channel
       API adapter
       document adapter
       manual review
       adapter backlog
  -> item-level observations
  -> downstream strict filtering
  -> operator quality verification
```

Final invariant:

```text
Search result finds evidence.
SourceScopeResolution finds what to monitor.
SourceUnderstanding explains why the scope can produce signals.
Routing decides what operational effect is allowed.
Adapters convert source scopes into item-level observations.
Selection remains strict and quality-verified.
```
