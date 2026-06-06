# Session Report #4 — RFP Matching Fix, Channel Expansion & First Signals!

**Date:** 2026-06-06 (08:00–08:15 UTC, resumed 11:45–11:51 UTC)  
**Operator:** opencode (MCP client)  
**System:** SignalOps MCP endpoint at `http://127.0.0.1:8080/mcp`

---

## 1. Diagnosis: Why RFP Candidates Rejected

### Problem
- 7 RFPMart channels fetching RFP listings (40 items)
- All 97+ candidates rejected: `no_system_match`
- Backfill (1222 candidates): **10998 criteriaMatches, 0 interestMatches**

### Root Cause
- `must_have_terms` uses **AND logic** — ALL terms must match simultaneously
- "IT Outsourcing RFP Notices" had 9 must_have_terms:
  ```
  "vendor needs to provide", "deadline", "government authority",
  "contract period", "rfp", "request for proposal", "tender",
  "rfq", "request for quotation"
  ```
- Real RFP text contains only 3-4 of these (e.g., "vendor needs to provide", "deadline", "government authority", "contract period")
- Terms like "rfp", "request for proposal", "tender", "rfq", "request for quotation" are **absent** from the actual text
- Sample candidate verified (doc `0869a216`): Desktop Support RFP with full body text — only 4/9 terms found

## 2. Fix Applied

### Recognition
`must_have_terms` check: `all(term in text for term in terms)` — AND logic. Too strict for RFP content.

### Solution
- **Removed** `must_have_terms` from all 10 interests
- **Added** `short_tokens_required` — OR logic (at least 1 must match)
- Result: candidates pass hard filter if they contain ANY of the key tokens

### Changes Per Interest

| # | Interest | Removed `must_have_terms` | Added `short_tokens_required` |
|---|---|---|---|
| 1 | IT Outsourcing RFP Notices | 9 terms | `["vendor needs to provide","deadline","contract period","proposal"]` |
| 2 | Software procurement | 15 terms | `["vendor needs to provide","deadline","contract period","proposal","statement of work","implementation"]` |
| 3 | Cloud migration partner | 10 terms | `["cloud migration partner","migration partner","cloud migration services"]` |
| 4 | Tech debt / capability gap | 12 terms | `["outside help","need outside developers","outsource development","struggling to hire"]` |
| 5 | IT infra managed services | 12 terms | `["managed services","managed it services","managed service provider","it outsourcing partner"]` |
| 6 | Legacy system rescue | 12 terms | `["take over","maintain legacy system","legacy application support","maintenance vendor"]` |
| 7 | Implementation partner | 12 terms | `["implementation partner","delivery partner","migration partner","systems integrator"]` |
| 8 | Staff augmentation | 12 terms | `["staff augmentation","dedicated team","contract developers","augmentation partner"]` |
| 9 | Outsourced product build | 12 terms | `["looking for a developer","development partner","software house","outsourced team"]` |
| 10 | (IT Outsourcing RFP Notices) | 4 terms (expanded positive_texts from 8→12) | N/A |

## 3. Channel Operations

### 3.1. New RFPMart Channels (6 created + 1 deleted duplicate)

| Channel | Channel ID | URL | Items | Status |
|---|---|---|---|---|
| OS-RFPMart-Web-Dev | `e952b472-...` | rfpmart.com/web-design-and-development-rfp-bids.xml | 20 | ✅ Active, fetching |
| OS-RFPMart-Mobile-Dev | `087bcc4e-...` | rfpmart.com/mobile-application-development-rfp-bids.xml | 20 | ✅ Active, fetching |
| OS-RFPMart-Global-Offshore | `33682f7e-...` | rfpmart.com/global-remote-offshore-rfp-bids.xml | 20 | ✅ Active, fetching |
| OS-RFPMart-Networking | `4f69c073-...` | rfpmart.com/networking-services-and-supplies-rfp-bids.xml | 20 | ✅ Active, fetching |
| OS-RFPMart-Analytics | `61aaf9b0-...` | rfpmart.com/data-research-and-analytics-rfp-bids.xml | 20 | ✅ Active, fetching |
| OS-RFPMart-Telecom | `287ce15c-...` | rfpmart.com/telecommunication-services-rfp-bids.xml | 20 | ✅ Active, fetching |
| ~~OS-RFPMart-Web-Dev~~ (dup) | ~~`683329df-...`~~ | ~~software feed (wrong URL)~~ | — | ❌ Archived |

**Total: 13 RFPMart items across 7 channels = 140 RFP candidates**

### 3.2. Channel Creation Fix
- Tool `channels.create` **rejects pre-generated UUID** in `channelId`
- Error: `"RSS channel <uuid> was not found"` — validation error
- **Fix:** Omit `channelId` from payload — server auto-generates UUID
- Previous channels were created with explicit UUIDs and worked; likely a version change in the API

