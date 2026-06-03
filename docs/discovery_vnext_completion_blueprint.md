# Discovery vNext Completion Blueprint

**Назначение:** документ-инструкция по доделке текущей реализации Discovery vNext так, чтобы она стала универсальной zero-shot системой поиска и мониторинга источников под любые `system interests`, без доменной привязки к outsourcing/procurement/job boards и без обесценивания редких источников из-за отсутствия исторического yield.

**Контекст:** в текущей системе уже реализованы базовые артефакты `DiscoveryBrief`, `HypothesisBatch`, `ProbePlan`, `ProbeReport`, `SourceUnderstanding`, `RoutingDecision`, таблицы `discovery_artifacts`, `discovery_candidates`, `source_inventory`, `source_monitoring_state`, `source_observations`, `discovery_policies`, `adapter_backlog`, `discovery_feedback_events`, а также vNext API/MCP/админские поверхности. Это правильный каркас. Главная проблема сейчас не в отсутствии структуры, а в том, что `SourceUnderstanding`, `MegaLoop`, `QueryQuality` и handoff пока слишком shallow: система может принять страницу, содержащую нужные слова, за источник, способный регулярно производить нужные сигналы.

**Ключевой вывод:** не надо откатываться к старому graph-first discovery и не надо строить огромную domain-specific ontology. Нужно усилить уже существующий contract-driven loop: сделать `SourceUnderstanding` действительно универсальным, но interest-conditioned; сделать `MegaLoop` настоящим controlled-amnesia генератором гипотез; сделать routing зависимым от роли/режима источника, а не только от capability score; и сделать source inventory первичной truth, а channel — лишь опциональной operational projection.

---

## 1. Цели переделки

### 1.1. Product goal

Discovery должен принимать произвольный `system interest` и строить вокруг него **sensor mesh**: широкую карту потенциальных публичных источников, артефактов, endpoint-ов, query families, source understandings и monitoring decisions, которые могут помочь обнаруживать редкие или частые сигналы.

Discovery не должен отвечать только на вопрос:

```text
релевантен ли источник?
```

Он должен отвечать на вопросы:

```text
что это за источник?
какие публичные артефакты он производит?
может ли этот тип артефактов содержать desired signals текущего interest?
сигнал был бы direct, indirect, precursor или contextual?
можно ли источник дешево и безопасно наблюдать?
что с ним делать: inventory, cheap_watch, probation channel, manual review, adapter backlog, blocked?
```

### 1.2. Engineering goal

Нужно не переписывать всё с нуля, а доделать текущий vNext:

- расширить contract schemas;
- усилить `SourceUnderstanding`;
- сделать real end-to-end full run;
- улучшить `MegaLoop`;
- исправить RSS/provider inference;
- улучшить query quality;
- ограничить auto-register;
- сделать admin/MCP surfaces показывающими source understanding, а не только score;
- добавить eval suite на разные домены, включая outsourcing только как один тестовый домен.

### 1.3. Non-goals

Не строим сейчас:

- hardcoded outsourcing/procurement/job taxonomy;
- сложную Bayesian-модель;
- многоагентный scaffolding из planner/critic/researcher/evaluator;
- автоматическую генерацию новых production adapters без review;
- auto-delete источников из-за нулевого yield;
- LLM-review каждого candidate как обязательный hot path;
- ручной approval каждого найденного источника.

---

## 2. Архитектурные инварианты

### 2.1. Domain-neutral core

В ядре запрещены доменные enum/value/branch names вроде:

```text
procurement_portal
rfp_signal
outsourcing_buyer
hiring_gap
migration_pressure
job_board
security_advisory
```

Они могут встречаться только:

- в `DiscoveryBrief`, если они прямо есть в исходном `system interest`;
- в сгенерированном runtime artifact;
- в eval fixtures;
- в example docs.

В core schemas допустимы только универсальные категории:

```text
sourceVoice
artifactFreshnessKind
signalProductionMode
artifactType
accessPattern
technicalObservability
risk
capability
directness
routingConfidence
```

### 2.2. Interest-conditioned, not domain-specific

`SourceUnderstanding` не должен быть domain-specific, но обязан быть **interest-conditioned**.

Правильная формула:

```text
SourceUnderstanding =
  domain-neutral source role / artifact / freshness / observability / risk
  +
  interest-conditioned capability against DiscoveryBrief.desiredSignals
```

То есть:

- источник сначала понимается универсально: кто говорит, что публикует, как обновляется, как наблюдается;
- затем его способность оценивается относительно `DiscoveryBrief.desiredSignals`;
- никаких outsourcing-specific правил в коде.

### 2.3. Source inventory is truth; source_channels are projection

`source_inventory` должен быть primary discovery truth.

`source_channels` должны создаваться только когда `RoutingDecision` решил, что источник достаточно:

- observable;
- recurring или official-update oriented;
- low-risk;
- technically valid;
- suitable for operational monitoring.

Не каждый найденный source становится channel. Многие источники должны оставаться:

```text
inventory
inventory_context
cheap_watch
manual_review
adapter_backlog
blocked
```

### 2.4. No yield-based source retention

Historical yield, recent useful hits, selected items count, stored item count и downstream filtering results не должны использоваться для keep/drop редких источников.

Разрешено использовать yield-like telemetry только для:

- dashboard/debug;
- temporary polling boost;
- query/policy diagnostics;
- retrospective quality analysis;
- UI sorting, но не hard rejection.

Инвариант:

```text
zero useful signals observed != weak source
zero useful signals observed == no event observed yet
```

### 2.5. Auto-routing, not manual-review-first

Система может находить сотни или тысячи sources. Ручной approval для каждого источника не масштабируется.

Нужно использовать routing policy:

