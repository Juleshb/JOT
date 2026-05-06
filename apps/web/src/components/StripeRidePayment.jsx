import { useState } from 'react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ?? ''

export const stripePublishableConfigured = Boolean(publishableKey)

const stripePromise = publishableKey ? loadStripe(publishableKey) : null

function PaymentForm({ darkMode, onSucceeded, onError }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    onError('')
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })

      if (error) {
        onError(error.message ?? 'Your card could not be charged.')
        return
      }

      if (paymentIntent?.status === 'succeeded' && paymentIntent.id) {
        onSucceeded(paymentIntent.id)
      } else {
        onError(`Payment status: ${paymentIntent?.status ?? 'unknown'}. Try again or use cash.`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        className={`rounded-xl border p-3 ${
          darkMode ? 'border-[#9d3733]/35 bg-black/50' : 'border-[#e8dfd6] bg-white'
        }`}
      >
        <PaymentElement />
      </div>
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-xl bg-[#4a1515] py-3 text-sm font-bold text-white transition hover:bg-[#3d1212] disabled:opacity-60"
      >
        {submitting ? 'Processing…' : 'Pay and request ride'}
      </button>
    </form>
  )
}

export function StripeRidePayment({ clientSecret, darkMode, onSucceeded, onError }) {
  if (!stripePromise || !clientSecret) {
    return null
  }

  const options = {
    clientSecret,
    appearance: {
      theme: darkMode ? 'night' : 'stripe',
      variables: {
        colorPrimary: '#4a1515',
        borderRadius: '12px',
      },
    },
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentForm darkMode={darkMode} onSucceeded={onSucceeded} onError={onError} />
    </Elements>
  )
}
