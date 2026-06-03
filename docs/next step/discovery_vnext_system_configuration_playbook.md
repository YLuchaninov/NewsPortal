# Discovery vNext — настройка системы и универсальный операционный playbook

Дата: 2026-06-03  
Статус: companion-документ к `discovery_vnext_system_completion_plan.md`.

Этот документ отвечает на вопрос: **как настраивать Discovery vNext**, чтобы он работал под разные system interests, не превращаясь в domain-specific код, и чтобы MegaLoop был максимально универсальным. Здесь допустимы доменные примеры, но только как настройки, domain packs и eval fixtures.

---

## 0. Executive summary

Настройки должны описывать:

```text
что является полезным сигналом для конкретного system interest
что является шумом
какие языки/географии важны
какие evidence patterns предпочтительны
какой риск допустим
какой provider/access mode можно auto-route
```

Настройки не должны менять core:

```text
memory modes
universal lenses
source scope resolver
source roles
artifact freshness kinds
signal production modes
routing mechanics
source inventory model
```

Правильная граница:

```text
Core = universal algorithms and typed artifacts.
Configuration = interest-specific semantics and policies.
```

---

## 1. Что настраивается, а что нет

### 1.1. Настраивается под домен / system interest

```text
DiscoveryBrief.desiredSignals
DiscoveryBrief.negativeSignals
positive/negative prototypes
query seeds / keyword hints
languages
geographies
freshness needs
risk tolerance
provider preferences
routing policy thresholds
manual review bands
eval fixtures
operator examples
```

### 1.2. Не настраивается под домен в core

```text
SourceScopeResolution types
SourceUnderstanding core roles
MegaLoop memory modes
Universal lens names
Routing decision types
No-yield-retention invariant
Source inventory states
MCP tool semantics
```

### 1.3. Domain vocabulary placement

Allowed:

```text
system interest configs
domain packs
tests/evals
operator docs
manual examples
prompt examples
```

Forbidden:

```text
core enums
core branching logic
core source resolver
core routing mechanics
core MegaLoop lens names
```

---

## 2. Universal MegaLoop default configuration

MegaLoop должен по умолчанию покрывать все универсальные способы появления сигналов.

### 2.1. Required universal lenses

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

### 2.2. Required memory modes

```text
blind
thin
gap_only
locale
artifact_lens
adversarial
full_evaluator_only
```

### 2.3. Recommended default run config

```json
{
  "runKind": "full",
  "loopStrategy": "universal_broad_coverage",
  "liveProviderExecution": true,
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
  },
  "maxQueryAttemptsPerRun": 120,
  "maxResultsPerQuery": 20,
  "maxProbeCandidatesPerRun": 80,
  "maxProbeCandidatesPerLens": 8,
  "maxProbeCandidatesPerHypothesis": 4,
  "maxProbeCandidatesPerDomain": 2,
  "timeRange": "y",
  "maxBrowserProbeRequests": 0,
  "dryRunHandoff": false
}
```

### 2.4. Temporary compatibility fields

If runtime still supports old fields, pass both until the API is consolidated:

```json
{
  "maxProbeRequests": 80,
  "maxProbeCandidatesPerRun": 80
}
```

### 2.5. Anti-patterns

Avoid:

```text
maxBatches = 2
only official/document lenses
month-only time range for source discovery
auto-register before source scope resolution
creating channels from candidate URL
```

---

## 3. Configuring a system interest

Every domain should be expressed through `DiscoveryBrief` / system interest settings.

### 3.1. Desired signals

Each desired signal should describe:

```text
what event/change/need/risk/opportunity matters
why it matters
what evidence could reveal it
whether signal is direct/indirect/precursor/contextual
what artifacts may carry it
```

Example schema:

```json
{
  "signalId": "signal-1",
  "description": "A public artifact indicating that an organization may need an external provider or implementation capacity.",
  "whyItMatters": "It can become a monitored business/opportunity signal.",
  "directness": "direct | indirect | precursor | contextual",
  "expectedEvidence": [
    "official notice",
    "document",
    "listing",
    "discussion",
    "dataset row",
    "changelog entry",
    "registry update"
  ]
}
```

### 3.2. Negative signals

Negative signals should be strong and explicit.

Generic negative categories:

```text
seller-authored marketing without external event evidence
SEO ranking/directory pages without item detail
generic how-to/advice/tutorial pages
wrapper/search/category/profile pages without item detail
jobs-only pages without external provider/request evidence
stale/closed/archive-only pages if no monitoring value
unusable auth/CAPTCHA/private access
```

Domain packs can add domain-specific negative phrases.

### 3.3. Must-have terms

For rare/hidden signal discovery:

```text
must_have_terms = empty or minimal
```

