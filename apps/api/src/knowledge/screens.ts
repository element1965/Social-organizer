export const SCREEN_GUIDE = `
APP SCREENS GUIDE:

LANDING PAGE (/ or /welcome)
Public entry point with 3D globe visualization. Sections: hero with CTA, pain-point quotes, "What is it" (3 cards: Handshake, Intention, Transparency), "How it works" (3 steps), Principles (Equality, Self-organization, Openness, 27 Languages), FAQ accordion, Download section with Telegram button. Language switcher in the top-right corner.

LOGIN PAGE (/login)
Sign in via Telegram (auto-login in Mini App), Google, or email/password. Toggle between login and registration modes. Authenticated Telegram users are redirected automatically.

ONBOARDING (/onboarding)
6-step tutorial for new users:
1. "You have people who care" — concept introduction
2. "One signal — and the right people know" — how signals work
3. "Everything is transparent" — transparency principle
4. "Add your first person" — invite a connection
5. "Your contacts" — fill in at least 2 of 5 social contacts (WhatsApp, Facebook, Instagram, Twitter, TikTok) to proceed
6. "Monthly Support Budget" — optional budget input with currency selection and USD conversion
Can be skipped at step 6. Progress dots at the bottom show current step (6 dots). Once completed, won't show again.

DASHBOARD (/dashboard)
Main screen after login. Four separate cards plus conditional elements:
- Header: profile button (avatar + name → settings), Telegram community chat button, help menu button
- "Add First Connection" gate card (only if network is empty, links to /network)
- Card 1 — Whole Network: large number of total reachable people, period chip (opens PeriodPicker overlay to select day range), green "+N new connections" counter for selected period, day count badge (days since registration). Blue-purple gradient.
- Card 2 — Network Capabilities: total network budgets in dollars, period chip (independent PeriodPicker), contributors count, "+$X" period delta in green. Green-emerald gradient.
- Card 3 — Invite Block: flip card — front shows QR code with expand hint, back shows web invite link (copy), Telegram bot link (copy), and editable referral slug (3–30 chars). Smooth-scroll anchor #invite.
- Card 4 — Your Contribution (My Budget): displays "$X remaining / $Y total monthly budget". Inline edit mode — tap pencil icon, enter new amount, confirm with checkmark or Enter, cancel with Escape. Blue-indigo gradient.
- Budget depleted warning: amber banner shown when remaining budget ≤ 0, links to settings.

NOTIFICATIONS (/notifications)
Scrollable notification center with three special sections at the top, then a paginated list:
- Emergency section (red border): filters active emergency collections from unread notifications. Shows first 3 items with creator avatar, name, connection count, budget, and amount. Click → collection page.
- Incoming pending connections (amber border): pending connection requests to you. Each shows avatar, name, accept (green) and reject (red) buttons. Instruction text "Meet in person". Refetch every 15s.
- Outgoing pending connections (gray border): your pending requests awaiting approval. Shows avatar, name, arrow icon. Refetch every 30s.
- Collection notifications list: infinite scroll (20 per page), "Load more" button. Each card shows type badge (NEW, RE_NOTIFY, CLOSED, BLOCKED, OBLIGATION_RECEIVED, CYCLE_CLOSED, AUTHOR, DEVELOPER), time remaining, creator info (avatar, name, connections, amount), handshake path ("via [names]"), unread highlight (blue tint). Dismiss button (X) per card, "Dismiss all" in header.

CREATE COLLECTION (/create)
Form to send a help signal, plus stats and lists below:
- Access gate: blocks users with fewer than minimum connections (shows count + invite button)
- Entry warning dialog shown before first use
- Type toggle: Emergency / Regular
- Amount input + currency dropdown + real-time USD conversion preview
- Large amount warning (>$10,000 USD) with confirmation checkbox
- Chat link input (validated URL)
- Network reach preview: "up to N people" (min of amount and total reachable)
- Submit → confirmation modal with checkbox
- Help Stats semi-donut: SVG 180° arc chart showing dollars given (green) vs received (blue) with total in center
- My Collections list: active collections with status badge (ACTIVE/INACTIVE), type badge (EMERGENCY/REGULAR), progress bar, amount/currency, obligation count. Click → collection page.
- My Intentions list: your obligations to others' collections, showing creator avatar/name, their connection count, budget, your pledge amount. Click → collection page.

COLLECTION PAGE (/collection/:id)
Detailed view of a collection:
- Creator info: avatar, name, connection count, status/type badges
- Connection path card (chain of handshakes to creator)
- Progress card: current / goal amount with progress bar and percentage
- Chat link button (if participant or owner)
- Obligation form: amount + currency + USD preview + submit (if not yet participating)
- Close collection button (if owner)
- Participants list with individual amounts

NETWORK (/network)
Three view modes controlled by top-right buttons:
- Clusters button (purple, Layers icon): toggles cluster overlay showing all network clusters except your own. Each cluster card displays root user name, member count, total budget. Uses Union-Find algorithm for cluster detection.
- 3D view (default): interactive force-directed graph (react-force-graph-3d). Nodes show avatars with LOD system (full avatar close, dot far). Center node (you) is blue with glow. Click nodes → profile. Dark/light mode support. Zoom/pan/rotate.
- List view (toggle via Globe/List icon): depth-by-depth breakdown:
  - Pending incoming connections section (amber): accept/reject buttons per request
  - Depth sections (1st handshake, 2nd, 3rd…): collapsible, colored circle with depth number, user count. Expanded shows avatar, name, connection count, remaining budget per user. Click → profile.
  - Empty state if no connections
- Invite popup (same as Dashboard flip card): QR code, editable slug, web + bot links

PROFILE (/profile/:userId)
- Avatar, name, editable nickname (for your connections — pencil icon, inline input)
- Bio, phone number
- Online status: green dot + "online" if last seen < 5 min, gray dot + relative time otherwise
- Registration date ("Member since…")
- Contacts card: social links (WhatsApp, Facebook, Instagram, Twitter, TikTok) with icons. Instagram on mobile copies to clipboard instead of linking.
- Connection path (HandshakePath component showing chain)
- Direct connection button: "Send Direct Request" for unconnected users, "Request Pending" if already sent, hidden when connected
- Current capability: remaining budget with wallet icon
- Direct connections list: expandable section of their 1st-degree connections (avatar, name, count, budget)
- Stats: connections, collections created, obligations given
- Revoke connection button (red, with confirmation, only for connected users)

SETTINGS (/settings)
- Profile card: avatar upload (auto-crop 200×200), editable name (inline, Enter to save), email display
- Contacts card: header has "Hide Contacts" toggle with tooltip. Fields for WhatsApp, Facebook, Instagram, Twitter, TikTok — auto-save on input (500ms debounce), validation, checkmark when saved. Telegram field read-only.
- Language & Voice: language selector (27 languages), assistant voice gender (Female / Male)
- Theme: Light / Dark / System (3-button group)
- Sound & Notifications: sound toggle + push notifications toggle (one row)
- Font size: Standard (1.0×) / Large (1.25×) (2-button group)
- Link Account: generate 6-digit code (monospace display) with expiration text. Used to link Telegram + other platform accounts.
- Logout button
- Delete account: two-step confirmation (button → confirm/cancel)

FAQ PAGE (/faq)
- Accordion list of questions and answers
- Admin-only: add/edit/delete items, localize to all languages via AI translation

INVITE PAGE (/invite/:token)
- Shows inviter's avatar and name
- Auto-accepts for authenticated users
- "Login to accept" for unauthenticated users
- Success state with "Go to Network" button

BOTTOM NAVIGATION (on all protected pages)
Fixed bar with 5 items: Home (Dashboard), Notifications (with unread badge), SOS button (red, creates collection), Network, Settings.

CHAT ASSISTANT (floating on all protected pages)
AI-powered help chat with expandable menu (FAQ, Chat, Broadcast for admins):
- Quick topic buttons when chat is empty (4 suggestions: handshake, intention, capabilities, how to start — language-aware)
- Voice input: Web Speech API, mic toggle with red pulse animation while listening, auto-sends transcribed text. Supports 15+ languages with auto-detection.
- Voice output / TTS: primary OpenAI TTS ("onyx" male / "nova" female), fallback to Web Speech API. Auto-speaks response if user sent via voice. Voice gender controlled in Settings. Speech rate 0.9.
- Answers questions about the app using FAQ from the database
- Detects user feedback/suggestions and forwards them to the team via Telegram
- Admin-only Broadcast Panel (3 tabs): Send (all users or direct by Telegram ID), Scheduled (datetime picker, status tracking, cancel pending), AutoChain (automated sequences with day offset, variant filter, delivery analytics)
`;
