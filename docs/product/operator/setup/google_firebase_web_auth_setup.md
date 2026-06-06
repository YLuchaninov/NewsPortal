# Google/Firebase Web Auth Setup

Этот runbook описывает настройку end-user web sign-in через Google account для SignalOps.

Ключевое правило: OAuth Web Client ID, Firebase Web API key и Firebase Authentication Google provider должны принадлежать одному и тому же Google Cloud / Firebase project.

## Project Relationship

Firebase project не является отдельным объектом поверх Google Cloud project. Firebase project — это Google Cloud project, в котором включены Firebase services.

```text
Google Cloud Project
  -> Firebase enabled
     -> Firebase Authentication
     -> Web app config / Web API key
     -> OAuth Web Client IDs
```

Если Firebase уже создан, он уже есть в Google Cloud Console. Нужно просто выбрать тот же project по Project ID или Project number.

## Required SignalOps Env

Для web Google auth нужны:

```sh
FIREBASE_WEB_API_KEY=...
SIGNALOPS_WEB_GOOGLE_CLIENT_ID=...
SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN=mobidev.biz
```

Optional:

```sh
SIGNALOPS_API_CONTENT_AUTH_REQUIRED=false
```

Notes:

- `FIREBASE_WEB_API_KEY` берется из Firebase project settings / web app config.
- `SIGNALOPS_WEB_GOOGLE_CLIENT_ID` берется из Google Cloud Console OAuth client, созданного в том же project.
- `SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN=mobidev.biz` разрешает вход только пользователям с email `*@mobidev.biz`.
- `SIGNALOPS_API_CONTENT_AUTH_REQUIRED=false` оставляет direct content API reads совместимыми со старым режимом. При `true` content API reads требуют valid Google web session cookie.

## Firebase Project Setup

1. Open Firebase Console:
   https://console.firebase.google.com/
2. Select the project used by SignalOps.
3. Open Project settings.
4. Check Project ID and Project number.
5. Add a Web app if one does not exist yet.
6. Copy the Web API key into:

```sh
FIREBASE_WEB_API_KEY=...
```

7. Open Authentication -> Sign-in method.
8. Enable Google provider.
9. Save the provider settings.

The Google provider must be enabled before SignalOps can exchange a Google Identity Services credential through Firebase `accounts:signInWithIdp`.

## Google Cloud OAuth Setup

1. Open Google Cloud Console:
   https://console.cloud.google.com/
2. In the top project selector, choose the same project as the Firebase project.
3. Verify the Project number matches the Firebase Project number.
4. Open APIs & Services -> Credentials.
5. Create or open an OAuth 2.0 Client ID with Application type `Web application`.
6. Copy the Client ID into:

```sh
SIGNALOPS_WEB_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
```

7. In the same OAuth client, configure Authorized JavaScript origins.

For local development add:

```text
http://127.0.0.1:4321
http://localhost:4321
```

For production add the exact web origin, for example:

```text
https://your-web-domain.example
```

Use exact origins only. Do not add paths such as `/bff/auth/google`.

## Redirect URIs

The current SignalOps web flow uses Google Identity Services credential callback in the browser and posts the credential to:

```text
/bff/auth/google
```

It does not use an OAuth redirect flow. Authorized redirect URIs are not required for this implementation.

If Google Cloud Console requires a redirect URI for a different OAuth flow, that is not the flow used by SignalOps web sign-in.

## Domain Restriction

To allow only `mobidev.biz` Google accounts:

```sh
SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN=mobidev.biz
```

The comparison is exact and case-insensitive:

- allowed: `user@mobidev.biz`
- rejected: `user@sub.mobidev.biz`
- rejected: `user@gmail.com`

Do not include `@` in the env value.

## Local Verification

After changing env:

1. Restart the web process/container.
2. Open:

```text
http://127.0.0.1:4321/
```

3. Click Google sign-in.
4. Select a `mobidev.biz` account.
5. Expected result:

- signed-out landing page is replaced by full web functionality;
- `np_web_session` and `np_web_refresh` cookies are set;
- browser console does not show Firebase `OPERATION_NOT_ALLOWED` or `INVALID_IDP_RESPONSE`.

## Common Errors

### `OPERATION_NOT_ALLOWED`

Example:

```text
OPERATION_NOT_ALLOWED : The identity provider configuration is not found.
```

Meaning:

Firebase Authentication Google provider is not enabled in the selected Firebase project.

Fix:

1. Open Firebase Console.
2. Select the same project used by `FIREBASE_WEB_API_KEY`.
3. Go to Authentication -> Sign-in method.
4. Enable Google provider.

### `INVALID_IDP_RESPONSE`

Example:

```text
INVALID_IDP_RESPONSE : Invalid Idp Response: the Google id_token is not allowed to be used with this application.
```

Meaning:

The Google token was issued for an OAuth Web Client ID that is not authorized for the Firebase project used by `FIREBASE_WEB_API_KEY`.

Fix:

1. Open Firebase Project settings and note Project number.
2. Open Google Cloud Console.
3. Select the same Project number.
4. Use or create an OAuth Web Client ID inside that project.
5. Put that client id into `SIGNALOPS_WEB_GOOGLE_CLIENT_ID`.

If the client id starts with a different project number than Firebase, it is probably from the wrong Google Cloud project.

### `The given origin is not allowed for the given client ID`

Example:

```text
[GSI_LOGGER]: The given origin is not allowed for the given client ID.
```

Meaning:

Google Identity Services loaded the button with a valid client id, but the current browser origin is not listed in Authorized JavaScript origins for that OAuth client.

Fix:

1. Open Google Cloud Console.
2. Select the same project as Firebase.
3. Open APIs & Services -> Credentials.
4. Open the OAuth Web Client ID used in `SIGNALOPS_WEB_GOOGLE_CLIENT_ID`.
5. Add the exact local origin:

```text
http://127.0.0.1:4321
```

6. If you use localhost instead of 127.0.0.1, also add:

```text
http://localhost:4321
```

This error can appear even when the server-side Firebase exchange works, because the visible Google button iframe is validated by Google against Authorized JavaScript origins.

### `Cross-Origin-Opener-Policy policy would block the window.postMessage call`

Meaning:

This is a browser warning commonly emitted by Google Identity Services popup/iframe communication. It is usually not the primary login failure.

Fix:

First resolve GSI/Firebase errors such as unauthorized origin, disabled provider, or invalid IdP response. If login succeeds and only this warning remains, treat it as informational unless Google sign-in UI behavior is broken.

## References

- Firebase: use Firebase with an existing Google Cloud project:
  https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project
- Firebase CLI reference, including `projects:addfirebase`:
  https://firebase.google.com/docs/cli
- Firebase OAuth provider configuration:
  https://firebase.google.com/docs/auth/configure-oauth-rest-api
