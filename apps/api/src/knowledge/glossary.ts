export const GLOSSARY = `
EXTENDED GLOSSARY:

HANDSHAKE
Mutual confirmation of a meaningful connection between two people. Both must confirm. This is the fundamental building block of the network.

DUNBAR'S NUMBER (150 LIMIT)
Each person can have a maximum of 150 connections (handshakes). Based on Robin Dunbar's research — the cognitive limit of stable social relationships a human brain can maintain.

HANDSHAKE CHAIN
Path of connections between users through mutual acquaintances. Example: you → friend → their friend = 2 handshakes apart. Based on six degrees of separation theory.

INTENTION (OBLIGATION)
A recorded voluntary commitment to support another person. NOT a debt, loan, or legal obligation. The actual transfer of funds happens outside the organizer — the app only records the intention and its fulfillment.

SUPPORT SIGNAL (COLLECTION)
A request for help when someone needs support. Two types:
- Emergency: urgent need, notifications sent immediately through the network (up to 3 handshake levels)
- Regular: 28-day cycles, auto-closes and can be renewed
Each collection has a chat link for direct communication with the creator.

MONTHLY BUDGET
Optional personal limit for monthly support activity. Stored in USD equivalent. Decreases when intentions are fulfilled. This is NOT a pooled fund or shared account — it reflects individual readiness to help.

CURRENT CAPABILITIES
Aggregated sum of remaining monthly budgets across the user's network (up to 3 handshake levels). An indicator of collective readiness to help — not an actual account or guaranteed funds.

NETWORK
Your connections and their connections, up to 3 handshake levels deep. Notifications propagate through this network based on handshake chains.

REPUTATION
Emerges from fulfilled intentions visible in the user's profile. Not a score, rating, or algorithm — simply the observable history of recorded actions and their outcomes.

IGNORE
One-sided communication block. Stops notifications from a specific person but keeps the handshake intact. The ignored person is not informed. Reversible anytime from Settings.

1:1 NOTIFICATION RATIO
The amount entered for a collection = the number of people who will be notified via BFS traversal. Example: $100 collection → up to 100 people notified.

BFS (BREADTH-FIRST SEARCH)
The algorithm used to traverse the connection graph and find recipients for notifications. It goes level by level through handshake chains.

WAVE
Each notification round for a collection. Wave 1 is sent on creation, subsequent waves are sent by the re-notify worker every 12 hours.

CYCLE (28 DAYS)
Regular collections operate in 28-day cycles. When a cycle ends, the collection auto-closes and can be renewed for a new cycle.

BLOCKED STATUS
A collection becomes BLOCKED when the sum of intentions reaches or exceeds the requested amount. No more intentions can be added.

LINKING CODE
A 6-digit code that allows linking multiple platform accounts (Telegram, Google, etc.) to a single user. Valid for 5 minutes.

INVITE LINK
A unique link to invite someone to become your connection. Can be shared directly or via QR code. Accepting creates a handshake.
`;
