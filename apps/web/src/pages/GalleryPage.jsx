import { useCallback, useEffect, useState } from 'react'
import { listGalleryImages } from '../lib/api'

const PAGE_BG = '#F5EFE6'
const PANEL_BG = '#FFFCF9'

export default function GalleryPage({ navigateToPage }) {
  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const loadImages = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const data = await listGalleryImages()
      setImages(Array.isArray(data?.images) ? data.images : [])
    } catch (e) {
      setError(e.message || 'Could not load the gallery.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    loadImages()
  }, [loadImages])

  useEffect(() => {
    if (lightboxIndex == null) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowRight') {
        setLightboxIndex((i) => (i == null ? i : (i + 1) % images.length))
      }
      if (e.key === 'ArrowLeft') {
        setLightboxIndex((i) =>
          i == null ? i : (i - 1 + images.length) % images.length,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, images.length])

  const lightboxImage = lightboxIndex != null ? images[lightboxIndex] : null

  return (
    <div className="text-[#2d100f]" style={{ backgroundColor: PAGE_BG }}>
      <section className="scroll-mt-28 pb-10 pt-24 sm:pb-12 sm:pt-28">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-accent text-[11px] font-bold uppercase tracking-[0.22em] text-[#96724a]">
              JO Transportation gallery
            </p>
            <h1 className="font-brand mt-3 text-[2rem] font-bold leading-[1.12] tracking-tight text-[#3d1212] sm:text-4xl sm:leading-[1.08]">
              <span className="text-[#4a1515]">Our fleet</span>
              <br />
              <span className="text-[#96724a]">&amp; moments on the road</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[0.98rem] font-medium leading-relaxed text-[#3d2a28] sm:text-[1.0625rem]">
              Browse photos of our vehicles and service. Images are curated by our team and updated
              regularly.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-20">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          {error && (
            <div
              className="mb-6 rounded-2xl border border-[#9d3733]/40 px-4 py-3 text-sm text-[#9d3733]"
              style={{ backgroundColor: PANEL_BG }}
            >
              {error}{' '}
              <button
                type="button"
                onClick={loadImages}
                className="font-bold underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          )}

          {busy ? (
            <p className="text-sm font-medium text-[#96724a]">Loading gallery…</p>
          ) : images.length === 0 ? (
            <div
              className="rounded-3xl border border-[#e8dfd6] px-6 py-14 text-center shadow-[0_4px_40px_-14px_rgba(45,16,16,0.1)]"
              style={{ backgroundColor: PANEL_BG }}
            >
              <p className="font-brand text-xl font-bold text-[#3d1212]">No photos yet</p>
              <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-relaxed text-[#3d2a28]">
                Check back soon — our team is adding images of the fleet and trips.
              </p>
              <button
                type="button"
                onClick={() => navigateToPage('contact')}
                className="mt-6 rounded-xl bg-[#9d3733] px-5 py-2.5 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b]"
              >
                Contact us
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((img, index) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  className="group overflow-hidden rounded-2xl border border-[#e8dfd6] text-left shadow-[0_4px_28px_-16px_rgba(45,16,16,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_36px_-16px_rgba(45,16,16,0.28)]"
                  style={{ backgroundColor: PANEL_BG }}
                >
                  <div className="aspect-[4/3] overflow-hidden bg-[#e8dfd6]">
                    <img
                      src={img.url}
                      alt={img.description || 'Gallery image'}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  </div>
                  {img.description && (
                    <div className="px-4 py-3">
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-[#3d1212]">
                        {img.description}
                      </p>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxImage.description || 'Gallery image'}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-white/20"
            onClick={() => setLightboxIndex(null)}
          >
            Close
          </button>
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous image"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-lg font-bold text-white transition hover:bg-white/20 sm:left-6"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((i) => (i - 1 + images.length) % images.length)
                }}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next image"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-lg font-bold text-white transition hover:bg-white/20 sm:right-6"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((i) => (i + 1) % images.length)
                }}
              >
                ›
              </button>
            </>
          )}
          <figure
            className="max-h-[90vh] max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.url}
              alt={lightboxImage.description || 'Gallery image'}
              className="max-h-[80vh] w-auto max-w-full rounded-xl object-contain"
            />
            {lightboxImage.description && (
              <figcaption className="mt-3 text-center text-sm font-medium text-white/90">
                {lightboxImage.description}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </div>
  )
}
