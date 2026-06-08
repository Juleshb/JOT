/** Comma-separated Web / iOS / Android OAuth client IDs from Google Cloud Console. */
export function getGoogleClientIds(): string[] {
  const raw = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_IDS ?? '';
  const ids = raw
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  return [...new Set(ids)];
}
