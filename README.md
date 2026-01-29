# Social Organizer

P2P-приложение для записи связей и обязательств. Работает на Gun.js без центрального сервера — данные синхронизируются напрямую между участниками.

## Архитектура

```
Social organizer/
├── client/          # React + TypeScript + Vite + Tailwind
│   ├── components/  # UI-компоненты (Welcome, Dashboard, Connections и др.)
│   ├── gun-sync.ts  # P2P синхронизация через Gun.js
│   ├── store.ts     # Zustand store (связка Gun <-> React)
│   └── types.ts     # UI-типы
├── relay/           # Gun.js relay-сервер (bootstrap node)
│   └── server.js
├── shared/          # Общие типы данных
│   └── types.ts     # Participant, Connection, Obligation, State Machine
└── package.json     # Root: запуск relay + client
```

## Модель данных

| Сущность      | Поля                                               |
|---------------|-----------------------------------------------------|
| Participant   | pubKey, invitedBy, createdAt                        |
| Connection    | fromPubKey, toPubKey, createdAt                     |
| Obligation    | id, fromPubKey, toPubKey, unitAmount, type, status, createdAt |

### Типы обязательств
- `ONE_TIME` — разовое
- `REPEATING` — повторяющееся
- `INITIATIVE` — инициатива

### State Machine (Obligation)
```
DECLARED → CONFIRMED → CLOSED
```
Других переходов нет. CLOSED — терминальное состояние.

## Принципы

- **Trustless** — нет центрального арбитра
- **Deterministic** — подтверждение по timestamp (earliest first)
- **P2P** — Gun.js CRDT, данные реплицируются между пирами
- **Non-custodial** — система не перемещает деньги и не хранит финансовые данные

## Быстрый старт

```bash
# Установить зависимости
npm run install:all

# Запустить relay + client
npm run dev
```

- Client: http://localhost:3000
- Relay: http://localhost:8765

## Переменные окружения (client)

Создайте `client/.env` при необходимости:

```
VITE_RELAY_URL=http://localhost:8765/gun
```

## Технологии

- React 19 + TypeScript + Vite
- Tailwind CSS (CDN)
- Gun.js (P2P CRDT store + SEA crypto)
- Zustand (state management)
- Express (relay server)
