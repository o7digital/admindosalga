export function safeRedirect(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://dosalga.invalid');
    if (url.origin !== 'https://dosalga.invalid' || /^\/(sign-in|change-password|api)(\/|$)/.test(url.pathname)) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}
