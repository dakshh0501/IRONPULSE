import { Jimp } from 'jimp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src', 'assets', 'Logo2.png')
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res')

const SPLASHES = [
  { dir: 'drawable-land-mdpi',    w: 480,  h: 320  },
  { dir: 'drawable-land-hdpi',    w: 800,  h: 480  },
  { dir: 'drawable-land-xhdpi',   w: 1280, h: 720  },
  { dir: 'drawable-land-xxhdpi',  w: 1600, h: 960  },
  { dir: 'drawable-land-xxxhdpi', w: 1920, h: 1280 },
  { dir: 'drawable-port-mdpi',    w: 320,  h: 480  },
  { dir: 'drawable-port-hdpi',    w: 480,  h: 800  },
  { dir: 'drawable-port-xhdpi',   w: 720,  h: 1280 },
  { dir: 'drawable-port-xxhdpi',  w: 960,  h: 1600 },
  { dir: 'drawable-port-xxxhdpi', w: 1280, h: 1920 },
  { dir: 'drawable',              w: 320,  h: 480  }, // fallback
]

async function main() {
  console.log('Reading high-res logo...')
  const logo = await Jimp.read(SRC)
  console.log(`  Original: ${logo.bitmap.width}x${logo.bitmap.height}`)

  // Crop to square center
  const size = Math.min(logo.bitmap.width, logo.bitmap.height)
  const offsetX = Math.floor((logo.bitmap.width - size) / 2)
  const offsetY = Math.floor((logo.bitmap.height - size) / 2)
  const square = logo.clone().crop({ x: offsetX, y: offsetY, w: size, h: size })

  for (const { dir, w, h } of SPLASHES) {
    const outDir = join(RES, dir)
    const outFile = join(outDir, 'splash.png')

    // Create black canvas at exact screen resolution
    const splash = new Jimp({ width: w, height: h, color: 0xff000000 })

    // Logo size: 28% of the smaller dimension for crisp rendering
    const logoDim = Math.round(Math.min(w, h) * 0.28)
    const logoResized = await square.clone().resize({ w: logoDim, h: logoDim })
    const x = Math.round((w - logoDim) / 2)
    const y = Math.round((h - logoDim) / 2)
    splash.composite(logoResized, x, y)
    await splash.write(outFile)
    console.log(`  ✓ ${dir}/splash.png ${w}x${h} (logo: ${logoDim}px)`)
  }

  console.log('\nDone — all density-specific splash images generated')
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