```text
inventory
inventory_context
inventory_low_priority
cheap_watch
auto_register_probation
manual_review
adapter_backlog
blocked
rejected_structural
```

Manual review — exception path для high-risk, uncertain, expensive, adapter/auth/API/browser-heavy cases.

### 2.6. Harness for open-ended discovery; deterministic runtime for monitoring

Open-ended reasoning выполняется через bounded discovery harness:

- compile brief;
- generate hypothesis batches;
- run controlled-amnesia mega loop;
- generate query families;
- synthesize source understanding;
- diagnose gaps.

Production runtime остаётся deterministic:

- probes;
- routing policy;
- inventory state transitions;
- channel handoff;
- monitoring;
- downstream filtering.

---

## 3. Текущее состояние и главные разрывы

### 3.1. Что уже хорошо

В текущем архиве уже есть:

```text
services/workers/app/discovery_vnext_artifacts.py
services/workers/app/discovery_vnext_brief.py
services/workers/app/discovery_vnext_megaloop.py
services/workers/app/discovery_vnext_candidates.py
services/workers/app/discovery_vnext_probe.py
services/workers/app/discovery_vnext_understanding.py
services/workers/app/discovery_vnext_routing.py
services/workers/app/discovery_vnext_handoff.py
services/api/app/discovery_vnext_api.py
services/mcp/src/tools/discovery/vnext-tools.ts
packages/contracts/src/discovery-vnext.ts
database/migrations/0056_discovery_vnext_foundation.sql
database/migrations/0057_discovery_vnext_hard_cutover.sql
database/migrations/0059_discovery_vnext_completion_runtime.sql
```

Это значит, что vNext не надо начинать заново. Есть базовая contract-driven skeleton.

### 3.2. Разрыв 1: `SourceUnderstanding` сейчас shallow

Текущий `discovery_vnext_understanding.py` в основном выводит capability из:

```text
artifact_fit
technical_observability
evidence_directness
```

и формирует универсальные фразы вроде:

```text
<host> publishes public web resources that can expose source artifacts.
```

Это недостаточно. Такая логика не отличает:

```text
seller service page
static evergreen advice article
secondary explainer
source directory
official program page
recurring listing source
public authority update
community/UGC sensor
```

Поэтому vendor/advice/SEO pages могут получать завышенный `capabilityFit` и попадать в active channels.

### 3.3. Разрыв 2: `MegaLoop` сейчас формальный

Текущий `discovery_vnext_megaloop.py` имеет lenses и memory modes, но каждый batch создаёт фактически одну шаблонную гипотезу, query families — это seed terms + lens qualifiers, comparator почти всегда ставит `noveltyScore = 1.0` и не сравнивает с persistent memory.

Это не настоящий controlled-amnesia meta loop.

Нужно, чтобы генераторы независимо создавали разные hypothesis batches, а evaluator/comparator сравнивал их со всей памятью.

### 3.4. Разрыв 3: QueryQuality измеряет объём, а не качество

Текущий `query_quality_report()` считает query хорошим, если он дал достаточно normalized candidates. Но много candidates может означать много vendor/SEO/advice pages.

Нужно оценивать result mix:

```text
owner/official sources
recurring/listing sources
source directories
secondary explainers
seller/vendor pages
SEO/noise
dead/blocked
duplicates
```

### 3.5. Разрыв 4: full run не является полноценным full loop

В текущем `execute_run_steps()` full run делает:

```text
brief_compile
mega_loop
candidate_acquisition
```

Но `probe` запускается только если в request уже передан `probePlan`, а `understand_route` — только если в request уже передан `sourceUnderstanding`.

То есть current `full` не выполняет автоматически:

```text
candidate -> ProbePlan -> ProbeReport -> SourceUnderstanding -> RoutingDecision -> handoff
```

Это нужно исправить.

### 3.6. Разрыв 5: RSS/provider inference слишком слабый

Candidate URL может получить `candidateKindGuess = rss` по текстовым токенам, но active RSS channel должен создаваться только после валидного feed probe.

Правило:

```text
Never create RSS source_channel unless feed probe confirms parsable RSS/Atom/JSON Feed.
```

Если feed probe невалиден, но website probe успешен — candidate должен быть website/inventory/cheap_watch/manual, а не broken RSS channel.

### 3.7. Разрыв 6: routing policy получает завышенные inputs

`discovery_vnext_routing.py` в целом нормален как deterministic policy layer, но он зависит от `SourceUnderstanding`. Если understanding завышает `capabilityFit`, routing policy будет принимать мусор.

Приоритет — не “подкрутить thresholds”, а улучшить semantic source understanding.

---

## 4. Целевой pipeline

Целевая цепочка:

```text
System Interest
  -> DiscoveryBrief
  -> HypothesisMegaLoop
  -> HypothesisComparator
  -> CandidateAcquisition
  -> QueryQualityReport
  -> ProbePlan
  -> ProbeReport
  -> SourceUnderstanding
  -> RoutingDecision
  -> SourceInventory update
  -> optional MonitoringState
  -> optional source_channel probation handoff
  -> downstream strict filtering
```

### 4.1. System Interest input

Input должен быть произвольным и domain-neutral:

```json
{
  "interestId": "...",
  "name": "...",
  "description": "...",
  "positiveTexts": [],
  "negativeTexts": [],
  "candidatePositiveSignals": [],
  "candidateNegativeSignals": [],
  "geographies": [],
  "languages": [],
  "allowedContentKinds": [],
  "mustNotHaveTerms": []
}
```

Outsourcing, procurement, job board и т.п. не должны появляться, если они не содержатся в input.

### 4.2. DiscoveryBrief

`DiscoveryBrief` должен компилировать interest в универсальные desired/negative signals.

