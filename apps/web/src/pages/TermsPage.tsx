import { Prose, type ProseSection } from '../components/site/Prose';

// The terms are kept word for word from the previous page; the owner writes the final version.
const GITHUB = 'https://github.com/element1965/Social-organizer';
const BOT = 'https://t.me/socialorganizer_bot';

const SECTIONS: ProseSection[] = [
  {
    id: 'about',
    title: '1. About the Service',
    body: (
      <p>
        Social Organizer is a free, open-source platform for coordinating mutual support within
        trusted networks. The App is available as a Telegram Mini App and at orginizer.com.
      </p>
    ),
  },
  {
    id: 'acceptance',
    title: '2. Acceptance of Terms',
    body: (
      <p>
        By using Social Organizer, you agree to these Terms of Service. If you do not agree,
        please do not use the App.
      </p>
    ),
  },
  {
    id: 'accounts',
    title: '3. User Accounts',
    body: (
      <ul>
        <li>You must provide accurate information when creating an account.</li>
        <li>You are responsible for maintaining the security of your account.</li>
        <li>You may create only one account per person.</li>
        <li>You must be at least 16 years old to use the service.</li>
      </ul>
    ),
  },
  {
    id: 'how-it-works',
    title: '4. How It Works',
    body: (
      <>
        <p>Social Organizer facilitates mutual support by allowing users to:</p>
        <ul>
          <li>Build trusted support networks through personal invitations.</li>
          <li>Create and participate in support collections for people in need.</li>
          <li>Set monthly support budgets and track their contributions.</li>
          <li>Discover connection paths between network members.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'conduct',
    title: '5. User Conduct',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>Create fraudulent support requests or collections.</li>
          <li>Misrepresent your identity or relationship to others.</li>
          <li>Use the platform for illegal activities or spam.</li>
          <li>Attempt to exploit, hack, or disrupt the service.</li>
          <li>Harass or abuse other users.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'financial-disclaimer',
    title: '6. Financial Disclaimer',
    body: (
      <p>
        Social Organizer is a coordination tool, not a financial institution. The App helps
        organize mutual support but does not process payments directly. All financial
        transactions happen outside the platform between users. We are not responsible for
        the fulfillment of support obligations between users.
      </p>
    ),
  },
  {
    id: 'liability',
    title: '7. Limitation of Liability',
    body: (
      <p>
        The service is provided "as is" without warranties of any kind. We are not liable for
        any damages arising from the use of the App, including but not limited to financial
        losses from unfulfilled support obligations.
      </p>
    ),
  },
  {
    id: 'open-source',
    title: '8. Open Source',
    body: (
      <p>
        Social Organizer is open-source software licensed under its repository terms.
        The source code is available at{' '}
        <a href={GITHUB} target="_blank" rel="noopener noreferrer">
          github.com/element1965/Social-organizer
        </a>.
      </p>
    ),
  },
  {
    // Kept as `child-safety`: store listings link to /terms#child-safety.
    id: 'child-safety',
    title: '9. Child Safety Standards',
    body: (
      <>
        <p>
          Social Organizer has a zero-tolerance policy toward child sexual abuse and exploitation (CSAE).
          We strictly prohibit any content, behavior, or use of our platform that sexually exploits
          or endangers minors in any way.
        </p>
        <p>Specifically, the following are strictly forbidden:</p>
        <ul>
          <li>Sharing, distributing, or soliciting child sexual abuse material (CSAM) of any kind.</li>
          <li>Grooming, trafficking, or exploitation of minors.</li>
          <li>Any communication of a sexual nature with or about minors.</li>
          <li>Using the platform to facilitate access to children for harmful purposes.</li>
        </ul>
        <p>
          Users must be at least 16 years of age. We reserve the right to immediately terminate
          accounts and report violators to the appropriate law enforcement authorities, including
          the{' '}
          <a href="https://www.missingkids.org/gethelpnow/cybertipline" target="_blank" rel="noopener noreferrer">
            National Center for Missing &amp; Exploited Children (NCMEC)
          </a>{' '}
          and local law enforcement.
        </p>
        <p>
          If you encounter any content or behavior that violates these standards, please report it
          immediately via{' '}
          <a href={BOT} target="_blank" rel="noopener noreferrer">
            Telegram
          </a>.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: '10. Changes to Terms',
    body: (
      <p>
        We may update these terms from time to time. Continued use of the App after changes
        constitutes acceptance of the new terms.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '11. Contact',
    body: (
      <p>
        For questions about these Terms, contact us via{' '}
        <a href={BOT} target="_blank" rel="noopener noreferrer">
          Telegram
        </a>.
      </p>
    ),
  },
];

export function TermsPage() {
  return <Prose doc="terms" title="Terms of Service" meta="Last updated: February 7, 2025" sections={SECTIONS} />;
}