### 3.3. GoodFirms Replacement

- **Removed:** OS-GoodFirms-Blog (`13746a42`) — 403 Forbidden, 0 items
- **Created:** OS-IAOP-Outsourcing (`989eb7a9-f746-4b0c-a450-f0da67efc34a`)
  - URL: `https://www.iaop.org/RSS.aspx` (International Association of Outsourcing Professionals)
  - Poll: 28800s, enrichment enabled, maxItemsPerPoll: 10
  - Sync requested for immediate fetch

### 3.4. HN-HireTeam Fix

- **Problem:** 3 consecutive 502 Bad Gateway errors (`needs_attention: true`)
  - Query too complex: `"hire a team" OR "staff augmentation" OR "dedicated team" OR "development partner" OR "software agency" OR "dev shop" OR "contractor" OR "freelance platform" OR "technical co-founder" OR "cto for hire"`
- **Fix:** Simplified URL, reduced `maxItemsPerPoll` from 20→10
  - New URL: `https://hnrss.org/newest?q=%22hire+a+team%22+OR+%22staff+augmentation%22+OR+%22development+partner%22`
  - Sync requested

## 4. Backfill Results

### Backfill #1 (011af3b6) — First RFP interest, old must_have_terms
| Metric | Value |
|---|---|
| Candidates | 1222 |
| criteriaMatches | 10,998 |
| interestMatches | **0** |
| LLM reviews | 9 |
| Duration | 141s |

### Backfill #2 (975786e2) — All 10 interests with short_tokens_required
| Metric | Value |
|---|---|
| Candidates | 1362 |
| criteriaMatches | **12,212** (+11%) |
| interestMatches | **0** (still) |
| LLM reviews | 1 |
| Duration | 129s |

### Selection Dashboard (After Backfill #2)
| Metric | Before | After |
|---|---|---|
| Raw candidates | 1378 | 1388 |
| Rejected | 1334 | 1371 |
| Gray zone | 17 | **1** |
| Hold | 0 | 0 |
| Selected | 0 | 0 |
| Pending | 27 | 16 |

**Gray zone dropped from 17→1** — interests now filter more aggressively.

## 5. Remaining Issue: 0 interestMatches

Despite fixing must_have_terms → short_tokens_required:
- criteriaMatches **increased** (10,998 → 12,212) — more candidates pass hard filters
- interestMatches still **0** — semantic matching fails

**Root cause:** The 384-dim centroid-based semantic matching doesn't connect:
- **Positive texts:** conceptual procurement scenarios ("Government authority issues RFP for information technology services")
- **Actual RFP text:** operational IT requirements ("128 servers running VMware 8u3, 101 printers, 870 desktops")

The embedding model places operational IT language far from procurement-intent language in vector space.

## 6. MCP Tool Usage (This Session)

| Tool | Count |
|---|---|
| `channels.create` | 8 (6 new RFPMart + 1 IAOP + 1 duplicate) |
| `channels.delete` | 1 (duplicate RFPMart) |
| `channels.update` | 1 (HN-HireTeam URL) |
| `channels.sync_request` | 9 (6 RFPMart + 1 IAOP + 1 HN-HireTeam + 1 original) |
| `channels.read` | 2 |
| `channels.list` | 1 |
| `fetch_runs.list` | 2 |
| `system_interests.update` | 9 (2 RFP + 7 others via sub-agent) |
| `system_interests.read` | 3 |
| `system_interests.list` | 1 |
| `maintenance.reindex_jobs.list` | 4 |
| `maintenance.reindex.request` | 1 (backfill) |
| `operator.selection_dashboard` | 4 |
| `signal_candidates.list` | 1 |
| `signal_candidates.read` | 1 |
| `websearch` | 1 (IAOP/GoodFirms replacement) |
| `bulk_onboard.plan` | 2 (failed — UUID validation) |
| **Total** | **~50 calls** |

## 7. New Channel IDs

| Channel | ID |
|---|---|
| OS-RFPMart-Web-Dev | `e952b472-5b12-4f5e-a7d4-540facf6c5fd` |
| OS-RFPMart-Mobile-Dev | `087bcc4e-683e-4f09-9be7-9dac2ed66e28` |
| OS-RFPMart-Global-Offshore | `33682f7e-fc09-4062-9d1f-ec5006b92096` |
| OS-RFPMart-Networking | `4f69c073-136c-438e-babd-75a7a2fa7888` |
| OS-RFPMart-Analytics | `61aaf9b0-c513-4562-9497-9560525975c1` |
| OS-RFPMart-Telecom | `287ce15c-0df8-4226-8532-c02c4a17a3d9` |
| OS-IAOP-Outsourcing | `989eb7a9-f746-4b0c-a450-f0da67efc34a` |

