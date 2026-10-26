# Wealth advisor

Two apps that work together. Each builds, runs and deploys on its own.

| App | |
|---|---|
| [`agent/`](agent) | The wealth advisor agent: a LangGraph orchestrator-worker service on FastAPI. It reads a banker-client call transcript and advises whether to proceed with investments. |
| [`app/`](app) | The banker's window: upload a transcript, read the advice, watch the agent work. |

The app reaches the agent's `/v1` API at `AGENT_URL`.

## Run both

Start the agent with any OpenAI-compatible model endpoint:

```bash
docker build -t wealth-advisor-agent agent
docker run -p 127.0.0.1:8080:8080 -e OPENAI_BASE_URL -e OPENAI_API_KEY -e AGENT_MODEL wealth-advisor-agent
```

Then the app, in a second terminal:

```bash
docker build -t wealth-advisor-app app
docker run -p 127.0.0.1:5173:8080 -e AGENT_URL=http://host.docker.internal:8080 wealth-advisor-app
```

Open http://localhost:5173.
