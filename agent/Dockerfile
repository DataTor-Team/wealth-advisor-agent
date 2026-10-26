FROM python:3.12-slim

RUN useradd --create-home --uid 10001 agent
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent.py hops.py main.py ./

USER 10001
EXPOSE 8080
# OpenTelemetry traces each request and each call to the model router, with no code in the app.
# It exports nothing until OTEL_TRACES_EXPORTER=otlp and OTEL_EXPORTER_OTLP_ENDPOINT are set.
ENV OTEL_SERVICE_NAME=wealth-advisor-agent \
    OTEL_TRACES_EXPORTER=none \
    OTEL_METRICS_EXPORTER=none \
    OTEL_LOGS_EXPORTER=none \
    OTEL_PYTHON_FASTAPI_EXCLUDED_URLS=healthz
CMD ["opentelemetry-instrument", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
