# Sign in with Apple — настройка

Реализация: web OAuth через системный браузер (как Google). Бинарник пересобирать **не нужно**.
Код уже готов:
- Бэкенд: `apps/api/src/services/apple.service.ts` + роуты в `apps/api/src/index.ts`
  (`POST /api/auth/apple/callback`, `GET /.well-known/apple-developer-domain-association.txt`)
- Фронтенд: кнопка Apple в `apps/web/src/pages/LoginPage.tsx`, финиш‑страница `apps/web/src/pages/AppleCallbackPage.tsx` (роут `/auth/apple/done`)

Осталось 3 шага: настроить Apple Developer → задать env в Railway → задеплоить.

## Шаг 1 — Apple Developer Portal (developer.apple.com → Certificates, IDs & Profiles)

1. **App ID** `com.socialorganizer.app` → Edit → включить **Sign In with Apple** → Save.
2. **Identifiers → `+` → Services IDs**
   - Description: `Social Organizer Sign In`
   - Identifier: например `com.socialorganizer.signin` ← это и есть **APPLE_SERVICE_ID**
   - Register.
3. Открыть созданный Services ID → включить **Sign In with Apple** → **Configure**:
   - Primary App ID: `com.socialorganizer.app`
   - **Domains and Subdomains**: `orginizer.com` и `www.orginizer.com`
   - **Return URLs**: `https://www.orginizer.com/api/auth/apple/callback`
   - Сохранить. Apple предложит скачать файл для верификации домена
     (`apple-developer-domain-association.txt`) — открой его и скопируй всё содержимое.

## Шаг 2 — Railway env (сервис API)

```
APPLE_SERVICE_ID=com.socialorganizer.signin
APPLE_BUNDLE_ID=com.socialorganizer.app
APPLE_DOMAIN_ASSOCIATION=<всё содержимое скачанного файла>
VITE_APPLE_SERVICE_ID=com.socialorganizer.signin   # build-time для web
```

`VITE_APPLE_SERVICE_ID` должен присутствовать на момент сборки web (Railway build), иначе кнопка Apple не покажется.

## Шаг 3 — Деплой и верификация домена

1. Запушить (автодеплой Railway).
2. После деплоя проверить, что файл отдаётся:
   `https://www.orginizer.com/.well-known/apple-developer-domain-association.txt`
   должен вернуть содержимое (не index.html).
3. В Apple Developer (Services ID → Configure → Domains) нажать **Verify** рядом с доменом.
4. Открыть `/login` в обычном браузере → кнопка **Apple** → пройти вход.

## Как это работает

- Native (iOS/Android): кнопка открывает `appleid.apple.com/auth/authorize` в системном браузере
  (Apple блокирует вход во встроенном WKWebView). Apple делает form_post на бэкенд, бэкенд
  верифицирует id_token, создаёт/находит юзера и возвращает в приложение через
  `socialorganizer://auth-success?at=…&rt=…&uid=…` (тот же deep link, что у Google).
- Web: бэкенд редиректит на `/auth/apple/done#at=…` — SPA читает токены из фрагмента и логинит.
- Имя пользователя Apple отдаёт только при ПЕРВОМ входе (в поле `user`); далее только `sub` + email.

## Если ревьюер потребует нативную кнопку (редко для webview-приложений)
Тогда добавить `@capacitor-community/apple-sign-in`, capability "Sign in with Apple" в Xcode,
пересобрать и заново залить бинарник. Текущая web‑реализация удовлетворяет гайдлайн 4.8.
