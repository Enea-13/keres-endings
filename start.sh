#!/usr/bin/env bash
# Run the study app locally with one command.
#   ./start.sh          build (first time only) and open the app
#   ./start.sh --dev    run the Vite dev server instead (hot reload)
#   ./start.sh --rebuild-content   re-extract everything from the PDF
#   ./start.sh --demo   build and open the demo instead (five positions, no PDF needed)
# The book is read from book.pdf in this folder; override with KERES_PDF=/path/to/book.pdf
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-}"
export KERES_PDF="${KERES_PDF:-$PWD/book.pdf}"

if [ ! -x pipeline/.venv/bin/python ]; then
  echo "Setting up the Python pipeline…"
  python3 -m venv pipeline/.venv
  pipeline/.venv/bin/pip install -q --upgrade pip
  pipeline/.venv/bin/pip install -q -r pipeline/requirements.txt
fi

if [ "$MODE" = "--demo" ]; then
  echo "Building the demo content…"
  (cd pipeline && .venv/bin/python demo.py)
elif [ ! -f app/public/content/toc.json ] || [ "$MODE" = "--rebuild-content" ]; then
  if [ ! -f "$KERES_PDF" ]; then
    echo "Book PDF not found at: $KERES_PDF" >&2
    echo "Copy your PDF of the book to book.pdf here, or set KERES_PDF to its location." >&2
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
if [ "$MODE" = "--dev" ]; then
  exec npm run dev -- --open
fi
if [ "$MODE" = "--demo" ]; then
  npm run build:demo
else
  npm run build
fi
exec npx vite preview --open
