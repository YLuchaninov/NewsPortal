# Настройка Firebase для NewsPortal

Этот файл фиксирует точный маршрут по Firebase Console для текущего состояния репозитория NewsPortal.

Краткий framing:

- Для кого: для оператора или разработчика, который поднимает локальный или тестовый продуктовый baseline NewsPortal и еще не настроил Firebase auth.
- Что покрывает: минимально необходимую настройку Firebase Authentication и значения для `.env.dev`.
- Что вне scope: Firebase Hosting, Firestore, production rollout governance и agent/runtime-core process rules.
- Prerequisites: доступ к Firebase Console и право создать или изменить web app и auth providers в выбранном проекте.
- Expected result: у вас есть рабочие `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY` и `ADMIN_ALLOWLIST_EMAILS`, а `web`/`admin` auth path перестает быть bootstrap blocker.

Используй его вместе с:

- `docs/engineering.md` — для общей engineering discipline;
- `docs/contracts/test-access-and-fixtures.md` — для правил по test identities, fixture residue и cleanup, если во время настройки или proof-run создаются persistent локальные артефакты.

Актуально для репозитория на 2026-03-22. Названия кнопок в консоли Firebase могут немного отличаться визуально, но путь через `Project settings`, `Your apps` и `Authentication` должен оставаться тем же.

## Что реально нужно для этого репозитория

Сейчас NewsPortal использует Firebase только для `Authentication`.

Нужно включить:

- `Authentication`
- `Anonymous` sign-in
- `Email/Password` sign-in

Сейчас не нужны для первого запуска:

- `Firestore`
- `Realtime Database`
- `Storage`
- `Hosting`
- `Messaging`
- `Remote Config`
- `Functions`

Причина: код в `apps/web` и `apps/admin` ходит прямо в Firebase Identity Toolkit REST API по `FIREBASE_WEB_API_KEY` для anonymous bootstrap, admin sign-in и token lookup. `FIREBASE_CLIENT_CONFIG` и `FIREBASE_ADMIN_CREDENTIALS` в текущем MVP не используются.

## Что ты получишь в конце

После выполнения шагов ниже у тебя будут значения для:

```env
FIREBASE_PROJECT_ID=
FIREBASE_WEB_API_KEY=
FIREBASE_CLIENT_CONFIG={}
FIREBASE_ADMIN_CREDENTIALS={}
ADMIN_ALLOWLIST_EMAILS=
```

Минимально рабочий результат для `.env.dev`:

```env
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_WEB_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXX
FIREBASE_CLIENT_CONFIG={}
FIREBASE_ADMIN_CREDENTIALS={}
ADMIN_ALLOWLIST_EMAILS=your-admin-email@example.com
```

## Шаг 1. Создай или выбери Firebase project

Маршрут:

