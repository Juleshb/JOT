import { useCallback, useEffect, useRef, useState } from 'react'
import { adminDeleteGalleryImage, adminUploadGalleryImages, listGalleryImages } from '../../lib/api'
import { adminCardClass, adminInputClass } from '../../lib/adminTheme'

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function AdminGallery({ darkMode, authToken }) {
  const cardClass = adminCardClass(darkMode)
  const inputClass = adminInputClass(darkMode)
  const fileInputRef = useRef(null)

  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [description, setDescription] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [deletingId, setDeletingId] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const loadImages = useCallback(async () => {
    if (!authToken) return
    setBusy(true)
    setError('')
    try {
      const data = await listGalleryImages()
      setImages(Array.isArray(data?.images) ? data.images : [])
    } catch (e) {
      setError(e.message || 'Failed to load gallery.')
    } finally {
      setBusy(false)
    }
  }, [authToken])

  useEffect(() => {
    loadImages()
  }, [loadImages])

  const onPickFiles = (fileList) => {
    const next = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'))
    setSelectedFiles(next)
    setError('')
  }

  const onUpload = async () => {
    if (!authToken || selectedFiles.length === 0) return
    setUploading(true)
    setError('')
    try {
      await adminUploadGalleryImages(authToken, selectedFiles, {
        description: description.trim() || undefined,
      })
      setSelectedFiles([])
      setDescription('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadImages()
    } catch (e) {
      setError(e.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const onDelete = async (id) => {
    if (!authToken || !id) return
    if (!window.confirm('Delete this image from the gallery?')) return
    setDeletingId(id)
    setError('')
    try {
      await adminDeleteGalleryImage(authToken, id)
      setImages((prev) => prev.filter((img) => img.id !== id))
    } catch (e) {
      setError(e.message || 'Could not delete image.')
    } finally {
      setDeletingId('')
    }
  }

  return (
    <>
      <header>
        <h2 className="font-brand text-xl font-bold sm:text-2xl">Gallery</h2>
        <p className="mt-1 text-sm opacity-80">
          Upload and manage images for the site gallery. JPEG, PNG, WebP, and GIF up to 8 MB each.
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-[#9d3733]/50 bg-[#9d3733]/10 px-4 py-3 text-sm text-[#9d3733]">
          {error}
        </p>
      )}

      <div className={cardClass}>
        <h3 className="font-accent text-lg font-bold">Upload images</h3>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold opacity-70">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Black Suburban at DFW arrivals"
              maxLength={280}
              rows={2}
              className={`${inputClass} resize-y`}
            />
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              onPickFiles(e.dataTransfer.files)
            }}
            className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
              dragOver
                ? 'border-[#9d3733] bg-[#9d3733]/10'
                : darkMode
                  ? 'border-[#9d3733]/40 bg-black/30'
                  : 'border-[#9d3733]/30 bg-white/60'
            }`}
          >
            <p className="text-sm font-semibold text-[#9d3733]">
              Drag & drop images here, or choose files
            </p>
            <p className="mt-1 text-xs opacity-70">Up to 12 images per upload</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="mt-4 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#9d3733] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#f2e3bb]"
              onChange={(e) => onPickFiles(e.target.files)}
            />
          </div>

          {selectedFiles.length > 0 && (
            <ul className="space-y-1 text-sm opacity-90">
              {selectedFiles.map((f) => (
                <li key={`${f.name}-${f.size}-${f.lastModified}`}>
                  {f.name} · {formatBytes(f.size)}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={onUpload}
            disabled={uploading || selectedFiles.length === 0}
            className="w-full rounded-xl bg-[#9d3733] px-4 py-2.5 text-sm font-bold text-[#f2e3bb] transition hover:bg-[#842f2b] disabled:opacity-50 sm:w-auto"
          >
            {uploading
              ? 'Uploading…'
              : selectedFiles.length
                ? `Upload ${selectedFiles.length} image${selectedFiles.length === 1 ? '' : 's'}`
                : 'Select images to upload'}
          </button>
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-accent text-lg font-bold">
            Library {busy ? '' : `(${images.length})`}
          </h3>
          <button
            type="button"
            onClick={loadImages}
            disabled={busy}
            className="rounded-lg border border-[#9d3733]/50 px-3 py-1.5 text-xs font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10 disabled:opacity-50"
          >
            {busy ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {!busy && images.length === 0 ? (
          <p className="mt-6 text-sm opacity-70">No gallery images yet. Upload your first batch above.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img) => (
              <figure
                key={img.id}
                className={`overflow-hidden rounded-xl border ${
                  darkMode ? 'border-[#9d3733]/35 bg-black/40' : 'border-[#9d3733]/20 bg-white'
                }`}
              >
                <div className="aspect-[4/3] overflow-hidden bg-[#9d3733]/10">
                  <img
                    src={img.url}
                    alt={img.description || 'Gallery image'}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <figcaption className="space-y-1 p-3 text-xs">
                  {img.description ? (
                    <p className="line-clamp-2 font-medium leading-snug">{img.description}</p>
                  ) : (
                    <p className="opacity-50">No description</p>
                  )}
                  <p className="opacity-60">{formatDate(img.createdAt)}</p>
                  <button
                    type="button"
                    onClick={() => onDelete(img.id)}
                    disabled={deletingId === img.id}
                    className="mt-2 rounded-lg border border-[#9d3733]/50 px-2.5 py-1 text-xs font-bold text-[#9d3733] transition hover:bg-[#9d3733]/10 disabled:opacity-50"
                  >
                    {deletingId === img.id ? 'Deleting…' : 'Delete'}
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
