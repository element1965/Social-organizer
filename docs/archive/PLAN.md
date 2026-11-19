# Social Organizer — План разработки

## Обзор

Монорепо с нуля. Старый прототип (client/, relay/, shared/) удалён.

**Стек:** Turborepo + pnpm, Fastify + tRPC + Prisma + PostgreSQL 17 (порт 5434), BullMQ + Redis, React 19 + shadcn/ui + Tailwind, React Native (Expo) + NativeWind, Three.js, Gun.js (бэкап), i18next.

---

## Фаза 0: Инфраструктура монорепо [DONE]

**Цель:** Пустой монорепо, который собирается и запускается.

1. [x] Удалить старые файлы (client/, relay/, shared/types.ts, старый package.json)
2. [x] Инициализировать pnpm workspace + Turborepo
3. [x] Создать структуру:
   ```
   packages/
     shared/          — @so/shared: типы, константы, валюты, валидация
     db/              — @so/db: Prisma-схема + миграции
     api-client/      — @so/api-client: tRPC-клиент
     i18n/            — @so/i18n: i18next + en.json + ru.json
     gun-backup/      — @so/gun-backup: Gun.js локальный бэкап (заглушка)
     graph-3d/        — @so/graph-3d: Three.js визуализация (заглушка)
     fb-adapter/      — @so/fb-adapter: FB Instant Game SDK (заглушка)
     tg-adapter/      — @so/tg-adapter: Telegram WebApp (заглушка)
   apps/
     api/             — @so/api: Fastify сервер
     web/             — @so/web: React SPA
     mobile/          — @so/mobile: React Native Expo (заглушка)
   ```
4. [x] `turbo.json` с pipeline: build, dev, lint, typecheck
5. [x] `tsconfig.base.json` со strict-конфигом
6. [x] `packages/db/prisma/schema.prisma` — полная Prisma-схема
7. [x] `prisma migrate dev` — создать все таблицы в PostgreSQL
8. [x] Redis (для BullMQ) — docker или локально

**Проверка:** `pnpm build` проходит, таблицы созданы в PostgreSQL.

---

## Фаза 1: Бэкенд (API) [DONE]

**Цель:** Работающий Fastify-сервер со всеми tRPC-эндпоинтами.

### tRPC-роутеры:
- [x] `auth` — loginWithPlatform (FB/TG/Apple/Google), generateLinkCode, linkAccount, refresh
- [x] `user` — me, update, getById, getStats, delete (soft-delete с очисткой профиля)
- [x] `connection` — list, add (лимит 150 у обоих, дедупликация), getCount, graphSlice (2-3 уровня для 3D)
- [x] `collection` — create (спецпрофили без суммы, 1+1 лимит), getById, close (COLLECTION_CLOSED рассылка), cancel, myActive, myParticipating
- [x] `obligation` — create (мин 10 единиц, блокировка при достижении цели), myList, unsubscribe
- [x] `notification` — list (курсорная пагинация), markRead, dismiss, unreadCount
- [x] `settings` — get, updateLanguage, updateTheme, updateSound, updateFontScale, ignoreList CRUD
- [x] `invite` — generate, accept (лимит у обоих, обоюдная связь), getByToken
- [x] `stats` — profile (статистика с разбивкой по валютам amountByCurrency)

### Сервисы:
- [x] **BFS-сервис** — рекурсивный CTE в PostgreSQL, исключает удалённых пользователей из получателей (но проходит через них)
- [x] **Auth-сервис** — JWT (HS256), 30 мин access / 30 дн refresh, middleware проверяет deletedAt
- [x] **Linking-сервис** — 6-значный код (5 мин TTL), объединение аккаунтов
- [x] **Notification-сервис** — BFS-рассылка с ignore-списком, handshake path, upsert по [userId, collectionId, type, wave]

### BullMQ-задачи:
- [x] `collection:re-notify` — каждые 12ч, доуведомление через BFS (пропускает коллекции без суммы)
- [x] `collection:cycle-close` — автозакрытие 28-дневного цикла, сохранение обязательств для статистики, рассылка COLLECTION_CLOSED
- [x] `user:special-notify` — уведомления о сборах Автора/Разработчика после первого обязательства пользователя
- [x] `notification:expire` — каждый час: протухшие уведомления (24ч) → статус EXPIRED
- [x] `collection:check-block` — если сумма >= цель → BLOCKED (пропускает коллекции без суммы)

---

## Фаза 2: Веб-фронтенд (MVP) [DONE]

**Цель:** Работающий React SPA для Facebook Instant Game.

### Страницы:
- [x] **LoginPage** — 3D-планета + кнопки входа (FB/TG/Apple/Google)
- [x] **OnboardingPage** — 4 экрана, кнопка приглашения на экране 4 (Web Share API), без Skip
- [x] **DashboardPage** — гейт «добавь первую связь», кнопка «Мне нужна помощь», мои сборы/обязательства/сеть, 3D облака фоном
- [x] **NotificationsPage** — список уведомлений с именами в handshake path, таймер 24ч, бейджи по типу
- [x] **CollectionPage** — детали сбора, прогресс (nullable amount), форма обязательства, список участников
- [x] **CreateCollectionPage** — тип, сумма, валюта (USD/EUR), ссылка на чат, предупреждение >10000
- [x] **MyNetworkPage** — 3D-граф (lazy) + список связей + кнопки приглашения/QR
- [x] **ProfilePage** — форма редактирования (имя/био/телефон), список связей, статистика по валютам, добавить/игнор
- [x] **SettingsPage** — язык, тема, звуки, размер шрифта, связывание аккаунтов, игнор-лист, удаление
- [x] **InvitePage** — принятие реферальной ссылки (/invite/:token)

