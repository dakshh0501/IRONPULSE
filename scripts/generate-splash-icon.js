import { Jimp } from 'jimp'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src', 'assets', 'Logo2.png')
const DRAWABLE = join(ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable')

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

  // splash.png — 108x108 centered on black canvas (for legacy splashes)
  const splash = new Jimp({ width: 108, height: 108, color: 0xff000000 })
  const logoSize = 76
  const pad = Math.round((108 - logoSize) / 2)
  const logoResized = await square.clone().resize({ w: logoSize, h: logoSize })
  splash.composite(logoResized, pad, pad)
  await splash.write(join(DRAWABLE, 'splash.png'))
  console.log('  ✓ drawable/splash.png (108x108)')

  console.log('\nDone — splash icon generated')
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
