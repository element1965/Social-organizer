# Social Organizer — готовность к выпуску

Дата: 10 ноября 2026. Ветка `redesign`. Основание: «Social Organizer — контекст для агента-разработчика».

## 1. Что изменено

Продукт описывает функцию координации, а не денежную операцию. Во всех 28 языках, у помощника, в боте, в push-уведомлениях, метатегах и правовых текстах действует один словарь.

| Было | Стало (RU) | EN |
|---|---|---|
| Просьба, Сбор | Потребность | Need |
| Открыть сбор | Сообщить о потребности | Report a Need |
| Участвовать | Сообщить об участии | Report Participation |
| Собрано X из Y | Заявлено X из Y | X of Y reported |
| Цель | Нужно | Needed |
| Цель собрана | Нужная сумма заявлена | Amount needed is reported |
| Выйти из сбора | Отозвать участие | Withdraw Participation |
| Чат сбора | Чат участников | Participants' chat |
| Отметить переводы | Отметить полученное | Mark as received |
| Ваш взнос | Ваше участие | Your Participation |
| Разовая помощь | Один раз | One time |

Зачем нужна сеть: она заранее делает риски каждого переносимыми — риск одного распределяется между многими людьми, которые знают друг друга. Публично это **распределение рисков** (risk sharing), а не «пул» (pooling): у нас нет общего котла, оператора и обещанных выплат, а слово pool в английском — термин страхования, за который в 2021 году закрыли китайские платформы взаимопомощи. «Peer-to-peer mutual risk pooling» — только внутреннее рабочее понятие (стратегия, разговоры с партнёрами). На вопрос «Это страховка?» лендинг отвечает «Нет» (FAQ q8).

В остальных 26 языках сигналы названы словом своего языка (Bedarf / Beteiligung, besoin / participation, ニーズ / 参加 и т. д.). Термины Need и Participation даны один раз в скобках: на лендинге, в «Как это работает», в FAQ и в условиях.

Лендинг: заголовок, подзаголовок и призыв из документа; четыре шага; блок «Принципы» вместо хуэй; «Чего Social Organizer не делает»; краткий FAQ из восьми вопросов (четыре из документа, «Передают ли участники деньги?», «В чём указаны суммы?», сравнение с онлайн-платформами взаимопомощи и «Это страховка?»). Тексты лендинга написаны простым языком: действует человек, без пассива и длинных тире. Тезис «не держит деньги» ушёл с первого экрана в FAQ и в блок «Чего не делает».

«Как это работает»: страница начинается с двух сигналов. Хуэй стоит последним, как исторический пример, с оговоркой, что это не устройство Social Organizer. Раздел «Поручительство» назван «Путь из знакомых». Пример 6 → 36 → 216 подписан как упрощённый: круги пересекаются, участвовать никто не обязан.

Функции, статусы и поля не менялись. Суммы, прогресс и отметки о получении остались и названы прямо.

## 2. Как сигналы устроены в коде сейчас

Это описание фактического поведения, а не спецификация.

**Need** (запись `Collection`)
- Поля: сумма в целых $ (минимум 10), периодичность (один раз / каждые 28 дней), ссылка на чат в любом мессенджере (обязательна, https).
- Статусы: `ACTIVE` открыта; `BLOCKED` без причины — заявленное участие достигло суммы, новые участники не добавляются; `BLOCKED` с причиной — приостановлена администратором или решением круга; `CLOSED` закрыта автором; `CANCELLED` отменена.
- Условие доступа: не меньше 5 прямых связей и 10 человек в сети. У одного человека одна открытая потребность каждого вида.
- Публичная страница `/sos/:id`: имя, сумма и заявленное участие видны всем.

**Participation** (запись `Obligation`)
- Поля: сумма в целых $ (минимум 1), подставляется «минимальное участие».
- Участник может изменить сумму или отозвать участие, пока потребность открыта.
- В потребности «каждые 28 дней» участник подтверждает сумму в каждом цикле; напоминание за 3 дня.
- Автор может поставить отметку «получено» у участника и снять её. Отметку ставит и видит только автор, сервис её не проверяет.
- После закрытия потребности участие попадает в два счётчика профиля: «сообщений об участии» и «отмечено авторами как полученное».
- Потребность на N $ уведомляет до N человек, волнами, от ближних к дальним.

## 3. Решения автора (10 ноября 2026)