1. Открой [Firebase Console](https://console.firebase.google.com/).
2. Либо выбери существующий проект, либо нажми `Create a project`.
3. Если создаешь новый проект:
   - задай имя проекта;
   - при необходимости отключи Google Analytics, если он тебе сейчас не нужен;
   - дождись создания проекта.

После этого ты попадешь на `Project Overview`.

## Шаг 2. Зарегистрируй Web App

Маршрут:

1. Внутри нужного Firebase project открой `Project Overview`.
2. Нажми значок шестеренки рядом с `Project Overview`.
3. Выбери `Project settings`.
4. На вкладке `General` прокрути до блока `Your apps`.
5. Если Web App еще не создан:
   - нажми иконку `</>` (`Web`);
   - задай app nickname, например `newsportal-web`;
   - `Firebase Hosting` для этого репозитория настраивать не нужно;
   - заверши создание приложения.
6. В блоке `Your apps` открой созданное web app.
7. В секции `SDK setup and configuration` выбери режим `Config`.

Ты увидишь объект примерно такого вида:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

Из него для текущего репозитория нужны только:

- `projectId` -> это `FIREBASE_PROJECT_ID`
- `apiKey` -> это `FIREBASE_WEB_API_KEY`

## Шаг 3. Возьми `FIREBASE_PROJECT_ID`

Есть два нормальных пути.

Путь A:

1. `Project settings`
2. вкладка `General`
3. верхний блок `Your project`
4. поле `Project ID`

Путь B:

1. `Project settings`
2. вкладка `General`
3. блок `Your apps`
4. нужное `Web app`
5. `SDK setup and configuration`
6. `Config`
7. поле `projectId` в `firebaseConfig`

Вставь это значение в:

```env
FIREBASE_PROJECT_ID=your-project-id
```

## Шаг 4. Возьми `FIREBASE_WEB_API_KEY`

Маршрут:

1. `Project settings`
2. вкладка `General`
3. блок `Your apps`
4. нужное `Web app`
5. `SDK setup and configuration`
6. `Config`
7. поле `apiKey` в `firebaseConfig`

Вставь это значение в:

```env
FIREBASE_WEB_API_KEY=AIzaSy...
```

Важно:

- для Firebase web/API use-case это нормальный client API key;
- сам по себе этот key не дает административный доступ;
- для этого репозитория он обязателен, потому что серверный код вызывает `accounts:signUp`, `accounts:signInWithPassword` и `accounts:lookup` через Firebase Auth REST API.

## Шаг 5. Включи `Authentication`

Маршрут:

1. В левом меню открой `Build`.
2. Выбери `Authentication`.
3. Если видишь экран инициализации, нажми `Get started`.

После этого Firebase Authentication будет включен для проекта.

## Шаг 6. Включи `Anonymous` sign-in

Маршрут:

1. `Build`
2. `Authentication`
3. вкладка `Sign-in method`
4. найди провайдер `Anonymous`
5. открой его
6. включи `Enable`
7. нажми `Save`

Это нужно для `apps/web`, потому что пользовательский bootstrap в текущем MVP идет через anonymous Firebase session.

## Шаг 7. Включи `Email/Password`

Маршрут:

1. `Build`
2. `Authentication`
3. вкладка `Sign-in method`
4. найди провайдер `Email/Password`
5. открой его
6. включи основной toggle `Enable`
7. `Email link (passwordless sign-in)` можно не включать для текущего MVP
8. нажми `Save`

Это нужно для `apps/admin`, потому что admin login в текущем коде использует `signInWithPassword`.

## Шаг 8. Создай admin user в Firebase

Маршрут:

1. `Build`
2. `Authentication`
3. вкладка `Users`
4. нажми `Add user`
5. заполни:
   - `Email`
   - `Password`
6. сохрани пользователя

Этот email должен совпадать с тем, что ты потом укажешь в `ADMIN_ALLOWLIST_EMAILS`.

Пример:

```env
ADMIN_ALLOWLIST_EMAILS=admin@example.com
```

Если хочешь разрешить целый домен, можно указать:

```env
ADMIN_ALLOWLIST_EMAILS=@example.com
```

Если нужно несколько значений, используй запятую:

```env
ADMIN_ALLOWLIST_EMAILS=admin@example.com,ops@example.com,@example.org
```

## Шаг 9. Что делать с `FIREBASE_CLIENT_CONFIG`

Для текущего состояния репозитория оставь:

```env
FIREBASE_CLIENT_CONFIG={}
```

Почему:

- переменная есть в env contract;
- текущий код ее не читает;
- для запуска `web` и `admin` она сейчас не обязательна.

## Шаг 10. Что делать с `FIREBASE_ADMIN_CREDENTIALS`

Для текущего состояния репозитория оставь:

```env
FIREBASE_ADMIN_CREDENTIALS={}
```

Почему:

- текущий код не использует Firebase Admin SDK;
- для прохождения текущего MVP gate admin service account не нужен.

Если позже появится код на Admin SDK, брать service account нужно будет так:

1. `Project settings`
2. вкладка `Service accounts`
3. секция `Firebase Admin SDK`
4. `Generate new private key`

Но для текущего запроса и текущего кода этого делать не нужно.

## Шаг 11. Заполни `.env.dev`

Открой `.env.dev` и задай минимум:

```env
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_WEB_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXX
FIREBASE_CLIENT_CONFIG={}
FIREBASE_ADMIN_CREDENTIALS={}
ADMIN_ALLOWLIST_EMAILS=your-admin-email@example.com
```

## Шаг 12. Быстрая проверка после настройки

1. Убедись, что в Firebase:
   - создан `Web app`
   - включен `Authentication`
   - включен `Anonymous`
   - включен `Email/Password`
   - создан admin user

2. Убедись, что в `.env.dev`:
   - `FIREBASE_PROJECT_ID` не `replace-me`
   - `FIREBASE_WEB_API_KEY` не `replace-me`
   - `ADMIN_ALLOWLIST_EMAILS` содержит email созданного admin user

3. После этого запусти:

```sh
pnpm test:mvp:internal
```

## Типичные ошибки

### Ошибка 1. `FIREBASE_WEB_API_KEY is not configured`

Причина:

- в `.env.dev` все еще `replace-me`
- переменная не подхватилась процессом

Что проверить:

- значение реально заменено
- перезапущен dev/test process после изменения env

### Ошибка 2. Anonymous bootstrap не работает

Причина:

- не включен провайдер `Anonymous`

Что проверить:

- `Build -> Authentication -> Sign-in method -> Anonymous -> Enabled`

### Ошибка 3. Admin sign-in не работает

Причина:

- не включен `Email/Password`
- user не создан в Firebase Auth
- email не входит в `ADMIN_ALLOWLIST_EMAILS`

Что проверить:

- `Build -> Authentication -> Sign-in method -> Email/Password -> Enabled`
- `Build -> Authentication -> Users` содержит нужный email
- `.env.dev` содержит тот же email в `ADMIN_ALLOWLIST_EMAILS`

### Ошибка 4. Firebase user существует, но локальная admin роль не выдается

Причина:

- email не совпал с allowlist

Что проверить:

- нет лишних пробелов
- email записан в lower-case
- если используешь доменную allowlist, она выглядит как `@example.com`

## Краткая памятка

Нужно включить только это:

- `Authentication`
- `Anonymous`
- `Email/Password`

Нужно взять только это:

- `projectId`
- `apiKey`

Нужно заполнить только это:

```env
FIREBASE_PROJECT_ID=...
FIREBASE_WEB_API_KEY=...
FIREBASE_CLIENT_CONFIG={}
FIREBASE_ADMIN_CREDENTIALS={}
ADMIN_ALLOWLIST_EMAILS=...
```

## Источники

- [Add Firebase to your JavaScript project](https://firebase.google.com/docs/web/setup)
- [Learn about API keys for Firebase](https://firebase.google.com/docs/projects/api-keys)
- [Authenticate with Firebase anonymously](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Authenticate with Firebase using password-based accounts](https://firebase.google.com/docs/auth/web/password-auth)
- [Set up the Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
