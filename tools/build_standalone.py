#!/usr/bin/env python3
"""Builds grove-clash-standalone.html — the entire game in ONE file.

Inlines style.css and every <script src> from index.html so the game
runs with zero server and zero extra files (double-click it, upload it
anywhere, or open it in any static host's preview).

Run from the repo root or anywhere:  python3 tools/build_standalone.py
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "grove-clash-standalone.html")


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def main():
    html = read("index.html")
    html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        "<style>\n" + read("style.css") + "</style>",
    )

    inlined = []

    def inline_script(match):
        src = match.group(1)
        code = read(src)
        if "</script" in code.lower():
            raise SystemExit("refusing to inline %s: contains </script" % src)
        inlined.append(src)
        return "<script>\n" + code + "</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)

    expected = re.findall(r'<script src="([^"]+)"></script>', read("index.html"))
    if inlined != expected or not inlined:
        raise SystemExit("inlining mismatch: %r != %r" % (inlined, expected))

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print("wrote %s (%d KB, %d scripts inlined)" % (OUT, len(html) // 1024, len(inlined)))


if __name__ == "__main__":
    main()
