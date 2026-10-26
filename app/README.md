# Wealth advisor app

The banker's window onto the wealth advisor agent. Upload a call transcript and the advice appears: proceed or hold, what to say to the client, and what to do next.

Two switches in the header open one side panel at a time:

- Agent steps: the orchestrator, the workers and the synthesizer as they run.
- Hop by hop: every request and response between the app, the API, the graph, its nodes and the model, each with its full payload.

The app calls the agent's `/v1` API on its own origin, so the browser needs no CORS. In development Vite forwards `/v1` to the agent; in the container nginx does.

## Develop

```bash
npm install
npm run dev
```

It opens on http://localhost:5173 and forwards `/v1` to the agent on http://localhost:8080. Set `AGENT_URL` to use another agent.

## Container

```bash
docker build -t wealth-advisor-app .
docker run -p 127.0.0.1:5173:8080 -e AGENT_URL=http://host.docker.internal:8080 wealth-advisor-app
```

nginx serves the built app on port 8080 and forwards `/v1` to `AGENT_URL`, unbuffered, so the agent's events stream through as they happen. `AGENT_URL` defaults to `http://wealth-advisor-agent:8080`, the agent's Service in a cluster.
