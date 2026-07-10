#!/usr/bin/env sh
set -eu

BASE_URL="https://www.e-tax.nta.go.jp/shiyo/download"
DOWNLOAD_DIR="${1:-data/specs/downloads}"

mkdir -p "$DOWNLOAD_DIR"

for item in 09 10 11 12 13; do
  file="e-tax${item}.CAB"
  url="${BASE_URL}/${file}"
  echo "Downloading ${url}"
  curl -fL "$url" -o "${DOWNLOAD_DIR}/${file}"
done

cat <<'MSG'

Downloaded CAB files for e-Tax specification items 9-13.
Extract them with a CAB-capable tool, then convert the official Excel/Word
specification data into JSON definitions under data/specs/.
MSG
