"""Every hop of one run as an event: what the caller sent, what each node received and returned,
what each node asked the model and what came back, and how the router fanned the work out."""

import time
from collections.abc import Callable
from typing import Any
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.messages import BaseMessage
from langchain_core.outputs import LLMResult

NODES = {"orchestrator", "worker", "synthesizer"}
# Where each node's input comes from: START, a Send from the router, or the filled-in state.
SOURCES = {"orchestrator": "graph", "worker": "router", "synthesizer": "state"}


class Hops(AsyncCallbackHandler):
    """Turns the graph's callbacks into hops, without changing how the graph or the model runs."""

    run_inline = True  # handle callbacks in the order they fire

    def __init__(self, transcript: str, emit: Callable[[dict], None]):
        self.transcript = transcript
        self.marker = f"‹transcript, {len(transcript):,} characters›"
        self.emit = emit
        self.started = time.monotonic()
        self.count = 0
        self.runs: dict[UUID, tuple[str, str]] = {}  # run id -> (owner, kind of run)
        self.asked: dict[UUID, float] = {}  # model run id -> when its request went out

    def hop(self, sender: str, receiver: str, kind: str, data: Any) -> None:
        self.count += 1
        hop = {
            "n": self.count,
            "t": round(time.monotonic() - self.started, 3),
            "from": sender,
            "to": receiver,
            "kind": kind,
            "data": self.shorten(jsonable_encoder(data)),
        }
        self.emit({"hop": hop})

    def shorten(self, value: Any) -> Any:
        """Names the transcript instead of repeating it in every hop that passes it along."""
        if isinstance(value, str):
            return value.replace(self.transcript, self.marker)
        if isinstance(value, dict):
            return {key: self.shorten(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self.shorten(item) for item in value]
        return value

    async def on_chain_start(
        self,
        serialized: dict[str, Any] | None,
        inputs: dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        name = kwargs.get("name")
        if parent_run_id is None:
            self.runs[run_id] = ("graph", "graph")
            self.hop("api", "graph", "invoke", inputs)
        elif name in NODES and name == (metadata or {}).get("langgraph_node"):
            owner = f"worker:{inputs['worker']}" if name == "worker" else name
            self.runs[run_id] = (owner, "node")
            self.hop(SOURCES[name], owner, "input", inputs)
        elif name == "assign_workers":
            self.runs[run_id] = ("router", "router")
        else:  # a step inside a node, such as the structured-output parser
            self.runs[run_id] = (self.runs.get(parent_run_id, ("graph", ""))[0], "inner")

    async def on_chain_end(self, outputs: Any, *, run_id: UUID, **kwargs: Any) -> None:
        owner, kind = self.runs.get(run_id, ("graph", "inner"))
        if kind == "graph":
            self.hop("graph", "api", "output", outputs)
        elif kind == "node":
            self.hop(owner, "state", "update", outputs)
        elif kind == "router":
            sends = [{"node": send.node, "arg": send.arg} for send in outputs]
            self.hop("orchestrator", "router", "route", sends)

    async def on_chain_error(self, error: BaseException, *, run_id: UUID, **kwargs: Any) -> None:
        owner, kind = self.runs.get(run_id, ("graph", "inner"))
        if kind == "node":
            self.hop(owner, "state", "error", {"error": str(error)})

    async def on_chat_model_start(
        self,
        serialized: dict[str, Any] | None,
        messages: list[list[BaseMessage]],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        owner = self.runs.get(parent_run_id, ("graph", ""))[0]
        self.runs[run_id] = (owner, "model")
        self.asked[run_id] = time.monotonic()
        params = kwargs.get("invocation_params", {})
        request = {
            "model": params.get("model"),
            "messages": [{"role": m.type, "content": m.content} for m in messages[0]],
            # Recorded so the trace proves it: the agent offers the model no tools.
            "tools": [tool["function"]["name"] for tool in params.get("tools", [])],
        }
        self.hop(owner, "model", "request", request)

    async def on_llm_end(self, response: LLMResult, *, run_id: UUID, **kwargs: Any) -> None:
        message = response.generations[0][0].message  # type: ignore[attr-defined]
        answer = {
            "content": message.content,
            "finish_reason": message.response_metadata.get("finish_reason"),
            "usage": message.usage_metadata,
            "seconds": round(time.monotonic() - self.asked.pop(run_id), 2),
        }
        self.hop("model", self.runs[run_id][0], "response", answer)

    async def on_llm_error(self, error: BaseException, *, run_id: UUID, **kwargs: Any) -> None:
        self.hop("model", self.runs[run_id][0], "error", {"error": str(error)})