Hard must-have lists can kill rare formulations before semantic/LLM stages.

Use strong `must_not` and negative cues instead.

### 3.4. Language/geography

Configure:

```text
languages
geographies
excluded geographies/domains
local-language hints
```

Do not hardcode locale terms in core. Add them to the interest/domain pack.

### 3.5. Freshness

For source discovery:

```text
timeRange = y or none
```

Do not use a month-only range for discovering rare-signal sources. Freshness of selected items can be handled downstream.

---

## 4. Routing policy configuration

Routing should be generic and source-mode-based.

### 4.1. Recommended global defaults

```json
{
  "inventoryThreshold": 0.10,
  "cheapWatchThreshold": 0.25,
  "autoRegisterThreshold": 0.72,
  "minTechnicalObservability": 0.55,
  "minConfidence": 0.65,
  "maxAutoRisk": 0.35,
  "maxWatchRisk": 0.60,
  "allowedAutoRegisterSignalProductionModes": [
    "direct_event_feed",
    "direct_request_or_listing",
    "official_update",
    "source_directory"
  ],
  "allowedAutoRegisterFreshnessKinds": [
    "recurring_listing",
    "recurring_feed",
    "official_update",
    "dataset_or_registry"
  ],
  "allowedAutoRegisterSourceScopeTypes": [
    "domain_root",
    "section",
    "feed",
    "api_endpoint",
    "listing_page",
    "search_endpoint",
    "document_collection"
  ],
  "blockedAutoRegisterSourceVoices": [
    "seller_or_vendor",
    "third_party_commentary"
  ]
}
```

### 4.2. Auto inventory

Most eligible public sources can enter inventory if no hard blocker exists.

```text
inventoryThreshold = 0.10–0.15
```

### 4.3. Cheap watch

Use cheap watch for sources that may produce relevant signals and are observable with low risk.

```text
cheapWatchThreshold = 0.25–0.35
risk <= medium
sourceScopeType not in [single_item, context_page]
```

### 4.4. Auto-register probation

Auto-register only if all are true:

```text
sourceScopeType is monitorable
signalProductionMode is source-worthy
artifactFreshnessKind is recurring/official/dataset
sourceVoice is not seller/vendor/commentary
technicalObservability high enough
routingConfidence high enough
risk low enough
provider validated
```

### 4.5. Manual review

Manual review is exception path for:

```text
high capability + high risk
source scope uncertain
access/auth/browser required
possible legal/compliance issue
large crawl blast radius
conflicting evidence
unknown source role with high potential
```

### 4.6. Adapter backlog

Use adapter backlog for:

```text
PDF/document item extraction
API mapping
nested JSON path
portal list→detail extraction
browser-required public JS-heavy site
auth/API key/config needed
```

### 4.7. Blocked

Blocked for:

```text
malware/spam/phishing
unsupported login/CAPTCHA-only access
legal/policy block
dead/unreachable domain after retry
duplicate sink without added value
private/non-public data
```

---

## 5. Provider/access policies

### 5.1. RSS

```text
RSS channel only after valid feed probe.
```

If candidate is not a valid feed:

```text
fallback to website probe / inventory / manual
not active RSS
```

### 5.2. Website static

Static website can be auto-probation only if:

```text
sourceScopeType in [section, listing_page, domain_root]
listing/feed/document/official update signals observed
not static single page
```

### 5.3. Website browser

Browser is bounded fallback, not default.

```text
maxBrowserProbeRequests = 0 by default
1–2 for explicit public JS-heavy cases
no login/CAPTCHA bypass
```

### 5.4. API

API sources usually go to:

```text
adapter_backlog
```

unless an adapter already exists and is validated.

### 5.5. PDF/document

PDF/document URLs are item artifacts. They need:

```text
document item adapter
parent scope discovery
document collection watcher
```

not website channel from raw PDF URL.

### 5.6. UGC/discussions

UGC/discussions can be sensors, but:

```text
higher promptInjectionRisk / manipulationRisk
usually cheap_watch/manual, not authoritative selected source without corroboration
```

---

## 6. Source scope operational settings

### 6.1. Scope preference order

When multiple scopes are available:

1. valid feed for relevant section;
2. stable listing page;
3. stable section index;
4. API endpoint with adapter;
5. document collection;
6. domain root only if small/highly focused;
7. single item only as seed evidence;
8. context page only as inventory context.

### 6.2. Crawl guardrails

For broader scopes:

```text
respect robots
same-origin only
crawl delay
max pages per poll
max resources per scope
blocked patterns
allowed patterns if needed
no login/CAPTCHA bypass
```

### 6.3. Channel creation guardrails

Do not create operational channel if:

```text
sourceScopeType = single_item
sourceScopeType = context_page
sourceScopeType = blocked_or_unusable
raw URL is PDF without document adapter
RSS not validated
access pattern requires auth/CAPTCHA
```

---

## 7. Running discovery iterations

### 7.1. Stage A — source discovery / wide pass

Goal:

```text
find source scopes and adapter backlog, not selected content immediately
```

Config:

```json
{
  "loopStrategy": "universal_broad_coverage",
  "timeRange": "y",
  "maxProbeCandidatesPerRun": 80,
  "maxProbeCandidatesPerLens": 8,
  "maxBrowserProbeRequests": 0,
  "dryRunHandoff": false
}
```

Success metrics:

```text
all universal lenses executed
source scopes resolved
source inventory grows with resolved scopes
adapter backlog captures high-potential sources
seller/context pages retained as context, not channels
```

### 7.2. Stage B — conversion pass

Goal:

```text
turn high-potential scopes into item-level observations
```

Actions:

```text
build/update adapter
sync channel/adapter
extract item-level records
run backfill/reindex with retroNotifications=skip
check selected items
```

Success metrics:

```text
item-level observations created
final selection rows materialized
selected content from new source families
context/seller pages remain rejected
```

### 7.3. Stage C — calibration pass

Goal:

```text
adjust interest/domain settings, not core
```

Actions:

```text
review false positives/negatives
update negative signals / must-not terms
update query seeds if needed
update routing policy thresholds if source modes were misrouted
add eval fixtures
rerun bounded discovery/reindex
```

---

## 8. Domain pack template

A domain pack should be data/config only.

```json
{
  "packName": "example-domain-pack",
  "interestId": "...",
  "desiredSignals": [],
  "negativeSignals": [],
  "querySeeds": [],
  "keywordHints": [],
  "languages": ["en"],
  "geographies": [],
  "excludedDomainsOrGeos": [],
  "freshnessNeeds": "rare | slow | normal | fast",
  "providerPreferences": [],
  "routingPolicyOverrides": {},
  "evalFixtures": []
}
```

Do not create a custom MegaLoop for each domain. Use the universal MegaLoop.

---

## 9. Example: outsourcing buyer signals as configuration only

This is illustrative. Do not hardcode into core.

### 9.1. Desired signal examples

```text
buyer-authored project ask
external provider/team request
implementation partner search
proposal/RFP/RFQ/tender
budget/timeline/deadline
capacity gap / cannot hire / urgent delivery
migration/replatforming deadline
marketplace project posting
public discussion asking for recommendations
official funded digital project requiring delivery
```

### 9.2. Negative signal examples

```text
seller-authored service pages
agency rankings/directories
RFP response guides
procurement advice articles
generic how-to/tutorial pages
marketing landing pages
generic hiring pages without external provider ask
closed/awarded-only record without follow-up opportunity
wrapper/search/category pages
```

### 9.3. Recommended source mode routing

```text
official item/listing/API/document -> adapter_backlog or probation
marketplace/listing project ask -> cheap_watch/probation if public/stable
forum/discussion -> cheap_watch/manual due risk
seller/advice pages -> inventory_context
PDF RFP -> document adapter backlog
```

---

## 10. Metrics and dashboards

### 10.1. Discovery metrics

Track:

```text
runs by status
executed lenses
missing lenses
hypothesis count per lens
candidate count per lens
probe count per lens
source scope types
source inventory state counts
adapter backlog count
routing decision counts
query result mix
```

### 10.2. Conversion metrics

Track:

```text
adapter backlog -> adapter implemented
source scope -> channel projection
channel -> item observations
item observations -> final selection
final selection -> public content items
```

### 10.3. Quality metrics

Track:

```text
seller/context pages auto-registered count should be 0
invalid RSS channels should be 0
single_item channels should be 0 unless special item watcher exists
source scope correction rate
routing feedback error rate
selected false positive rate
```

### 10.4. Warnings

Run should warn on:

```text
missing_required_lenses
probe_coverage_too_low
candidate_url_registered_as_channel
invalid_rss_probe
context_page_auto_register_attempt
single_item_auto_register_attempt
adapter_backlog_growth_without_conversion
llm_review_failures
```

---

## 11. LLM configuration

### 11.1. LLM use cases

LLM can help with:

```text
DiscoveryBrief generation
HypothesisBatch generation
SourceScopeResolution explanation
SourceUnderstanding patch
QueryQuality result mix classification
coverage gap diagnosis
```

### 11.2. LLM must output typed patches

Do not accept free-form prose.

```text
LLM output -> schema validation -> conflict check -> accepted canonical patch
```

### 11.3. LLM health

Operator dashboard should show:

```text
provider/model/config
last success/failure
pending/failed/skipped reviews
gray-zone unresolved reason
budget/quota
```

