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

### apps/api (планируется)
```
PORT=3001
DATABASE_URL=...
REDIS_URL=redis://localhost:6379
JWT_SECRET=...
```

## Текущий статус

- [x] **Фаза 0:** Инфраструктура монорепо
- [ ] **Фаза 1:** Бэкенд (API)
- [ ] **Фаза 2:** Веб-фронтенд (MVP)
- [ ] **Фаза 3:** 3D и оптимизация
- [ ] **Фаза 4:** Деплой и тестирование
