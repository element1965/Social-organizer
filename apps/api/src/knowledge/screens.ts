export const SCREEN_GUIDE = `
APP SCREENS GUIDE:

LANDING PAGE (/welcome)
The public entry point. Features a 3D Earth globe with NASA textures, animated clouds, and network visualization. Introduces the project concept. Redirects to login.

LOGIN PAGE (/login)
Sign in via Telegram Mini App (auto-login via initData), Google, or email. Also has a "Demo login without registration" button for exploring the app with mock data.

ONBOARDING (/onboarding)
5-step interactive tutorial shown automatically to new users:
1. Welcome and concept explanation
2. How handshakes work
3. How support signals work
4. Setting monthly budget (optional)
5. Inviting first connection
Can be skipped. Once completed, the flag is saved and onboarding won't show again.

DASHBOARD (/)
The main screen with 3 tabs:
- Network: your connections count, current capabilities, network reach
- Statistics: help given/received, participation history
- Activity: active collections (yours and participated), recent notifications
Shows emergency alerts prominently at the top.

NOTIFICATIONS (/notifications)
List of all notifications with:
- Handshake chain path (how the notification reached you)
- 24-hour timer (notifications expire)
- Type indicators (new collection, obligation received, cycle closed, etc.)
- Quick actions (view collection, dismiss)
Supports cursor-based pagination.

CREATE COLLECTION (/create)
Form to create a support signal:
- Type selection (Emergency or Regular)
- Amount input in local currency with real-time USD conversion
- Network reach preview (how many people will be notified, based on 1:1 ratio)
- Chat link (e.g. Telegram group for communication)
Shows the user's current network size for context.

COLLECTION PAGE (/collection/:id)
Detailed view of a collection:
- Creator info with handshake path to you
- Progress bar (collected vs target amount)
- List of intentions/participants
- Chat link to contact the creator
- Actions: create intention, close (if owner), cancel (if owner)

NETWORK (/network)
Connection management:
- List of all direct connections with connection counts
- 3D force-directed graph visualization
- Invite link generation with QR code
- Search/filter connections

PROFILE (/profile/:userId)
User profile showing:
- Name, photo, connection count
- Handshake path to this user (if not direct connection)
- Statistics: collections created, intentions fulfilled
- Contact information (Telegram, social links)
- Action: add/remove connection

SETTINGS (/settings)
User preferences:
- Language selection (25 languages)
- Theme toggle (dark/light/system)
- Sound effects toggle
- Font scale adjustment
- Monthly budget setting
- Contact information management
- Ignore list management (block/unblock users)
- Account deletion
`;