Требуемые поля:

```json
{
  "interestId": "...",
  "interestName": "...",
  "sourceInterestText": "...",
  "goal": "...",
  "desiredSignals": [
    {
      "signalId": "signal-1",
      "description": "domain-neutral or interest-derived description",
      "whyItMatters": "...",
      "directness": "direct | indirect | precursor | contextual",
      "expectedEvidencePatterns": ["..."],
      "signalPolarity": "positive",
      "sourceOfSignal": "positive_text | candidate_cue | generated_from_interest"
    }
  ],
  "negativeSignals": [
    {
      "description": "...",
      "whyExcluded": "...",
      "sourceOfSignal": "negative_text | candidate_negative_cue | generated_from_interest"
    }
  ],
  "artifactExpectations": ["article", "listing", "document", "dataset", "thread", "registry_entry", "report"],
  "geographies": [],
  "languages": [],
  "freshnessNeed": "fast | normal | slow | rare | unknown",
  "constraints": {
    "domainNeutralCore": true,
    "noYieldBasedRejection": true,
    "noLoginOrCaptchaBypass": true,
    "publicSourcesOnly": true
  },
  "querySeeds": [],
  "keywordHints": []
}
```

### 4.3. HypothesisMegaLoop

Цель — не одна гипотеза, а независимые batches из разных perspectives.

Обязательные memory modes:

```text
blind        видит только source interest + hard constraints
thin         видит DiscoveryBrief, но не старые источники/candidates
gap_only     видит coverage gaps, но не successful directions
locale       видит interest + language/geo slice
artifact_lens видит interest + один artifact/source lens
adversarial  ищет то, что предыдущие batches могли забыть
full         только comparator/evaluator, не generator
```

Universal lenses:

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

Каждый generator batch должен вернуть 5–20 гипотез, а не одну.

Формат hypothesis:

```json
{
  "hypothesisId": "...",
  "description": "...",
  "sourceRoleDescription": "universal source role description, not domain class",
  "expectedArtifacts": ["listing", "document"],
  "expectedSignalLinks": [
    {
      "signalId": "signal-1",
      "capabilityReason": "why this artifact/source role could expose that signal",
      "expectedDirectness": "direct | indirect | precursor | contextual"
    }
  ],
  "queryFamilies": [
    {
      "familyId": "...",
      "intent": "find official sources / recurring listings / public documents / etc.",
      "queries": ["..."],
      "badIfResultsAre": ["seller pages", "generic SEO content", "static explainers"]
    }
  ],
  "riskAssumption": "low | medium | high | unknown",
  "actionability": "high | medium | low",
  "memoryMode": "blind",
  "lens": "official_owners"
}
```

### 4.4. HypothesisComparator

Comparator получает:

- all new HypothesisBatch payloads;
- previous accepted hypotheses;
- previous rejected/noisy hypotheses;
- existing source inventory;
- coverage map;
- feedback events.

Он должен считать:

```text
noveltyScore
coverageGain
actionabilityScore
riskScore
rediscoveryCount
duplicateOf
mergedInto
status = accepted | duplicate | merged | rejected | needs_probe
```

Важно: `rediscoveryCount` не всегда плохо. Если несколько independent batches приходят к похожей идее, это может быть positive signal.

### 4.5. CandidateAcquisition

Candidate acquisition запускает search queries по accepted hypotheses.

Для каждого result:

```json
{
  "canonicalUrl": "...",
  "canonicalDomain": "...",
  "candidateKindGuess": "rss | website | api | document | dataset | unknown",
  "acquisitionEvidence": {
    "paths": [
      {
        "hypothesisId": "...",
        "queryAttemptId": "...",
        "title": "...",
        "snippet": "...",
        "provider": "ddgs | stub | ...",
        "rank": 1
      }
    ]
  },
  "rediscoveryCount": 1,
  "status": "new"
}
```

Canonical identity must not include run ID.

Correct source identity:

```text
provider-neutral canonical identity = canonical_domain + normalized canonical_url or source root
```

Wrong:

```text
interest/run/signal-pack specific sourceIdentityKey
```

Run/interest/hypothesis links must live as relationships/evidence, not identity.

### 4.6. QueryQualityReport

Current `likelyUsefulCandidates = len(candidates)` must be replaced.

New result mix:

```json
{
  "query": "...",
  "queryFamilyIntent": "...",
  "observedResultMix": {
    "ownerOrOfficialSources": 0,
    "recurringListingSources": 0,
    "sourceDirectories": 0,
    "datasetsOrRegistries": 0,
    "secondaryExplainers": 0,
    "sellerOrVendorPages": 0,
    "seoOrContentFarm": 0,
    "deadOrBlocked": 0,
    "duplicates": 0,
    "unknown": 0
  },
  "quality": "useful_for_acquisition | useful_for_query_expansion | needs_refinement | noisy | exhausted",
  "refinementHints": [],
  "recommendedNextAction": "probe_top_candidates | refine_query | use_different_lens | stop_family"
}
```

This can initially be heuristic, then LLM-assisted.

### 4.7. ProbePlan

ProbePlan remains good conceptually. It must explicitly encode:

```json
{
  "candidateUrl": "...",
  "candidateKindGuess": "...",
  "probeStrategy": "cheap_static_first",
  "checks": ["website_static_probe", "rss_feed_probe", "sitemap_probe"],
  "limits": {
    "maxRequests": 10,
    "maxBrowserRequests": 0,
    "timeoutMs": 10000,
    "sampleCount": 5,
    "sameOriginOnly": true
  },
  "allowedEscalations": [],
  "disallowedActions": ["login", "captcha_bypass", "cookie_replay", "stealth_scraping"],
  "fetchersBoundary": {
    "owner": "services/fetchers",
    "pythonRole": "orchestrate_only"
  }
}
```