If LLM unreliable, deterministic path must still run.

---

## 12. Feedback configuration

### 12.1. Feedback types

Use typed feedback:

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

### 12.2. Feedback use

Feedback may influence:

```text
future source understanding
query quality calibration
routing thresholds
eval fixtures
operator review priority
```

Feedback must not silently delete sources solely due to zero yield.

---

## 13. Evaluation fixtures

Keep domain examples as evals.

Recommended eval domains:

```text
outsourcing buyer signals
job board
IT/security advisories
public policy/regulatory monitoring
research/grants/funding
product changelogs
local government/public records
marketplace/listing signals
public discussions / UGC signals
```

Each fixture should label:

```text
candidateUrl
expected sourceScopeType
expected sourceVoice
expected artifactFreshnessKind
expected signalProductionMode
expected routingDecision
expected selected/not-selected if item-level
```

---

## 14. Clean operational runbook

### Step 1 — create/update system interest

Configure:

```text
desired signals
negative signals
languages/geos
keyword hints
must-not terms
freshness needs
```

### Step 2 — run universal broad discovery

Use universal coverage settings, not a domain-specific MegaLoop.

### Step 3 — inspect run warnings

Check:

```text
missing lenses
probe coverage
source scope distribution
adapter backlog
context-only pages
invalid RSS guesses
```

### Step 4 — review source scopes, not raw URLs

Operator should review:

```text
resolvedSourceUrl
sourceScopeType
seedItemUrl
why resolved
why monitored/not monitored
```

### Step 5 — implement adapters for high-value backlog

Prioritize source scopes with:

```text
official/direct/listing/document/API evidence
high source-scope confidence
low risk
clear item extraction path
```

### Step 6 — sync/reindex

After adapter/channel changes:

```text
channels.sync.request
maintenance.reindex.request retroNotifications=skip
content_items.list / explain
operator selection dashboard
```

### Step 7 — calibrate settings only

If false positives:

```text
update negative signals / must-not terms / routing thresholds
```

Do not add domain branches to core.

---

## 15. What we almost lost / must keep in operations

### 15.1. Broad discovery and conversion are different runs

Do not expect every discovery run to immediately increase selected count.

### 15.2. Adapter backlog is actionable output

A growing backlog is not bad if it contains high-potential resolved source scopes.

### 15.3. Source scope review is more important than URL review

Reviewing raw candidate URLs will mislead operators into approving pages instead of sources.

### 15.4. Hidden signals need all universal lenses

If public discussions, marketplaces, local language, and weird artifacts do not run, hidden signals were not really searched.

### 15.5. Do not let settings mutate core

When a domain needs tuning, change domain pack / interest config / evals / thresholds.

### 15.6. Downstream selection should remain strict

Do not solve discovery weakness by weakening final selection.

### 15.7. Full site can be noisy

Prefer resolved signal-dense scope over full domain when appropriate.

### 15.8. Existing active channels may need demotion

After scope re-resolution, some current channels should become:

```text
inventory_context
adapter_backlog
manual_review
paused/deleted operational projection
```

### 15.9. Auto-routing must be rollbackable

All auto-routed sources should have:

```text
policyVersion
runId
rollbackGroupId
reason
evidence
```

### 15.10. Manual review is exception path

Manual review should focus on high-risk/uncertain/high-potential sources, not every candidate.

---

## 16. Recommended default policies by mode

### Broad source discovery

```json
{
  "inventoryThreshold": 0.10,
  "cheapWatchThreshold": 0.25,
  "autoRegisterThreshold": 0.78,
  "maxAutoRisk": 0.30,
  "autoRegisterRequiresResolvedScope": true,
  "autoRegisterDisallowScopeTypes": ["single_item", "context_page", "blocked_or_unusable"]
}
```

### Conservative production auto-register

```json
{
  "inventoryThreshold": 0.15,
  "cheapWatchThreshold": 0.35,
  "autoRegisterThreshold": 0.82,
  "minTechnicalObservability": 0.70,
  "minConfidence": 0.75,
  "maxAutoRisk": 0.25
}
```

### Research/exploration mode

```json
{
  "inventoryThreshold": 0.05,
  "cheapWatchThreshold": 0.20,
  "autoRegisterThreshold": 0.90,
  "dryRunHandoff": true,
  "manualReviewBand": [0.40, 0.80]
}
```

---

## 17. Final operating principle

```text
Discovery settings tell the system what signals matter.
Universal MegaLoop explores where such signals might appear.
SourceScopeResolution decides what scope is monitorable.
SourceUnderstanding explains why that scope can produce signals.
Routing policy decides what to do safely.
Adapters convert source scopes into item-level observations.
Final selection remains strict.
```
