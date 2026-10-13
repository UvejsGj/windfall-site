# windfall-site

The website for [Windfall](https://github.com/UvejsGj/Windfall), an AirDrop implementation
for Windows and Linux, built from scratch by reverse-engineering the protocol.

Live at <https://uvejsgj.github.io/windfall-site/>.

## How it works

The site is one self-contained page, `index.html`, with no build step. GitHub Pages serves
it from the root of `main`, so a push to `main` updates the site within a minute or two.

| File | What it is |
|---|---|
| `index.html` | The whole page: markup, styles and the mark, in one file. Its only outside request is for fonts |
| `social-card.png` | The image shown when the link is shared |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

To look at a change before pushing it, open `index.html` in a browser.

## Keeping it true

The page repeats figures from the Windfall README: the test count, the iOS versions, how
often transfers complete, and the speed. When those change there, change them here too.

## Licence

MIT, as for Windfall itself. Windfall is an independent project and is not affiliated with
or endorsed by Apple.
