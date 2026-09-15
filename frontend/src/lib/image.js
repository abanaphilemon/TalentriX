// Reads an image File and returns a downscaled data URL. Phone photos are
// often 2-8 MB, so we shrink them on a canvas before storing — this keeps
// uploads light and avoids the old "must be under 1 MB" failure on phones.
export function readImageFile(file, { maxSize = 1024, forcePng = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image. Try another.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image. Try another.'));
      img.onload = () => {
        try {
          const limit = Math.max(64, maxSize || 1024);
          const scale = Math.min(1, limit / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not process that image.');
          ctx.drawImage(img, 0, 0, w, h);
          const usePng = forcePng || file.type.toLowerCase().includes('png');
          resolve(canvas.toDataURL(usePng ? 'image/png' : 'image/jpeg', 0.85));
        } catch (err) {
          reject(err);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}