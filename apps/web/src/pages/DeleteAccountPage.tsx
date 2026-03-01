import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-teal-400 hover:text-teal-300 mb-8 transition-colors">
          <ArrowLeft size={18} /> Back
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">Account Deletion</h1>
        <p className="text-gray-500 text-sm mb-8">Social Organizer by Social Organizer Team</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">How to Delete Your Account</h2>
            <p className="mb-3">
              You can delete your account and all associated data directly from the app.
              Follow these steps:
            </p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Open the Social Organizer app or go to <a href="https://www.orginizer.com" className="text-teal-400 hover:text-teal-300 underline">www.orginizer.com</a></li>
              <li>Log in to your account</li>
              <li>Navigate to <strong className="text-white">Settings</strong> (gear icon in the bottom navigation)</li>
              <li>Scroll to the bottom of the Settings page</li>
              <li>Tap <strong className="text-red-400">"Delete Account"</strong></li>
              <li>Confirm the deletion in the dialog that appears</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Data That Will Be Deleted</h2>
            <p className="mb-3">Upon account deletion, the following data is <strong className="text-white">permanently removed</strong>:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
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
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Data Retention</h2>
            <p>
              Account deletion is <strong className="text-white">immediate and irreversible</strong>.
              All your personal data is deleted from our database within seconds of confirmation.
              No personal data is retained after deletion.
            </p>
            <p className="mt-2">
              If you had connections with other users, your name in their network will be replaced
              with "Deleted user" to maintain data integrity, but no personal information is preserved.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Contact</h2>
            <p>
              If you are unable to access your account and need assistance with deletion, contact us via{' '}
              <a
                href="https://t.me/socialorganizer_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300 underline"
              >
                Telegram
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
