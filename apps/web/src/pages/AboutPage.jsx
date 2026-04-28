export default function AboutPage({ darkMode, navigateToPage }) {
  const sectionShell = `mx-auto w-full max-w-6xl px-6 ${
    darkMode ? 'text-[#f2e3bb]' : 'text-[#2d100f]'
  }`

  const cardClass = `rounded-2xl border p-6 transition-colors duration-300 ${
    darkMode ? 'border-[#9d3733]/40 bg-[#101010]' : 'border-[#9d3733]/30 bg-[#fff8eb]'
  }`

  const valueCards = [
    {
      title: 'Safety first',
      body: 'Every trip is backed by verified drivers, rider support, and in-app safety tools.',
    },
    {
      title: 'Access for everyone',
      body: 'From daily commutes to late-night rides, we build reliable mobility for all.',
    },
    {
      title: 'Built with local insight',
      body: 'We partner with local drivers and communities to improve transport every day.',
    },
  ]

  const leaders = [
    { name: 'Aline M.', role: 'Chief Executive Officer' },
    { name: 'David K.', role: 'Chief Operations Officer' },
    { name: 'Ruth N.', role: 'Head of Safety' },
  ]

  return (
    <>
      <section className={`${sectionShell} pb-14 pt-28 md:pt-32`}>
        <p className="mb-4 inline-block rounded-full border border-[#9d3733] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#9d3733]">
          About JO
        </p>
        <h1
          className={`font-brand max-w-4xl text-4xl font-bold leading-tight sm:text-5xl ${
            darkMode ? 'text-white' : 'text-[#2d100f]'
          }`}
        >
          We reimagine how cities move, one ride at a time.
        </h1>
        <p className={`mt-5 max-w-3xl text-base sm:text-lg ${darkMode ? 'text-[#f2e3bb]/85' : 'text-[#4b2220]'}`}>
          JO Transportation is a technology platform connecting riders and drivers through safe,
          dependable, and transparent urban mobility.
        </p>
      </section>

      <section className={`${sectionShell} pb-14`}>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { label: 'Cities served', value: '18+' },
            { label: 'Completed trips', value: '2.5M+' },
            { label: 'Driver partners', value: '12k+' },
          ].map((stat) => (
            <article key={stat.label} className={cardClass}>
              <p className="text-sm uppercase tracking-wider text-[#9d3733]">{stat.label}</p>
              <p className={`mt-2 text-4xl font-bold ${darkMode ? 'text-white' : 'text-[#2d100f]'}`}>
                {stat.value}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${sectionShell} pb-14`}>
        <div className={cardClass}>
          <h2 className={`font-brand text-3xl font-bold ${darkMode ? 'text-white' : 'text-[#2d100f]'}`}>
            Our mission
          </h2>
          <p className={`mt-4 max-w-4xl text-base ${darkMode ? 'text-[#f2e3bb]/85' : 'text-[#4b2220]'}`}>
            We help people get where they need to go, when they need to go. By combining local
            operational excellence with real-time technology, we create a seamless transportation
            experience for riders and meaningful earning opportunities for drivers.
          </p>
        </div>
      </section>

      <section className={`${sectionShell} pb-14`}>
        <h2 className={`font-brand mb-6 text-3xl font-bold ${darkMode ? 'text-white' : 'text-[#2d100f]'}`}>
          What we value
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {valueCards.map((item) => (
            <article key={item.title} className={cardClass}>
              <h3 className={`font-accent text-xl font-bold ${darkMode ? 'text-white' : 'text-[#2d100f]'}`}>
                {item.title}
              </h3>
              <p className={`mt-3 text-sm ${darkMode ? 'text-[#f2e3bb]/80' : 'text-[#4b2220]'}`}>
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${sectionShell} pb-14`}>
        <h2 className={`font-brand mb-6 text-3xl font-bold ${darkMode ? 'text-white' : 'text-[#2d100f]'}`}>
          Leadership
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {leaders.map((leader) => (
            <article key={leader.name} className={cardClass}>
              <div className="mb-4 h-28 rounded-xl bg-gradient-to-br from-[#9d3733]/50 via-[#9d3733]/20 to-transparent" />
              <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-[#2d100f]'}`}>
                {leader.name}
              </p>
              <p className={`text-sm ${darkMode ? 'text-[#f2e3bb]/80' : 'text-[#4b2220]'}`}>
                {leader.role}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${sectionShell} pb-16`}>
        <div
          className={`flex flex-col items-start justify-between gap-5 rounded-2xl border p-6 md:flex-row md:items-center ${
            darkMode ? 'border-[#9d3733]/40 bg-[#0f0f0f]' : 'border-[#9d3733]/30 bg-[#fff8eb]'
          }`}
        >
          <div>
            <h3 className={`font-brand text-2xl font-bold ${darkMode ? 'text-white' : 'text-[#2d100f]'}`}>
              Join us on the journey
            </h3>
            <p className={`mt-2 text-sm ${darkMode ? 'text-[#f2e3bb]/80' : 'text-[#4b2220]'}`}>
              Whether you ride, drive, or build with us, you are part of the future of mobility.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigateToPage('rider')}
            className="font-accent rounded-lg bg-[#9d3733] px-6 py-3 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
          >
            Book a ride
          </button>
        </div>
      </section>
    </>
  )
}