### 4.8. ProbeReport

ProbeReport must expose richer page/source-shape observations:

```json
{
  "candidateUrl": "...",
  "accessPattern": "public | requires_browser | requires_auth | captcha_blocked | blocked | unknown",
  "technicalObservability": {
    "observable": true,
    "score": 0.72,
    "feedValid": false,
    "staticWebsiteSignals": true,
    "hasStableUrls": true,
    "hasDateOrVersionSignals": true,
    "hasRecurringStructure": true,
    "challengeDetected": false
  },
  "observedArtifacts": [
    {
      "artifactType": "listing | article | document | dataset | thread | registry_entry | changelog | unknown",
      "countEstimate": 12,
      "evidence": ["..."],
      "sampleUrls": []
    }
  ],
  "pageRoleHints": {
    "sellerOrVendorLikely": false,
    "officialOwnerLikely": true,
    "aggregatorOrDirectoryLikely": false,
    "secondaryExplainerLikely": false,
    "staticEvergreenLikely": false
  },
  "providerFailures": [],
  "negativeEvidencePolicy": {
    "providerFailuresDoNotPunishSource": true,
    "historicalYieldNotUsed": true
  }
}
```

---

## 5. SourceUnderstanding: целевая спецификация

### 5.1. Required fields

Current schema must be extended.

New `SourceUnderstanding` payload:

```json
{
  "candidateId": "...",
  "sourceUrl": "...",

  "sourceRoleDescription": "Human-readable description of this source role",

  "sourceVoice": "owner_or_operator | public_authority | seller_or_vendor | aggregator_or_directory | community_or_ugc | third_party_commentary | unknown",

  "artifactProducingBehavior": "Human-readable description of what source publishes",

  "artifactFreshnessKind": "recurring_listing | recurring_feed | official_update | static_service_page | evergreen_article | documentation_or_guide | dataset_or_registry | community_thread | unknown",

  "signalProductionMode": "direct_event_feed | direct_request_or_listing | official_update | precursor_context | source_directory | secondary_context | unlikely | unknown",

  "observedArtifactTypes": ["listing", "document"],

  "canProduceSignals": [
    {
      "signalId": "signal-1",
      "signalDescription": "copied from DiscoveryBrief desired signal",
      "capability": "high | medium | low | unknown",
      "capabilityScore": 0.0,
      "directness": "direct | indirect | precursor | contextual",
      "reason": "Why this source can theoretically produce this signal",
      "evidenceFromProbe": [],
      "counterEvidence": []
    }
  ],

  "notExpectedToProduce": [
    {
      "signalId": "signal-2",
      "reason": "Why this source is structurally unlikely to produce this signal"
    }
  ],

  "artifactFit": 0.0,
  "technicalObservability": 0.0,
  "evidenceDirectness": 0.0,
  "sourceRoleConfidence": 0.0,
  "routingConfidence": 0.0,

  "risk": {
    "overallRisk": "low | medium | high | unknown",
    "riskScore": 0.0,
    "legalRisk": "low | medium | high | unknown",
    "spamRisk": "low | medium | high | unknown",
    "promptInjectionRisk": "low | medium | high | unknown",
    "authOrCaptchaRisk": "low | medium | high | unknown",
    "crawlBlastRadius": "low | medium | high | unknown"
  },

  "hardBlockers": [],
  "classificationUncertain": false,
  "potentialHigh": false,
  "adapterRequired": false,
  "yieldIndependent": true,

  "reasonToKeep": "...",
  "reasonNotToAutoRegister": "...",

  "accessPattern": "public | requires_browser | requires_auth | captcha_blocked | blocked | unknown",
  "suggestedProviderType": "rss | website | api | document_portal | unknown",
  "probeSummary": {}
}
```

### 5.2. Universal role enums

These are allowed because they are domain-neutral:

#### `sourceVoice`

```text
owner_or_operator
public_authority
seller_or_vendor
aggregator_or_directory
community_or_ugc
third_party_commentary
unknown
```

Meaning:

- `owner_or_operator`: source is operated by entity that owns the relevant product/service/program/data.
- `public_authority`: government/regulatory/public institution.
- `seller_or_vendor`: source sells services/products or produces vendor-marketing/advice.
- `aggregator_or_directory`: source aggregates/listings/directories from multiple entities.
- `community_or_ugc`: user-generated discussion/issues/forums/social.
- `third_party_commentary`: editorial/explainer/analysis not owning primary event.
- `unknown`: insufficient evidence.

#### `artifactFreshnessKind`

```text
recurring_listing
recurring_feed
official_update
static_service_page
evergreen_article
documentation_or_guide
dataset_or_registry
community_thread
unknown
```

#### `signalProductionMode`

```text
direct_event_feed
direct_request_or_listing
official_update
precursor_context
source_directory
secondary_context
unlikely
unknown
```

This is the most important field for routing.

### 5.3. Scoring logic

Do not infer capability from artifact/technical score alone.

Use:

```text
capabilityScore(signal) =
  signal_role_fit
  × artifact_relevance
  × production_mode_weight
  × source_voice_weight
  × observability_weight
  × confidence
  - risk_penalty
```

Initial deterministic weights:

```text
signalProductionMode:
  direct_event_feed        0.95
  direct_request_or_listing 0.95
  official_update          0.80
  source_directory         0.70
  precursor_context        0.55
  secondary_context        0.35
  unlikely                 0.10
  unknown                  0.25

artifactFreshnessKind:
  recurring_listing        0.95
  recurring_feed           0.90
  official_update          0.80
  dataset_or_registry      0.75
  community_thread         0.55
  documentation_or_guide   0.40
  evergreen_article        0.30
  static_service_page      0.15
  unknown                  0.25

sourceVoice:
  public_authority         0.90
  owner_or_operator        0.80
  aggregator_or_directory  0.75
  community_or_ugc         0.55
  third_party_commentary   0.40
  seller_or_vendor         0.20
  unknown                  0.35
```