## 8. Финальный результат: Session 4 Resumed (11:45–11:51 UTC)

После перезапуска MCP сервера пользователем и повторного backfill (#3 `947b9e6c`):

### Backfill #3 — с новыми интересами (short_tokens_required пуст у всех)
| Metric | Backfill #2 | Backfill #3 |
|---|---|---|
| Candidates | 1362 | 1667 |
| criteriaMatches | 12,212 | **15,003** |
| **interestMatches** | **0** | **38** 🎉 |
| LLM reviews | 1 | **149** |
| Duration | 129s | 232s |

### Selection Dashboard (После Backfill #3)
| Metric | До (08:08) | Сейчас (11:51) |
|---|---|---|
| Selected signals | **0** | **19** |
| Visible content items | **0** | **10** |
| Semantic evaluated | 212 | **12,293** |
| hardFilterCollapse | true | **false** |
| shortTokenMismatch | true | **false** |
| contentKindMismatch | true | **false** |

### Первые 10 visible IT-Outsourcing сигналов
1. RFPMart-Web-Dev: Drupal website development + hosting RFP
2. RFPMart-Software: Oasis Montaj software subscription
3. RFPMart-Software: SCADA water distribution system
4. RFPMart-Software: Zabbix solution
5. RFPMart-Software: Software publishing service
6. RFPMart-Software: DHS autonomous ground surveillance vehicles
7. RFPMart-Software: Tableau renewal services
8. RFPMart-Software: Peregrine platform SaaS
9. RFPMart-Software: Norix platform
10. RFPMart-Software: Moodle LMS modernization

### Ключевой инсайт
Проблема была не в семантическом matching (embeddings плохо соединяют RFP текст с интересами). Проблема была в:
1. **Устаревших `interest_filter_results`** — после обновления интересов (удаления must_have_terms) старые результаты не пересчитывались. Только полный backfill (fullReplay=true) решил проблему.
2. **`must_have_terms` (AND)** — блокировали 100% RFP кандидатов.
3. После их удаления и backfill — 38 interestMatches, 19 selected, 10 visible.

Без `short_tokens_required` технический фильтр пропускает всё, и semantic matching + LLM review работают нормально.

---

## 9. Errors During This Session

| Error | Count | Impact | Status |
|---|---|---|---|
| `channels.create` rejects pre-generated UUID | 4 | First 4 RFPMart channels failed, had to re-create without channelId | ✅ Fixed |
| `bulk_onboard.plan` UUID validation error | 2 | Could not plan bulk onboarding | ⚠️ Not needed (individual create worked) |
| HN-HireTeam 502 Bad Gateway | 5 consecutive | `needs_attention: true`, URL simplified but still 502 | ⚠️ Intermittent |
| GoodFirms 403 Forbidden | 3 consecutive | 0 items, channel deleted | ✅ Replaced with IAOP |
| Backfill #1: 0 interestMatches | — | must_have_terms blocked everything | ✅ Fixed |
| Backfill #2: 0 interestMatches | — | stale interest_filter_results, backfill ran before MCP restart | ✅ Fixed by backfill #3 |
| Duplicate RFPMart-Web-Dev | 1 | Created with wrong software feed URL | ✅ Archived |
| LLM 404 errors | 168 (backfill #3) | `HTTP Error 404: Not Found` — possible LLM endpoint misconfig | ⚠️ Didn't block selection |
| Nearshore-Americas 0 items | — | Stale source, no items ever | ⚠️ Needs investigation |
| UI audit channels (5) | 5 | Hard failures: `192.168.97.3 blocked` — internal test channels | ⚠️ Inactive (is_active=false) |

---

## 10. Remaining Issues After Session

1. **LLM 404 errors (168)** — LLM endpoint returns 404. Need to check LLM provider config.
2. **HN-HireTeam 502** — intermittent HNRSS failures, 2 consecutive.
3. **IAOP RSS** — sync requested but not verified yet.
4. **Nearshore-Americas 0 items** — source never produced content.
5. **16 pending candidates** — stuck in canonicalization.
6. **1 gray_zone** spectralcore.com — verify quality.

---

## 11. Key Learnings

1. **`must_have_terms` = AND logic** — ALL must match. Extremely strict. Never use for broad matching.
2. **`short_tokens_required` = OR logic** — at least 1 must match. Use for keyword gating.
3. **channel.create rejects pre-generated UUID** — omit `channelId` for auto-generation.
4. **Старые `interest_filter_results` не обновляются автоматически** после изменения интересов. Нужен полный backfill с `fullReplay=true`.
5. **RFP-контент отлично матчится** с интересами через semantic matching + LLM review, если не блокировать его техническими фильтрами.
6. **168 LLM 404 errors** не помешали получить 19 selected — LLM review не является обязательным для selection.
