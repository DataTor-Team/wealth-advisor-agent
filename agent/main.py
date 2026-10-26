"""The agent as an HTTP service: FastAPI on uvicorn, one async LangGraph run per request, and
nothing kept between requests. Callers are authorized by the gateway in front; model calls go to
the router behind, at OPENAI_BASE_URL."""

import asyncio
import json

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent import Recommendation, Worker, graph
from hops import Hops

app = FastAPI(
    title="Wealth advisor agent",
    version="1.0.0",
    description="Reads a banker-client call transcript and advises on proceeding with investments.",
)


class AdviceRequest(BaseModel):
    transcript: str = Field(min_length=1, description="The call transcript, WebVTT or plain text.")


class Advice(Recommendation):
    call_summary: str = Field(description="The orchestrator's summary of the call.")
    reports: dict[Worker, str] = Field(description="Each worker's report, by worker.")


@app.post("/v1/advice", summary="Advice for one call transcript")
async def advise(body: AdviceRequest) -> Advice:
    result = await graph.ainvoke({"transcript": body.transcript})
    return Advice(
        **result["recommendation"].model_dump(),
        call_summary=result["call_summary"],
        reports=result["reports"],
    )


@app.post(
    "/v1/advice/stream",
    summary="The same advice, streamed as server-sent events",
    description="Each node's output as it finishes, and every hop of the run with its payload.",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def advise_stream(body: AdviceRequest, request: Request) -> StreamingResponse:
    received = {"method": request.method, "path": request.url.path, "body": body.model_dump()}
    return StreamingResponse(steps(body.transcript, received), media_type="text/event-stream")


@app.get("/healthz", summary="Liveness and readiness probe")
def healthz() -> dict:
    return {"status": "ok"}


async def steps(transcript: str, received: dict):
    """Each node's output and every hop of the run, as events, in the order they happen."""
    events: asyncio.Queue[dict | None] = asyncio.Queue()
    hops = Hops(transcript, events.put_nowait)
    hops.hop("app", "api", "request", received)

    async def run() -> None:
        state = {"transcript": transcript}
        try:
            async for update in graph.astream(state, {"callbacks": [hops]}, stream_mode="updates"):
                events.put_nowait(update)
            hops.hop("api", "app", "response", {"status": 200, "content_type": "text/event-stream"})
        except Exception as error:  # the response has started, so the failure goes out as an event
            events.put_nowait({"error": str(error)})
        finally:
            events.put_nowait(None)

    task = asyncio.create_task(run())
    try:
        while (event := await events.get()) is not None:
            yield f"data: {json.dumps(jsonable_encoder(event))}\n\n"
    finally:
        task.cancel()  # the caller has gone, so stop spending on the run
