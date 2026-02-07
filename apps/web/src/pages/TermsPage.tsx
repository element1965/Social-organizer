import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-teal-400 hover:text-teal-300 mb-8 transition-colors">
          <ArrowLeft size={18} /> Back
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-gray-500 text-sm mb-8">Last updated: February 7, 2025</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. About the Service</h2>
            <p>
              Social Organizer is a free, open-source platform for coordinating mutual support within
              trusted networks. The App is available as a Telegram Mini App and at orginizer.com.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Acceptance of Terms</h2>
            <p>
              By using Social Organizer, you agree to these Terms of Service. If you do not agree,
              please do not use the App.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. User Accounts</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>You must provide accurate information when creating an account.</li>
              <li>You are responsible for maintaining the security of your account.</li>
              <li>You may create only one account per person.</li>
              <li>You must be at least 16 years old to use the service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. How It Works</h2>
            <p>
              Social Organizer facilitates mutual support by allowing users to:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>Build trusted support networks through personal invitations.</li>
              <li>Create and participate in support collections for people in need.</li>
              <li>Set monthly support budgets and track their contributions.</li>
              <li>Discover connection paths between network members.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. User Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>Create fraudulent support requests or collections.</li>
              <li>Misrepresent your identity or relationship to others.</li>
              <li>Use the platform for illegal activities or spam.</li>
              <li>Attempt to exploit, hack, or disrupt the service.</li>
              <li>Harass or abuse other users.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Financial Disclaimer</h2>
            <p>
              Social Organizer is a coordination tool, not a financial institution. The App helps
              organize mutual support but does not process payments directly. All financial
              transactions happen outside the platform between users. We are not responsible for
              the fulfillment of support obligations between users.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Limitation of Liability</h2>
            <p>
              The service is provided "as is" without warranties of any kind. We are not liable for
              any damages arising from the use of the App, including but not limited to financial
              losses from unfulfilled support obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Open Source</h2>
            <p>
              Social Organizer is open-source software licensed under its repository terms.
              The source code is available at{' '}
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
            <h2 className="text-lg font-semibold text-white mb-2">9. Changes to Terms</h2>
            <p>
              We may update these terms from time to time. Continued use of the App after changes
              constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">10. Contact</h2>
            <p>
              For questions about these Terms, contact us via{' '}
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
