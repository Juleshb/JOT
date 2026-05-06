const PAGE_BG = '#F5EFE6'
const PANEL_BG = '#FFFCF9'

export default function AboutPage({ navigateToPage }) {
  const valueCards = [
    {
      title: 'Safety first',
      body: 'Every trip is backed by verified drivers, rider support, and in-app safety tools.',
      icon: (
        <path d="M12 3 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-4Z" strokeLinejoin="round" />
      ),
    },
    {
      title: 'Access for everyone',
      body: 'From daily commutes to late-night rides, we build reliable mobility for all.',
      icon: (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 20v-1a7 7 0 0 1 14 0v1" strokeLinecap="round" />
        </>
      ),
    },
    {
      title: 'Built with local insight',
      body: 'We partner with local drivers and communities to improve transport every day.',
      icon: (
        <>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
          <circle cx="12" cy="10" r="3" />
        </>
      ),
    },
  ]

  const innovationItems = [
    {
      title: 'Live dispatch & matching',
      tag: 'Operations',
      body: 'Demand-aware routing pairs riders with nearby drivers faster, reducing wait times and empty miles across the network.',
      icon: (
        <>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3" />
        </>
      ),
    },
    {
      title: 'Predictive ETAs & pricing',
      tag: 'Intelligence',
      body: 'Traffic, events, and historical patterns feed transparent fare estimates and arrival times riders can plan around.',
      icon: (
        <>
          <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m7 12 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ),
    },
    {
      title: 'Safety-by-design trips',
      tag: 'Trust',
      body: 'Verified partners, in-trip status, and responsive support create a consistent safety baseline on every journey.',
      icon: <path d="M12 3 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-4Z" strokeLinejoin="round" />,
    },
    {
      title: 'Driver-first tools',
      tag: 'Partners',
      body: 'Clear earnings, flexible hours, and fair trip offers help professional drivers grow with the platform—not against it.',
      icon: (
        <>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" strokeLinecap="round" />
        </>
      ),
    },
  ]

  const leaders = [
    { name: 'Aline M.', role: 'Chief Executive Officer', initials: 'AM' },
    { name: 'David K.', role: 'Chief Operations Officer', initials: 'DK' },
    { name: 'Ruth N.', role: 'Head of Safety', initials: 'RN' },
  ]

  return (
    <div className="text-[#2d100f]" style={{ backgroundColor: PAGE_BG }}>
      <section className="scroll-mt-28 pb-12 pt-24 sm:pb-14 sm:pt-28">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
              About JO Transportation
            </p>
            <h1 className="font-brand mt-3 text-[2rem] font-bold leading-[1.12] tracking-tight text-[#3d1212] sm:text-4xl sm:leading-[1.08]">
              <span className="text-[#4a1515]">We reimagine how cities move,</span>
              <br />
              <span className="text-[#96724a]">one ride at a time.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[0.98rem] font-medium leading-relaxed text-[#3d2a28] sm:text-[1.0625rem]">
              JO Transportation is a technology platform connecting riders and drivers through safe,
              dependable, and transparent urban mobility.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-12 sm:pb-14">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div
            className="rounded-3xl border border-[#e8dfd6] p-6 shadow-[0_4px_40px_-14px_rgba(45,16,16,0.1)] sm:p-8"
            style={{ backgroundColor: PANEL_BG }}
          >
            <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
              At a glance
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                { label: 'Cities served', value: '18+' },
                { label: 'Completed trips', value: '2.5M+' },
                { label: 'Driver partners', value: '12k+' },
              ].map((stat) => (
                <article
                  key={stat.label}
                  className="rounded-2xl bg-white px-5 py-6 text-center ring-1 ring-[#e8dfd6]/80 sm:py-7"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#96724a]">
                    {stat.label}
                  </p>
                  <p className="font-brand mt-2 text-3xl font-bold tabular-nums text-[#3d1212] sm:text-4xl">
                    {stat.value}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="pb-12 sm:pb-14">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-[#e8dfd6] bg-white p-6 shadow-[0_4px_40px_-14px_rgba(45,16,16,0.1)] sm:p-9">
            <h2 className="font-brand text-2xl font-bold text-[#3d1212] sm:text-3xl">Our mission</h2>
            <p className="mt-4 max-w-3xl text-sm font-medium leading-relaxed text-[#4b2220] sm:text-base">
              We help people get where they need to go, when they need to go. By combining local
              operational excellence with real-time technology, we create a seamless transportation
              experience for riders and meaningful earning opportunities for drivers.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-12 sm:pb-14" aria-labelledby="about-trust-spotlight-heading">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14 xl:gap-16">
            <div>
              <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
                Trust &amp; safety
              </p>
              <h2
                id="about-trust-spotlight-heading"
                className="font-brand mt-2 text-2xl font-bold leading-tight text-[#3d1212] sm:text-3xl lg:text-[2rem]"
              >
                Protection on every trip
              </h2>
              <p className="mt-4 max-w-lg text-sm font-medium leading-relaxed text-[#4b2220] sm:text-base">
                From driver verification to live trip status and 24/7 support, we design each ride so you always
                know who is driving, where you are, and how to reach us—without compromising your privacy.
              </p>
              <a
                href="#about-innovations"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#3d1212] px-7 py-3.5 text-sm font-bold text-white shadow-[0_4px_24px_-10px_rgba(0,0,0,0.35)] transition hover:bg-[#2a0c0c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a1515] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5EFE6]"
              >
                Read more
                <span aria-hidden>→</span>
              </a>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
              <div className="rounded-3xl border border-[#e8dfd6] bg-white p-3 shadow-[0_20px_50px_-24px_rgba(45,16,16,0.22)] sm:p-4">
                <div className="relative overflow-hidden rounded-2xl">
                  <img
                    src="/welcome-suburban-high-country.jpg"
                    alt="Premium JO vehicle representing secure, professional service"
                    className="aspect-[4/3] h-full w-full object-cover object-center grayscale"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1a1010]/50 via-transparent to-[#1a1010]/20" aria-hidden />

                  <div
                    className="jo-about-spotlight-badge-top pointer-events-none absolute -top-1 left-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-[#22c55e] text-[#14532d] ring-[3px] ring-white"
                    aria-hidden
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="8" r="3" />
                      <path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div
                    className="pointer-events-none absolute -bottom-1 left-1/2 z-20 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full bg-[#22c55e] text-[#14532d] shadow-[0_4px_14px_rgba(34,197,94,0.45)] ring-[3px] ring-white"
                    aria-hidden
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="8" r="3" />
                      <path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" strokeLinecap="round" />
                    </svg>
                  </div>

                  <div
                    className="jo-about-spotlight-shield pointer-events-none absolute right-3 top-3 z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/35 backdrop-blur-sm"
                    aria-hidden
                  >
                    <svg
                      className="h-9 w-9 text-white drop-shadow-md"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M12 3 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-4Z" strokeLinejoin="round" />
                      <path d="M9 11h6v5a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-5Z" strokeLinejoin="round" />
                      <path d="M10 11V9a2 2 0 1 1 4 0v2" strokeLinecap="round" />
                    </svg>
                  </div>

                  <div
                    className="jo-about-spotlight-chip pointer-events-none absolute left-3 top-1/2 z-10 rounded-lg border border-white/40 bg-white/20 px-2 py-2 shadow-lg backdrop-blur-md"
                    aria-hidden
                  >
                    <div className="flex items-center gap-2 text-white">
                      <span className="text-xs font-bold leading-none opacity-90">×</span>
                      <span className="flex flex-col gap-1">
                        <span className="h-0.5 w-8 rounded-full bg-white/90" />
                        <span className="h-0.5 w-5 rounded-full bg-white/70" />
                      </span>
                    </div>
                  </div>

                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                    <span className="jo-about-spotlight-play flex h-16 w-16 items-center justify-center rounded-full bg-white/92 text-[#3d1212] shadow-[0_8px_30px_rgba(0,0,0,0.25)] ring-4 ring-white/50 backdrop-blur-sm sm:h-[4.5rem] sm:w-[4.5rem]">
                      <svg className="ml-1 h-6 w-6 sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M8 5v14l11-7L8 5Z" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="about-innovations" className="scroll-mt-28 pb-12 sm:pb-14">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:max-w-xl lg:text-left">
            <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
              Innovations
            </p>
            <h2 className="font-brand mt-2 text-2xl font-bold text-[#3d1212] sm:text-3xl">
              Technology that keeps trips smooth
            </h2>
            <p className="mt-3 text-sm font-medium leading-relaxed text-[#5a4540] sm:text-base">
              We invest in products and systems that make every ride more reliable—for riders waiting curbside and
              drivers on the road.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:gap-5">
            {innovationItems.map((item) => (
              <article
                key={item.title}
                className="flex gap-4 rounded-2xl border border-[#e8dfd6] bg-white p-5 shadow-[0_2px_24px_-12px_rgba(45,16,16,0.08)] sm:p-6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FFFCF9] ring-1 ring-[#e8dfd6]/80">
                  <svg
                    className="h-6 w-6 text-[#a68966]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    {item.icon}
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-accent text-[10px] font-bold uppercase tracking-[0.18em] text-[#96724a]">
                    {item.tag}
                  </p>
                  <h3 className="font-brand mt-1 text-base font-bold text-[#4a1515] sm:text-lg">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#4b2220]">{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-12 sm:pb-14">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
              What we value
            </p>
            <h2 className="font-brand mt-2 text-2xl font-bold text-[#3d1212] sm:text-3xl">
              Principles that guide us
            </h2>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-5 sm:gap-6">
            {valueCards.map((item) => (
              <article
                key={item.title}
                className="flex w-full max-w-[20.5rem] flex-1 flex-col rounded-2xl border border-[#e8dfd6] bg-white p-6 text-center shadow-[0_2px_24px_-12px_rgba(45,16,16,0.08)] sm:min-h-[210px] sm:max-w-[22rem] sm:p-7"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFFCF9] ring-1 ring-[#e8dfd6]/80">
                  <svg
                    className="h-7 w-7 text-[#a68966]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    {item.icon}
                  </svg>
                </div>
                <h3 className="font-brand mt-4 text-base font-bold text-[#4a1515] sm:text-lg">{item.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[#4b2220]">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-12 sm:pb-14">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
              Leadership
            </p>
            <h2 className="font-brand mt-2 text-2xl font-bold text-[#3d1212] sm:text-3xl">
              The team behind JO
            </h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {leaders.map((leader) => (
              <article
                key={leader.name}
                className="rounded-2xl border border-[#e8dfd6] bg-white p-6 shadow-[0_2px_24px_-12px_rgba(45,16,16,0.08)] sm:p-7"
              >
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-[#4a1515] font-brand text-xl font-bold text-white shadow-inner">
                  {leader.initials}
                </div>
                <p className="mt-5 text-center font-brand text-lg font-bold text-[#3d1212]">{leader.name}</p>
                <p className="mt-1 text-center text-sm font-medium text-[#96724a]">{leader.role}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-20">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-[#e8dfd6] bg-white p-6 shadow-[0_4px_40px_-14px_rgba(45,16,16,0.1)] sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-9">
            <div className="max-w-xl">
              <h3 className="font-brand text-xl font-bold text-[#3d1212] sm:text-2xl">Join us on the journey</h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-[#5a4540] sm:text-base">
                Whether you ride, drive, or build with us, you are part of the future of mobility.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:mt-0 sm:shrink-0 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={() => navigateToPage('rider')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4a1515] px-6 py-3.5 text-sm font-bold text-white shadow-[0_4px_20px_-8px_rgba(74,21,21,0.4)] transition hover:bg-[#3d1212] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a1515] focus-visible:ring-offset-2 sm:w-auto"
              >
                Book a ride
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
