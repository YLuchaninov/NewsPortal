# Session Report #5 — Backfill, New Channels, Interest Tuning

**Date:** 2026-06-06
**Objective:** Увеличить количество selected IT-outsourcing procurement signals через обновление каналов и интересов.

---

## Summary

Бэкфилл #5 (fullReplay, 343s, 0 LLM failures) подтвердил: LLM работает, но узкое место — семантический матчинг.

### Что сделано

**Channels:**
- Создал 4 новых RFPMart: AI/ML (`42052a48`), US Federal (`6e752630`), Staffing (`996965f8`), Consulting (`dbeb0896`) — каждый принес 20 items
- **Починил HN-HireTeam**: URL `frontpage?q="hire"`, таймаут 30s, maxItemsPerPoll=5. Сейчас работает с 0 ошибок
- Удалил IAOP RSS (XML невалидный)
- Заархивировал 5 UI audit каналов (192.168.97.3 blocked)

**Interests:**
- Обновил 4 интереса реальными RFP excerpts:
  - Software procurement (+20 примеров)
  - IT infrastructure managed services (+11 примеров)
  - Implementation partner (+11 примеров)
  - Cloud migration (+10 примеров)

**Backfill #5 (queued → completed):**
- candidates: 1,734 → 1,954 (+220)
- interestMatches: 38 → 40 (+2, +5%)
- selected: 19 → 20 (+1, +5%)
- visible: 10 → 11 (+1)
- LLM failures: 0 ✅

### Измерения

| Метрика | #3 | #4 | #5 |
|---|---|---|---|
| candidates | 1,667 | 1,734 | 1,954 |
| criteriaMatches | 15,003 | 15,606 | 17,226 |
| interestMatches | 38 | 38 | 40 |
| selected | — | 19 | 20 |
| visible | — | 10 | 11 |
| LLM failures | 168 | 0 | 0 |
| LLM reviews | 149 | 149 | 160 |

### Топ блокеры (после #5)
| Причина | Count |
|---|---|
| wrapper_directory_noise | 1,440 |
| time_window | 1,422 |
| must_not:review | 282 |
| must_not:how to | 138 |
| must_not:best practices | 87 |

### Состояние каналов
- **22 активных канала** (11 RFPMart, 1 GitHub Issues API, 1 RemoteOK API, 3 Reddit, 5 HN, 1 Funding)
- **2 проблемных**: OS-HN-Build-vs-Buy (502 transient), OS-Nearshore-Americas (пустой RSS)
- **6 удалено/архивировано** за сессию

---

## Key Decisions

1. **Real RFP texts в positive_texts дали +5%** — слабый эффект. Видимо, семантические эмбеддинги и так хорошо ловили общую тему procurement; конкретные примеры почти не помогли.
2. **4 новых канала +180 candidates = 0 новых interestMatches**. RFPMart одной категории vs другой — контент слишком похож семантически.
3. **HN-HireTeam фикс подтвержден** — single term на `frontpage` работает надежно. Проблема была в multi-term queries на `newest`.
4. **wrapper_directory_noise (1,440)** — главный кандидат на ослабление для увеличения recall.

---

## Открытые вопросы для следующей сессии

1. Убрать/ослабить `wrapper_directory_noise` — потенциально разблокирует ~1,440 кандидатов
2. Получить SAM.gov API ключ — US Federal procurement как новый source type (API)
3. RFPMart Feedburner catch-all — пропущенные категории
4. Selection profile → broad вместо balanced для временного увеличения recall
