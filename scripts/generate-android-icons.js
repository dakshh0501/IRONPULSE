import { Jimp } from 'jimp'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src', 'assets', 'Logo2.png')
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res')

const DENSITIES = [
  { dir: 'mipmap-mdpi',     size: 48 },
  { dir: 'mipmap-hdpi',     size: 72 },
  { dir: 'mipmap-xhdpi',    size: 96 },
  { dir: 'mipmap-xxhdpi',   size: 144 },
  { dir: 'mipmap-xxxhdpi',  size: 192 },
]

async function main() {
  console.log('Reading logo...')
  const logo = await Jimp.read(SRC)
  const w = logo.bitmap.width
  const h = logo.bitmap.height
  console.log(`  Logo: ${w}x${h}`)

  // Crop to square (center)
  const size = Math.min(w, h)
  const offsetX = Math.floor((w - size) / 2)
  const offsetY = Math.floor((h - size) / 2)
  const square = logo.clone().crop({ x: offsetX, y: offsetY, w: size, h: size })

  for (const { dir, size: targetSize } of DENSITIES) {
    const outDir = join(RES, dir)
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

    // ic_launcher.png — logo on solid black square (pre-Android 8 fallback)
    const launcher = new Jimp({ width: targetSize, height: targetSize, color: 0xff000000 })
    const pad = Math.round(targetSize * 0.16)
    const logoSize = targetSize - pad * 2
    const logoResized = await square.clone().resize({ w: logoSize, h: logoSize })
    launcher.composite(logoResized, pad, pad)
    await launcher.write(join(outDir, 'ic_launcher.png'))
    console.log(`  ✓ ${dir}/ic_launcher.png`)

    // ic_launcher_round.png — same as launcher
    await launcher.clone().write(join(outDir, 'ic_launcher_round.png'))
    console.log(`  ✓ ${dir}/ic_launcher_round.png`)

    // ic_launcher_foreground.png — logo on transparent background for adaptive icon
    const fgSize = Math.round(targetSize * 0.72)
    const fg = new Jimp({ width: targetSize, height: targetSize, color: 0x00000000 })
    const fgLogo = await square.clone().resize({ w: fgSize, h: fgSize })
    const fgPad = Math.round((targetSize - fgSize) / 2)
    fg.composite(fgLogo, fgPad, fgPad)
    await fg.write(join(outDir, 'ic_launcher_foreground.png'))
    console.log(`  ✓ ${dir}/ic_launcher_foreground.png`)
  }

  // Rewrite adaptive icon XMLs to reference mipmap PNGs
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const file = join(RES, 'mipmap-anydpi-v26', name)
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
    writeFileSync(file, xml, 'utf-8')
    console.log(`  ✓ mipmap-anydpi-v26/${name}`)
  }

  console.log('\nDone — all Android icon resources generated from Logo2.png')
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
