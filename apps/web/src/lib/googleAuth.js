/** True when VITE_GOOGLE_CLIENT_ID is a real Google OAuth Web client ID. */
export function resolveGoogleWebClientId(raw) {
  const id = (raw ?? '').trim().replace(/^["']|["']$/g, '');
  if (!id || id === 'n' || id === 'your-web-client-id.apps.googleusercontent.com') {
    return '';
  }
  if (!id.endsWith('.apps.googleusercontent.com')) {
    return '';
  }
  return id;
}