| Вопрос | Решение | Что сделано |
|---|---|---|
| Отметки «получено» | Личная запись автора потребности | Саму отметку видит только автор: сервер больше не отдаёт её другим участникам |
| След исполнения участия | Два факта рядом в профиле, без метки и оценки | В профиле человека: «Сообщений об участии: N» и «Отмечено авторами как полученное: M». Считаются только закрытые потребности, отозванное участие не считается. Эти числа видят люди сети; в своей истории человек видит их же |
| Число на главном экране | «Заявленное участие сети» (12 ноября 2026; до этого «Минимальное участие сети») | Переименовано на 28 языках, в помощнике и README. Личная сумма называется «Моё намерение», строка профиля «Потребности и участие» стала «Активностью» |
| Сцена на лендинге | Без чисел на кружках | К автору идут точки без сумм |
| Единица «$» | Доллары США как общая единица счёта | Добавлено в условия (раздел 6) и в FAQ лендинга; валюту и способ участники выбирают сами |
| Остановка по сумме | Оставить | Часть протокола Need: когда заявленное участие достигает нужной суммы, новые сообщения об участии не принимаются |
| Сумма = число уведомлённых | Оставить и описать | Часть протокола Need: потребность на N $ уведомляет до N человек, волнами, от ближних к дальним |
| Хуэй | Оставить в «Как это работает» | Последний блок, исторический пример с оговоркой |

Статуса «исполнено» у участия нет. Момент исполнения в продукте — это отметка автора; она не меняет сам сигнал.

| Вехи | Запись того, что реально изменилось | Четыре вехи: первое рукопожатие, можно сообщить о потребности (5 прямых связей и 10 человек в сети), первая потребность, первое участие. «10 человек в круге» убрана: она ничего не открывала. Достигнутую веху видит только сам человек, один раз, в ленте Круга. Строку «Этапы» в профиле автор убрал 12 ноября 2026. Вех за суммы и за число людей нет |

### Остаётся открытым

1. **Неденежные потребности.** Потребность выражается только суммой в $. Вводить другое содержание сигнала — отдельная задача после выпуска.
2. **Правовые тексты.** Условия и политика переписаны и датированы 10 ноября 2026. Нужна проверка юристом по странам выпуска, включая требования сторов к приложениям, где упоминаются деньги, и публичный показ двух чисел в профиле.
3. **Возрастной порог.** В условиях стоит 16 лет. Подтвердить для стран выпуска.
4. **Оспаривание отметки.** Автор может не поставить отметку по ошибке. Сейчас участник может только написать автору. Нужна ли процедура — решить по первым обращениям.

## 4. Перед выпуском в продакшен

Сделано в `redesign`:
- [x] Тексты интерфейса, лендинга и «Как это работает» на 28 языках
- [x] Помощник: FAQ, глоссарий, описание экранов, запрет обещаний и слов «сбор», «взнос», «пожертвование»
- [x] Тексты бота и push-уведомлений
- [x] Метатеги и OG-описание
- [x] Условия использования и политика конфиденциальности
- [x] README

Осталось сделать руками:
- [ ] **FAQ в базе продакшена** (`FaqItem`). Вопросы ведёт администратор, они хранятся в базе и в старых формулировках. Переписать через экран FAQ и нажать «Перевести на все языки».
- [ ] **Авторассылка и отложенные посты** (`AutoChainMessage`, `ScheduledPost`). Тексты в базе, проверить на слова «сбор», «взнос», «помощь гарантирована».
- [ ] **OG-картинка** `apps/web/public/og-image.png`: если на ней есть старый слоган, перерисовать.
- [ ] **Скриншоты и описания в сторах** (раздел 5). Новые скриншоты и feature graphic (EN и RU) лежат в `play-store-assets/<locale>/` и `apps/web/ios/App/fastlane/screenshots/<locale>/`, пересобираются командой `node scripts/capture-store-shots.mjs`. Осталось загрузить их и тексты в Google Play и App Store Connect.
- [ ] **Проверка носителями языка.** Перевод 26 языков машинный, прошёл автоматическую проверку плейсхолдеров и тегов. Приоритет: en, uk, de, es, he, ar.
- [ ] Миграции продакшена из README (раздел Redesign) применить до слияния, включая `20261110120000_milestones_by_meaning`: без неё лента Круга на продакшене не загрузит вехи.
- [ ] Слить `main` в `redesign`, проверить staging, затем слить `redesign` в `main`. Слияние в `main` выкатывает продакшен и обновляет приложения в сторах без пересборки.
- [ ] Юридическая проверка условий и политики (раздел 3, «Остаётся открытым»).

## 5. Тексты для сторов

**Короткое описание (RU, до 80 знаков)**
Сообщайте о потребностях и об участии. Решения и действия — между людьми.

**Short description (EN, up to 80 characters)**
Report Needs and Participation. Decisions and actions stay between people.

**Полное описание (RU)**
Social Organizer — инструмент координации для людей, которые знают друг друга.

В нём есть два сигнала. Потребность — сообщение участника о том, что ему нужно. Участие — сообщение другого участника о собственном добровольном участии.

Как это работает:
1. Участник сообщает о потребности.
2. Другие участники получают информацию и самостоятельно решают, могут ли содействовать.
3. Желающие сообщают об участии.
4. Конкретные действия участники согласуют и выполняют непосредственно друг с другом, вне Social Organizer.

