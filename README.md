# Social Organizer

Приложение для организации сборов и обязательств через доверенную сеть связей. Facebook Instant Game + Telegram WebApp.

## Архитектура

Turborepo монорепо с pnpm workspaces.

```
Social organizer/
├── apps/
│   ├── api/             # @so/api: Fastify + tRPC + BullMQ
│   ├── web/             # @so/web: React 19 + Vite + Tailwind + shadcn/ui
│   └── mobile/          # @so/mobile: React Native Expo (заглушка)
├── packages/
│   ├── shared/          # @so/shared: типы, константы, валюты, валидация
│   ├── db/              # @so/db: Prisma-схема + миграции (PostgreSQL 17)
│   ├── api-client/      # @so/api-client: tRPC-клиент
│   ├── i18n/            # @so/i18n: i18next (en + ru)
│   ├── gun-backup/      # @so/gun-backup: Gun.js локальный бэкап (заглушка)
│   ├── graph-3d/        # @so/graph-3d: Three.js визуализация (заглушка)
│   ├── fb-adapter/      # @so/fb-adapter: FB Instant Game SDK (заглушка)
│   └── tg-adapter/      # @so/tg-adapter: Telegram WebApp (заглушка)
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── PLAN.md              # План разработки по фазам
└── SPEC.md              # Полная спецификация проекта
```

## Стек

- **Монорепо:** Turborepo + pnpm
- **Бэкенд:** Fastify + tRPC + Prisma + PostgreSQL 17 + BullMQ + Redis
- **Фронтенд:** React 19 + Vite + Tailwind CSS + shadcn/ui
- **Мобильное:** React Native (Expo) + NativeWind
- **3D:** Three.js + react-force-graph-3d
- **Бэкап:** Gun.js (IndexedDB)
- **i18n:** i18next (en, ru)

## Быстрый старт

```bash
# Установить зависимости
pnpm install

# Настроить базу данных
cp packages/db/.env.example packages/db/.env
# Отредактируйте packages/db/.env при необходимости

# Создать таблицы
pnpm db:migrate

# Собрать все пакеты
pnpm build

# Запустить в dev-режиме
pnpm dev
```

## База данных

- **PostgreSQL 17** на порту 5434
- Prisma ORM для миграций и генерации клиента

### Модели данных

| Модель | Описание |
|--------|----------|
| User | Пользователь с настройками и ролью |
| PlatformAccount | Привязка к FB/TG/Apple/Google |
| Connection | Связь между пользователями (userAId < userBId) |
| Collection | Сбор средств (экстренный/регулярный) |
| Obligation | Обязательство по сбору |
| Notification | Уведомление с цепочкой рукопожатий |
| IgnoreEntry | Запись игнора |
| LinkingCode | 6-значный код привязки (5 мин TTL) |
| InviteLink | Пригласительная ссылка |

## Скрипты

| Команда | Описание |
|---------|----------|
| `pnpm build` | Собрать все пакеты |
| `pnpm dev` | Запустить dev-серверы |
| `pnpm typecheck` | Проверить типы |
| `pnpm db:migrate` | Запустить миграции Prisma |
| `pnpm db:generate` | Сгенерировать Prisma Client |
| `pnpm db:studio` | Открыть Prisma Studio |

## Переменные окружения

### packages/db/.env
```
DATABASE_URL="postgresql://postgres:1111@localhost:5434/social_organizer?schema=public"
```

### apps/api
```
PORT=3001
DATABASE_URL=postgresql://postgres:1111@localhost:5434/social_organizer?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
```

## API (tRPC-эндпоинты)

| Роутер | Процедуры |
|--------|-----------|
| `auth` | loginWithPlatform, refresh, generateLinkCode, linkAccount |
| `user` | me, update, getById, getStats, delete |
| `connection` | list, add (лимит 150), getCount, graphSlice (2-3 уровня) |
| `collection` | create, getById, close, cancel, myActive, myParticipating |
| `obligation` | create, myList, unsubscribe |
| `notification` | list (курсорная пагинация), markRead, dismiss, unreadCount |
| `settings` | get, updateLanguage/Theme/Sound/FontScale, ignoreList/addIgnore/removeIgnore |
| `invite` | generate, accept, getByToken |
| `stats` | profile |

