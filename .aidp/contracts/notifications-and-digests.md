# Контракт notifications and digests

## Подсистема

- Имя: пользовательские notifications, channel bindings and digest delivery.
- Владельцы кода/границ: web settings/BFF modules, `services/workers/app/main.py`, `services/workers/app/delivery.py`, `services/workers/app/digests.py`, notification migrations and Mailpit/dev delivery baseline.
- Основные runtime surfaces: web push, Telegram, email digest, notification preferences, manual saved digest queue, scheduled match digest queue.

## Почему нужен contract

Уведомления создают persistent rows и external side effects. Старые contracts описывали selection/discovery, но source code показывает отдельный durable delivery layer со своими cleanup and proof requirements.

## Ответственности

- Web BFF владеет user channel binding CRUD для `web_push`, `telegram` и `email_digest`.
- Web digest settings владеют cadence/timezone/next-run configuration и требуют enabled email digest channel перед включением scheduled digests.
- Worker notification path отправляет web push/Telegram notifications только для matched content с decision `notify`.
- Worker digest path обрабатывает queued manual saved digests и due scheduled match digests.
- Delivery code владеет external dispatch adapters и возвращает явные `sent`/`failed` status details.

## Интерфейсы и границы

- Channel config validation:
  - `web_push` requires endpoint plus `keys.auth` and `keys.p256dh`.
  - `telegram` requires `chatId`.
  - `email_digest` requires an email value.
- Notification preferences сейчас gated для immediate `web_push` и `telegram` delivery. Email digest имеет отдельные scheduled settings.
- Immediate notification channels загружаются из `user_notification_channels` с `channel_type in ('web_push', 'telegram')`.
- Email digest channel загружается отдельно из последнего enabled `email_digest` binding.
- Manual saved digest rows используют `digest_kind = 'manual_saved'`; scheduled match rows используют `digest_kind = 'scheduled_matches'`.

## Модель данных или состояния

- Primary durable state: `user_notification_channels`, `user_digest_settings`, `notification_log`, `digest_delivery_log`, digest item link tables и notification suppression rows.
- Runtime/transient state: queued delivery rows, текущий worker polling cycle и external provider responses.
- Delivery artifacts: Mailpit messages in dev, Telegram/API responses, browser push subscriptions и VAPID metadata.
- Scheduled digest state включает cadence, send hour/minute, timezone, `skip_if_empty`, `next_run_at`, `last_sent_at`, last status and last error.

## Runtime и delivery concerns

- Env controls:
  - `TELEGRAM_BOT_TOKEN` for Telegram.
  - `EMAIL_DIGEST_SMTP_URL` and `EMAIL_DIGEST_FROM` for email digest.
  - `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT` for web push.
  - `WORKER_ENABLE_USER_DIGEST_SCHEDULER` and `WORKER_USER_DIGEST_POLL_INTERVAL_SECONDS` for digest polling.
- Local MVP baseline ожидает, что email digest SMTP указывает на Mailpit: `smtp://mailpit:1025`.
- Scheduled digest timezone должен быть valid; invalid timezone записывает failure и останавливает hidden retry churn.
- Empty scheduled digests можно skip с durable status `skipped_empty`, когда `skip_if_empty` true.

## Риски и proof expectations

- Минимальный proof для notification/digest changes: targeted static/unit proof плюс worker/web BFF proof для affected channel.
- End-to-end delivery changes должны использовать `pnpm test:mvp:internal` или `pnpm test:cluster-match-notify:compose`, когда затронут worker matching/notification behavior.
- Email digest changes должны доказать Mailpit-local delivery или записать, почему SMTP proof не выполнялся.
- Web push или Telegram changes требуют explicit residual gap, если real external providers не проверялись.
- Любой proof, создающий channels, subscriptions, notification rows, digest rows или Mailpit messages, должен записать cleanup/residual state в `.aidp/work.md`.

## Правила изменений

- Не отправляй retroactive notifications во время replay/backfill, если explicit work item не меняет product policy.
- Не скрывай external send failures; persist status/error details.
- Держи immediate notifications и scheduled email digests отдельными paths.
- Обновляй этот contract, когда меняются channel types, config shape, preference semantics, digest cadence rules, delivery env или worker polling semantics.