These are not domain-specific. They encode source role reliability and recurringness.

### 5.4. Examples without domain hardcode

#### Static seller page

```json
{
  "sourceVoice": "seller_or_vendor",
  "artifactFreshnessKind": "static_service_page",
  "signalProductionMode": "unlikely",
  "recommendedRouting": "inventory_context",
  "reasonNotToAutoRegister": "Static seller-authored page is not a recurring producer of external signals."
}
```

#### Public authority program page

```json
{
  "sourceVoice": "public_authority",
  "artifactFreshnessKind": "official_update",
  "signalProductionMode": "official_update",
  "recommendedRouting": "cheap_watch",
  "reasonToKeep": "Official public source can publish slow or rare updates relevant to the interest."
}
```

#### Aggregator/directory/listing source

```json
{
  "sourceVoice": "aggregator_or_directory",
  "artifactFreshnessKind": "recurring_listing",
  "signalProductionMode": "source_directory",
  "recommendedRouting": "manual_review_or_probation",
  "reasonToKeep": "Recurring directory can expose candidate artifacts but may need access/subscription/quality review."
}
```

#### Secondary explainer

```json
{
  "sourceVoice": "third_party_commentary",
  "artifactFreshnessKind": "evergreen_article",
  "signalProductionMode": "secondary_context",
  "recommendedRouting": "inventory_context",
  "reasonToKeep": "Useful for terminology/query expansion, not for active monitoring as a primary signal source."
}
```

---

## 6. Routing policy v2

### 6.1. Add routing decisions

Current routing decisions should add:

```text
inventory_context
```

Meaning: source is useful as background/terminology/query-expansion/context, but not as active monitoring channel.

Full set:

```text
inventory
inventory_context
inventory_low_priority
cheap_watch
auto_register_probation
manual_review
adapter_backlog
blocked
rejected_structural
```

### 6.2. Auto-register must require source mode eligibility

Current routing mainly checks:

```text
capabilityFit >= threshold
technicalObservability >= threshold
routingConfidence >= threshold
riskScore <= threshold
```

Add source-mode gate:

```text
auto_register_probation allowed only if:
  signalProductionMode in [direct_event_feed, direct_request_or_listing, official_update]
  OR (signalProductionMode == source_directory AND provider/risk policy allows probation)

AND artifactFreshnessKind in [recurring_listing, recurring_feed, official_update, dataset_or_registry]

AND sourceVoice not in [seller_or_vendor, third_party_commentary]

AND accessPattern == public

AND no hardBlockers

AND suggestedProviderType is validated by probe
```

### 6.3. Cheap watch criteria

`cheap_watch` allowed for:

```text
signalProductionMode in [official_update, source_directory, precursor_context, direct_event_feed, direct_request_or_listing]
technicalObservability >= threshold
risk <= maxWatchRisk
```

### 6.4. Inventory context criteria

`inventory_context` for:

```text
seller_or_vendor + static_service_page
evergreen_article + secondary_context
documentation_or_guide + secondary_context
third_party_commentary where useful for query terms but not source monitoring
```

### 6.5. Adapter backlog criteria

`adapter_backlog` for:

```text
source could produce desired signals
BUT requires unsupported API/auth/parser/browser/custom adapter
```

### 6.6. Blocked criteria

`blocked` for:

```text
captcha_blocked without allowed browser path
malware/spam/phishing
legal/policy block
unsupported auth required
dead source
```

### 6.7. Routing pseudocode

```python
def route_source_understanding_v2(u, policy):
    if has_hard_blocker(u):
        return blocked

    if u.adapterRequired or access_policy_requires_adapter(u.accessPattern):
        return adapter_backlog

    if u.riskScore > policy.maxWatchRisk:
        return manual_review

    if is_context_only(u):
        return inventory_context

    if is_auto_register_eligible_source_mode(u):
        if scores_pass_auto_register(u, policy):
            return auto_register_probation

    if is_cheap_watch_eligible(u):
        if scores_pass_cheap_watch(u, policy):
            return cheap_watch

    if u.classificationUncertain and u.potentialHigh:
        return manual_review

    if u.capabilityFit >= policy.inventoryThreshold:
        return inventory

    return inventory_low_priority
```

---

## 7. Probe/provider fixes

### 7.1. RSS validation rule

Do not create RSS source from guessed candidate.

Required:

```text
if candidateKindGuess == rss:
  run feed probe
  if feedValid:
    suggestedProviderType = rss
  else:
    if website probe has signals:
      suggestedProviderType = website
    else:
      suggestedProviderType = unknown
      decision = manual_review or inventory_low_priority
```

### 7.2. Access challenge rule

If probe detects challenge/captcha/verification page:

```text
accessPattern = captcha_blocked or requires_browser
signalProductionMode cannot be direct_event_feed by default
routing = manual_review or blocked
never auto_register
```

### 7.3. Website page role hints

Fetchers website probe should try to classify page shape into generic hints:

```text
sellerOrVendorLikely
officialOwnerLikely
publicAuthorityLikely
aggregatorOrDirectoryLikely
communityOrUgcLikely
secondaryExplainerLikely
staticEvergreenLikely
recurringListingLikely
datasetOrRegistryLikely
```

Initial heuristics can use:

