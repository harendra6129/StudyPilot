import os
from pathlib import Path

env_file = Path(__file__).resolve().parent / ".env"

for line in env_file.read_text(encoding="utf-8-sig").splitlines():
    line = line.strip()
    if line.startswith("GEMINI_API_KEY="):
        value = line.split("=", 1)[1].strip().strip('"').strip("'")
        if value:
            os.environ["GEMINI_API_KEY"] = value

print("Gemini key loaded:", bool(os.getenv("GEMINI_API_KEY")))
