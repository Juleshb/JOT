const PAGE_BG = '#F5EFE6'
const PANEL_BG = '#FFFCF9'

const LAST_UPDATED = 'July 28, 2026'

const sections = [
  {
    id: 'overview',
    title: '1. Overview',
    body: [
      'JO Transportation (“JO,” “we,” “us,” or “our”) provides ride booking and related services through our website and mobile applications (the “Services”). This Privacy Policy explains what information we collect, how we use it, and the choices you have.',
      'By using the Services, you agree to the collection and use of information as described in this policy. If you do not agree, please do not use the Services.',
    ],
  },
  {
    id: 'information-we-collect',
    title: '2. Information we collect',
    body: [
      'Account information. When you create an account or sign in, we may collect your name, email address, phone number, password (stored in hashed form), and profile details you choose to provide. If you use Google Sign-In or Sign in with Apple, we receive limited account information from that provider (such as your name and email, or a private relay email from Apple) as permitted by your settings.',
      'Location information. To request rides, match riders and drivers, show maps, estimate routes and fares, and track active trips, we collect precise location data from your device when you grant permission. You can turn location access off in your device settings, but some features will not work without it.',
      'Trip and usage information. We collect pickup and drop-off details, route and fare estimates, ride status, ratings, and history needed to operate and improve the Services.',
      'Payment information. When you pay for a ride, payment card details are processed by our payment provider (for example, Stripe). We do not store your full card number on our servers. We may receive payment status, limited billing metadata, and transaction identifiers.',
      'Communications. If you contact us (including through our contact form), we collect the information you submit—such as name, email, phone, company, topic, and message content—so we can respond.',
      'Device and technical data. We may collect device type, operating system, app version, IP address, browser type, and diagnostic logs needed for security, performance, and troubleshooting.',
    ],
  },
  {
    id: 'how-we-use',
    title: '3. How we use information',
    body: [
      'We use personal information to:',
    ],
    bullets: [
      'Create and manage your account',
      'Provide ride matching, navigation, trip tracking, and customer support',
      'Process payments and prevent fraud',
      'Send service-related notices (for example, ride updates or account security messages)',
      'Improve safety, reliability, and product features',
      'Comply with law and enforce our terms',
    ],
  },
  {
    id: 'sharing',
    title: '4. How we share information',
    body: [
      'We do not sell your personal information. We may share information in these situations:',
    ],
    bullets: [
      'With drivers and riders as needed to complete a trip (for example, first name, pickup location, and trip status)',
      'With service providers who help us operate the Services, including hosting, maps and location services (such as Google Maps / Places or Mapbox), authentication (Google and Sign in with Apple), payments (Stripe), email delivery, and analytics or error monitoring when enabled',
      'When required by law, legal process, or to protect the rights, safety, and security of JO, our users, or the public',
      'In connection with a merger, acquisition, financing, or sale of assets, subject to appropriate safeguards',
    ],
  },
  {
    id: 'retention',
    title: '5. Data retention',
    body: [
      'We retain personal information for as long as needed to provide the Services, meet legal and accounting obligations, resolve disputes, and enforce our agreements. Trip records and account data may be kept for a longer period when required for safety, fraud prevention, or compliance. When information is no longer needed, we delete or de-identify it where reasonably possible.',
    ],
  },
  {
    id: 'security',
    title: '6. Security',
    body: [
      'We use reasonable administrative, technical, and organizational measures to protect personal information. No method of transmission or storage is completely secure. Please use a strong password and notify us promptly if you suspect unauthorized access to your account.',
    ],
  },
  {
    id: 'your-choices',
    title: '7. Your choices and rights',
    body: [
      'Depending on where you live, you may have rights to access, correct, delete, or export certain personal information, or to object to or restrict certain processing. You can update some account details in the app or website profile settings. In the mobile app, you can permanently delete your account from Profile → Delete account. You may also email us to request deletion.',
      'To make a privacy request, email jotransportation2@gmail.com with the subject line “Privacy Request.” We may need to verify your identity before responding. You may also contact us by phone at +1 (682) 786-1241.',
      'You can withdraw location permission in your device settings at any time. Marketing communications, if any, can be opted out of using the instructions in those messages. Transactional ride and account messages may still be sent.',
    ],
  },
  {
    id: 'children',
    title: '8. Children’s privacy',
    body: [
      'The Services are not directed to children under 13 (or the minimum age required in your jurisdiction). We do not knowingly collect personal information from children. If you believe a child has provided us personal information, contact us and we will take appropriate steps to delete it.',
    ],
  },
  {
    id: 'international',
    title: '9. International users',
    body: [
      'JO Transportation is based in Dallas–Fort Worth, Texas, USA. If you access the Services from outside the United States, your information may be processed in the United States or other countries where we or our providers operate. Those countries may have different data-protection laws than your home country.',
    ],
  },
  {
    id: 'changes',
    title: '10. Changes to this policy',
    body: [
      'We may update this Privacy Policy from time to time. We will post the updated version on this page and revise the “Last updated” date. Continued use of the Services after changes become effective means you accept the updated policy.',
    ],
  },
  {
    id: 'contact',
    title: '11. Contact us',
    body: [
      'If you have questions about this Privacy Policy or our privacy practices, contact:',
    ],
    bullets: [
      'JO Transportation',
      'Dallas–Fort Worth, Texas, USA',
      'Email: jotransportation2@gmail.com',
      'Phone: +1 (682) 786-1241',
      'Web: https://jotransipotation.online/contact',
    ],
  },
]