## Сервисы

- **Auth** — JWT (HS256), 30 мин access / 30 дн refresh, 6-значные коды привязки
- **BFS** — рекурсивный CTE в PostgreSQL для обхода графа связей и рассылки уведомлений
- **Notifications** — BFS-рассылка с учётом ignore-списка и handshake path

## BullMQ-задачи

| Воркер | Описание | Расписание |
|--------|----------|------------|
| `re-notify` | Повторные уведомления по активным сборам | Каждые 12ч |
| `cycle-close` | Автозакрытие 28-дневного цикла регулярных сборов | Каждый час |
| `special-notify` | Уведомления о сборах Автора/Разработчика (после первого обязательства) | Каждый час |
| `expire-notifications` | Протухшие уведомления (24ч) → EXPIRED | Каждый час |
| `check-block` | Проверка суммы обязательств → BLOCKED | По событию |

## Деплой

- **Railway:** автодеплой при `git push` в main
- **URL:** https://social-organizer-production.up.railway.app
- **Healthcheck:** /health
- **Сервисы:** PostgreSQL 17, Redis 7, Fastify API

## Веб-фронтенд (apps/web)

React 19 SPA с tRPC-клиентом.

### Страницы

| Страница | Путь | Описание |
|----------|------|----------|
| LoginPage | `/login` | Вход через платформу (FB/TG/Apple/Google) |
| OnboardingPage | `/onboarding` | 4 экрана онбординга с приглашением |
| DashboardPage | `/` | Мои сборы, обязательства, сеть, «Мне нужна помощь» |
| NotificationsPage | `/notifications` | Уведомления с handshake path и таймером 24ч |
| CreateCollectionPage | `/create` | Создание сбора (USD/EUR) |
| CollectionPage | `/collection/:id` | Детали сбора + обязательства |
| MyNetworkPage | `/network` | Список связей + приглашения |
| ProfilePage | `/profile/:userId` | Профиль с редактированием, списком связей, статистикой по валютам |
| SettingsPage | `/settings` | Язык, тема, звуки, размер шрифта, игнор-лист |
| InvitePage | `/invite/:token` | Принятие пригласительной ссылки |

### Технологии фронтенда

- **State:** Zustand (auth, theme) + tRPC React Query (серверные данные)
- **Роутинг:** React Router v7 с ProtectedRoute
- **UI:** shadcn-стиль компоненты + Tailwind CSS 3
- **i18n:** i18next v25 + react-i18next (en/ru), автодетект языка через navigator.language
- **Иконки:** lucide-react
- **QR:** qrcode.react
- **3D:** Three.js + @react-three/fiber (lazy loaded)
- **3D-граф:** react-force-graph-3d (lazy loaded)
- **Бэкап:** @so/gun-backup (Gun.js + IndexedDB)

### Размер бандла (code splitting)

| Чанк | Размер | Gzip | Загрузка |
|-------|--------|------|----------|
| index (основное приложение) | 458 KB | 140 KB | Всегда |
| three (Three.js core) | 1284 KB | 342 KB | Lazy |
| r3f (React Three Fiber) | 169 KB | 54 KB | Lazy |
| force-graph (ForceGraph3D) | 206 KB | 63 KB | Lazy |
| CSS | 20 KB | 4 KB | Всегда |
| **Итого gzip** | | **~607 KB** | **< 5 MB лимит FB** |

## Текущий статус

- [x] **Фаза 0:** Инфраструктура монорепо
- [x] **Фаза 1:** Бэкенд (API) — tRPC роутеры, сервисы, BullMQ воркеры
- [x] **Фаза 2:** Веб-фронтенд (MVP) — все 9 страниц, UI-компоненты, tRPC клиент, i18n
- [x] **Фаза 3:** 3D и оптимизация — Three.js планета, облака, граф, Gun.js бэкап, code splitting
- [x] **Фаза 4:** Деплой и тестирование — Railway config, API serves web frontend, SPEC audit fixes
