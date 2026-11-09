# WP9 — Чистка, сборки, проверка в обёртках

Ветка `redesign/wp9-cleanup` от `redesign` после мерджа WP8. PR в `redesign`. В `main` не пушить.
Думать и отвечать по-русски; код, комментарии и коммиты — по-английски.

## Читать перед стартом
- `docs/redesign/dev-plan.md` §1 и WP9; `docs/redesign/screens.md` «Что убрать из текущего кода»;
  `docs/redesign/coverage.md` (строки «убрано» с причинами).
- CLAUDE.md: сборка Android (`node scripts/deploy-android.mjs` — только собрать, без загрузки), версии.

## Сделать
1. Удалить мёртвый код: старые страницы и компоненты из списка в screens.md, `components/ui/` (если не используется),
   роуты `/matches /skills /needs`, `RetiredFeaturePage`, `VideoGuide` и видеофайлы, демо-режим (`demo-token`,
   `lib/demoData.ts`), UI кода привязки, временные маппинги старых цветовых рамп в `tailwind.config.js`.
2. Проверить прод-данные (через Railway MCP или по логам): трафик на `/arvut`, заполненность контактов VK/TikTok;
   убрать, если пусто.
3. `pnpm typecheck`, `pnpm build`, сборка Android AAB без загрузки; открыть веб в Telegram Mini App и в Capacitor-обёртке
   (локальная сборка на staging-URL, если staging уже есть).
4. Обновить `README.md` в корне и `docs/redesign/README.md` под итоговое состояние.

## Готово, когда
- [ ] В `apps/web/src` нет ссылок на удалённые компоненты; размер чанков web записан в PR до и после.
- [ ] Сборка Android проходит; в Telegram Mini App таб-бар, BackButton и тема работают.
- [ ] README актуален.
