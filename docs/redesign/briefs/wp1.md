# WP1 — Каркас, токены, компоненты `ui2`, AppShell

Ветка `redesign-wp1-shell` от `redesign`. Сдача — локальный мердж в `redesign` после ревью (ветка в GitHub не пушится). В `main` не пушить (автодеплой прода).
Думать и отвечать по-русски; код, комментарии и коммиты — по-английски.

## Читать перед стартом
- `docs/redesign/dev-plan.md` §1 (правила) и WP1.
- `docs/redesign/design-system.md` целиком; живой стайлгайд `docs/redesign/mockups/v2/design-system.html`
  (кнопка темы в шапке), токены `docs/redesign/mockups/v2/tokens.css` — канон.
- `docs/redesign/screens.md`: «Общие правила», «Навигация», §16 (десктоп и планшет).
- Макеты: `mockups/v2/desktop.html` (сайдбар, рейл, диалог, колонка 680), любой экран из `mockups/v2/*.html`
  для таб-бара и шапки пуш-экрана (`shared.css`, `shared.js`: `tabs()`, `nav()`, `row()`, `meter()`).
- Как смотреть макеты: `npx -y http-server docs/redesign/mockups -p 8787`, затем `http://localhost:8787/v2/`.

## Владение файлами
`apps/web/src/App.tsx`, `components/Layout.tsx` (→ `AppShell`), `components/ui2/*`, `styles/tokens.css`,
`styles/typography.css` (новый), `index.css`, `tailwind.config.js`, `packages/i18n/locales/ru.json` и `en.json`
(секции `nav`, `common`). Остальные файлы не трогать.

## Сделать
1. Токены: переписать `apps/web/src/styles/tokens.css` по `mockups/v2/tokens.css` (слой `--so-*`, светлая на `:root`,
   тёмная на `html.dark`), в `tailwind.config.js` — радиусы `r-xs…r-2xl`, высоты контролов, шкала шрифтов из
   design-system.md §2. Линт-правило: запрет hex-цветов и `dark:` в `apps/web/src`.
2. Шрифт Manrope self-hosted в `public/fonts`, `font-display: swap`.
3. Тема Авто / Светлая / Тёмная: класс `html.dark`, ключ в `localStorage`, по умолчанию `prefers-color-scheme`;
   в Telegram Mini App брать только `colorScheme`, инъекцию цветов Telegram убрать.
4. `AppShell` с тремя режимами по `matchMedia`: таб-бар до 768 (Круг, Просьба с красным знаком-рукой, Добавить,
   Профиль; активный `care`), рейл 76 px на 768–1023, сайдбар 240 px от 1024 (Круг с бейджем новых событий, Люди,
   Просьба, Профиль; кнопка «Добавить человека»; внизу Помощь, тема, строка пользователя). В Telegram Mini App и
   Capacitor всегда таб-бар. Safe-area, высота панели, `BackButton` Telegram, скрытие таб-бара на пуш-экранах.
   Приглушённое состояние таба «Просьба» с кольцом прогресса по двум пропсам (доля круга, доля сети).
5. Компоненты `ui2`: `Screen` (шапка «‹ Назад», заголовок, действие справа; проп `width="column"` → 680 px по
   центру от 1024), `MainBar` для десктопа, `Card`, `Group` + `Row` (tail, шеврон, тумблер), `Button` (primary
   `care`, secondary, text, danger; состояния hover/active/disabled/loading), `Input` (text, money 52 px, search,
   код из 6 ячеек), `Segmented`, `Chip`, `Pill`, `Avatar`, `Meter` («Собрано / Цель», с «Вы» когда участвую),
   `PathFigure`, `EventRow`, `Banner`, `Sheet` (скрим, фокус-ловушка, Escape; от 1024 рендерится как `Dialog` 440 px),
   `Switch`. Размеры, радиусы и состояния — по design-system.md §3–4.
6. Маршруты из screens.md «Навигация» и редиректы со старых; страницы-заглушки для WP2–WP7 и WP10, чтобы ветки
   собирались.
7. Страница `/dev/ui` (только dev-сборка) со всеми компонентами во всех состояниях в обеих темах.

## Готово, когда
- [x] `/dev/ui` показывает все компоненты из design-system.md §4 в светлой и тёмной теме.
- [x] На 390 — таб-бар, на 834 — рейл, на 1280 — сайдбар; контент вторичных экранов в колонке 680.
- [x] Старые маршруты редиректят; `pnpm typecheck` и `pnpm build` чисты.
- [x] Нет hex-цветов и `dark:` в новых файлах; линт это ловит.
- [x] `/dev/ui` и оболочка на 375 / 834 / 1280 проверены координатором в браузере (2026-11-09).
- [x] Список удалённого или помеченного `@deprecated` кода — в отчёте исполнителя и в трекере.
