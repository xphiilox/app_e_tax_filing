import json
import os
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SCHEMA = Path(os.environ.get("ETAX_SCHEMA", "/schemas/shotoku/RKO0010-250.xsd"))
MAX_XML_SIZE = 5 * 1024 * 1024


class ValidationHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.respond(200, {"ok": True, "schema": str(SCHEMA), "schemaAvailable": SCHEMA.is_file()})
            return
        self.respond(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/validate":
            self.respond(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.respond(400, {"valid": False, "errors": ["Content-Lengthが不正です。"]})
            return

        if length <= 0 or length > MAX_XML_SIZE:
            self.respond(413, {"valid": False, "errors": ["XMLは1バイト以上5MB以下にしてください。"]})
            return
        if not SCHEMA.is_file():
            self.respond(503, {"valid": False, "errors": ["検証用XSDを読み込めません。"]})
            return

        xml = self.rfile.read(length)
        with tempfile.NamedTemporaryFile(suffix=".xml") as source:
            source.write(xml)
            source.flush()
            result = subprocess.run(
                ["xmllint", "--nonet", "--noout", "--schema", str(SCHEMA), source.name],
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )

        errors = normalize_errors(result.stderr)
        self.respond(200, {
            "valid": result.returncode == 0,
            "schema": "shotoku/RKO0010-250.xsd",
            "procedureVersion": "25.0.0",
            "formVersion": "KOA020 23.0",
            "errors": [] if result.returncode == 0 else errors,
        })

    def respond(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


def normalize_errors(stderr):
    lines = []
    for raw in stderr.splitlines():
        line = raw.strip()
        if not line or line.endswith("fails to validate") or line.endswith("validates"):
            continue
        line = line.replace("Schemas validity error : ", "")
        lines.append(line)
    return lines[:100] or ["XSD検証に失敗しました。"]


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8081), ValidationHandler)
    server.serve_forever()
