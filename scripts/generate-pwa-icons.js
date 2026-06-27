import { Jimp } from 'jimp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src', 'assets', 'Logo2.png')
const OUT = join(ROOT, 'public', 'icons')

async function main() {
  console.log('Reading logo...')
  const logo = await Jimp.read(SRC)

  // Crop to square center
  const w = logo.bitmap.width
  const h = logo.bitmap.height
  const size = Math.min(w, h)
  const offsetX = Math.floor((w - size) / 2)
  const offsetY = Math.floor((h - size) / 2)
  const square = logo.clone().crop({ x: offsetX, y: offsetY, w: size, h: size })

  // Generate PWA icons
  const sizes = [192, 512]
  for (const s of sizes) {
    const icon = new Jimp({ width: s, height: s, color: 0xff000000 })
    const logoSize = Math.round(s * 0.68)
    const pad = Math.round((s - logoSize) / 2)
    const logoResized = await square.clone().resize({ w: logoSize, h: logoSize })
    icon.composite(logoResized, pad, pad)
    await icon.write(join(OUT, `icon-${s}.png`))
    console.log(`  ✓ icons/icon-${s}.png (${s}x${s})`)
  }

  console.log('\nDone — PWA icons generated')
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
