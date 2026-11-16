"""Static file server for the lot-rules audit that gzips HTML, CSS and JS like GitHub Pages does.

python's plain http.server sends files uncompressed, so Lighthouse measured a 62 KB render-blocking
styles.css that production actually serves at about 14 KB. Usage: python3 scripts/serve-gzip.py 8765
"""
import gzip, http.server, io, os, sys


class GzipHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if (os.path.isfile(path) and path.endswith((".html", ".css", ".js", ".json"))
                and "gzip" in self.headers.get("Accept-Encoding", "")):
            with open(path, "rb") as f:
                data = gzip.compress(f.read())
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return io.BytesIO(data)
        return super().send_head()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(("127.0.0.1", port), GzipHandler).serve_forever()
