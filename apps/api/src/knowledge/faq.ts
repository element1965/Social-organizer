export const FAQ = `
FREQUENTLY ASKED QUESTIONS:

Q: How do I add a connection (handshake)?
A: Go to Network page, generate an invite link or QR code, and share it with someone you know. When they accept, a mutual handshake is created. Both sides must confirm.

Q: Why is there a limit of 150 connections?
A: This is based on Dunbar's number — the cognitive limit of stable relationships a human brain can maintain. It ensures that every connection is meaningful, not just a number.

Q: How do support signals (collections) work?
A: When you need help, create a collection specifying the amount and type (emergency or regular). Your network is notified through handshake chains. People who want to help record their intentions. All actual transfers happen outside the app.

Q: What's the difference between Emergency and Regular collections?
A: Emergency collections send notifications immediately and stay active until closed. Regular collections run in 28-day cycles — they auto-close after 28 days and can be renewed.

Q: How does the monthly budget work?
A: It's an optional personal limit you set in Settings. It represents how much you're willing to help per month (in USD equivalent). It decreases when you fulfill intentions. It resets monthly. It's completely voluntary.

Q: What are "Current Capabilities" on the dashboard?
A: It's the sum of remaining monthly budgets across your network (up to 3 handshake levels). It shows the collective readiness to help — but it's not a guaranteed fund or actual account.

Q: How many people see my collection notification?
A: The 1:1 ratio means: the amount you enter = the number of people notified. A $100 collection notifies up to 100 people. The system uses BFS to find recipients through your handshake chains.

Q: Does the app handle money?
A: No. The organizer only records intentions and confirmations. All actual transfers happen outside the app, through any method the participants choose (cash, bank transfer, crypto, etc.).

Q: How do I ignore someone?
A: Go to Settings → Ignore List → Add user. This stops their notifications from reaching you but keeps the handshake intact. They won't be notified that you ignored them. You can reverse it anytime.

Q: Can I link multiple accounts (Telegram + Google)?
A: Yes. Go to Settings, generate a 6-digit linking code, then log in with the other platform and enter the code. Both accounts will be linked to one profile.

Q: How do I delete my account?
A: Go to Settings → scroll to the bottom → Delete Account. This removes all your data permanently. Active collections will be cancelled.

Q: What happens when a collection gets "blocked"?
A: When the sum of intentions reaches or exceeds the requested amount, the collection status changes to BLOCKED. This means enough help has been pledged and no more intentions can be added.

Q: How does the handshake chain path work in notifications?
A: Each notification shows the chain of connections through which it reached you. For example: "Alice → Bob → You" means Alice created the collection, Bob is your mutual connection who links you.

Q: Can I use the app without Telegram?
A: Yes. The app works as a regular website. Telegram Mini App mode provides auto-login and some UX enhancements, but all features work in the browser too.

Q: What languages are supported?
A: 25 languages: English, Russian, Spanish, French, German, Portuguese, Italian, Chinese, Japanese, Korean, Arabic, Hindi, Turkish, Polish, Ukrainian, Dutch, Swedish, Danish, Finnish, Norwegian, Czech, Romanian, Thai, Vietnamese, Indonesian.

Q: How does the 3D globe on the landing page work?
A: It's a Three.js visualization using real NASA Blue Marble textures with bump maps, specular lighting for water, animated clouds, and a network of nodes on the surface representing connections.

Q: What is reputation in this app?
A: Reputation is not a score or rating. It simply emerges from your visible history: confirmed handshakes, fulfilled intentions, participation in collections. Others can see your track record on your profile.
`;
