export const SCREEN_GUIDE = `
APP SCREENS GUIDE:

LANDING PAGE (/ or /welcome)
Public entry point with 3D globe visualization. Sections: hero with CTA, pain-point quotes, "What is it" (3 cards: Handshake, Intention, Transparency), "How it works" (3 steps), Principles (Equality, Self-organization, Openness, 27 Languages), FAQ accordion, Download section with Telegram button. Language switcher in the top-right corner.

LOGIN PAGE (/login)
Sign in via Telegram (auto-login in Mini App), Google, or email/password. Toggle between login and registration modes. Authenticated Telegram users are redirected automatically.

ONBOARDING (/onboarding)
5-step tutorial for new users:
1. "You have people who care" — concept introduction
2. "One signal — and the right people know" — how signals work
3. "Everything is transparent" — transparency principle
4. "Add your first person" — invite a connection
5. "Monthly Support Budget" — optional budget input with currency selection and USD conversion
Can be skipped at step 5. Once completed, won't show again.

DASHBOARD (/dashboard)
Main screen after login. Sections:
- Profile header: avatar + name (tap → settings), invite button (opens invite popup)
- Emergency alerts banner (if any active emergency collections)
- "Add first connection" prompt (if network is empty)
- Total network card: big number + sparkline growth chart + day counter since registration
- Capabilities grid: "Network Capabilities" (total budgets of network) + "My Capabilities" (personal budget, editable inline)
- Budget depleted warning (if budget is zero)
- Help statistics: help given by period (with bar chart) + dual semi-donut (given vs received)
- "Invite someone you trust" CTA button
- Invite popup: QR code, editable personal invite code (slug), two links — website link and Telegram bot link with descriptions

NOTIFICATIONS (/notifications)
Scrollable list of notifications with:
- Creator avatar, name, connection count, remaining budget
- Handshake chain path (who linked you to this person)
- Time remaining badge (notifications expire)
- Status badges: NEW, REMINDER, CLOSED, BLOCKED, HELP, CYCLE CLOSED, AUTHOR, DEVELOPER
- "Dismiss all" button in header
- Infinite scroll pagination

CREATE COLLECTION (/create)
Form to send a help signal:
- Type toggle: Emergency / Regular
- Amount input + currency dropdown + real-time USD conversion
- Large amount warning (>$10,000) with confirmation checkbox
- Chat link input (validated URL)
- Network reach preview (1:1 ratio: amount = people notified)
- Submit button
Below the form: list of your active collections (with progress bars) and your intentions to others

COLLECTION PAGE (/collection/:id)
Detailed view of a collection:
- Creator info: avatar, name, connection count, status/type badges
- Connection path card (chain of handshakes to creator)
- Progress card: current / goal amount with progress bar and percentage
- Chat link button (if you're a participant or owner)
- Obligation form: amount + currency + USD preview + submit (if not yet participating)
- Close collection button (if owner)
- Participants list with individual amounts

NETWORK (/network)
Two view modes toggled by button:
- 3D view: interactive force-directed graph, click nodes → profile, dark/light mode
- List view: depth-by-depth breakdown (1st handshake, 2nd, etc.), collapsible sections, user cards with avatar, name, connection count, remaining budget
- Invite popup (same as Dashboard): QR code, editable slug, web + bot links

PROFILE (/profile/:userId)
- Large avatar, name (with editable nickname for your connections)
- Bio, phone, registration date
- Contacts card: social links (Telegram, WhatsApp, Instagram, etc.)
- Connection path card (how you're connected)
- Current capability: remaining budget
- Statistics: connections, collections created, times helped, total pledged (with currency breakdown)

SETTINGS (/settings)
- Profile card: avatar upload, editable name, email display
- Contacts: editable social links (Telegram auto-filled, not editable)
- Language selector (27 languages) + assistant voice gender
- Theme toggle: Light / Dark / System
- Sound + Push notifications toggles (one row)
- Font size: Standard / Enlarged
- Link account: generate 6-digit code to link Telegram + other platforms
- Logout button
- Delete account with confirmation

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
AI-powered help chat. Answers questions about the app using FAQ from the database. Detects user feedback/suggestions and forwards them to the team via Telegram.
`;
