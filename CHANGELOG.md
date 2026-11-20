# Changelog

All notable changes to Social Organizer are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- The landing's starlings fly into the opening screen soon after it loads instead of popping in once the visitor scrolls; opened at a later section or with reduced motion, the scene fades in.

## [1.0.0] - 2026-11-20

First public release of the code.

### Added

- A local demo with fictional accounts, a local e-mail outbox, and a quick start for new contributors.
- CI for builds, types, lint, translation keys and Need protocol tests.
- A landing page walkthrough using the app's own screens and Circle graph, with a job-loss example.
- Sharing options for people who have reported Participation in an open Need.
- Public contribution, community conduct, vulnerability reporting and release documentation.
- A page for groups that join together (`/groups`) and a press page (`/press`).
- A cookieless landing counter: campaign tags and the referring site per day, with no personal data.

### Changed

- Invite links are shorter. Newcomers who arrive through a Need link, invite, or Telegram keep their destination through sign-in and onboarding.
- The Circle and related screens show one network figure with reach up to the sixth handshake. The graph is easier to read in the light theme and labels overlap less.
- The app uses consistent wording for Needs and intentions. Empty screens offer a next step.
- Updated brand marks, site icons and crawler files, improved contrast and right-to-left layout, and aligned the native startup and Telegram Mini App colours.
- Deployment settings are configurable for forks. The code is available under AGPL-3.0-or-later.
- The landing picks its language from the link and the server sends localized titles, descriptions and language alternates. The footer links to How it works, groups, privacy, terms, account deletion and press, and the landing says what data is kept.
- Money amounts are written as "300 $" and the number never breaks away from its sign.

### Fixed

- Failed actions give feedback, loading screens show progress, and unknown routes offer a way back. Unknown addresses return HTTP 404.
- Account writes stay tied to the person who started them, proxy errors preserve sign-in, and dismissing a Need counts once.
- The FAQ falls back to English if the requested language has no entries.

### Removed

- Unused workspace stubs, historical one-off scripts, and private material from the public repository.

[Unreleased]: https://github.com/element1965/Social-organizer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/element1965/Social-organizer/releases/tag/v1.0.0
