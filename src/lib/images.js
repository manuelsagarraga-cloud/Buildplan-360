/**
 * Compresión de imágenes en el navegador antes de subir.
 * Máx 1920px de lado, JPEG 80%. No toca imágenes ya livianas (<200KB) ni GIFs.
 * Usada por el libro de obra (escritorio y móvil).
 */
export async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  if (file.size < 200 * 1024) return file
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const MAX = 1920
      let w = img.width, h = img.height
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else { w = Math.round(w * MAX / h); h = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.8)
    }
    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}
