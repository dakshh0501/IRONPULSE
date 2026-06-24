export function extractDominantColor(img) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const size = 50
  canvas.width = size
  canvas.height = size
  ctx.drawImage(img, 0, 0, size, size)

  const imageData = ctx.getImageData(0, 0, size, size)
  const data = imageData.data

  const colorCounts = {}
  let maxCount = 0
  let dominantColor = '#e8420a'

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a < 128) continue

    const roundedR = Math.round(r / 32) * 32
    const roundedG = Math.round(g / 32) * 32
    const roundedB = Math.round(b / 32) * 32

    const key = `${roundedR},${roundedG},${roundedB}`
    colorCounts[key] = (colorCounts[key] || 0) + 1

    if (colorCounts[key] > maxCount) {
      maxCount = colorCounts[key]
      dominantColor = `#${roundedR.toString(16).padStart(2, '0')}${roundedG.toString(16).padStart(2, '0')}${roundedB.toString(16).padStart(2, '0')}`
    }
  }

  return dominantColor
}
