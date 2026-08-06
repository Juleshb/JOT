/** Collect all configured Google OAuth client IDs used as ID-token audiences. */
export function getGoogleClientIds(): string[] {
  const chunks = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_IDS,
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ];

  const ids = chunks
    .flatMap((raw) => (raw ?? '').split(','))
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);

  return [...new Set(ids)];
}
