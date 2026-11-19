# Changelog

All notable changes to Social Organizer are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- A local demo with fictional accounts, a local e-mail outbox, and a quick start for new contributors.
- CI for builds, types, lint, translation keys and Need protocol tests.
- A landing page walkthrough using the app's own screens and Circle graph, with a job-loss example.
- Sharing options for people who have reported Participation in an open Need.
- Public contribution, community conduct, vulnerability reporting and release documentation.

### Changed

- Invite links are shorter. Newcomers who arrive through a Need link, invite, or Telegram keep their destination through sign-in and onboarding.
- The Circle and related screens show one network figure with reach up to the sixth handshake. The graph is easier to read in the light theme and labels overlap less.
- The app uses consistent wording for Needs and intentions. Empty screens offer a next step.
- Updated brand marks, site icons and crawler files, improved contrast and right-to-left layout, and aligned the native startup and Telegram Mini App colours.
- Deployment settings are configurable for forks. The code is available under AGPL-3.0-or-later.

### Fixed

- Failed actions give feedback, loading screens show progress, and unknown routes offer a way back.
- Account writes stay tied to the person who started them, proxy errors preserve sign-in, and dismissing a Need counts once.
- The FAQ falls back to English if the requested language has no entries.

### Removed

- Unused workspace stubs, historical one-off scripts, and private material from the public repository.

<!-- Add the v1.0.0 entry at release time. -->
