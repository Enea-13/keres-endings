"""Shared paths and constants for the content pipeline."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
DEFAULT_PDF = Path.home() / "Desktop" / (
    "Practical Chess Endings with modern chess notation (Paul Keres).pdf"
)
PDF_PATH = Path(os.environ.get("KERES_PDF", DEFAULT_PDF))
BUILD = ROOT / "build"                      # intermediate artefacts (gitignored)
CONTENT = PROJECT / "app" / "public" / "content"  # app-facing output (gitignored)
