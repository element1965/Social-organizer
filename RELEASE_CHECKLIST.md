# Финальный чек-лист релиза iOS 1.0

Всё, что делается через App Store Connect API, уже сделано (билд, метаданные, скриншоты,
категория, рейтинг 4+, цена Free, доступность). Ниже — только то, что нужно сделать руками
в браузере. **Делать строго по порядку.** Apple-вход должен реально работать ДО сабмита,
иначе отклонят по гайдлайну 4.8.

App: **Social Orginizer** · Apple ID `6768132198` · Bundle `com.socialorganizer.app`

---

## ШАГ 1 — Sign in with Apple: Apple Developer

developer.apple.com → Account → Certificates, IDs & Profiles

1. **Identifiers → App ID `com.socialorganizer.app`** → отметить **Sign In with Apple** → Save.
2. **Identifiers → `+` → Services IDs → Continue**
   - Description: `Social Organizer Sign In`
   - Identifier: `com.socialorganizer.signin`  ← запомни, это APPLE_SERVICE_ID
   - Register.
3. Открыть `com.socialorganizer.signin` → галочка **Sign In with Apple** → **Configure**:
   - Primary App ID: `com.socialorganizer.app`
   - Domains and Subdomains: `orginizer.com` и (новой строкой) `www.orginizer.com`
   - Return URLs: `https://www.orginizer.com/api/auth/apple/callback`
   - **Download** (кнопка скачивания файла верификации домена) → открой файл
     `apple-developer-domain-association.txt`, выдели и скопируй ВСЁ содержимое.
   - Пока НЕ нажимай Verify (домен ещё не отдаёт файл — это в Шаге 2).
   - Save.

## ШАГ 2 — Railway: переменные окружения

railway.app → проект **ravishing-expression** → сервис **API** → вкладка **Variables** → добавить:

```
APPLE_SERVICE_ID = com.socialorganizer.signin
APPLE_BUNDLE_ID = com.socialorganizer.app
APPLE_DOMAIN_ASSOCIATION = <вставь всё содержимое файла из Шага 1.3>
VITE_APPLE_SERVICE_ID = com.socialorganizer.signin
```

Сохранить. Railway передеплоит сам (если нет — Deployments → Redeploy).
⚠️ `VITE_APPLE_SERVICE_ID` нужен именно на сборке — поэтому дождись НОВОГО деплоя после добавления.

## ШАГ 3 — Верификация домена и проверка

1. Дождись окончания деплоя. Открой в браузере:
   `https://www.orginizer.com/.well-known/apple-developer-domain-association.txt`
   — должно показать содержимое файла (а не «Not configured» и не страницу сайта).
2. Вернись в Apple Developer → Services ID → Configure → у домена нажми **Verify**. Должно стать verified.
3. Открой `https://www.orginizer.com/login` в ОБЫЧНОМ браузере (не в Telegram) → должна
   появиться чёрная кнопка **Apple**. Нажми → пройди вход → проверь, что залогинило.

Если кнопка не появилась — значит `VITE_APPLE_SERVICE_ID` не попал в сборку: проверь, что
переменная задана и был НОВЫЙ деплой после её добавления.

---

## ШАГ 4 — App Privacy (этикетка данных)

appstoreconnect.apple.com → Apps → Social Orginizer → слева **App Privacy** → **Get Started / Edit**.

- Do you collect data? → **Yes, we collect data**.
- Добавить тип **Name** (раздел Contact Info):
  - Used for: **App Functionality**
  - Linked to the user's identity: **Yes**
  - Used for tracking: **No**
- Добавить тип **User ID** (раздел Identifiers):
  - Used for: **App Functionality**
  - Linked to the user's identity: **Yes**
  - Used for tracking: **No**
- (Если спросит про Email Address — у входа через Apple/Google есть email; можно добавить так же:
  App Functionality, Linked = Yes, Tracking = No. Не обязательно, если не хочешь.)
- **Publish**.

---

## ШАГ 5 — App Review Information (доступ для ревьюера)

ASC → Social Orginizer → версия **1.0** → блок **App Review Information**:

- **Sign-in required**: Yes.
- **Demo account** — дай рабочий аккаунт, которым ревьюер войдёт. Проще всего обычный
  **Google**-аккаунт (email + пароль) — кнопка Google на `/login` его пустит.
  (Telegram для ревьюера неудобен.)
- **Contact**: имя, телефон, email (например info@lambertain.agency).
- **Notes** (пример):
  > The app is a coordination/notification tool. Sign in with Google (demo account provided),
  > Apple, or Telegram. Use the provided Google account to access all features.

---

## ШАГ 6 — Submit for Review

ASC → версия 1.0 → проверь, что вверху нет жёлтых предупреждений (всё заполнено) →
**Add for Review** → **Submit to App Review**.

Ревью обычно 1–3 дня.

---

### Порядок коротко
1) Apple Developer: App ID + Services ID + домены + Return URL, скопировать файл верификации
2) Railway: 4 env-переменные, дождаться деплоя
3) Проверить `.well-known`-файл → Verify в Apple → проверить кнопку Apple на `/login`
4) App Privacy → Publish
5) App Review Information → демо-аккаунт + контакт
6) Submit to App Review
