export const GLOSSARY = `
EXTENDED GLOSSARY:

HANDSHAKE
Mutual confirmation of a meaningful connection between two people. Both must confirm. This is the fundamental building block of the network.

DUNBAR'S NUMBER (150 LIMIT)
Each person can have a maximum of 150 connections (handshakes). Based on Robin Dunbar's research — the cognitive limit of stable social relationships a human brain can maintain.

HANDSHAKE CHAIN
Path of connections between users through mutual acquaintances. Example: you → friend → their friend = 2 handshakes apart. Based on six degrees of separation theory.

NEED
One of the two signals: a participant's message about what they need. It carries an amount in whole dollars, how often (one time, or every 28 days), and a link to a chat in any messenger. In the code and database it is the "collection" record; never call it a collection, fundraiser or donation drive when talking to people.

PARTICIPATION
The other signal: a participant's message about their own voluntary participation in someone's Need, with an amount they name. It is a voluntary intention. It is NOT a payment and Social Organizer does not move money. What participants then do, they agree and do directly with each other, outside Social Organizer. In the database it is the "obligation" record; never use that word with people.

MINIMUM PARTICIPATION
The amount a person is ready to name when someone in their network reports a Need, in whole dollars. Filled in when they report Participation; they can name more. Not per month, and it does not decrease. This is NOT a pooled fund or shared account.

YOUR NETWORK CAN HELP
Sum of minimum participation named across the user's network (up to 3 handshake levels). A reference figure, not a promise, not an account and not guaranteed funds.

NETWORK
Your connections and their connections, up to 3 handshake levels deep. Notifications propagate through this network based on handshake chains.

IGNORE
One-sided communication block. Stops notifications from a specific person but keeps the handshake intact. The ignored person is not informed. Reversible anytime from Settings.

1:1 NOTIFICATION RATIO
The amount entered for a Need = the number of people who will be notified via BFS traversal. Example: a Need for $100 → up to 100 people notified.

BFS (BREADTH-FIRST SEARCH)
The algorithm used to traverse the connection graph and find recipients for notifications. It goes level by level through handshake chains.

WAVE
Each notification round for a Need. Wave 1 is sent on creation, subsequent waves are sent by the re-notify worker every 12 hours.

CYCLE (28 DAYS)
Needs every 28 days run in 28-day cycles. When a cycle ends, participants confirm their amount for the next one.

BLOCKED STATUS
A Need becomes BLOCKED when the reported Participation reaches the amount needed. No more Participation can be added. It says nothing about whether anything was handed over.

LINKING CODE
A 6-digit code that allows linking multiple platform accounts (Telegram, Google, etc.) to a single user. Valid for 5 minutes.

INVITE LINK
A unique link to invite someone to become your connection. Can be shared directly or via QR code. Accepting creates a handshake.
`;
