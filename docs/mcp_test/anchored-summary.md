# Anchored Summary — IT Outsourcing SignalOps Pipeline

**Last updated:** 2026-06-06T13:10 UTC (backfill #5 completed)

## Goal
Get IT-outsourcing procurement signals (RFPs, tenders) selected through SignalOps MCP semantic matching and LLM review.

---

## Current State

### Pipeline History
| Metric | Backfill #3 (broken LLM) | Backfill #4 (fixed LLM) | Backfill #5 (updated interests + 4 new channels) |
|---|---|---|---|
| Total candidates | 1,667 | 1,734 | **1,954** |
| criteriaMatches | 15,003 | 15,606 | **17,226** |
| interestMatches | 38 | 38 | **40** (+2) |
| selected | — | **19** | **20** (+1) |
| visible | — | **10** | **11** (+1) |
| LLM failures | 168 | **0 ✅** | **0 ✅** |
| Duration | 232s | 298s | **343s** |

Key insight: interestMatches выросло с 38 до 40 (+5%), selected с 19 до 20 (+5%). Реальные RFP-тексты в positive_texts дали слабый прирост.

### Selection Dashboard (after backfill #5)
| Metric | Value |
|---|---|
| Selected signals | **20** |
| Visible content items | **11** |
| Gray zone | 1 |
| Hold | 0 |
| Pending | 16 |
| Rejected | 1,917 |
| Semantic evaluated | 13,991 |

Bottleneck: **40 interestMatches out of 17,226 criteriaMatches (0.23%)** — semantic matching is the constraint.

### Top Blockers
| Filter | Count |
|---|---|
| wrapper_directory_noise | 1,440 |
| time_window | 1,422 |
| must_not:review | 282 |
| must_not:how to | 138 |
| must_not:best practices | 87 |

---

## Channels

### Active, Working (22 total)
| Channel | Items | Notes |
|---|---|---|
| OS-RFPMart-Software | 72 | Best performer |
| 10 more RFPMart categories | 20-27 each | Including 4 new: AI/ML, US Federal, Staffing, Consulting |
| OS-Reddit-DevOps | 391 | |
| OS-Reddit-Startups | 437 | |
| OS-GitHub-Issues-API | 118 | |
| OS-RemoteOK-API | 66 | |
| OS-HN-Outsourcing | 36 | |
| **OS-HN-HireTeam** | **1 (FIXED)** | `frontpage?q="hire"`, 30s timeout — **0 errors** |
| Others | 32-137 | |

### Needs Attention
| Channel | Problem |
|---|---|
| OS-HN-Build-vs-Buy | 502 (5x, transient HNRSS) |
| OS-Nearshore-Americas | 0 items (empty RSS) |

### Deleted/Archived This Session
IAOP (XML error) + 5 UI audit channels (192.168.97.3 blocked)

---

## Key Decisions
- **`must_have_terms` removed** — AND logic too strict for RFP text; semantic matching + LLM do the filtering
- **Updated 4 interests with real RFP excerpts** — +2 interestMatches (weak improvement)
- **4 new RFPMart channels** — AI/ML, US Federal, Staffing, Consulting
- **HN-HireTeam fixed** — `frontpage` + single term `"hire"` + 30s timeout
- **LLM endpoint fixed** — 0 failures in backfills #4 and #5

## Key Learnings
1. **Semantic matching is the bottleneck**: 0.23% pass rate. Real RFP texts helped only +5%.
2. **`wrapper_directory_noise` (1,440)** and **`time_window` (1,422)** are the top technical filters.
3. **LLM conversion rate** is ~50%: 40 interestMatches → 20 selected.
4. **Добавление новых каналов** (4 RFPMart) добавило +180 candidates, но почти не подняло interestMatches.
5. **HN-HireTeam**: `newest` endpoint с любыми multi-term queries = 502. `frontpage?q="hire"` работает.

## Immediate Next Steps (for next session)
1. Увеличить recall: **убрать `wrapper_directory_noise`** или ослабить — это топ-1 блокер (1,440)
2. **SAM.gov API** — самый ценный missing source, требует регистрации
3. **RFPMart Feedburner** (`http://feeds.feedburner.com/RFPMart`) — catch-all для пропущенных категорий
4. Если нужно больше recall сейчас — временно переключить selection_profile на `broad`
