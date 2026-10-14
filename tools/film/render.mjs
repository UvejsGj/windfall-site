// Renders the phone-page film from film.html, one frame at a time, into media/.
//
//     node tools/film/render.mjs              both themes
//     node tools/film/render.mjs dark         one theme
//
// film.html is an animation that draws any moment it is asked for, so nothing depends on
// how fast the machine is: each frame is drawn, photographed by a headless Chromium, and
// handed to ffmpeg. Every frame goes to two encoders at once: H.264 in an MP4, which
// plays everywhere, and AV1 in a WebM, about half the size where it is supported. The
// frame at 0:21, the scan, is also kept as a WebP still, which the page shows until the
// film is played.
//
// Needs Node 18 or later, Playwright with its Chromium (npm install playwright, then
// npx playwright install chromium), ffmpeg built with libx264, libsvtav1 and libwebp, and a
// network connection for the film's fonts. A full render takes about ten minutes a theme.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEDIA = path.resolve(HERE, '../../media');
const FPS = 30;
const STILL = 21 * FPS;
const STEPS = '6,16,27.5,38.4,54.4,63.4,71.9,82.4,93.4';  // the step starts, as data-at in index.html
const themes = process.argv.slice(2).length ? process.argv.slice(2) : ['light', 'dark'];

// The frames are sRGB. Converted to video with BT.709 and labelled so, a browser shows the
// page's own colours. Unlabelled, ffmpeg's default matrix would read back about 13 levels
// redder in the apple and 10 darker in the leaf.
const COLOUR = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

function ffmpeg(args, out) {
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS),
    '-c:v', 'png', '-i', '-', '-an', ...args, out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) =>
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed for ${out}`)))));
  return { ff, done };
}

function write(stream, buf) {
  return stream.write(buf) ? null : new Promise((resolve) => stream.once('drain', resolve));
}

const browser = await chromium.launch();
for (const theme of themes) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(path.join(HERE, 'film.html')).href + '?theme=' + theme);
  await page.evaluate(() => document.fonts.ready);
  // The fonts come from Google Fonts. Without them the film would be drawn in fallback faces.
  const fonts = await page.evaluate(() => ['Bricolage Grotesque', 'Instrument Sans', 'IBM Plex Mono']
    .filter((f) => ![...document.fonts].some((x) => x.family.replace(/"/g, '') === f && x.status === 'loaded')));
  if (fonts.length) throw new Error(`fonts did not load: ${fonts.join(', ')}. The render needs a network connection.`);
  const frames = Math.round((await page.evaluate(() => window.DURATION)) * FPS);

  // A keyframe at each step start lets a jump to a step in the MP4 start at once. SVT-AV1
  // ignores forced keyframes, so the WebM has one every 5 s instead, and its index at the
  // front so the first seek needs no extra request.
  const films = [
    ffmpeg([...COLOUR, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-tune', 'animation',
      '-force_key_frames', STEPS, '-movflags', '+faststart'], path.join(MEDIA, `phone-page-${theme}.mp4`)),
    ffmpeg([...COLOUR, '-c:v', 'libsvtav1', '-preset', '6', '-crf', '38', '-g', '150',
      '-svtav1-params', 'enable-overlays=0', '-cues_to_front', '1'], path.join(MEDIA, `phone-page-${theme}.webm`)),
  ];
  let still = null;

  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const png = await page.screenshot({ type: 'png' });
    await Promise.all(films.map(({ ff }) => write(ff.stdin, png)));
    if (i === STILL) {
      still = ffmpeg(['-vf', 'scale=1280:-2', '-c:v', 'libwebp', '-quality', '80'], path.join(MEDIA, `phone-page-${theme}.webp`));
      still.ff.stdin.end(png);
    }
    if (i % 300 === 0) console.log(`${theme}: frame ${i} of ${frames}`);
  }
  films.forEach(({ ff }) => ff.stdin.end());
  await Promise.all([...films, still].filter(Boolean).map(({ done }) => done));
  await page.close();
  console.log(`${theme}: done`);
}
await browser.close();