- URL path (`/blog/`, `/docs/`, `/press/`, `/news/`, `/tenders/`, `/registry/`, `/api/`, `/changelog/`);
- page title/snippet;
- schema.org metadata;
- sitemap/collection behavior;
- presence of dates/multiple detail links;
- repeated list cards;
- forms/login/paywall indicators;
- article body author/source voice hints.

This is not domain-specific; it is web-source role classification.

---

## 8. Full run completion

### 8.1. Target full run

`run_kind = full` must execute:

```text
brief_compile
mega_loop
candidate_acquisition
query_quality
candidate_selection_for_probe
probe_plan_build
probe_execute
source_understand
route
handoff
```

### 8.2. Candidate probe selection

Do not probe all candidates by default. Use limits:

```text
maxProbeCandidatesPerRun
maxProbeCandidatesPerHypothesis
minCandidateRediscoveryCount optional
provider/risk filters
query result mix priority
```

Selection criteria:

```text
ranked by:
  query quality
  rediscovery count
  source-like URL/path
  official/owner/directory/listing hints
  diversity by canonical domain
  lens diversity
```

### 8.3. Full run output

Full run result should include:

```json
{
  "briefArtifact": {},
  "hypothesisArtifacts": [],
  "megaLoopComparison": {},
  "candidateAcquisition": {},
  "probeReports": [],
  "sourceUnderstandings": [],
  "routingDecisions": [],
  "handoffResults": [],
  "summary": {
    "candidateCount": 0,
    "probedCount": 0,
    "inventoryCount": 0,
    "contextCount": 0,
    "cheapWatchCount": 0,
    "probationChannelCount": 0,
    "manualReviewCount": 0,
    "adapterBacklogCount": 0,
    "blockedCount": 0
  }
}
```

---

## 9. Data model adjustments

### 9.1. Keep current tables

Keep:

```text
discovery_artifacts
discovery_candidates
source_inventory
source_monitoring_state
source_observations
discovery_policies
adapter_backlog
discovery_feedback_events
discovery_vnext_runs
discovery_run_steps
discovery_query_attempts
discovery_llm_gateway_events
```

### 9.2. Add optional generated columns/indexes

If needed for admin/filtering:

```sql
alter table source_inventory
  add column if not exists source_voice text null,
  add column if not exists artifact_freshness_kind text null,
  add column if not exists signal_production_mode text null,
  add column if not exists source_role_confidence numeric null,
  add column if not exists inventory_reason text null;
```

But this is optional; first version can read from latest `SourceUnderstanding` artifact.

### 9.3. Add `inventory_context` state

Update check constraint to include:

```text
inventory_context
```

### 9.4. Source identity

Ensure `source_identity_key` is canonical and stable:

```text
source_identity_key = provider-neutral canonical source root
```

Suggested implementation:

```text
source_identity_key = canonical_domain + normalized_source_root
```

Where source root is:

- feed URL for valid RSS;
- website root/section URL for website;
- API endpoint root for API;
- document portal root for document portals.

Never include:

```text
run_id
interest_id
signal pack key
hypothesis id
```

These belong in evidence links.

---

## 10. MCP changes

### 10.1. Required tools

MCP should expose:

```text
discovery_vnext.preview_brief
discovery_vnext.start_run
discovery_vnext.list_artifacts
discovery_vnext.get_artifact
discovery_vnext.preview_mega_loop
discovery_vnext.normalize_candidates
discovery_vnext.create_probe_plan
discovery_vnext.execute_probe
discovery_vnext.preview_source_understanding
discovery_vnext.apply_routing
discovery_vnext.apply_probation_handoff
discovery_vnext.submit_feedback
discovery_vnext.prepare_rollback
discovery_vnext.apply_rollback
```

### 10.2. Permission rules

MCP/harness may:

- create briefs;
- create hypothesis batches;
- propose probe plans;
- run bounded probes;
- create source understandings;
- propose routing decisions;
- create adapter backlog items.

MCP/harness must not:

- delete source inventory;
- bypass captcha/login;
- silently promote high-risk sources;
- create RSS channel without feed validation;
- overwrite active policy without explicit policy activation path;
- mark source useful solely because it reached route.

### 10.3. Feedback semantics

Current feedback types should be refined or interpreted strictly:

```text
mark_useful = source understanding/routing was correct and source is useful as classified
mark_noise = source was incorrectly treated as signal-producing
correct = operator provides corrected sourceVoice/artifactFreshnessKind/signalProductionMode
policy_issue = routing policy made wrong decision despite correct understanding
rollback = batch/source decision should be reverted
```

Avoid using `mark_useful` as smoke-test success.

---

## 11. Admin UI changes

### 11.1. Source inventory list

Show columns:

```text
Source
State
Provider
Source voice
Artifact freshness
Signal production mode
Access pattern
Risk
Routing confidence
Latest decision
Registered channel?
Last observation
```

### 11.2. Source detail page

Must show:

- why source was found;
- originating run/hypothesis/query;
- ProbeReport summary;
- SourceUnderstanding fields;
- canProduceSignals per desired signal;
- notExpectedToProduce;
- reasonToKeep;
- reasonNotToAutoRegister;
- RoutingDecision + policy version;
- actions applied;
- feedback controls.

### 11.3. Manual review queue

Manual review should group by reason:

```text
high risk
access/browser/auth
classification uncertain
potential high but low confidence
adapter required
large crawl blast radius
policy conflict
```

### 11.4. MegaLoop page

Show:

- memory modes used;
- lenses used;
- hypothesis batches;
- accepted/duplicate/merged/rejected hypotheses;
- coverage gaps;
- rediscovery counts;
- query families;
- query quality result mix.

### 11.5. Policy editor

Admin should edit:

- routing thresholds;
- allowed auto-register source modes;
- provider policies;
- access pattern policies;
- sample review percent;
- rollback enabled;
- max probes/browser probes;
- policy activation with version.

---

## 12. Verification / eval suite

### 12.1. Unit tests

Add tests for:

```text
SourceUnderstanding classifies seller static pages as inventory_context, not auto_register
SourceUnderstanding classifies official update pages as cheap_watch
SourceUnderstanding classifies recurring listing/directory as cheap_watch/probation/manual depending risk
RSS candidate without valid feed cannot become RSS channel
captcha/access challenge cannot auto-register
historical yield is not accepted as reason in RoutingDecision
sourceIdentityKey does not include runId
```

### 12.2. Domain-neutrality tests

Test that core schemas/code do not contain domain-specific enums:

```text
outsourcing
procurement
rfp
job_board
hiring_gap
migration_pressure
security_advisory
```

Allow these in fixtures/examples only.

### 12.3. Current discovered source regression labels

Use current sources as one eval domain, not as core logic.

Expected labels:

```text
1840andco blog/challenge page:
  access issue / seller/advice / no auto-register

AppVerticals service page:
  seller_or_vendor + static_service_page + unlikely/secondary_context + inventory_context

PHInfrastructure implementation centers:
  potential official/program source but fetch issue -> manual_review/cheap_watch after probe fix, not active failing channel

NeonPartners:
  likely seller/service; route depends on source role evidence, no blind auto-register

Twine blog article:
  secondary/explainer or marketplace context, not direct signal channel

BidDetail:
  aggregator_or_directory + recurring/listing/source_directory -> manual_review/probation/cheap_watch depending access

DesignSystemProblems:
  secondary_context / documentation pattern -> inventory_context

AIDA MITRE timelines:
  official/educational context -> inventory_context or slow cheap_watch depending interest

SiftHub RFP response guide:
  seller/secondary explainer -> inventory_context, not auto_register

FHWA ADCMS grants:
  public_authority + official_update -> cheap_watch / slow monitoring

EHS Momentum compliance calendar software:
  likely seller service page -> inventory_context unless source shows recurring external signals

ISRP/SBNSoftware/ProjectManagementFormula as RSS:
  invalid RSS probe -> no RSS channel

TechTarget HR demo article:
  third_party_commentary / evergreen article / secondary_context -> inventory_context

Pandium requirements template:
  seller/vendor guide -> inventory_context

VLStudio fractional CTO article:
  seller/advice/context -> inventory_context
```

These labels must not be hardcoded. They are eval expectations for this specific run.

### 12.4. Multi-domain evals

Add eval fixtures for:

```text
outsourcing buyer signals
job board / career opportunities
IT/security advisories
public policy/regulatory monitoring
research/grants/funding
product changelogs
local government/public records
```

Each fixture should include:

- system interest input;
- expected DiscoveryBrief properties;
- expected hypothesis lenses;
- source candidates with expected SourceUnderstanding labels;
- expected RoutingDecision.

---

## 13. Implementation plan

### Phase 0 — Guardrails and immediate fixes

1. Add `inventory_context` to routing decisions/state constraints.
2. Add source mode fields to `SourceUnderstanding` schema:
   - `sourceVoice`;
   - `artifactFreshnessKind`;
   - `signalProductionMode`;
   - `sourceRoleConfidence`;
   - `reasonNotToAutoRegister`.
3. Update routing policy to forbid auto-register for:
   - `seller_or_vendor`;
   - `third_party_commentary`;
   - `static_service_page`;
   - `evergreen_article`;
   - `secondary_context`;
   - `unlikely`.
4. Require valid feed probe before RSS channel creation.
5. Remove `runId` from source identity keys.
6. Stop marking routed candidates as useful in smoke/verification scripts.

### Phase 1 — SourceUnderstanding v2

1. Extend ProbeReport with page role hints.
2. Implement deterministic source-role classifier:
   - URL/path heuristics;
   - probe observations;
   - website classification_json;
   - feed/listing/document counts;
   - access pattern;
   - page metadata if available.
3. Implement optional LLM-assisted `SourceUnderstanding` only as structured artifact generator, bounded by schema.
4. Add source-role scoring weights.
5. Add tests on discovered source regression labels.

### Phase 2 — Routing v2

1. Add source mode gates before auto-register.
2. Add policy config for allowed auto-register modes.
3. Add `inventory_context` action.
4. Add probation rollback group for auto-register batches.
5. Add sampled review for auto-routed sources.

### Phase 3 — Full run completion

1. Modify `execute_run_steps(run_kind='full')` to run:
   - candidate selection;
   - probe plan generation;
   - probe execution;
   - source understanding;
   - routing;
   - handoff.
2. Store all artifacts with lineage.
3. Produce full summary.
4. Add API/MCP endpoints for full run result.

### Phase 4 — MegaLoop v2

1. Make each generator return 5–20 hypotheses.
2. Add persistent memory to comparator.
3. Add coverage map.
4. Add rediscovery count across batches/runs.
5. Add batch-level diversity limits.
6. Add LLM/harness path for hypothesis generation if enabled, with deterministic fallback.

### Phase 5 — QueryQuality v2

1. Replace count-based quality with result-mix classification.
2. Store query attempts with result mix.
3. Use query quality to refine future queries.
4. Add admin view for noisy/useful query families.

### Phase 6 — Admin/MCP finish

1. Add SourceUnderstanding detail UI.
2. Add routing policy editor fields.
3. Add manual review queue grouped by reason.
4. Add source inventory filters by source voice / signal production mode.
5. Add MCP permission checks.

### Phase 7 — Eval and acceptance

