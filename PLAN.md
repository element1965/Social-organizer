# Social Organizer — План разработки

## Обзор

Монорепо с нуля. Старый прототип (client/, relay/, shared/) удалён.

**Стек:** Turborepo + pnpm, Fastify + tRPC + Prisma + PostgreSQL 17 (порт 5434), BullMQ + Redis, React 19 + shadcn/ui + Tailwind, React Native (Expo) + NativeWind, Three.js, Gun.js (бэкап), i18next.

---

## Фаза 0: Инфраструктура монорепо

**Цель:** Пустой монорепо, который собирается и запускается.

1. Удалить старые файлы (client/, relay/, shared/types.ts, старый package.json)
2. Инициализировать pnpm workspace + Turborepo
3. Создать структуру:
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
4. `turbo.json` с pipeline: build, dev, lint, typecheck
5. `tsconfig.base.json` со strict-конфигом
6. `packages/db/prisma/schema.prisma` — полная Prisma-схема
7. `prisma migrate dev` — создать все таблицы в PostgreSQL
8. Redis (для BullMQ) — docker или локально

**Проверка:** `pnpm build` проходит, таблицы созданы в PostgreSQL.

---

## Фаза 1: Бэкенд (API)

**Цель:** Работающий Fastify-сервер со всеми tRPC-эндпоинтами.

### tRPC-роутеры:
- `auth` — loginFacebook, loginTelegram, loginApple, loginGoogle, generateLinkCode, linkAccount, refresh
- `user` — me, update, getById, getStats, delete
- `connection` — list, add (лимит 150, дедупликация), getCount, graphSlice (2-3 уровня для 3D)
- `collection` — create (валидация: мин 10, валюта из списка, URL), getById, close, cancel, myActive, myParticipating
- `obligation` — create (мин 10 единиц), myList, unsubscribe
- `notification` — list (с пагинацией), markRead, dismiss, unreadCount
- `settings` — get, updateLanguage, updateTheme, updateSound, updateFontScale, ignoreList CRUD
- `invite` — generate, accept (создаёт обоюдную связь), getByToken
- `stats` — profile (агрегированная статистика)

### Сервисы:
- **BFS-сервис** — обход графа связей для рассылки уведомлений. Рекурсивный CTE в PostgreSQL.
- **Auth-сервис** — валидация токенов платформ (FB/TG/Apple/Google) → JWT
- **Linking-сервис** — генерация 6-значного кода (5 мин TTL), объединение аккаунтов

### BullMQ-задачи:
- `collection:re-notify` — каждые 12ч проверка активных сборов, доуведомление через BFS
- `collection:cycle-close` — автозакрытие 28-дневного цикла регулярных сборов
- `user:special-notify` — на 3-й день после регистрации → уведомление о сборах Автора и Разработчика
- `notification:expire` — каждый час: протухшие уведомления (24ч) → статус EXPIRED
- `collection:check-block` — после каждого нового обязательства: если сумма >= цель → BLOCKED

**Проверка:** Все tRPC-эндпоинты отвечают, BFS-тест на тестовом графе, BullMQ-воркер запускается.

---

## Фаза 2: Веб-фронтенд (MVP)

**Цель:** Работающий React SPA для Facebook Instant Game.

### Страницы:
- **LoginPage** — 3D-планета + кнопка входа
- **OnboardingPage** — 4 экрана
- **DashboardPage** — колокольчик, мои сборы, обязательства, сеть
- **NotificationsPage** — список уведомлений с handshake path
- **CollectionPage** — детали сбора + прогресс + форма обязательства
- **CreateCollectionPage** — сумма, валюта, ссылка на чат
- **MyNetworkPage** — полноэкранный 3D-граф
- **ProfilePage** — свой/чужой профиль
- **SettingsPage** — язык, тема, звуки, шрифт, аккаунты, игнор-лист

### Техническое:
- Vite + React 19 + TypeScript
- shadcn/ui + Tailwind CSS (PostCSS)
- tRPC React client + React Query (polling 30-60s)
- React Router
- Светлая/тёмная тема
- i18n: en + ru
- QR-код для приглашений
- FB Instant Game SDK интеграция

---

## Фаза 3: 3D-визуализация и оптимизация

**Цель:** Three.js интеграция, бандл < 5MB для FB Instant Game.

1. PlanetScene — процедурная планета (шейдеры)
2. CloudBackground — декоративные облака
3. NetworkGraph — react-force-graph-3d
4. HandshakePath — подсветка цепочки
5. Автоопределение производительности
6. Tree-shaking Three.js
7. Code splitting — 3D lazy
8. Gzip/Brotli сжатие
9. Gun.js бэкап — IndexedDB, 2 уровня графа

---

## Фаза 4: Деплой и тестирование

1. Railway: PostgreSQL + Redis + Fastify
2. FB Instant Game регистрация
3. E2E-тест полного flow
4. Нагрузочный тест BFS (10K+ узлов)
5. Тест 12ч и 28-дневного циклов
6. Оставшиеся 23 языка i18n

---

## Prisma-схема (ключевые модели)

```prisma
model User {
  id, name, bio, phone, photoUrl
  language, theme, soundEnabled, fontScale
  role (REGULAR | AUTHOR | DEVELOPER)
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
  type (EMERGENCY|REGULAR), amount, currency (ISO 4217), chatLink
  status (ACTIVE|BLOCKED|CLOSED|CANCELLED)
  → obligations[], notifications[]
}

model Obligation {
  collectionId, userId, amount (>= 10)
  isSubscription, unsubscribedAt
}

model Notification {
  userId, collectionId, type, handshakePath (JSON)
  status (UNREAD|READ|DISMISSED|RESPONDED|EXPIRED)
  expiresAt, wave
  @@unique([userId, collectionId, wave])
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
| Handshake path | BFS при отправке, хранится в notification |
| 3D в RN | WebView с Three.js, postMessage |
| Gun.js бэкап | IndexedDB, 2 уровня (~22K записей) |
| Спец. профили | role=AUTHOR/DEVELOPER |

---

## Текущий статус

- [x] Фаза 0: Инфраструктура монорепо
- [ ] Фаза 1: Бэкенд (API)
- [ ] Фаза 2: Веб-фронтенд (MVP)
- [ ] Фаза 3: 3D и оптимизация
- [ ] Фаза 4: Деплой и тесты
