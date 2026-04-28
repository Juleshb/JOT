import { useEffect, useId, useRef, useState } from 'react'

export default function AuthModal({
  open,
  onClose,
  darkMode,
  googleButtonRef,
  googleClientId,
  authBusy,
  authError,
  onLogin,
  onRegister,
}) {
  const titleId = useId()
  const panelRef = useRef(null)
  const [mode, setMode] = useState('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPassword2, setRegPassword2] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regRole, setRegRole] = useState('RIDER')
  const [vehMake, setVehMake] = useState('')
  const [vehModel, setVehModel] = useState('')
  const [vehColor, setVehColor] = useState('')
  const [vehPlate, setVehPlate] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!open) return undefined
    setLocalError('')
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setLocalError('')
    }
  }, [mode, open])

  if (!open) return null

  const panelClass = `relative z-10 w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl ${
    darkMode ? 'border-[#9d3733]/45 bg-[#111] text-[#f2e3bb]' : 'border-[#9d3733]/35 bg-[#fff8eb] text-[#2d100f]'
  }`

  const inputClass = `w-full rounded-xl border px-4 py-3 text-sm outline-none ${
    darkMode
      ? 'border-[#9d3733]/50 bg-black text-[#f2e3bb] placeholder:text-[#f2e3bb]/45'
      : 'border-[#9d3733]/35 bg-white text-[#2d100f] placeholder:text-[#9d3733]/55'
  }`

  const tabBtn = (active) =>
    `flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
      active
        ? 'bg-[#9d3733] text-[#f2e3bb]'
        : darkMode
          ? 'text-[#f2e3bb]/70 hover:bg-white/5'
          : 'text-[#2d100f]/70 hover:bg-[#9d3733]/10'
    }`

  const handleLoginSubmit = (e) => {
    e.preventDefault()
    setLocalError('')
    if (!loginEmail.trim() || !loginPassword) {
      setLocalError('Enter email and password.')
      return
    }
    onLogin({ email: loginEmail, password: loginPassword })
  }

  const handleRegisterSubmit = (e) => {
    e.preventDefault()
    setLocalError('')
    if (!regName.trim() || !regEmail.trim() || !regPassword) {
      setLocalError('Name, email, and password are required.')
      return
    }
    if (regPassword.length < 8) {
      setLocalError('Password must be at least 8 characters.')
      return
    }
    if (regPassword !== regPassword2) {
      setLocalError('Passwords do not match.')
      return
    }
    if (regRole === 'DRIVER') {
      if (!vehMake.trim() || !vehModel.trim() || !vehColor.trim() || !vehPlate.trim()) {
        setLocalError('Drivers must provide vehicle make, model, color, and license plate.')
        return
      }
    }
    onRegister({
      name: regName,
      email: regEmail,
      password: regPassword,
      phone: regPhone || null,
      role: regRole,
      vehicle:
        regRole === 'DRIVER'
          ? {
              make: vehMake.trim(),
              model: vehModel.trim(),
              color: vehColor.trim(),
              licensePlate: vehPlate.trim(),
            }
          : undefined,
    })
  }

  const displayError = localError || authError

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-hidden />
      <div
        ref={panelRef}
        className={panelClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#9d3733]/25 px-5 py-4">
          <div>
            <h2 id={titleId} className="font-brand text-xl font-bold">
              Account
            </h2>
            <p className="mt-0.5 text-xs opacity-75">
              Sign in with email or Google, or create a new account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-lg leading-none opacity-70 transition hover:bg-[#9d3733]/15 hover:opacity-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4 flex gap-1 rounded-xl bg-black/10 p-1 dark:bg-white/5">
            <button type="button" className={tabBtn(mode === 'login')} onClick={() => setMode('login')}>
              Log in
            </button>
            <button
              type="button"
              className={tabBtn(mode === 'register')}
              onClick={() => setMode('register')}
            >
              Create account
            </button>
          </div>

          {displayError && (
            <p className="mb-3 rounded-lg border border-[#9d3733]/40 bg-[#9d3733]/10 px-3 py-2 text-sm text-[#9d3733]">
              {displayError}
            </p>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold opacity-80">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold opacity-80">Password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={authBusy}
                className="w-full rounded-xl bg-[#9d3733] py-3 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:opacity-60"
              >
                {authBusy ? 'Signing in…' : 'Log in'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold opacity-80">Full name</label>
                <input
                  type="text"
                  autoComplete="name"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className={inputClass}
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold opacity-80">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold opacity-80">Phone (optional)</label>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  className={inputClass}
                  placeholder="+1 …"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold opacity-80">Password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className={inputClass}
                    placeholder="8+ characters"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold opacity-80">Confirm</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={regPassword2}
                    onChange={(e) => setRegPassword2(e.target.value)}
                    className={inputClass}
                    placeholder="Repeat"
                  />
                </div>
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold opacity-80">I am a</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRegRole('RIDER')}
                    className={`flex-1 rounded-xl border py-2 text-sm font-bold transition ${
                      regRole === 'RIDER'
                        ? 'border-[#9d3733] bg-[#9d3733]/20 text-[#9d3733]'
                        : 'border-[#9d3733]/30 opacity-80'
                    }`}
                  >
                    Rider
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegRole('DRIVER')}
                    className={`flex-1 rounded-xl border py-2 text-sm font-bold transition ${
                      regRole === 'DRIVER'
                        ? 'border-[#9d3733] bg-[#9d3733]/20 text-[#9d3733]'
                        : 'border-[#9d3733]/30 opacity-80'
                    }`}
                  >
                    Driver
                  </button>
                </div>
              </div>
              {regRole === 'DRIVER' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={vehMake}
                    onChange={(e) => setVehMake(e.target.value)}
                    className={inputClass}
                    placeholder="Make"
                  />
                  <input
                    type="text"
                    value={vehModel}
                    onChange={(e) => setVehModel(e.target.value)}
                    className={inputClass}
                    placeholder="Model"
                  />
                  <input
                    type="text"
                    value={vehColor}
                    onChange={(e) => setVehColor(e.target.value)}
                    className={inputClass}
                    placeholder="Color"
                  />
                  <input
                    type="text"
                    value={vehPlate}
                    onChange={(e) => setVehPlate(e.target.value)}
                    className={inputClass}
                    placeholder="License plate"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={authBusy}
                className="w-full rounded-xl bg-[#9d3733] py-3 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:opacity-60"
              >
                {authBusy ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          )}

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#9d3733]/25" />
            <span className="text-[11px] font-semibold uppercase tracking-wider opacity-60">or</span>
            <span className="h-px flex-1 bg-[#9d3733]/25" />
          </div>

          {googleClientId ? (
            <div className="flex justify-center">
              <div ref={googleButtonRef} />
            </div>
          ) : (
            <p className="text-center text-[11px] text-[#9d3733]">
              Add <code className="rounded bg-black/10 px-1">VITE_GOOGLE_CLIENT_ID</code> to use Google.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
