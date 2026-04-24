# Контракт auth/session boundary

## Подсистема

- Имя: граница web/admin аутентификации и сессий.
- Владельцы кода/границ: `apps/web/src/lib/server/auth.ts`, `apps/admin/src/lib/server/auth.ts`, web/admin BFF auth routes, `user_roles`/`user_profiles`/`users` tables, nginx `/admin` routing.
- Основные runtime surfaces: публичная anonymous web-сессия, admin email/password sign-in, session cookies, Firebase Identity Toolkit, локальная PostgreSQL authorization truth.

## Почему нужен contract

Эта граница была почти не представлена в старых contracts, но source code показывает долговечную authorization semantics. Ошибка здесь может дать silent privilege drift: Firebase подтверждает identity, но local PostgreSQL roles решают authorization.

## Ответственности

- Web app создает или переиспользует anonymous Firebase sessions для публичных пользовательских flows.
- Admin app входит через Firebase email/password и затем требует allowlisted/local admin authorization.
- Local PostgreSQL владеет долговечным user/profile/role state после identity verification.
- nginx держит web и admin BFF paths раздельно: `/bff/*` идет в web, `/admin/bff/*` и `/admin/*` идут в admin.

## Интерфейсы и границы

- Web session cookie: `np_web_session`; web refresh cookie: `np_web_refresh`.
- Admin session cookie: `np_admin_session`.
- Cookies в текущем коде server-side, HttpOnly и SameSite Strict.
- Web auth использует Firebase anonymous `accounts:signUp`, refresh-token reuse и `accounts:lookup`.
- Admin auth использует Firebase `accounts:signInWithPassword` плюс `accounts:lookup`.
- `ADMIN_ALLOWLIST_EMAILS` принимает точные emails и domain entries с префиксом `@`; aliases точного email нормализуются admin auth code.
- Anonymous Firebase users не должны проходить admin authorization.

## Модель данных или состояния

- Primary durable state: `users`, `user_profiles`, `user_roles`, auth provider/subject fields и local role assignments.
- External identity state: Firebase identity tokens and refresh tokens.
- Runtime state: signed/verified session cookies и BFF redirects/JSON responses.
- Derived/display state: session responses и UI-visible roles.

## Runtime и delivery concerns

- Required env включает `FIREBASE_WEB_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_CONFIG`, `FIREBASE_ADMIN_CREDENTIALS`, `ADMIN_ALLOWLIST_EMAILS` и `APP_SECRET`.
- Admin bootstrap может назначать local `admin` role только после allowlist verification.
- nginx должен сохранять `X-Forwarded-Prefix /admin` для admin routes.
- Auth flows являются stateful tests, потому что создают или переиспользуют users/profiles/roles.

## Риски и proof expectations

- Минимальный proof для admin/session/auth changes: targeted unit/static proof плюс admin/web session flow proof.
- nginx или compose route changes, затрагивающие auth, требуют nginx-routed proof через `pnpm test:mvp:internal` или `pnpm test:website:admin:compose`.
- Firebase/session proof может создать users and roles; cleanup или residual state нужно записать в `.aidp/work.md`.
- Не закрывай auth work одним typecheck, если менялись behavior, cookies, roles или allowlist semantics.

## Правила изменений

- Не делай Firebase authorization source of truth; local PostgreSQL roles остаются решающими.
- Не дублируй admin allowlist или role semantics в unrelated UI components.
- Держи web и admin cookies/path scopes раздельно.
- Обновляй этот contract, когда меняются cookie names, session validation, allowlist rules, Firebase flow, role bootstrap или nginx admin routing.
