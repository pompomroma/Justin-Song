#!/usr/bin/env python3
"""Grove Clash — zero-dependency static file server.

Serves the game folder on 0.0.0.0 so Replit's webview (and any LAN
browser) can reach it. Uses only the Python standard library."""
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", "8000"))
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **getattr(SimpleHTTPRequestHandler, "extensions_map", {}),
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the Replit console clean


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("Grove Clash is serving on http://0.0.0.0:%d" % PORT)
    print("Open the webview/preview pane, then CLICK the game once so it gets keyboard focus.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
