FROM python:3.11-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install dependencies (project itself not yet available, so use --no-install-project)
RUN uv sync --no-dev --no-install-project

# Copy source
COPY src/ src/

# Install the project itself
RUN uv sync --no-dev

ENV PYTHONPATH=src

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "simulator.api:app", "--host", "0.0.0.0", "--port", "8000"]
