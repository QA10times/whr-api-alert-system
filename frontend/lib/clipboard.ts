// lib/clipboard.ts — section 9.1
export async function copyFromPromise(textPromise: Promise<string>): Promise<boolean> {
  try {
    if (window.isSecureContext && 'ClipboardItem' in window && navigator.clipboard?.write) {
      const blob = textPromise.then((t) => new Blob([t], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return true;
    }
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(await textPromise);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false; // caller opens CurlFallbackDialog
}
