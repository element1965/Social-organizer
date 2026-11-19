# Local development

Start with the [quick start](../README.md#quick-start). The example starts the web app on port 3060 and the API on 3061.

Try `big@test.local` for a larger Circle or `new@test.local` for onboarding.

If you already run local PostgreSQL 17, you can skip Docker. Create a new,
empty development database and point both `DATABASE_URL` entries at it.
The example leaves Redis and the external integrations disabled.

Stop the dev servers with Ctrl+C and the containers with `docker compose down`.
Compose keeps the database on its named volume. With the dev servers stopped,
rerun `pnpm db:setup` to sync the schema. It skips the demo seed if any users already exist.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm dev` | Start dev servers |
| `pnpm typecheck` | Type check |
| `pnpm lint` | Check JavaScript, TypeScript and React Hooks |
| `pnpm i18n:check` | Check translation keys |
| `pnpm test` | Run the Need protocol suite against disposable PostgreSQL |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:generate` | Generate Prisma Client |
| `pnpm db:studio` | Open Prisma Studio |

Set `DATABASE_URL` explicitly when you run the tests: otherwise Prisma picks up
`packages/db/.env` (your dev database) and the suite's guard refuses to run. For
the quick-start container or another local server, export `DATABASE_URL` with a database name containing `test`
and a role with `CREATEDB`. The name in the URL need not exist. The suite
creates a uniquely named database, applies the schema with `prisma db push`
and drops its database during teardown. A fresh install needs
`pnpm db:generate` before running the suite.

## Environment Variables

Each service documents its configuration and local defaults in its example file.

- [API configuration](../apps/api/.env.example) for Fastify and its optional integrations.
- [Web configuration](../apps/web/.env.example) for Vite, public links, and OAuth redirects.
- [Database configuration](../packages/db/.env.example) for Prisma and the demo seed.

For a fork, set the public origins and OAuth client IDs in both apps as
applicable. `VITE_*` settings are public and are embedded when Vite
builds the web bundle. Configure `MAIL_FROM` and `VAPID_SUBJECT` when you
enable mail and Web Push.

Native builds use the same public settings when exported into the
environment before `cap sync` and Android build. In Xcode, set
`PRODUCT_BUNDLE_IDENTIFIER`, the signing team and profile, and the
`SO_APP_LINK_HOST`, `SO_APP_LINK_HOST_ALT`, and `SO_NATIVE_AUTH_SCHEME`
build settings for your target. Register the corresponding domains, app
IDs, and redirect URLs with your identity providers. For Android push,
supply Firebase registration files for your app IDs.

### Maintainer scripts

The scripts below use shell environment variables. They are optional for
the quick start. Scripts meant to connect to a database also require
`DATABASE_URL` for their intended target.

| Variable | Purpose |
|----------|---------|
| `JAVA_HOME` | Optional JDK location for Android build and release scripts. |
| `JAVA_TOOL_OPTIONS` | Optional JVM options inherited by the Android staging build. |
| `ANDROID_HOME`, `ANDROID_SDK_ROOT` | Optional SDK paths for the Android staging build. |
| `HOME`, `LOCALAPPDATA` | OS-provided paths used to find the SDK when neither Android SDK variable is set. |
| `GOOGLE_PLAY_SERVICE_ACCOUNT` | Optional service-account JSON for Play Store uploads. |
| `SEED_LANG` | Optional video demo seed language (default `ru`). |
| `WEB` | Optional web URL for video capture (default `http://localhost:3000`). |
| `FFMPEG` | Optional FFmpeg executable path for video capture. |
| `FFMPEG_THREADS` | Optional FFmpeg encoding thread count for the first-steps capture. |
| `CHROMIUM_PATH` | Optional Chromium executable path for video capture. |
| `PLAYWRIGHT_PATH` | Optional Playwright module path for video capture. |
| `SHOTS` | Optional debug screenshot directory for video capture. |
| `STEPS_DIR` | Optional output directory for step-by-step illustrations. Required by `add-why.mjs`. |
| `SKIP_SEED` | Set to `1` to capture the regular-Need video without reseeding. |

For Windows tooling and local phone testing, see the [redesign workspace notes](redesign/README.md#local-development-on-windows).
