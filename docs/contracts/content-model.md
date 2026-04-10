# Universal Content Model

Этот документ фиксирует durable public/domain contract для universal-content cutover.

## Canonical public terms

- `resource`
  Persisted ingest object from any provider type.
- `content_item`
  Publicly surfaced readable object returned by `/collections/system-selected`, `/content-items`, and `/users/{user_id}/matches`.
- `content_kind`
  Declared kind of a surfaced item. Current first-class kinds: `editorial`, `listing`, `entity`, `document`, `data_file`, `api_payload`.
- `system interest`
  Global selection rule that determines which kinds of content are eligible for the system-selected collection.
- `user interest`
  Per-user personalization rule applied only after system selection.
- `system-selected collection`
  Global collection of content items selected by system interests.

## Canonical rules

- Editorial/article content is one `content_kind`, not the product-wide default.
- A user without personal interests still sees the global system-selected collection.
- `user_interests` never expand the upstream set beyond what system interests already selected.
- `allowed_content_kinds` on system interests determine which kinds are eligible for global selection.

## Public route contract

- `/collections/system-selected`
  Canonical global collection.
- `/content-items`
  Canonical paginated listing of surfaced content items.
- `/content-items/{content_item_id}`
  Canonical content-item detail.
- `/content-items/{content_item_id}/explain`
  Canonical explain/debug projection.

## Internal legacy names

Some storage/runtime internals still use legacy names such as `articles`, `criteria`, `interest_templates`, and `system_feed_results`.

These remain implementation details only.

- They must not define user-facing product meaning.
- New public contracts and docs should use `content item`, `system interest`, and `system-selected collection`.