Принципы: добровольное участие, независимое решение, прямая связь участников, минимальная координация без централизованного распределения.

Social Organizer не принимает, не переводит и не удерживает средства и не гарантирует результат: он зависит от решений и действий участников. Открытый код, некоммерческий проект.

**Full description (EN)**
Social Organizer is a coordination tool for people who know each other.

It has two signals. A Need is a participant's message about what they need. A Participation is another participant's message about their own voluntary participation.

How it works:
1. A participant reports a Need.
2. Other participants learn of it and decide for themselves whether they can assist.
3. Those who wish report Participation.
4. Participants agree and carry out the actual steps directly with each other, outside Social Organizer.

Principles: voluntary participation, independent decision, direct connection between participants, minimal coordination with no centralised distribution.

Social Organizer does not accept, transfer or hold funds and does not guarantee an outcome: it depends on the decisions and actions of participants. Open source, a non-profit project.

## 6. Scale steps

The steps follow the size of the network, not a date. Each starts at a network size or at the first
sign in the `[metrics]` log line, whichever comes first. The line is written once a minute by
`apps/api/src/services/runtime-metrics.service.ts` (see "Runtime metrics" in the root README): event
loop delay (p50, p95, max), requests, memory, the graph (people, connections, full reloads and the
time of the last one, re-reads, appends, light checks, the exact signature time) and the timed network
walks. `reach max` is the longest timed reach calculation in that one-minute window: a full walk up to
the 6th handshake, or a recalculation of the near rings 1–3 that reuses the far rings. Answers served
from the per-person cache are not timed. The `wave` figures time choosing who a Need notifies.

Thresholds the `[metrics]` lines are watched for:

- event loop delay p95 below 100 ms;
- `reach max` below 50 ms;
- a full graph reload shorter than 1 s and no more often than once an hour.

### Scale 1. Up to 10 thousand people

Starts now, together with release stages 1–2. Point fixes, without changing how the graph is stored.
All items were done on 13 Nov 2026.

- **Production measurements.** The `[metrics]` line once a minute and a separate `[graph] full reload`
  line on every full reload of the graph. Watch after each deploy: event loop p95, `reach max`, reloads.
- **Removing a connection or an account without re-reading the whole connections table.** Only the
  rows of the people named in `invalidateGraph` are re-read. On 100 thousand people a removal costs
  48 ms instead of a full load (6 s and 288 MB).
- **Auto-chain without reading all connections.** Whether a person has a connection comes from the
  graph in memory (`auto-chain.worker.ts`). The auto-chain still reads its other tables in full
  (Telegram accounts, deliveries); that is left for Scale 2.
- **Graph signature without `COUNT(*)` every 5 seconds**, without triggers. Every 5 seconds a light
  check by index (0 ms on 100 thousand people); the exact count runs only after a change and once a
  minute (47–60 ms instead of 150–195 ms). Migration `20261113160000_graph_signature_indexes`; the
  code works without it, only slower. A connection removed by another process is seen within a minute.
- **Wave selection rules in chunks inside a ring.** A ring is read in chunks of 500 people
  (`HOLD_CHUNK`) and only while the amount is not yet covered; the result is the same as reading the
  whole ring (checked with chunks of 1 and of 2).
- **Admin statistics and clusters from the graph in memory, page by page.** Only the 200 people of a
  page or of a search are read from the database; up to 200 clusters are shown. The unused
  `cluster.myCluster` was removed. On 100 thousand people the cluster calculation takes about a
  second and holds the process for that time; the page is for admins only.
- **Query plans checked on a database of 100 thousand people.** `apps/api/scripts/seed-scale.ts` and
  `apps/api/scripts/check-scale.ts` on the local database `so_scale_check`. The feed, the unread
  counter, pending requests and a person's connections use indexes (0.1–1 ms). Only parts of the
  graph signature were read in full, and indexes closed that. A load test with many people at once
  is still open (release stage 1).

### Scale 2. Up to 100 thousand people

Starts at 10–20 thousand people, or when the walk for a person's first request takes longer than
50 ms (`reach max` above 50 ms).

- **The graph in typed arrays** (done 13 Nov 2026, `graph-store.ts`). On 100 thousand people: graph
  memory 288 MB → about 20 MB of arrays, the load from the database 6 s → 2.3 s, a person's first
  reach request 390–750 ms → 10–15 ms. Check without a database: `apps/api/scripts/check-graph-store.ts`.
- **Walks outside the request thread**: postponed by measurement. With typed arrays a walk takes
  10–15 ms on 100 thousand people, below the 50 ms threshold. Come back to it when the production
  `[metrics]` line shows `reach max` above 50 ms, or before a million people, whichever comes first.
