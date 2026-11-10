export const SCREEN_GUIDE = `
APP SCREENS GUIDE:

The signed-in app has four tabs on a phone: Circle / Круг (/), Need / Потребность (/ask), Add / Добавить (/add), Profile / Профиль (/me). A wide screen uses the same destinations in a sidebar and adds People / Люди. Guests see the public site at / and the explainer at /how. Old addresses redirect: /dashboard, /network, /notifications, /welcome, /arvut, /matches, /skills, /needs → /; /create → /ask; /settings → /me; /faq → /me/help; /onboarding → /intro; /profile/:userId → /person/:id.

CIRCLE / КРУГ (/)
Signed-in home. A 3D graph of the circle (three rings of handshakes) and a feed of Needs and acquaintance events. Ring chips open People for that ring. Search opens People. An empty circle asks the person to add someone they know.

PEOPLE / ЛЮДИ (/people, /people/1, /people/2, /people/3)
People of one ring, with search and a switch that shows or hides that ring on the graph.
- Ring 1: direct handshakes. People added in the last week sit under Recent, together with incoming acquaintance requests (confirm in a sheet; both sides must agree).
- Rings 2 and 3: people further along the chain. Each row shows the path ("via A → B").
A row opens Person. A pending request opens the acquaintance sheet instead.

PERSON (/person/:id)
One person. Avatar, name, online (last seen under 5 minutes) or last seen, and the handshake path when they are not a direct connection.
- Ring 1: a private nickname (used across the circle, people, and Needs), contacts, and Remove (the handshake goes away; their part in a Need stays).
- Further out: "We are acquainted" sends a direct request. Contacts stay hidden until there is a direct handshake. Instagram on a phone copies the name instead of opening the app.
- An open Need of theirs can be opened from here. Shared participation is listed. Someone outside the circle is marked as not in the circle.

NEED / ПОТРЕБНОСТЬ (/ask)
The form for reporting a Need (the old /create address opens this). One time, or every 28 days (participants confirm the amount each cycle; a reminder goes out 3 days before). Amount in whole dollars, minimum 10. A link to the participants' chat (https) is required — any messenger. Social Organizer records the signal; it does not accept, transfer or hold money.
Reporting a Need stays closed until the circle is large enough (direct handshakes and the wider network). Until then the screen shows what is still missing and points to Add. A person has one open Need of each type. "Report a Need" / «Сообщить о потребности» sends it; what opens is the Need (потребность): "Your Need" / «Ваша потребность».

ADD / ДОБАВИТЬ (/add, /add/qr, /add/scan)
One invite link per person (orginizer.com and a QR). Share it, show the QR, or scan someone else's code. Incoming people wait here to be confirmed. When the circle is still too small to ask, a short path card says how many direct and network people are still needed.

NEED (/collection/:id)
One Need. Author, one time or every 28 days, handshake path, reported Participation against the amount needed, and the participants' chat.
States:
- Open (ACTIVE). Anyone in reach can report Participation ("Report Participation" / «Сообщить об участии») with a whole-dollar amount (minimum 1 $). The field suggests their minimum participation. The stage line shows Amount → Chat → Closed. Participation is a voluntary intention, not a payment.
- Amount needed is reported (BLOCKED, no reason): reported Participation covers the amount needed. No new Participation. It does not mean anything was handed over.
- Paused (BLOCKED with a reason): an admin pause, or a community hold. New Participation and the chat stop. The owner sees the reason and can write to the assistant. On lists this shows as paused.
- New cycle: a Need's next 28 days (every 28 days). Current participants confirm the amount (waiting / confirmed). Confirming does not change the total already reported.
- Closed (CLOSED or CANCELLED): past. Opens from Needs in Profile. The author can close an open Need and mark from whom they received money ("Mark as received" / «Отметить полученное»): that is the author's own mark, Social Organizer does not see or verify transfers. A participant can withdraw ("Withdraw Participation" / «Отозвать участие»). The author can set a missing amount and share a public link (/sos/:id). A person who joins from that public link becomes a direct handshake.

PROFILE / ПРОФИЛЬ (/me)
- Account card → Account (/me/account): photo, name, slug, member since. Contacts (hide contacts is a switch). Connect Telegram, for an account that signed in another way, opens the bot with a link code and does not show the digits. Delete account is at the bottom of Account.
- Participation: "Your network can help" (sum of minimum participation named by the circle — a reference figure, not a promise and not money held by anyone). Minimum participation (/me/stake): the amount the person is ready to name when someone they know reports a Need (not per month; it is filled in when they report Participation, and they can name more); "I can't help right now" clears it; Social Organizer does not accept money. Needs (/me/history): open count on the row; open ones are also at /me/open, past ones in history.
- Settings: theme Auto / Light / Dark. Notifications (the notifications channel): cycles (a reminder 3 days before a cycle and again on the day), sounds, and push when the device supports it. The row reads All, Some, or Off. Larger text. Language.
- More: Help (/me/help), About, Sign out.
- Admins only: Broadcast (/me/broadcast), Statistics (/me/stats), Support inbox (/support), and the moderation queue.

HELP (/me/help)
FAQ (/me/help/faq), the assistant (/me/help/assistant), How it works (/how), replay the intro (/intro), and the community chat. A Need's "write to support" opens the assistant. The assistant is this chat, not a floating button.

COMMUNITY MODERATION
A participant can complain about a Need (a reason and a short comment). Three complaints open a review. The complainant's circle votes for 48 hours: problem, ok, or unknown. A circle smaller than 3 people does not vote — admins take the case. Quorum is at least 3 votes and 30% of that circle. The complaint is upheld when at least two votes say problem and problem beats ok: the Need is paused with a community hold. Ok winning at quorum dismisses it. No quorum, a tie, or only unknown is inconclusive: the complaints drop and nobody is penalised. Two dismissals where ok won at quorum stop that person complaining for 30 days. Open reviews also appear in the Circle feed. Admins can pause or resume a Need with a reason (complaints, suspected fraud, rules, or the author's request).

ACCOUNT DELETION
Inside the account: Profile → Account, at the bottom, Delete account, then confirm. It is immediate and cannot be undone. Gone: profile, photo, phone, e-mail, contacts, sign-in methods, connections and invites, the person's open Needs and their part in open Needs, notifications, push, settings, and assistant chats. Other people's circles keep "Deleted user" with no personal data. Past Needs of other people keep the amounts without the name.
An account that is not used is deleted automatically after 2 years.
Someone who cannot sign in writes to @socialorganizer_bot with the e-mail or username they used. That deletion is manual, within 30 days. The public page /delete-account explains the same steps.

LOGIN (/login)
One screen for new and existing people: Google, Apple, Telegram (automatic inside the Mini App; on the site, the Telegram button or the bot), or an e-mail code (6 digits, resend after 60 seconds). No password. If the e-mail already belongs to an account, the screen asks for an e-mail code first.

INTRO (/intro)
First-run intro. It can be replayed from Help. /onboarding redirects here.

INVITE (/invite/:token)
Opens from a personal invite link. An authenticated person accepts; otherwise the token waits through sign-in and is accepted after. There is one invite link per person, shared from Add.
`;