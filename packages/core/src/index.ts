export function initFetchDoctor() {
  if (typeof window === 'undefined') {
    console.warn('[fetch-doctor]: Node environment detected. Interceptors disabled.');
    return;
  }
}