1. Add deterministic unit tests.
2. Add current-source eval fixture.
3. Add multi-domain fixtures.
4. Add no-domain-hardcode test.
5. Add full non-live run test.
6. Add rollback test.
7. Add admin flow test.

---

## 14. Concrete code-level change map

### 14.1. `packages/contracts/src/discovery-vnext.ts`

Update:

- `DISCOVERY_VNEXT_ROUTING_DECISIONS` add `inventory_context`.
- `SOURCE_UNDERSTANDING_PAYLOAD_SCHEMA` add required/optional fields:
  - `sourceVoice`;
  - `artifactFreshnessKind`;
  - `signalProductionMode`;
  - `observedArtifactTypes`;
  - `sourceRoleConfidence`;
  - `classificationUncertain`;
  - `potentialHigh`;
  - `reasonNotToAutoRegister`.
- `QUERY_QUALITY_REPORT_PAYLOAD_SCHEMA` add result mix categories and new quality values.

### 14.2. `services/workers/app/discovery_vnext_artifacts.py`

Update validators:

- enum sets for source voice/freshness/production mode;
- validator for new `SourceUnderstanding` fields;
- validator forbidding yield terms in RoutingDecision reasons must remain;
- domain neutrality validator should not forbid domain terms if they exist in source interest text, but should catch generated contamination.

### 14.3. `services/workers/app/discovery_vnext_understanding.py`

Replace shallow build logic.

Add functions:

```python
classify_source_voice(probe_report, candidate) -> str
classify_artifact_freshness(probe_report, candidate) -> str
classify_signal_production_mode(source_voice, freshness, probe_report, discovery_brief) -> str
score_signal_capability(signal, role_context, probe_report) -> dict
build_reason_not_to_auto_register(...)
```

Remove assumption:

```text
observable artifacts => can expose all desired signals
```

Replace with per-signal capability.

### 14.4. `services/workers/app/discovery_vnext_routing.py`

Add source-mode gates.

Add:

```python
def is_context_only(u): ...
def is_auto_register_eligible_source_mode(u): ...
def is_cheap_watch_eligible(u): ...
```

Add `inventory_context` actions.

### 14.5. `services/workers/app/discovery_vnext_probe.py`

Add richer observations:

- page role hints;
- stable URL/date/version/listing signals;
- challenge/verification detection;
- static evergreen detection;
- seller/vendor hint;
- source directory hint.

Ensure RSS validity controls provider suggestion.

### 14.6. `services/workers/app/discovery_vnext_candidates.py`

Replace `query_quality_report()`.

Add:

```python
classify_result_mix(candidates, raw_results) -> dict
query_quality_from_result_mix(mix) -> str
```

Candidate `_kind_guess` should be advisory only.

### 14.7. `services/workers/app/discovery_vnext_megaloop.py`

Replace one-hypothesis template with actual batch generation.

If LLM disabled, deterministic fallback can generate multiple generic hypotheses by combining:

```text
memory mode
lens
artifact expectations
desired signal directness
geography/language
negative signals
```

Comparator must accept historical memory input.

### 14.8. `services/api/app/discovery_vnext_api.py`

Update `execute_run_steps()`:

- after candidate acquisition, select probe candidates;
- build probe plan for each;
- execute probe;
- synthesize source understanding;
- apply routing;
- apply handoff if decision requires it;
- persist artifacts with lineage.

### 14.9. `services/workers/app/discovery_vnext_handoff.py`

Guard probation handoff:

```text
if provider_type == rss and feed not validated -> do not register rss
if sourceVoice/signalProductionMode not auto-register eligible -> no channel
if accessPattern not public -> no auto channel
```

### 14.10. Admin/MCP

Update:

```text
apps/admin/src/pages/discovery.astro
apps/admin/src/lib/server/discovery-page-view-model.ts
services/mcp/src/tools/discovery/vnext-tools.ts
```

Add fields and filters described above.

---

## 15. Acceptance criteria

Discovery is considered done when:

1. `full` run can execute end-to-end without external verification script.
2. SourceUnderstanding correctly separates:
   - seller/vendor static page;
   - secondary explainer;
   - official/public authority update;
   - recurring listing/directory;
   - UGC/community source;
   - blocked/challenge source.
3. RSS channels are never created from invalid feeds.
4. Auto-register only happens for eligible source modes.
5. Current discovered-source eval labels pass.
6. Multi-domain evals pass without adding domain-specific core logic.
7. Admin shows why a source was kept, watched, registered, sent to manual review, or blocked.
8. MCP cannot silently promote high-risk or invalid-provider sources.
9. RoutingDecision reasons and validation never use historical yield as keep/drop justification.
10. Source inventory remains primary truth; source channels are optional projections.

---

## 16. Final design summary

The target design is:

```text
System Interest
  -> DiscoveryBrief
  -> Controlled-amnesia HypothesisMegaLoop
  -> Candidate acquisition
  -> QueryQuality result-mix feedback
  -> Bounded ProbePlan / ProbeReport
  -> SourceUnderstanding
       domain-neutral source role
       artifact freshness
       signal production mode
       interest-conditioned capability
       risk / observability
  -> RoutingDecision
       auto-route by policy
       manual only for exception cases
  -> SourceInventory
       primary truth
  -> optional cheap monitoring / probation channel / adapter backlog
  -> downstream strict filtering
```

The most important fix is not a threshold tweak. It is changing `SourceUnderstanding` from:

```text
observable artifacts may expose signals
```

to:

```text
this source has a universal role, publishes specific artifact forms, has a specific update/freshness pattern, and under this InterestBrief can or cannot theoretically produce these desired signals.
```

That keeps the system universal, avoids domain hardcode, protects rare signals from yield-based rejection, and prevents vendor/advice/SEO pages from becoming active monitoring channels just because they contain relevant words.
