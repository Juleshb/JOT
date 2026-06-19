import { useEffect } from 'react'
import { applyPageSeo } from '../lib/seo'

export default function usePageSeo(activePage) {
  useEffect(() => {
    applyPageSeo(activePage)
  }, [activePage])
}
