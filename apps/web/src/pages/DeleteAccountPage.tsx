import { Prose, type ProseSection } from '../components/site/Prose';

// The text is kept word for word from the previous page (store listings link here); the owner writes the final
// version. Note: the in-app path "Settings → Delete Account" becomes "Profile → Account" after the redesign.
const BOT = 'https://t.me/socialorganizer_bot';

const SECTIONS: ProseSection[] = [
  {
    id: 'how-to-delete',
    title: 'How to Delete Your Account',
    body: (
      <>
        <p>
          You can delete your account and all associated data directly from the app.
          Follow these steps:
        </p>
        <ol>
          <li>Open the Social Organizer app or go to <a href="https://www.orginizer.com">www.orginizer.com</a></li>
          <li>Log in to your account</li>
          <li>Navigate to <strong>Settings</strong> (gear icon in the bottom navigation)</li>
          <li>Scroll to the bottom of the Settings page</li>
          <li>Tap <strong>"Delete Account"</strong></li>
          <li>Confirm the deletion in the dialog that appears</li>
        </ol>
      </>
    ),
  },
  {
    id: 'deleted-data',
    title: 'Data That Will Be Deleted',
    body: (
      <>
        <p>Upon account deletion, the following data is <strong>permanently removed</strong>:</p>
        <ul>
          <li>Your profile information (name, email, phone, photo, bio)</li>
          <li>Your contact links (Telegram, Instagram, WhatsApp, etc.)</li>
          <li>Platform account bindings (Telegram, Google, Facebook, Apple)</li>
          <li>Your network connections and invitation history</li>
          <li>Support collections you created and your obligations</li>
          <li>All notifications related to your account</li>
          <li>Push notification subscriptions and FCM tokens</li>
          <li>Your skills, needs, and match notifications</li>
          <li>Chat messages with the AI assistant</li>
          <li>Ignore list entries</li>
          <li>Linking codes</li>
          <li>Settings and preferences</li>
        </ul>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'Data Retention',
    body: (
      <>
        <p>
          Account deletion is <strong>immediate and irreversible</strong>.
          All your personal data is deleted from our database within seconds of confirmation.
          No personal data is retained after deletion.
        </p>
        <p>
          If you had connections with other users, your name in their network will be replaced
          with "Deleted user" to maintain data integrity, but no personal information is preserved.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        If you are unable to access your account and need assistance with deletion, contact us via{' '}
        <a href={BOT} target="_blank" rel="noopener noreferrer">
          Telegram
        </a>.
      </p>
    ),
  },
];

export function DeleteAccountPage() {
  return <Prose doc="delete" title="Account Deletion" meta="Social Organizer by Social Organizer Team" sections={SECTIONS} />;
}
