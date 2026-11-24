// A file the player keeps (an exported save or map) handed over to the device.
// On the phone (#420): written into the device's Downloads, under SovereignWill/, where a file manager finds it; if
// that can't be done (no permission, a device that won't have it), the system's Share sheet with the file instead.
// In a browser: the browser's own download (or its Share sheet where there's one for files).
// Returns where it went ('Download/SovereignWill/<name>'), true when shared or downloaded, false when the player
// cancelled the sharing.

const FOLDER = 'Download/SovereignWill';

/** @param {string} filename @param {string} data @param {string} [mimeType] @returns {Promise<string | boolean>} */
export async function exportFile(filename, data, mimeType = 'application/json') {
  const capacitor = /** @type {any} */ (window).Capacitor;
  if (capacitor?.isNativePlatform?.()) {
    const filesystem = capacitor.Plugins?.Filesystem;
    const share = capacitor.Plugins?.Share;
    if (!filesystem) throw new Error('Native file export requires the Filesystem plugin');
    // (utf8: without it the plugin takes the text for base64)
    try {
      if (filesystem.requestPermissions) {
        const status = await filesystem.checkPermissions().catch(() => null);
        if (status && status.publicStorage !== 'granted') await filesystem.requestPermissions();
      }
      await filesystem.writeFile({ path: `${FOLDER}/${filename}`, data, directory: 'EXTERNAL_STORAGE', encoding: 'utf8', recursive: true });
      return `${FOLDER}/${filename}`;
    } catch (error) {
      console.warn('Could not write the file into Downloads, sharing it instead', error);
    }
    if (!share) throw new Error('Native file export requires the Share plugin');
    const { uri } = await filesystem.writeFile({ path: `exports/${filename}`, data, directory: 'CACHE', encoding: 'utf8', recursive: true });
    if (!uri) throw new Error('Filesystem did not return an export URI');
    try {
      await share.share({ title: filename, dialogTitle: filename, files: [uri] });
    } catch (error) {
      if (/cancel/i.test(String(/** @type {any} */ (error)?.message))) return false;
      throw error;
    }
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
