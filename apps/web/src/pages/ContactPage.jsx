import { useMemo, useState } from 'react'
import { sendContactMessage } from '../lib/api'

const PAGE_BG = '#F5EFE6'
const PANEL_BG = '#FFFCF9'

export default function ContactPage({ navigateToPage }) {
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    preferredContactMethod: 'EMAIL',
    topic: 'General question',
    message: '',
  })
  const canSubmit = useMemo(() => {
    return (
      form.name.trim().length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
      (form.preferredContactMethod !== 'PHONE' || form.phone.trim().length >= 6) &&
      form.message.trim().length >= 10
    )
  }, [form.email, form.message, form.name, form.phone, form.preferredContactMethod])

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit || busy) return

    try {
      setBusy(true)
      setErrorMessage('')
      await sendContactMessage({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        company: form.company.trim() || undefined,
        preferredContactMethod: form.preferredContactMethod,
        topic: form.topic.trim(),
        message: form.message.trim(),
      })
      setSubmitted(true)
      setForm({
        name: '',
        email: '',
        phone: '',
        company: '',
        preferredContactMethod: 'EMAIL',
        topic: 'General question',
        message: '',
      })
    } catch (e2) {
      setErrorMessage(e2?.message || 'Could not send your message. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="text-[#2d100f]" style={{ backgroundColor: PAGE_BG }}>
      <section className="scroll-mt-28 pb-12 pt-24 sm:pb-14 sm:pt-28">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
              Contact JO Transportation
            </p>
            <h1 className="font-brand mt-3 text-[2rem] font-bold leading-[1.12] tracking-tight text-[#3d1212] sm:text-4xl sm:leading-[1.08]">
              <span className="text-[#4a1515]">Get in touch</span>
              <br />
              <span className="text-[#96724a]">We reply quickly</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[0.98rem] font-medium leading-relaxed text-[#3d2a28] sm:text-[1.0625rem]">
              Questions about rides, safety, billing, or partnerships? Send us a message and we will
              get back to you.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-20">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div
            className="rounded-3xl border border-[#e8dfd6] p-6 shadow-[0_4px_40px_-14px_rgba(45,16,16,0.1)] sm:p-8"
            style={{ backgroundColor: PANEL_BG }}
          >
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
              <div>
                <h2 className="font-brand text-2xl font-bold text-[#3d1212] sm:text-3xl">
                  Send a message
                </h2>

                <form onSubmit={submit} className="mt-6 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-[#4b2220]">Name</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        type="text"
                        required
                        className="w-full rounded-xl border border-[#e8dfd6] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#4a1515] focus:ring-2 focus:ring-[#4a1515]/15"
                        placeholder="Your full name"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold text-[#4b2220]">Email</label>
                      <input
                        value={form.email}
                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                        type="email"
                        required
                        className="w-full rounded-xl border border-[#e8dfd6] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#4a1515] focus:ring-2 focus:ring-[#4a1515]/15"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-[#4b2220]">
                        Phone <span className="opacity-70">(optional)</span>
                      </label>
                      <input
                        value={form.phone}
                        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                        type="tel"
                        className="w-full rounded-xl border border-[#e8dfd6] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#4a1515] focus:ring-2 focus:ring-[#4a1515]/15"
                        placeholder="+1 555 010 2026"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold text-[#4b2220]">
                        Company <span className="opacity-70">(optional)</span>
                      </label>
                      <input
                        value={form.company}
                        onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                        type="text"
                        className="w-full rounded-xl border border-[#e8dfd6] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#4a1515] focus:ring-2 focus:ring-[#4a1515]/15"
                        placeholder="Company or organization"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-[#4b2220]">
                      Preferred contact method
                    </label>
                    <select
                      value={form.preferredContactMethod}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, preferredContactMethod: e.target.value }))
                      }
                      className="w-full rounded-xl border border-[#e8dfd6] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#4a1515] focus:ring-2 focus:ring-[#4a1515]/15"
                    >
                      <option value="EMAIL">Email</option>
                      <option value="PHONE">Phone</option>
                    </select>
                    {form.preferredContactMethod === 'PHONE' && form.phone.trim().length < 6 ? (
                      <p className="mt-2 text-xs font-medium text-[#842f2b]">
                        Please add a valid phone number for phone replies.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-[#4b2220]">Topic</label>
                    <select
                      value={form.topic}
                      onChange={(e) => setForm((p) => ({ ...p, topic: e.target.value }))}
                      className="w-full rounded-xl border border-[#e8dfd6] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#4a1515] focus:ring-2 focus:ring-[#4a1515]/15"
                    >
                      <option>General question</option>
                      <option>Ride support</option>
                      <option>Billing</option>
                      <option>Safety</option>
                      <option>Partnerships</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-[#4b2220]">Message</label>
                    <textarea
                      value={form.message}
                      onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                      required
                      rows={5}
                      className="w-full resize-none rounded-xl border border-[#e8dfd6] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#4a1515] focus:ring-2 focus:ring-[#4a1515]/15"
                      placeholder="Tell us what you need help with..."
                    />
                    <p className="mt-2 text-xs opacity-80">
                      Tip: include ride id / date if this is ride-related.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={!canSubmit || busy}
                    className="w-full rounded-xl bg-[#4a1515] px-6 py-3.5 text-sm font-bold text-white shadow-[0_4px_20px_-8px_rgba(74,21,21,0.4)] transition hover:bg-[#3d1212] disabled:opacity-60"
                  >
                    {busy ? 'Sending...' : 'Send message'}
                  </button>

                  {errorMessage && (
                    <div className="rounded-2xl border border-[#e8dfd6] bg-white px-5 py-4 text-sm font-medium text-[#842f2b]">
                      {errorMessage}
                    </div>
                  )}

                  {submitted && (
                    <div className="rounded-2xl border border-[#e8dfd6] bg-white px-5 py-4 text-sm font-medium text-[#3d2a28]">
                      Thanks! Your message has been received. We will reply soon.
                    </div>
                  )}
                </form>
              </div>

              <div>
                <h2 className="font-brand text-2xl font-bold text-[#3d1212] sm:text-3xl">
                  Contact details
                </h2>
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl border border-[#e8dfd6] bg-white p-5">
                    <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
                      Support email
                    </p>
                    <p className="mt-2 text-base font-bold text-[#4a1515]">
                      jotransportation2@gmail.com
                    </p>
                    <p className="mt-1 text-sm opacity-80">Typically responds within 1 business day.</p>
                  </div>

                  <div className="rounded-2xl border border-[#e8dfd6] bg-white p-5">
                    <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
                      Phone
                    </p>
                    <p className="mt-2 text-base font-bold text-[#4a1515]">+1 (682) 786-1241</p>
                    <p className="mt-1 text-sm opacity-80">Mon-Fri, 9am to 5pm local time.</p>
                  </div>

                  <div className="rounded-2xl border border-[#e8dfd6] bg-white p-5">
                    <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
                      Location
                    </p>
                    <p className="mt-2 text-base font-bold text-[#4a1515]">
                      Dallas - Fort Worth, Texas, USA
                    </p>
                    <p className="mt-1 text-sm opacity-80">
                      We serve multiple cities. For immediate ride help, please message us.
                    </p>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-[#e8dfd6] bg-white">
                    <div className="border-b border-[#e8dfd6] px-5 py-3">
                      <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
                        Map location
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#4a1515]">
                        Dallas - Fort Worth, Texas, USA
                      </p>
                    </div>
                    <iframe
                      title="JO Transportation location map"
                      src="https://www.google.com/maps?q=Dallas%20Fort%20Worth%20Texas%20USA&output=embed"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      className="h-64 w-full"
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