export default function PrivacyPolicyPage({ navigateToPage }) {
  return (
    <div className="text-[#2d100f]" style={{ backgroundColor: PAGE_BG }}>
      <section className="scroll-mt-28 pb-10 pt-24 sm:pb-12 sm:pt-28">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
              Legal
            </p>
            <h1 className="font-brand mt-3 text-[2rem] font-bold leading-[1.12] tracking-tight text-[#3d1212] sm:text-4xl sm:leading-[1.08]">
              <span className="text-[#4a1515]">Privacy Policy</span>
            </h1>
            <p className="mt-4 text-sm font-medium text-[#96724a]">Last updated: {LAST_UPDATED}</p>
            <p className="mt-6 max-w-2xl text-[0.98rem] font-medium leading-relaxed text-[#3d2a28] sm:text-[1.0625rem]">
              This policy describes how JO Transportation collects, uses, and shares information when
              you use our website and mobile apps to book and manage rides.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-20">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div
            className="rounded-3xl border border-[#e8dfd6] p-6 shadow-[0_4px_40px_-14px_rgba(45,16,16,0.1)] sm:p-9"
            style={{ backgroundColor: PANEL_BG }}
          >
            <nav aria-label="Privacy Policy sections" className="mb-8 border-b border-[#e8dfd6] pb-6">
              <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
                On this page
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-sm font-semibold text-[#4a1515] transition hover:text-[#9d3733]"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="space-y-10">
              {sections.map((section) => (
                <article key={section.id} id={section.id} className="scroll-mt-28">
                  <h2 className="font-brand text-xl font-bold text-[#3d1212] sm:text-2xl">
                    {section.title}
                  </h2>
                  <div className="mt-3 space-y-3 text-sm leading-relaxed text-[#4b2220] sm:text-[0.98rem]">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {section.bullets ? (
                      <ul className="list-disc space-y-2 pl-5">
                        {section.bullets.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-12 flex flex-col gap-3 border-t border-[#e8dfd6] pt-8 sm:flex-row">
              <button
                type="button"
                onClick={() => navigateToPage('contact')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4a1515] px-6 py-3.5 text-sm font-bold text-white shadow-[0_4px_20px_-8px_rgba(74,21,21,0.4)] transition hover:bg-[#3d1212] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a1515] focus-visible:ring-offset-2 sm:w-auto"
              >
                Contact support
                <span aria-hidden>→</span>
              </button>
              <button
                type="button"
                onClick={() => navigateToPage('home')}
                className="inline-flex w-full items-center justify-center rounded-xl border-2 border-[#4a1515] bg-transparent px-6 py-3.5 text-sm font-bold text-[#4a1515] transition hover:bg-[#4a1515]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a1515] focus-visible:ring-offset-2 sm:w-auto"
              >
                Back to home
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
