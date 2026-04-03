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
        <p className="text-gray-500 dark:text-gray-300 text-sm mb-8">Last updated: February 7, 2025</p>

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

          <section id="child-safety">
            <h2 className="text-lg font-semibold text-white mb-2">9. Child Safety Standards</h2>
            <p className="mb-2">
              Social Organizer has a zero-tolerance policy toward child sexual abuse and exploitation (CSAE).
              We strictly prohibit any content, behavior, or use of our platform that sexually exploits
              or endangers minors in any way.
            </p>
            <p className="mb-2">Specifically, the following are strictly forbidden:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
              <li>Sharing, distributing, or soliciting child sexual abuse material (CSAM) of any kind.</li>
              <li>Grooming, trafficking, or exploitation of minors.</li>
              <li>Any communication of a sexual nature with or about minors.</li>
              <li>Using the platform to facilitate access to children for harmful purposes.</li>
            </ul>
            <p className="mb-2">
              Users must be at least 16 years of age. We reserve the right to immediately terminate
              accounts and report violators to the appropriate law enforcement authorities, including
              the{' '}
              <a
                href="https://www.missingkids.org/gethelpnow/cybertipline"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300 underline"
              >
                National Center for Missing &amp; Exploited Children (NCMEC)
              </a>{' '}
              and local law enforcement.
            </p>
            <p>
              If you encounter any content or behavior that violates these standards, please report it
              immediately via{' '}
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

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">10. Changes to Terms</h2>
            <p>
              We may update these terms from time to time. Continued use of the App after changes
              constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">11. Contact</h2>
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
