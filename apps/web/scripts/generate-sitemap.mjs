import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'
import { PUBLIC_INDEXABLE_PATHS } from '../src/lib/seo.js'

const root = resolve(import.meta.dirname, '..')
const env = loadEnv(process.env.NODE_ENV === 'development' ? 'development' : 'production', root, '')
const siteUrl = (env.VITE_SITE_URL || 'https://jotransportation.xyz').replace(/\/$/, '')
const lastmod = new Date().toISOString().slice(0, 10)

const urls = PUBLIC_INDEXABLE_PATHS.map(
  (path) => `  <url>
    <loc>${siteUrl}${path === '/' ? '' : path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${path === '/' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${path === '/' ? '1.0' : path === '/ride' ? '0.9' : '0.7'}</priority>
  </url>`,
).join('\n')

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

writeFileSync(resolve(root, 'public/sitemap.xml'), sitemap)
console.log(`Generated sitemap for ${siteUrl}`)
