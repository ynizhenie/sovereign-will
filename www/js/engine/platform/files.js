export async function exportFile(filename, data, mimeType = 'application/json') {
  const capacitor = window.Capacitor;
  if (capacitor?.isNativePlatform?.()) {
    const filesystem = capacitor.Plugins?.Filesystem;
    const share = capacitor.Plugins?.Share;
    if (!filesystem || !share) throw new Error('Native file export requires Filesystem and Share plugins');
    const { uri } = await filesystem.writeFile({
      path: `exports/${filename}`,
      data,
      directory: 'CACHE',
      recursive: true
    });
    if (!uri) throw new Error('Filesystem did not return an export URI');
    await share.share({ title: filename, dialogTitle: filename, files: [uri] });
    return true;
  }

  const file = new File([data], filename, { type: mimeType });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: filename, files: [file] });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      throw error;
    }
  }

  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
