думай на русском
читай редми и поддерживай его актуальность
делай комит и пуш в гит

# GitHub — всё на английском
- README.md — на английском
- Commit messages — на английском
- PR descriptions — на английском
- Code comments — на английском

# PostgreSQL 17
- Порт: 5434
- Пароль: 1111
- Пользователь: postgres
- БД: social_organizer

# Railway
- Token: 995be95f-d629-4def-957a-eb22274285b7
- Деплой только через git push (автодеплой при пуше в main)
- URL: https://social-organizer-production.up.railway.app
- Healthcheck: /health
- GitHub репо: element1965/Social-organizer
- Проект: ravishing-expression (9a699980-4ee1-4582-8d32-a9c865722736)
- Service ID (API): 99e183b8-bdc7-4dd0-9fae-bc8e03900569
- Environment ID: 5ce68db1-c13c-4eea-b512-e06c40aba1c2
- Сервисы: Social-organizer (API), PostgreSQL, Redis

## Доступ к Railway API (логи, деплои, статус)

Railway CLI не работает с project token напрямую. Используй GraphQL API через curl:

```bash
# Аутентификация (проверка)
curl -sk -X POST https://backboard.railway.com/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 995be95f-d629-4def-957a-eb22274285b7" \
  -d '{"query":"{ me { name email } }"}'

# Последние деплои
curl -sk -X POST https://backboard.railway.com/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 995be95f-d629-4def-957a-eb22274285b7" \
  -d '{"query":"{ deployments(first: 5, input: { projectId: \"9a699980-4ee1-4582-8d32-a9c865722736\", serviceId: \"99e183b8-bdc7-4dd0-9fae-bc8e03900569\", environmentId: \"5ce68db1-c13c-4eea-b512-e06c40aba1c2\" }) { edges { node { id status createdAt } } } }"}'

# Логи деплоя (подставить DEPLOYMENT_ID)
curl -sk -X POST https://backboard.railway.com/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 995be95f-d629-4def-957a-eb22274285b7" \
  -d '{"query":"{ deploymentLogs(deploymentId: \"DEPLOYMENT_ID\", limit: 100) { message timestamp severity } }"}'

# Build логи
curl -sk -X POST https://backboard.railway.com/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 995be95f-d629-4def-957a-eb22274285b7" \
  -d '{"query":"{ buildLogs(deploymentId: \"DEPLOYMENT_ID\", limit: 200) { message timestamp } }"}'
```

Флаг `-k` нужен на Windows (обход проблемы с SSL в curl).
