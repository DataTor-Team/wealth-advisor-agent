# Wealth advisor agent

Reads the transcript of a call between a banker and a client. Tells the banker whether to proceed with investments, and what to say to the client.

It is a LangGraph orchestrator-worker workflow served by FastAPI on uvicorn, packaged as one container.

```
START → orchestrator ─┬→ sentiment     ─┬→ synthesizer → END
                      ├→ opportunities ─┤
                      ├→ risk_profile  ─┤
                      └→ action_items  ─┘
```

- `orchestrator` reads the transcript once and writes a summary of the call, plus a one- or two-sentence brief for each worker.
- Every worker gets the summary, its brief and the full transcript. All four run in parallel, one model call each.
- `synthesizer` reads the summary and the four reports, then writes the yes/no decision and the advice.

Every node is a prompt and one model call. No tools, no skills, no MCP. The orchestrator and the synthesizer reply in JSON text, which the agent parses.

The service is stateless: async nodes, one graph run per request, no checkpointer. Any replica can serve any request, so it scales out behind a Kubernetes Service with an HPA. Authorization belongs to the gateway in front of it. Every model call goes to `OPENAI_BASE_URL`, the model router behind it.

## API

| Endpoint | |
|---|---|
| `POST /v1/advice` | Advice for one transcript, as JSON |
| `POST /v1/advice/stream` | The same, as server-sent events while the graph runs |
| `GET /healthz` | Liveness and readiness probe |
| `GET /docs`, `GET /openapi.json` | The OpenAPI description of the above |

```bash
curl -s localhost:8080/v1/advice -H 'Content-Type: application/json' \
  -d "$(jq -Rs '{transcript: .}' sample_transcript.vtt)"
```

```json
{
  "decision": "yes",
  "summary": "...",
  "talking_points": ["..."],
  "next_steps": ["..."],
  "call_summary": "...",
  "reports": {"sentiment": "...", "opportunities": "...", "risk_profile": "...", "action_items": "..."}
}
```

`/v1/advice/stream` sends each node's output as it finishes: the orchestrator's summary and briefs, each worker's report, then the recommendation.

```
data: {"orchestrator": {"call_summary": "...", "briefs": {"sentiment": "...", "opportunities": "...", ...}}}
data: {"worker": {"reports": {"sentiment": "..."}}}
data: {"synthesizer": {"recommendation": {"decision": "yes", ...}}}
```

The stream also carries every hop of the run, in order, from `hops.py`: the request, the graph's input, each node's input and state update, every model request and response, the router's sends, the final state and the end of the response. Hops name the transcript instead of repeating it. Each model request lists the tools it offered, which is always none.

```
data: {"hop": {"n": 4, "t": 0.01, "from": "orchestrator", "to": "model", "kind": "request", "data": {"model": "...", "messages": [...], "tools": []}}}
data: {"hop": {"n": 5, "t": 6.71, "from": "model", "to": "orchestrator", "kind": "response", "data": {"content": "{\"tasks\": [...]}", "finish_reason": "stop", "usage": {...}, "seconds": 6.7}}}
```

## Configure

| Variable | Value |
|---|---|
| `OPENAI_BASE_URL` | The model router (any OpenAI-compatible endpoint) |
| `OPENAI_API_KEY` | The agent's key for the router |
| `AGENT_MODEL` | Model name on the router |
| `OTEL_TRACES_EXPORTER`, `OTEL_METRICS_EXPORTER` | `none` in the image; set to `otlp` to export |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Your OpenTelemetry collector |

To test without a router, use `https://api.anthropic.com/v1/` with an Anthropic API key and a Claude model such as `claude-opus-5-5`.

OpenTelemetry instruments FastAPI and the HTTP calls to the router with no code in the agent (`opentelemetry-instrument` starts uvicorn). Each request is a server span, with one client span per model call. The trace context from the caller continues through to the router, so the gateway, the agent and the router share one trace. `/healthz` is left out of traces.

## Run

```bash
docker build -t wealth-advisor-agent .
docker run -p 127.0.0.1:8080:8080 -e OPENAI_BASE_URL -e OPENAI_API_KEY -e AGENT_MODEL wealth-advisor-agent
```
