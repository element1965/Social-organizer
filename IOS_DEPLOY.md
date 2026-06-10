# Гайд по деплою в App Store (iOS)

## Текущий статус релиза 1.0 (обновлено 2026-06-10)

App: **Social Orginizer** · Apple ID `6768132198` · Bundle `com.socialorganizer.app` · версия 1.0 (**build 2**).

### ⚠️ Reject 2026-06-10 (build 1) — исправлено в коде, нужен новый бинарник build 2

Apple отклонила build 1 на iPad Air 11" (iPadOS 26.5) по трём пунктам. Все три исправлены (коммит a53058e):

1. **2.1a — краш камеры.** Аватар грузится через `<input type="file" accept="image/*">` (SettingsPage). На iPad iOS крашит без usage-описаний. Фикс: в `Info.plist` добавлены `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`.
2. **2.1a — зависает Sign in with Apple.** Deep link `socialorganizer://auth-success` не возвращался в приложение. Фикс: в `Info.plist` добавлен `CFBundleURLTypes` со схемой `socialorganizer`.
3. **4.5.4 — push обязателен.** `NativePushBootstrap` блокировал приложение гейтом «Включи уведомления» на всех native (включая iOS). Фикс: гейт показывается только на Android, на iOS push опционален (через Настройки). Это веб-фикс — уезжает на Railway через git push.

**Что осталось вручную:** пересобрать iOS (`bash scripts/deploy-ios.sh` → Xcode Archive build 2 → Upload), дождаться обработки, привязать build 2 к версии 1.0, заполнить What's New и Submit for Review.

Готово (через App Store Connect API, ключ в `secrets/asc/`):
- ✅ Бинарник build 1 загружен и VALID, привязан к версии 1.0
- ✅ Export compliance: `usesNonExemptEncryption = false`
- ✅ Описание, ключевые слова, support URL, marketing URL, privacy policy URL (`/privacy`)
- ✅ Скриншоты: iPhone 6.7" (1290×2796, 4 шт) + iPad 12.9" (2048×2732, 3 шт)
- ✅ Категория: Social Networking · Возрастной рейтинг: 4+
- ✅ Цена: Free · Доступность: все 175 стран

Осталось вручную в веб-интерфейсе (API недоступен):
- ⏳ **App Privacy** (этикетка данных). Объявить: Contact Info → Name; Identifiers → User ID (Telegram ID).
  Оба: «Data Linked to You», цель «App Functionality», НЕ для трекинга.
- ⏳ **App Review Information**: контакт + демо-аккаунт для входа (приложение требует логин Google/Telegram).
  Рекомендуется демо-аккаунт Google (email+пароль) — ревьюер сможет войти.
- ⏳ После заполнения — **Submit for Review** (по запросу владельца; автоматически НЕ отправляется).

Скрипты автоматизации листинга — разовые, лежат в истории сессии; ASC API key: `secrets/asc/api_key.json` (gitignored).

## Подготовка (один раз на Mac)

```bash
# Xcode — поставь из Mac App Store (если ещё не стоит)

# CocoaPods
sudo gem install cocoapods

# pnpm (если не стоит)
npm install -g pnpm
```

## Шаг 1 — Иконка приложения

Положи **PNG 1024×1024** (без прозрачности и без скруглённых углов — Apple сама скругляет) сюда:

```
apps/web/resources/icon.png
```

По желанию можно добавить splash-экран (PNG 2732×2732):
```
apps/web/resources/splash.png
apps/web/resources/splash-dark.png
```

## Шаг 2 — Apple Developer Portal (в браузере, один раз)

1. Заходи на [developer.apple.com](https://developer.apple.com) → **Account**
2. **Certificates, IDs & Profiles → Identifiers** → жми `+`
   - Type: App ID → App
   - Bundle ID: `com.socialorganizer.app` (Explicit)
   - Включи: Push Notifications
   - Register
3. **Certificates** → `+`
   - Apple Distribution → пройди мастер (понадобится CSR из Keychain на Mac)
   - Скачай сертификат и дважды кликни — он установится в Keychain
4. **Profiles** → `+`
   - App Store Connect → выбери `com.socialorganizer.app`
   - Выбери Distribution-сертификат
   - Скачай файл `.mobileprovision`

## Шаг 3 — App Store Connect (в браузере, один раз)

1. Заходи на [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. **My Apps** → `+` → New App
   - Platform: iOS
   - Name: Social Organizer
   - Bundle ID: `com.socialorganizer.app`
   - SKU: `socialorganizer` (любая уникальная строка)
3. Заполни **App Information**, **Pricing**, **App Privacy**
4. Добавь **скриншоты** (обязательно для 6.7" iPhone — например, iPhone 15 Pro Max)
5. Напиши **Description**, **Keywords**, **Support URL**

## Шаг 4 — Сборка и загрузка (терминал на Mac)

```bash
# Подтяни свежий код
git pull

# Запусти скрипт деплоя
bash scripts/deploy-ios.sh
```

Скрипт сделает:
- Соберёт веб-приложение
- Добавит iOS-платформу (только при первом запуске)
- Сгенерирует все размеры иконок из `resources/icon.png`
- Синхронизирует проект и откроет Xcode

## Шаг 5 — Xcode

1. Выбери **таргет `App`** (слева)
2. Вкладка **Signing & Capabilities**
   - Team: выбери свой Apple Developer аккаунт
   - Bundle Identifier: `com.socialorganizer.app`
   - Signing: Automatic (или импортируй `.mobileprovision` вручную)
3. Поставь **Version** (например, `1.0`) и **Build** (например, `1`)
4. Выбери цель сборки: **Any iOS Device (arm64)**
5. **Product → Archive** (займёт 2–5 минут)
6. В окне Organizer: **Distribute App**
   - App Store Connect → Upload → Next → Next → Upload
7. Подожди ~10 минут, пока App Store Connect обработает билд

## Шаг 6 — Отправка на ревью

1. В App Store Connect → твоё приложение → iOS App → жми `+` рядом с Build
2. Выбери загруженный билд
3. Заполни **What's New** (что нового)
4. **Add for Review** → **Submit to App Review**

Ревью занимает 1–3 дня.

---

## Поднятие версии (для следующих релизов)

Можно отредактировать `apps/web/ios/App/App.xcodeproj` в Xcode, либо через `agvtool`:
```bash
cd apps/web/ios/App
agvtool new-marketing-version 1.1
agvtool next-version -all
```
