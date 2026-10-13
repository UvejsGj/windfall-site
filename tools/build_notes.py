"""Builds notes.html, the lab notes page, from Windfall's own notes.

The notes are written in Markdown in the Windfall repository, in docs/protocol-notes.md.
GitHub's Markdown service turns them into HTML, so they read here exactly as they do
there. This script then gives each dated entry its label, builds the list of entries, and
sets the result in the site's page frame, which it lifts from index.html so the two pages
cannot drift apart.

    python tools/build_notes.py                          the notes on Windfall's main branch
    python tools/build_notes.py path/to/protocol-notes.md

It needs only Python and a network connection. Set GH_TOKEN if GitHub's limit for
anonymous requests (60 an hour) is in the way.
"""

import html
import json
import os
import re
import sys
import urllib.request
from pathlib import Path
from string import Template

SITE = Path(__file__).resolve().parent.parent
NOTES_URL = "https://raw.githubusercontent.com/UvejsGj/Windfall/main/docs/protocol-notes.md"
REPO = "https://github.com/UvejsGj/Windfall/blob/main/"

# What an entry's label says about it, and how it is drawn: (kind, style, filter name).
LABELS = {
    "CONFIRMED": ("confirmed", "yes", "Confirmed"),
    "MEASURED": ("measured", "yes", "Measured"),
    "OBSERVED": ("observed", "", "Observed"),
    "REFUTED": ("refuted", "nope", "Refuted"),
    "READ": ("read", "quiet", "Read"),
    "SESSION": ("session", "", "Sessions"),
}

HEADING = re.compile(
    r'<div class="markdown-heading"><h([1-4]) class="heading-element">(.*?)</h\1>'
    r'<a id="user-content-([^"]*)"[^>]*>.*?</a></div>',
    re.S,
)
ENTRY = re.compile(
    r"^(?:(\d{4}-\d{2}-\d{2}) — )?(?:(CONFIRMED|MEASURED|OBSERVED|REFUTED|READ|Session \d+): )?(.+)$",
    re.S,
)

PAGE = Template("""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Windfall lab notes</title>
<meta name="description" content="The running log behind Windfall: what was observed, measured, confirmed and refuted while rebuilding AirDrop from the bytes up.">
<link rel="canonical" href="https://uvejsgj.github.io/windfall-site/notes.html">
<meta property="og:title" content="Windfall lab notes">
<meta property="og:description" content="What was observed, measured, confirmed and refuted while rebuilding AirDrop from the bytes up.">
<meta property="og:type" content="article">
<meta property="og:url" content="https://uvejsgj.github.io/windfall-site/notes.html">
<meta property="og:image" content="https://uvejsgj.github.io/windfall-site/social-card.png">
<meta name="twitter:card" content="summary_large_image">
$head
</head>
<body>
<div class="page" id="top">

  <div class="top">
    <a class="brand" href="index.html" aria-label="Windfall, home">
      $mark
      Windfall
    </a>
    <nav aria-label="Pages">
      <a class="keep" href="index.html">Overview</a>
      <a class="keep" href="notes.html" aria-current="page">Lab notes</a>
      <a class="gh" href="https://github.com/UvejsGj/Windfall">GitHub</a>
    </nav>
  </div>

  <main>
    <header class="notes-head">
      <span class="label">Lab notes</span>
      <h1>What was observed, and when.</h1>
$intro
      <p class="small">$count entries, the latest from $latest. Written as the work happened, in <a href="${repo}docs/protocol-notes.md">docs/protocol-notes.md</a>.</p>
    </header>

    <div class="notes-grid">
      <aside class="index" aria-label="Entries">
        <details open>
          <summary>Entries</summary>
          <div class="filters" role="group" aria-label="Show">
$filters
          </div>
$groups
        </details>
      </aside>

      <article class="prose">
$parts
        <a class="totop" href="#top">Back to the top</a>
      </article>
    </div>
  </main>

  $footer

</div>
</body>
</html>
""")


def load(source: str) -> str:
    if re.match(r"https?://", source):
        with urllib.request.urlopen(source, timeout=60) as reply:
            return reply.read().decode("utf-8")
    return Path(source).read_text(encoding="utf-8")


def render(markdown: str) -> str:
    """Markdown to HTML, by GitHub's own renderer."""
    headers = {
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "windfall-site",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        "https://api.github.com/markdown",
        data=json.dumps({"text": markdown, "mode": "markdown"}).encode("utf-8"),
        headers=headers,
    )
    with urllib.request.urlopen(request, timeout=120) as reply:
        return reply.read().decode("utf-8")


def tidy(body: str) -> str:
    """The changes a block of rendered notes needs before it sits on this site."""
    # Wide tables scroll inside their own box, not the page.
    body = body.replace("<table>", '<div class="scroll"><table>').replace("</table>", "</table></div>")
    # The notes write "~15 s" for "about 15 s". Two of those in one paragraph are read as
    # strikethrough, there and here; put the tildes back.
    body = body.replace("<del>", "~").replace("</del>", "~")

    # Links between files in the repository have to leave this site to reach them.
    def absolute(match: re.Match) -> str:
        target = match.group(1)
        if re.match(r"(https?:|#|mailto:)", target):
            return match.group(0)
        path = os.path.normpath(os.path.join("docs", target)).replace("\\", "/")
        return f'<a href="{REPO}{path}"'

    return re.sub(r'<a href="([^"]*)"', absolute, body).strip()


