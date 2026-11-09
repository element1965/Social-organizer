import { Prose, type ProseSection } from '../components/site/Prose';

// The policy text is kept word for word from the previous page; the owner writes the final version.
const GITHUB = 'https://github.com/element1965/Social-organizer';
const BOT = 'https://t.me/socialorganizer_bot';

const SECTIONS: ProseSection[] = [
  {
    id: 'introduction',
    title: '1. Introduction',
    body: (
      <p>
        Social Organizer ("we", "our", "the App") is an open-source mutual support coordination platform.
        This Privacy Policy explains how we collect, use, and protect your personal data when you use our
        Telegram Mini App and web application at orginizer.com.
      </p>
    ),
  },
  {
    id: 'data-we-collect',
    title: '2. Data We Collect',
    body: (
      <ul>
        <li><strong>Account data:</strong> name, email address, Telegram user ID and username (when logging in via Telegram).</li>
        <li><strong>Profile data:</strong> photo, contact information you choose to add (social links, phone number).</li>
        <li><strong>Network data:</strong> your connections with other users, invitation history.</li>
        <li><strong>Activity data:</strong> support collections you create or participate in, obligations, budget settings.</li>
      </ul>
    ),
  },
  {
    id: 'how-we-use',
    title: '3. How We Use Your Data',
    body: (
      <ul>
        <li>To provide and maintain the service — connecting you with your support network.</li>
        <li>To process support requests and track mutual aid within your network.</li>
        <li>To send notifications about collections, invitations, and network activity.</li>
        <li>To improve the App based on aggregated, anonymized usage patterns.</li>
      </ul>
    ),
  },
  {
    id: 'data-sharing',
    title: '4. Data Sharing',
    body: (
      <>
        <p>We do not sell your personal data. Your data is shared only with:</p>
        <ul>
          <li><strong>Your network members:</strong> your name, photo, and contact info you choose to make visible.</li>
          <li><strong>Telegram:</strong> data necessary for the Mini App to function within Telegram.</li>
          <li><strong>Hosting providers:</strong> our servers process your data to deliver the service.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'storage-security',
    title: '5. Data Storage and Security',
    body: (
      <p>
        Your data is stored in a secure PostgreSQL database. We use encrypted connections (HTTPS/TLS),
        JWT-based authentication, and follow industry-standard security practices to protect your information.
        Accounts with no sign-ins for 2 years are deleted automatically, after notices 30 and 7 days in advance.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: '6. Your Rights',
    body: (
      <>
        <p>You have the right to:</p>
        <ul>
          <li>Access your personal data through your profile and settings.</li>
          <li>Correct or update your information at any time.</li>
          <li>Delete your account and associated data yourself in Profile → Account.</li>
          <li>Export your data in a machine-readable format.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'open-source',
    title: '7. Open Source',
    body: (
      <p>
        Social Organizer is fully open source. You can review our codebase and how your data
        is handled at{' '}
        <a href={GITHUB} target="_blank" rel="noopener noreferrer">
          github.com/element1965/Social-organizer
        </a>.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '8. Contact',
    body: (
      <p>
        For questions about this Privacy Policy or your data, contact us via{' '}
        <a href={BOT} target="_blank" rel="noopener noreferrer">
          Telegram
        </a>.
      </p>
    ),
  },
];

export function PrivacyPage() {
  return <Prose doc="privacy" title="Privacy Policy" meta="Last updated: February 7, 2025" sections={SECTIONS} />;
}
