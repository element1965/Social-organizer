# Contributing to Social Organizer

Follow the [quick start](README.md#quick-start) to set up the pnpm workspace. See the [development notes](docs/development.md) for environment variables and local test setup.

## Checks

Run these from the repository root before opening a pull request:

```sh
pnpm db:generate
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm i18n:check
```

Set `DATABASE_URL` explicitly for the Need protocol tests. Use local PostgreSQL, a role with `CREATEDB`, and a database name containing `test`. The suite creates and drops its own temporary database. See the [test setup](docs/development.md#scripts).

Keep commits focused. Write short, imperative subjects in English, such as `fix(web): keep the invite link after sign-in`. Describe what changed and how you checked it in the pull request. Use fictional accounts and redact personal data, tokens, credentials, and environment values from issues, pull requests, screenshots, and logs. Report vulnerabilities privately using the [security policy](SECURITY.md).

## Translation

The app uses i18next. Edit the matching JSON file under [packages/i18n/locales](packages/i18n/locales/). English (`en.json`) defines the keys and fallback values. Preserve placeholders such as `{{name}}` and use the plural forms for the locale. Write natural copy in the target language and use the agreed [project vocabulary](docs/narrative/topics/principles/vocabulary.md). Run `pnpm i18n:check` and provide a screen or route and the locale when asking for review.

## Research

Read the [theory and sources](docs/narrative/INDEX.md). Contact the team about research questions, replication, or proposed studies through the [Telegram bot](https://t.me/socialorganizer_bot?start=team_research).

## Licence and conduct

Contributions to the code are released under [AGPL-3.0-or-later](LICENSE). Under section 13, if you modify the software and users interact with your version over a network, your version must prominently offer them its complete corresponding source code at no charge from a network server. See [licensing and asset notices](docs/licensing.md) for the project marks and third-party assets.

Follow the [Code of Conduct](CODE_OF_CONDUCT.md) when participating.
