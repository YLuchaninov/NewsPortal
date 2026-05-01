# Firebase Setup

NewsPortal использует Firebase как identity layer. После входа локальная PostgreSQL-модель users/roles решает authorization.

Для локального MVP нужны:

- Firebase project;
- Web app config для browser/client side;
- Admin credentials для server-side verification;
- Anonymous sign-in для web flow;
- Email/password sign-in для admin flow;
- `ADMIN_ALLOWLIST_EMAILS` для первого admin bootstrap.

## Что положить в `.env.dev`

Основные значения:

```sh
FIREBASE_PROJECT_ID=...
FIREBASE_WEB_API_KEY=...
FIREBASE_CLIENT_CONFIG=...
FIREBASE_ADMIN_CREDENTIALS=...
ADMIN_ALLOWLIST_EMAILS=admin@example.com
```

Не коммитьте реальные credentials.

## Порядок настройки

1. Создайте или выберите Firebase project.
2. Создайте Web App.
3. Возьмите project id and web API key.
4. Включите Authentication.
5. Включите Anonymous sign-in.
6. Включите Email/password sign-in.
7. Создайте admin user.
8. Сформируйте `FIREBASE_CLIENT_CONFIG`.
9. Подготовьте `FIREBASE_ADMIN_CREDENTIALS`.
10. Добавьте admin email в `ADMIN_ALLOWLIST_EMAILS`.
11. Поднимите stack.
12. Войдите в `/admin`.

## Как понять, что все работает

- `/admin` открывает sign-in.
- Admin email/password проходит Firebase sign-in.
- После первого входа локальный user получает admin role.
- Повторный вход не требует ручной правки базы.
- Web anonymous flow не смешивается с admin role.

## Частые проблемы

`FIREBASE_WEB_API_KEY is not configured`

Проверьте `.env.dev` и container env.

Admin sign-in проходит, но доступа нет

Проверьте `ADMIN_ALLOWLIST_EMAILS` и локальную роль в PostgreSQL.

Anonymous flow не работает

Проверьте, включен ли Anonymous provider в Firebase Authentication.

Server-side verification падает

Проверьте `FIREBASE_ADMIN_CREDENTIALS`, project id and JSON escaping.

## Безопасность

- Не храните Firebase credentials в docs.
- Не вставляйте real tokens в screenshots.
- Не используйте admin allowlist как постоянную замену role model.
- Production-like Firebase project требует явного человеческого решения.