def plain(fragment: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", fragment))


def frame() -> dict:
    """The parts of the page frame both pages share, taken from index.html."""
    home = (SITE / "index.html").read_text(encoding="utf-8")

    def one(pattern: str) -> str:
        found = re.search(pattern, home, re.S)
        if not found:
            raise SystemExit(f"index.html no longer has what build_notes.py looks for: {pattern}")
        return found.group(0)

    head = "\n".join(
        [
            one(r'<link rel="icon"[^>]*>'),
            one(r'<link rel="stylesheet" href="https://fonts[^>]*>'),
            one(r'<link rel="stylesheet" href="site\.css">'),
            one(r"<script>.*?</script>"),
            one(r'<script src="site\.js" defer></script>'),
        ]
    )
    return {
        "head": head,
        "mark": one(r'<svg viewBox="0 0 16 16" aria-hidden="true">.*?</svg>'),
        "footer": one(r"<footer>.*?</footer>"),
    }


def build(markdown: str) -> str:
    rendered = render(markdown)
    headings = list(HEADING.finditer(rendered))
    if not headings or headings[0].group(1) != "1":
        raise SystemExit("The rendered notes do not start with a title; GitHub's output may have changed.")

    parts = []      # the page body, one <section> per second-level heading
    groups = []     # the list of entries, grouped the same way
    counts = {}     # entries per kind, for the filter buttons
    dates = []
    intro = ""
    part = None
    group = None

    for i, heading in enumerate(headings):
        level, title, slug = int(heading.group(1)), heading.group(2), heading.group(3)
        end = headings[i + 1].start() if i + 1 < len(headings) else len(rendered)
        body = tidy(rendered[heading.end():end])

        if level == 1:
            intro = "\n".join("      " + p for p in re.findall(r"<p>.*?</p>", body, re.S))
            continue

        if level == 2:
            part = [f'<h2 id="{slug}">{title}</h2>', body]
            group = []
            parts.append(part)
            groups.append((slug, title, group))
            continue

        if part is None:
            raise SystemExit("The notes have a heading before their first section.")

        if level == 3:
            part += [f'<h3 id="{slug}">{title}</h3>', body]
            continue

        date, label, name = ENTRY.match(title).groups()
        if not date and not label:
            part += [f'<h4 id="{slug}">{title}</h4>', body]
            continue

        kind, style, _ = LABELS[label.split()[0].upper()] if label else ("note", "none", "")
        counts[kind] = counts.get(kind, 0) + 1
        if date:
            dates.append(date)

        when = f'<time datetime="{date}">{date}</time>' if date else ""
        badge = f'<span class="v {style}">{label.upper()}</span>' if label else ""
        part.append(
            f'<section class="entry flow">\n'
            f'<h4 class="eh" id="{slug}"><span class="meta">{when}{badge}'
            f'<a class="perma" href="#{slug}" aria-label="Link to this entry">#</a></span>'
            f"<span>{name}</span></h4>\n{body}\n</section>"
        )

        short = f'<time datetime="{date}">{date[5:]}</time>' if date else "<span></span>"
        group.append(
            f'            <li data-kind="{kind}"><a href="#{slug}">{short}'
            f'<span class="dot {style}"></span><span>{name}</span></a></li>'
        )

    total = sum(counts.values())
    buttons = [f'            <button type="button" data-kind="all" aria-pressed="true">All<span>{total}</span></button>']
    for kind, _, name in LABELS.values():
        if counts.get(kind):
            buttons.append(
                f'            <button type="button" data-kind="{kind}" aria-pressed="false">{name}<span>{counts[kind]}</span></button>'
            )

    index = []
    for slug, title, entries in groups:
        if entries:
            index.append(
                f'          <div class="group">\n            <h2><a href="#{slug}">{title}</a></h2>\n'
                f"            <ol>\n" + "\n".join(entries) + "\n            </ol>\n          </div>"
            )

    sections = [
        '        <section class="part flow">\n' + "\n".join(piece for piece in part if piece) + "\n        </section>"
        for part in parts
    ]

    return PAGE.substitute(
        frame(),
        intro=intro,
        count=total,
        latest=max(dates),
        repo=REPO,
        filters="\n".join(buttons),
        groups="\n".join(index),
        parts="\n".join(sections),
    )


def main() -> None:
    source = sys.argv[1] if len(sys.argv) > 1 else NOTES_URL
    page = build(load(source))
    target = SITE / "notes.html"
    target.write_text(page, encoding="utf-8", newline="\n")
    print(f"wrote {target.name}: {len(page):,} characters from {source}")


if __name__ == "__main__":
    main()
