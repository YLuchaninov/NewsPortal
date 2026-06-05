# Контракт auth/session boundary

## Подсистема

- Имя: граница web/admin аутентификации и сессий.
- Владельцы кода/границ: `apps/web/src/lib/server/auth.ts`, `apps/admin/src/lib/server/auth.ts`, web/admin BFF auth routes, `user_roles`/`user_profiles`/`users` tables, nginx `/admin` routing.
- Основные runtime surfaces: публичная anonymous web-сессия, admin email/password sign-in, session cookies, Firebase Identity Toolkit, локальная PostgreSQL authorization truth.

## Почему нужен contract

Эта граница была почти не представлена в старых contracts, но source code показывает долговечную authorization semantics. Ошибка здесь может дать silent privilege drift: Firebase подтверждает identity, но local PostgreSQL roles решают authorization.

## Ответственности

- Web app accepts only authorized Google Firebase sessions for full end-user functionality. Signed-out users may access only the redacted `/` landing surface.
- Admin app входит через Firebase email/password и затем требует allowlisted/local admin authorization.
- Local PostgreSQL владеет долговечным user/profile/role state после identity verification.
- nginx держит web и admin BFF paths раздельно: `/bff/*` идет в web, `/admin/bff/*` и `/admin/*` идут в admin.

## Интерфейсы и границы

- Web session cookie: `np_web_session`; web refresh cookie: `np_web_refresh`.
- Admin session cookie: `np_admin_session`.
- Cookies в текущем коде server-side, HttpOnly и SameSite Strict. Cookie `Secure` управляется общей policy `SIGNALOPS_COOKIE_SECURE_POLICY`: `auto` ставит `Secure` для HTTPS или `X-Forwarded-Proto: https`, `always` принудительно включает, `never` оставляет выключенным только для локального HTTP/debug.
- Mutating public web BFF actions use the shared web action kit to reject explicit cross-site browser metadata before session resolution or payload reads, then validate declared web BFF action payload schemas for routes that read payload through the kit. The guard treats mismatched `Origin`/absolute `Referer` and `Sec-Fetch-Site: cross-site` as CSRF failures while preserving local/scripted requests that do not send browser site metadata; `auth/bootstrap` and `auth/logout` are sessionless special cases but still use the metadata guard.
- Admin mutating BFF actions that use the shared action kit reject explicit cross-site browser metadata before session resolution or payload reads. The guard treats mismatched `Origin`/absolute `Referer` and `Sec-Fetch-Site: cross-site` as CSRF failures while preserving local/scripted requests that do not send browser site metadata.
- Mutating admin BFF routes that use the shared admin action kit require signed admin action tokens unless they are documented read-only exceptions. Tokens are HMAC-signed with `APP_SECRET`, short-lived, and bound to admin user id, normalized BFF target path and route-level action scope. AdminShell publishes the scoped token set for server-rendered forms and same-origin admin React-island POST requests; the BFF validates the route scope before handler work.
- Web auth использует Google Identity Services credential exchange through Firebase `accounts:signInWithIdp`, refresh-token reuse и `accounts:lookup`.
- Web Google auth may enforce one exact email domain through `SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN`; when unset, any verified Google email is allowed.
- Proof-only web test auth can mint a `firebase_google`-shaped local session only when `SIGNALOPS_WEB_TEST_AUTH_ENABLED` is explicitly enabled. It must not be exposed in the UI or enabled in normal runtime.
- Admin auth использует Firebase `accounts:signInWithPassword` плюс `accounts:lookup`.
- `ADMIN_ALLOWLIST_EMAILS` принимает точные emails и domain entries с префиксом `@`; aliases точного email нормализуются admin auth code.
- Anonymous Firebase users must not pass web full-access or admin authorization.

## Модель данных или состояния

- Primary durable state: `users`, `user_profiles`, `user_roles`, auth provider/subject fields и local role assignments.
- External identity state: Firebase identity tokens and refresh tokens.
- Runtime state: signed/verified session cookies и BFF redirects/JSON responses.
- Derived/display state: session responses и UI-visible roles.

## Runtime и delivery concerns

- Required env включает `FIREBASE_WEB_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_CONFIG`, `FIREBASE_ADMIN_CREDENTIALS`, `ADMIN_ALLOWLIST_EMAILS` и `APP_SECRET`; auth-cookie runtime также читает `SIGNALOPS_COOKIE_SECURE_POLICY`.
- End-user Google auth additionally reads `SIGNALOPS_WEB_GOOGLE_CLIENT_ID`, optional `SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN` and optional `SIGNALOPS_API_CONTENT_AUTH_REQUIRED`.
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
- Обновляй этот contract, когда меняются cookie names, cookie Secure/proxy policy, session validation, CSRF/action token policy, allowlist rules, Firebase flow, role bootstrap или nginx admin routing.
