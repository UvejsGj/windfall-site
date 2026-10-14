"""Gives the phone-page film its voice.

    python tools/film/voice.py            speak the lines, then put the voice into media/
    python tools/film/voice.py --check    only speak them, and show how each one fits

The words and their times are in narration.json. Each line is spoken by Kokoro-82M, an open
speech model (Apache-2.0), run on the CPU with kokoro-onnx. Its weights and voices are
packaged on npm, and both packages are checked against the hashes below before use.

- Every line must end before the next one starts, and the last before the film fades. If
  one runs over, nothing is written and the line is named.
- The lines are laid on one track, brought to a standard loudness, and put into the four
  films in media/ in place of any voice they had. The picture is copied, not encoded again,
  so run render.mjs first if the picture has changed.
- media/phone-page.vtt gets one caption for each line, at the moment it is spoken.

Needs Python 3.10 or later, `pip install kokoro-onnx soundfile`, ffmpeg built with aac and
libopus, and a network connection the first time, for about 90 MB of weights. They are
kept in tools/film/.voice/, which git ignores.
"""

import base64
import hashlib
import io
import json
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = Path(__file__).resolve().parent
MEDIA = HERE.parent.parent / "media"
CACHE = HERE / ".voice"
FADE = 0.8  # the film's last 0.6 s fade to the page, so the voice ends before them

# The npm packages, as the registry describes them (dist.integrity).
MODEL = ("https://registry.npmjs.org/kokoro-q8-shards/-/kokoro-q8-shards-1.0.0.tgz",
         "sha512-KoJQ203LxUOFrHAm12mu+hRmvqTmOcCgz61OVgTxmxX4isWaufLCF6kYz+QwOzVFYGNS62HHJWBHUbhzeoR43g==")
VOICES = ("https://registry.npmjs.org/kokoro-js/-/kokoro-js-1.2.1.tgz",
          "sha512-oq0HZJWis3t8lERkMJh84WLU86dpYD0EuBPtqYnLlQzyFP1OkyBRDcweAqCfhNOpltyN9j/azp1H6uuC47gShw==")
# The model the shards join into: model_quantized.onnx from onnx-community/Kokoro-82M-v1.0-ONNX.
MODEL_SHA256 = "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478"


def package(url: str, integrity: str) -> tarfile.TarFile:
    """An npm package, downloaded once and checked against its registry hash every time."""
    CACHE.mkdir(exist_ok=True)
    path = CACHE / url.rsplit("/", 1)[1]
    if not path.exists():
        print(f"fetching {url}")
        with urllib.request.urlopen(url) as response:
            path.write_bytes(response.read())
    data = path.read_bytes()
    algo, want = integrity.split("-", 1)
    if base64.b64encode(hashlib.new(algo, data).digest()).decode() != want:
        path.unlink()
        raise SystemExit(f"{path.name} does not match its registry hash; it has been removed")
    return tarfile.open(fileobj=io.BytesIO(data))


def weights(voice: str) -> tuple[Path, Path]:
    """The model and the chosen voice, in the files kokoro-onnx reads."""
    model, voices = CACHE / "kokoro-q8.onnx", CACHE / f"{voice}.npz"
    if not model.exists():
        tar = package(*MODEL)
        parts = sorted((m for m in tar.getmembers() if m.name.startswith("package/kokoro-q8.part")),
                       key=lambda m: int(m.name.rsplit("part", 1)[1].split(".")[0]))
        joined = b"".join(tar.extractfile(m).read() for m in parts)
        if hashlib.sha256(joined).hexdigest() != MODEL_SHA256:
            raise SystemExit("the joined model does not match its known hash")
        model.write_bytes(joined)
    if not voices.exists():
        raw = package(*VOICES).extractfile(f"package/voices/{voice}.bin").read()
        np.savez(voices, **{voice: np.frombuffer(raw, dtype=np.float32).reshape(-1, 1, 256)})
    return model, voices


def length(film: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(film)],
                         check=True, capture_output=True, text=True).stdout
    return float(out)


def stamp(t: float) -> str:
    h, rest = divmod(t, 3600)
    m, s = divmod(rest, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


def ffmpeg(*args: str) -> str:
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", *args],
                          check=True, capture_output=True, text=True).stderr


def main() -> None:
    check = "--check" in sys.argv[1:]
    script = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
    films = [MEDIA / f"phone-page-{theme}.{kind}" for theme in ("light", "dark") for kind in ("mp4", "webm")]
    end = length(films[0])
    kokoro = Kokoro(*map(str, weights(script["voice"])))

    # Speak each line and find its place.
    cues, clips, sr = [], [], 24000
    for line in script["lines"]:
        audio, sr = kokoro.create(line.get("say", line["text"]), voice=script["voice"],
                                  speed=script["speed"], lang="en-us")
        start = line.get("at", cues[-1][1] + script["pause"] if cues else 0.0)
        cues.append((start, start + len(audio) / sr, line["text"]))
        clips.append(audio)

    # Each line has until the next one starts, less a breath; the last, until the fade.
    over = 0
    for n, (start, stop, text) in enumerate(cues):
        room = (cues[n + 1][0] - 0.1 if n + 1 < len(cues) else end - FADE) - stop
        over += room < 0
        print(f"{start:6.2f} {stop:6.2f}  {room:+5.2f} s  {'RUNS OVER  ' if room < 0 else ''}{text}")
    if over:
        raise SystemExit(f"{over} line(s) run over; nothing was written")
    if check:
        return

    # One track the length of the film, at a standard loudness for speech on the web.
    track = np.zeros(int(round(end * sr)), dtype=np.float32)
    for (start, _, _), audio in zip(cues, clips):
        i = int(round(start * sr))
        track[i:i + len(audio)] += audio[: len(track) - i]
    with tempfile.TemporaryDirectory() as tmp:
        raw, voice = Path(tmp) / "raw.wav", Path(tmp) / "voice.wav"
        sf.write(raw, track, sr, subtype="FLOAT")
        loud = "loudnorm=I=-16:TP=-1.5:LRA=11"
        report = ffmpeg("-i", str(raw), "-af", loud + ":print_format=json", "-f", "null", "-")
        m = json.loads(report[report.rindex("{"): report.rindex("}") + 1])
        measured = (f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
                    f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
        ffmpeg("-i", str(raw), "-af", loud + measured, "-ar", "48000", "-ac", "1", str(voice))

        # The picture is copied as it is. Any voice the films had is replaced.
        for film in films:
            out = Path(tmp) / film.name
            audio = (["-c:a", "aac", "-b:a", "80k", "-movflags", "+faststart"] if film.suffix == ".mp4"
                     else ["-c:a", "libopus", "-b:a", "48k", "-cues_to_front", "1"])
            ffmpeg("-i", str(film), "-i", str(voice), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
                   *audio, "-metadata:s:a:0", "language=eng", str(out))
            out.replace(film)
            print(f"voiced {film.name}")

    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    vtt = ["WEBVTT", ""]
    for n, (start, stop, text) in enumerate(cues, 1):
        vtt += [str(n), f"{stamp(start)} --> {stamp(stop)}", esc(text), ""]
    (MEDIA / "phone-page.vtt").write_text("\n".join(vtt), encoding="utf-8")
    print("wrote phone-page.vtt")


if __name__ == "__main__":
    main()
