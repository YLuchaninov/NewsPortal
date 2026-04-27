# Контракт universal content model

Этот contract обязателен, когда работа меняет public content/read surfaces, system-selected collection, user matches или mapping между article/resource storage и public content items.

Если работа добавляет `analysis_summary`, entities, labels or content filter projections к public/admin/API content responses, также читай `.aidp/contracts/content-analysis-and-gating.md`.

## Назначение

NewsPortal больше не должен мыслить public surface как "только статьи". Public/domain слой использует universal content vocabulary, а legacy table names остаются implementation detail.

## Канонические public terms

- `resource`: persisted ingest object from any provider type.
- `content_item`: readable surfaced object returned by `/collections/system-selected`, `/content-items` and `/users/{user_id}/matches`.
- `content_kind`: kind of surfaced item; current first-class kinds are `editorial`, `listing`, `entity`, `document`, `data_file`, `api_payload`.
- `system interest`: global selection rule for the system-selected collection.
- `user interest`: per-user personalization rule applied only after system selection.
- `system-selected collection`: global collection selected by system interests.

## Инварианты

- Editorial/article content is one `content_kind`, not the product-wide default.
- User interests do not expand upstream scope beyond system-selected content.
- A user without personal interests still sees the global system-selected collection.
- `allowed_content_kinds` on system interests governs which content kinds may enter global selection.
- Public/API/admin wording should prefer `content item`, `system interest`, and `system-selected collection` over legacy article-centric names unless the code surface is truly article-specific.

## Public route contract

- `/collections/system-selected` — canonical global selected collection.
- `/content-items` — canonical paginated listing.
- `/content-items/{content_item_id}` — content item detail.
- `/content-items/{content_item_id}/explain` — explain/debug projection.
- `/users/{user_id}/matches` — personalized matches after system selection.

## Analysis projections

- `analysis_summary` is an optional compact read projection for detail responses.
- Entities, labels and filter results remain separately queryable analysis data; they do not change the public content vocabulary by themselves.
- User-facing content UI may show lightweight signals from analysis, but visibility must still follow system-selected/personalization contracts unless an explicit gate-enforce stage changes that behavior.

## Legacy/internal names

`articles`, `criteria`, `interest_templates`, `system_feed_results` and similar names remain implementation details. They must not retake public product meaning or become the only semantic decision language.

## Proof expectations

- API/read-model changes: targeted unit proof around content-item SQL/read helpers plus `pnpm unit_tests` when broad.
- Public/admin surface changes: typecheck plus targeted TS/Python proof for mapped fields.
- Selection-source wording changes: prove that `final_selection_results` remains primary where applicable.

## Update triggers

Update this contract when public content routes, content kinds, system/user interest layering, or legacy-to-public naming rules change.
