import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-teal-400 hover:text-teal-300 mb-8 transition-colors">
          <ArrowLeft size={18} /> Back
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-500 dark:text-gray-300 text-sm mb-8">Last updated: February 7, 2025</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Introduction</h2>
            <p>
              Social Organizer ("we", "our", "the App") is an open-source mutual support coordination platform.
              This Privacy Policy explains how we collect, use, and protect your personal data when you use our
              Telegram Mini App and web application at orginizer.com.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Data We Collect</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong className="text-white">Account data:</strong> name, email address, Telegram user ID and username (when logging in via Telegram).</li>
              <li><strong className="text-white">Profile data:</strong> photo, contact information you choose to add (social links, phone number).</li>
              <li><strong className="text-white">Network data:</strong> your connections with other users, invitation history.</li>
              <li><strong className="text-white">Activity data:</strong> support collections you create or participate in, obligations, budget settings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>To provide and maintain the service — connecting you with your support network.</li>
              <li>To process support requests and track mutual aid within your network.</li>
              <li>To send notifications about collections, invitations, and network activity.</li>
              <li>To improve the App based on aggregated, anonymized usage patterns.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Data Sharing</h2>
            <p>
              We do not sell your personal data. Your data is shared only with:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li><strong className="text-white">Your network members:</strong> your name, photo, and contact info you choose to make visible.</li>
              <li><strong className="text-white">Telegram:</strong> data necessary for the Mini App to function within Telegram.</li>
              <li><strong className="text-white">Hosting providers:</strong> our servers process your data to deliver the service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Data Storage and Security</h2>
            <p>
              Your data is stored in a secure PostgreSQL database. We use encrypted connections (HTTPS/TLS),
              JWT-based authentication, and follow industry-standard security practices to protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>Access your personal data through your profile and settings.</li>
              <li>Correct or update your information at any time.</li>
              <li>Request deletion of your account and associated data.</li>
              <li>Export your data in a machine-readable format.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Open Source</h2>
            <p>
              Social Organizer is fully open source. You can review our codebase and how your data
              is handled at{' '}
              <a
                href="https://github.com/element1965/Social-organizer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300 underline"
              >
                github.com/element1965/Social-organizer
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Contact</h2>
            <p>
              For questions about this Privacy Policy or your data, contact us via{' '}
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
