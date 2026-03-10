думай на русском
читай редми и поддерживай его актуальность
делай комит и пуш в гит

# GitHub — всё на английском
- README.md — на английском
- Commit messages — на английском
- PR descriptions — на английском
- Code comments — на английском

# PostgreSQL 17 (Railway)
- Host (internal): PostgreSQL.railway.internal
- Порт: 5432
- Пароль: VWu9BYoj6MO1KcEsoHuIO8WI
- Пользователь: postgres
- БД: social_organizer
- TCP Proxy (публичный доступ): ballast.proxy.rlwy.net:27469
- Public URL: postgresql://postgres:VWu9BYoj6MO1KcEsoHuIO8WI@ballast.proxy.rlwy.net:27469/social_organizer?schema=public
- Миграции: только вручную (Railway не поддерживает автоматические)
- Как применить миграции:
  1. В packages/db/.env временно заменить DATABASE_URL на Public URL (см. выше)
  2. cd packages/db && npx prisma migrate deploy
  3. Вернуть DATABASE_URL обратно на localhost:5434

# Railway
- Token: d72c5e0a-db45-4e51-b6bd-d188ec9a588b
- Деплой только через git push (автодеплой при пуше в main)
- URL: https://www.orginizer.com
- Healthcheck: /health
- GitHub репо: element1965/Social-organizer
- Проект: ravishing-expression (9a699980-4ee1-4582-8d32-a9c865722736)
- Service ID (API): 99e183b8-bdc7-4dd0-9fae-bc8e03900569
- Service ID (PostgreSQL): 25065be4-8d13-4b64-8c47-fe67d835bbd3
- Service ID (Redis): dbc66e68-9310-42a6-821f-eb32c6bde6b1
- Environment ID: 5ce68db1-c13c-4eea-b512-e06c40aba1c2

# Telegram Bot
- Username: @socialorganizer_bot
- Env: VITE_TELEGRAM_BOT_USERNAME=socialorganizer_bot (build-time, нужен в Railway)

# Админы и рассылка
- ADMIN_IDS задаются через env переменную (apps/api/src/admin.ts)
- Рассылка (BroadcastPanel) — только для админов:
  - Фронт: кнопка видна только при isAdmin (ChatAssistant.tsx)
  - API: broadcast.sendAll, broadcast.sendDirect — assertAdmin()
  - Upload: /api/broadcast/upload — isAdmin() check
  - Обычные юзеры не видят кнопку и не могут вызвать API
- Бюджет редактируется на дашборде (блок "Мои возможности"), не в настройках

# Google Play (Android — Capacitor)
- Package: com.socialorganizer.app
- Проект: `apps/web/android/` (Capacitor, НЕ Bubblewrap/TWA)
- Capacitor config: `apps/web/capacitor.config.ts` (url: https://www.orginizer.com)
- Keystore: `keystore/release.jks` (пароль: socialorg2026, alias: social-organizer)
- Keystore properties: `apps/web/android/keystore.properties`
- Версия: build.gradle → `versionCode` / `versionName` (увеличивать при каждом релизе)
- JAVA_HOME: `C:\Program Files\Android\Android Studio\jbr`
- Сборка AAB:
  ```
  export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
  cd apps/web/android && ./gradlew bundleRelease
  ```
- Выходной файл: `apps/web/android/app/build/outputs/bundle/release/app-release.aab`
- Загрузка: вручную через Google Play Console