- **Far rings counted less often than near ones** (done 13 Nov 2026). After a minute only rings 1–3
  are walked again; the far rings, which are shown rounded, are reused for up to an hour (only in
  networks whose far part is 500 people or more). A person's own new connection is still seen at once
  and in full.
- **What to show when six handshakes cover almost the whole network.** No separate work needed: the
  network figure counts everyone a request reaches up to the 6th handshake and is rounded beyond the
  3rd ring, so the far part is never shown as an exact number (root README, "Network figures").
- **Intentions in an array next to the graph** (done 13 Nov 2026). What people can give is kept in
  memory by person number; the rows that changed are read once a minute and everything every
  30 minutes. A new acquaintance's intention and a person's own changed intention count at once.
- **One light "what changed" request instead of several timers** (done 13 Nov 2026).
  `notification.pulse` every 20 seconds (`apps/web/src/hooks/usePulse.ts`) replaces ten timers: one
  open Circle makes 3 requests a minute instead of 16–18. The lists are re-read every 5 minutes in
  any case. Server-sent events are postponed: later, by measurement.
- **Lists of the 2nd and 3rd ring page by page, search on the server** (done 13 Nov 2026).
  `connection.ringPeople`, 50 people per page with "Show more", sorting and search on the server (by
  the person's name and by the name of the acquaintance on the path). A person without connections who
  has only sent a request sees the numbers of that network but nobody in it.
- **Telegram queue: Need waves before mailings** (done 13 Nov 2026). Messages are queued in jobs of
  250 (`TG_JOB_SIZE`) with a priority (`TG_PRIORITY`). A Need's wave waits only for the current chunk
  of a mailing, about 10 seconds, not for the whole mailing. The split and the priorities are checked;
  the queue itself cannot be checked locally (no Redis there).
- **Abuse signals to the support chat.** Decided 13 Nov 2026: not now. They would be regular messages
  to the team chat, and at the current size of the network there is nothing to catch. Come back when
  the network reaches 10 thousand people or the first cases appear.

### Scale 3. Up to a million people

Starts at 100 thousand people, or when event loop delay p95 is above 100 ms.

- **Shared state for several API copies.** One process now keeps in memory: shake pairs
  (`shake.service.ts`), request and assistant rate limits, the timers of reply digests. Move them to
  Redis or PostgreSQL; this goes together with the decision on the Redis cost.
- **A second and third API copy behind a load balancer.** Each copy keeps its own graph (57 MB in
  arrays at a million people); changes made by another copy are seen within 5 seconds. Check shaking
  and sign-in by code across copies.
- **A database connection pool.** PgBouncer or a Prisma pool limit per copy, so that the copies do not
  use up PostgreSQL connections.
- **Notification tables: a retention period or time partitions.** `notifications` and
  `notification_deliveries` grow by the amount of every Need; at a million people that is millions of
  rows a month.
- **Decide what happens to mailings to the whole network.** A million messages at 25 a second take
  11 hours. Options: paid Telegram broadcasts, push only, mailing to parts of the network.
- **A load test on a million synthetic people**: API copies, the database, the Telegram queue. Run it
  before the network reaches 300 thousand people.

### Measurements

A synthetic network, about 13 connections per person, one process, no database (13 Nov 2026), with
the same structures as `graph-cache.service.ts` and `network.service.ts`:

| What | 100 thousand people | 1 million people |
|---|---|---|
| Graph in memory as objects | 163 MB | 1,626 MB |
| Building the graph from ready rows | 0.3 s | 4.3 s |
| Walk to the 6th handshake, objects | 110–180 ms | 0.6–1.2 s |
| People within 6 handshakes | almost all | about 590 thousand |
| Graph in typed arrays | 6 MB | 57 MB |
| Walk in typed arrays | 5–11 ms | 25–62 ms |
| Finding the 300 nearest for a wave (by rings) | 0.14 ms | 0.19 ms |

On a real database (local PostgreSQL, 100 thousand people, 643 thousand connections, 600 thousand
notifications; `apps/api/scripts/seed-scale.ts`, `apps/api/scripts/check-scale.ts`):

| What | After Scale 1 | After Scale 2 |
|---|---|---|
| Graph memory | 288 MB of objects | about 20 MB of arrays |
| Full load of the graph from the database (at start-up only) | 6 s | 2.3 s |
| Reach up to the 6th handshake, a person's first request | 390–750 ms | 10–15 ms |
| Clusters for admin statistics | 0.9–1.5 s | 0.1 s |
| A connection or an account removed | 48 ms | 50 ms |
| Choosing the recipients of a $300 Need | 70–150 ms | 50–125 ms |

A million people has not been measured on a real database; a linear estimate puts the walk at
100–150 ms, which is the Scale 3 question. The database can hold a million people; the limit is the
graph calculation inside one API process.
