import json
import os
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SCHEMA_ROOT = Path(os.environ.get("ETAX_SCHEMA_ROOT", "/schemas"))
MAX_XML_SIZE = 5 * 1024 * 1024
PROCEDURES = {
    "RKO0010": {
        "schema": "shotoku/RKO0010-250.xsd",
        "procedureVersion": "25.0.0",
        "forms": {"KOA020": "23.0"},
    },
    "PKO0420": {
        "schema": "shotoku/PKO0420-260.xsd",
        "procedureVersion": "26.0.0",
        "forms": {"KOZ280": "21.0"},
    },
}


class ValidationHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            available = all((SCHEMA_ROOT / item["schema"]).is_file() for item in PROCEDURES.values())
            self.respond(200, {"ok": available, "schemas": list(PROCEDURES), "schemaAvailable": available})
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
        xml = self.rfile.read(length)
        try:
            root = ET.fromstring(xml)
            procedure_element = next((child for child in root if local_name(child.tag) in PROCEDURES), None)
        except ET.ParseError as error:
            self.respond(200, {"valid": False, "errors": [f"XML構文エラー: {error}"]})
            return
        if local_name(root.tag) != "DATA" or procedure_element is None:
            self.respond(422, {"valid": False, "errors": ["対応するe-Tax手続を判定できません。RKO0010またはPKO0420のDATA XMLを指定してください。"]})
            return

        procedure = local_name(procedure_element.tag)
        metadata = PROCEDURES[procedure]
        schema = SCHEMA_ROOT / metadata["schema"]
        if not schema.is_file():
            self.respond(503, {"valid": False, "errors": [f"検証用XSDを読み込めません: {metadata['schema']}"]})
            return
        contents = next((child for child in procedure_element if local_name(child.tag) == "CONTENTS"), None)
        detected_forms = [] if contents is None else [
            name for child in contents for name in [local_name(child.tag)] if name in metadata["forms"]
        ]
        with tempfile.NamedTemporaryFile(suffix=".xml") as source:
            source.write(xml)
            source.flush()
            result = subprocess.run(
                ["xmllint", "--nonet", "--noout", "--schema", str(schema), source.name],
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )

        errors = normalize_errors(result.stderr)
        self.respond(200, {
            "valid": result.returncode == 0,
            "schema": metadata["schema"],
            "procedure": procedure,
            "procedureVersion": metadata["procedureVersion"],
            "forms": [{"id": form, "version": metadata["forms"][form]} for form in detected_forms],
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


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8081), ValidationHandler)
    server.serve_forever()
