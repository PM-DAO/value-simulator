"""Vercel serverless function entry point for FastAPI backend."""

import sys
from pathlib import Path

# Add backend/src to Python path so simulator package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend" / "src"))

from simulator.api import app  # noqa: E402, F401
