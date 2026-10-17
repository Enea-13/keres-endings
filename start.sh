#!/usr/bin/env bash
# Run the study app locally with one command.
#   ./start.sh          build (first time only) and open the app
#   ./start.sh --dev    run the Vite dev server instead (hot reload)
#   ./start.sh --rebuild-content   re-extract everything from the PDF
# The PDF path can be overridden with KERES_PDF=/path/to/book.pdf
set -euo pipefail
cd "$(dirname "$0")"

export KERES_PDF="${KERES_PDF:-$HOME/Desktop/Practical Chess Endings with modern chess notation (Paul Keres).pdf}"

if [ ! -x pipeline/.venv/bin/python ]; then
  echo "Setting up the Python pipeline…"
  python3 -m venv pipeline/.venv
  pipeline/.venv/bin/pip install -q --upgrade pip
  pipeline/.venv/bin/pip install -q -r pipeline/requirements.txt
fi

if [ ! -f app/public/content/toc.json ] || [ "${1:-}" = "--rebuild-content" ]; then
  if [ ! -f "$KERES_PDF" ]; then
    echo "Book PDF not found at: $KERES_PDF" >&2
    echo "Set KERES_PDF to its location and run again." >&2
    exit 1
  fi
  echo "Building the book's content from the PDF (about a minute)…"
  (cd pipeline && .venv/bin/python build.py --all)
fi

if [ ! -d app/node_modules ]; then
  echo "Installing app dependencies…"
  (cd app && npm install)
fi

cd app
if [ "${1:-}" = "--dev" ]; then
  exec npm run dev -- --open
fi
npm run build
exec npx vite preview --open
