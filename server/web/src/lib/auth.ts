// The PKCE exchange runs entirely server-side at /auth/callback. The SPA only
// needs to bounce the user to /auth/login, which the server redirects to the
// IdP's authorization endpoint.
export function startLogin(returnTo: string): void {
  const url = `/auth/login?redirect=${encodeURIComponent(returnTo)}`;
  window.location.assign(url);
}
