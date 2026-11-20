# Social Organizer

Social Organizer is an open-source tool for risk sharing in a network of people who know each other, where a Need notifies up to one person per dollar requested, nearest by handshakes first, and any money moves directly between people outside the app.

It is the open-source utility of **EXODUS 2.0**, a digital societal innovation: direct peer-to-peer coordination of people who are already connected, without a central authority.

<img src="apps/web/public/landing/app/circle-graph-dark.webp" width="200" alt="The Circle screen showing a network of acquaintances by handshake distance">

## Try it

[Website](https://www.orginizer.com) · [Google Play](https://play.google.com/store/apps/details?id=com.socialorganizer.app) · [App Store](https://apps.apple.com/app/id6768132198) · [Telegram @socialorganizer_bot](https://t.me/socialorganizer_bot)

## Theory

- Andrei Lubalin, [*From Human Behaviour to Social Coordination*](https://zenodo.org/records/21629935), a report on the research programme behind Social Organizer (Zenodo, 2026). Also on the [P2P Foundation wiki](https://wiki.p2pfoundation.net/From_Human_Behaviour_to_Social_Coordination).
- Andrei Lubalin, [*Discovery of the Law of Autocatalytic Inevitability*](https://doi.org/10.5281/zenodo.15778286), a preprint on network self-organization (Zenodo, 2025).
- Questions about the theory: the [DSI EXODUS 2.0 assistant](https://chatgpt.com/g/g-MXYLLg8W3-dsi-exodus-2-0).

## Quick start

Run it locally in five minutes with Git, Node.js 22.18+, pnpm 10.4.1 and Docker with Compose.

```bash
git clone https://github.com/element1965/Social-organizer.git
cd Social-organizer
docker compose up -d --wait
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
pnpm install
pnpm db:setup
pnpm dev
```

Open [localhost:3060](http://localhost:3060), sign in with e-mail as `anna@test.local`, and read the six-digit code from `apps/api/so-dev-mail.log`. In PowerShell, use `Copy-Item` and, if script execution is disabled, `pnpm.cmd`. [More setup options](docs/development.md).

## How to help

[Work on the code or a translation](CONTRIBUTING.md) or [talk to the team about research](https://t.me/socialorganizer_bot?start=team_research).

Read the [project docs](docs/README.md). The code is licensed under [AGPL-3.0-or-later](LICENSE). [Report security issues privately](SECURITY.md).
