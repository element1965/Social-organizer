# Гайд по деплою в App Store (iOS)

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