### Техническое:
- [x] Vite + React 19 + TypeScript
- [x] shadcn/ui + Tailwind CSS (PostCSS)
- [x] tRPC React client + React Query (polling 30s)
- [x] React Router v7 с ProtectedRoute
- [x] Светлая/тёмная тема + системная
- [x] i18n: en + ru (196 ключей, автодетект через navigator.language)
- [x] QR-код для приглашений (qrcode.react)
- [x] Навигация через i18n (nav.home, nav.notifications и т.д.)

---

## Фаза 3: 3D-визуализация и оптимизация [DONE]

**Цель:** Three.js интеграция, бандл < 5MB для FB Instant Game.

1. [x] PlanetScene — процедурная планета (шейдеры)
2. [x] CloudBackground — декоративные облака на дашборде
3. [x] NetworkGraph — react-force-graph-3d (интерактивный 3D-граф)
4. [x] HandshakePath — подсветка цепочки рукопожатий
5. [x] Автоопределение производительности
6. [x] Tree-shaking Three.js
7. [x] Code splitting — 3D lazy loaded
8. [x] Gzip/Brotli сжатие (итого ~607 KB gzip < 5 MB)
9. [x] Gun.js бэкап — IndexedDB, 2 уровня графа

---

## Фаза 4: Деплой и тестирование [В ПРОЦЕССЕ]

1. [x] Railway: PostgreSQL + Redis + Fastify (автодеплой при git push в main)
2. [ ] FB Instant Game регистрация в Meta Developer Console
3. [ ] E2E-тест полного flow
4. [ ] Нагрузочный тест BFS (10K+ узлов)
5. [ ] Тест 12ч и 28-дневного циклов
6. [ ] Оставшиеся 23 языка i18n

### Аудит SPEC выполнен:
- [x] Collection.amount nullable для спецпрофилей (AUTHOR/DEVELOPER)
- [x] BFS не отправляет уведомления для спецпрофилей при создании сбора
- [x] Лимит 1+1 (макс 1 экстренный + 1 регулярный)
- [x] BFS исключает удалённых пользователей из получателей
- [x] collection.close рассылает COLLECTION_CLOSED всем ранее уведомлённым
- [x] cycle-close сохраняет обязательства для статистики
- [x] Удаление пользователя: soft-delete, аннулирование обязательств, отмена сборов
- [x] Лимит связей проверяется у обоих пользователей
- [x] Notification unique constraint: [userId, collectionId, type, wave]
- [x] Статистика с разбивкой по валютам
- [x] Открытая регистрация + органическое слияние сетей через реферальные ссылки
- [x] Контакты (телефон) видны всем пользователям

---

## Prisma-схема (ключевые модели)

```prisma
model User {
  id, name, bio, phone, photoUrl
  language, theme, soundEnabled, fontScale
  role (REGULAR | AUTHOR | DEVELOPER)
  deletedAt — soft delete
  → platformAccounts[], connections[], collections[], obligations[], notifications[]
}

model PlatformAccount {
  platform (FB|TG|APPLE|GOOGLE), platformId
  @@unique([platform, platformId])
}

model Connection {
  userAId, userBId (userAId < userBId)
  @@unique([userAId, userBId])
}

model Collection {
  type (EMERGENCY|REGULAR), amount? (nullable для спецпрофилей), currency, chatLink
  status (ACTIVE|BLOCKED|CLOSED|CANCELLED)
  → obligations[], notifications[]
}

model Obligation {
  collectionId, userId, amount (>= 10)
  isSubscription, unsubscribedAt
}

model Notification {
  userId, collectionId, type, handshakePath (JSON: имена пользователей)
  status (UNREAD|READ|DISMISSED|RESPONDED|EXPIRED)
  expiresAt, wave
  @@unique([userId, collectionId, type, wave])
}

model IgnoreEntry { fromUserId, toUserId @@unique }
model LinkingCode { userId, code (6 цифр), expiresAt (5 мин) }
model InviteLink { inviterId, token, usedById }
```

---

## Ключевые решения

| Аспект | Решение |
|--------|---------|
| Connections | userAId < userBId для дедупликации |
| Polling | React Query refetchInterval: 30000ms |
| Auth | Платформенный токен → JWT (30 мин) + refresh |
| Handshake path | BFS при отправке, хранится в notification как имена |
| 3D в RN | WebView с Three.js, postMessage |
| Gun.js бэкап | IndexedDB, 2 уровня (~22K записей) |
| Спец. профили | role=AUTHOR/DEVELOPER, без лимита суммы, BFS не при создании |
| Удаление | Soft-delete, серый профиль, аннулирование обязательств |
| Регистрация | Открытая, без обязательного приглашения |
| Слияние сетей | Автоматическое через BFS при создании любой новой связи |
| i18n | Автодетект через navigator.language, fallback en |

---

## Текущий статус

- [x] Фаза 0: Инфраструктура монорепо
- [x] Фаза 1: Бэкенд (API)
- [x] Фаза 2: Веб-фронтенд (MVP)
- [x] Фаза 3: 3D и оптимизация
- [~] Фаза 4: Деплой и тесты (Railway done, аудит done, FB/E2E/load tests TODO)

## Осталось

- [ ] FB Instant Game регистрация
- [ ] E2E-тесты полного flow
- [ ] Нагрузочный тест BFS (10K+ узлов)
- [ ] Тест воркеров (12ч цикл, 28-дневный цикл)
- [ ] 23 дополнительных языка i18n
- [ ] Telegram Mini App интеграция
- [ ] React Native (Expo) мобильное приложение
- [ ] Push-уведомления (FCM/APNs)
