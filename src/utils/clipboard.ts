export type ClipboardCopyResult = 'success' | 'error';

export async function copyTextToClipboard(text: string): Promise<ClipboardCopyResult> {
  if (!navigator.clipboard?.writeText) {
    return 'error';
  }

  try {
    await navigator.clipboard.writeText(text);
    return 'success';
  } catch {
    return 'error';
  }
}
