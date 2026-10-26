"""A LangGraph orchestrator-worker agent that turns a banker-client call transcript into advice.

    START → orchestrator ─┬→ worker: sentiment     ─┬→ synthesizer → END
                          ├→ worker: opportunities ─┤
                          ├→ worker: risk_profile  ─┤
                          └→ worker: action_items  ─┘

The orchestrator reads the transcript once and writes a summary of the call, plus a short brief for
each worker. Every worker gets the summary, its brief and the full transcript, and they all run in
parallel. The synthesizer reads the summary and the four reports, decides whether to proceed with
investments, and writes the advice the banker can give the client. Every node is a prompt and one
model call: no tools, no skills, no MCP. The orchestrator and the synthesizer reply in JSON, parsed
into the models below.
"""

import json
import operator
import os
from typing import Annotated, Literal, TypedDict

from langchain_core.output_parsers import PydanticOutputParser
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from pydantic import BaseModel, Field

Worker = Literal["sentiment", "opportunities", "risk_profile", "action_items"]

WORKERS: dict[Worker, str] = {
    "sentiment": "the client's mood, trust in the bank, worries and readiness to invest",
    "opportunities": "investments the client raised or that suit them, with amounts and timing",
    "risk_profile": "the client's risk tolerance, time horizon, goals, liquidity needs and taxes",
    "action_items": "follow-ups the banker or the client agreed to, with an owner and a date",
}


class Plan(BaseModel):
    call_summary: str = Field(description="What happened on the call, in under 100 words.")
    briefs: dict[Worker, str] = Field(
        description="For each worker, where in the call to look, in one or two sentences."
    )


class Recommendation(BaseModel):
    decision: Literal["yes", "no"] = Field(description="Proceed further with investments?")
    summary: str = Field(description="The best advice for this client and why, in 2-3 sentences.")
    talking_points: list[str] = Field(description="What the banker can say to the client.")
    next_steps: list[str] = Field(description="What the banker should do after the call.")


def reply_as(model: type[BaseModel]) -> str:
    """Asks for the answer as JSON text, so structured output needs no tool call."""
    schema = json.dumps(model.model_json_schema())
    return f"Reply with only a JSON object that matches this schema, and nothing else:\n{schema}"


ORCHESTRATOR_PROMPT = (
    "You orchestrate a wealth advisory agent that supports a banker on a call with a client. "
    "Read the transcript once. Write a summary of the call, under 100 words, that every worker "
    "will start from: who is on it, what the client wants, and the amounts, dates and concerns "
    "that came up. Every worker waits for you, so keep it short. Then "
    "write each worker a brief of one or two sentences that points it at the moments in this "
    "call that matter for its job; the worker does the analysis.\n\nWorkers:\n"
    + "\n".join(f"- {worker}: {job}" for worker, job in WORKERS.items())
    + "\n\n"
    + reply_as(Plan)
)

WORKER_PROMPT = (
    "You are the {worker} worker of a wealth advisory agent that supports a banker on a call "
    "with a client. Report on {job}. Start from the summary, then check it against the "
    "transcript: use only what the transcript says, quote the client briefly as evidence, and "
    "keep it under 150 words."
)

SYNTHESIZER_PROMPT = (
    "You orchestrate a wealth advisory agent that supports a banker on a call with a client. "
    "From the summary of the call and your workers' reports, decide whether the banker should "
    "proceed further with investments, and write the advice the banker can give the client. "
    "Decide yes when the client wants to move forward, even with details still open. Decide no "
    "when they are not ready or their goals or risk tolerance are unclear, and make the next "
    "steps close that gap. Use only what the summary and the reports say.\n\n"
    + reply_as(Recommendation)
)


class State(TypedDict):
    transcript: str
    call_summary: str
    briefs: dict[Worker, str]
    reports: Annotated[dict[Worker, str], operator.or_]  # each worker merges in its own report
    recommendation: Recommendation


class WorkerState(TypedDict):
    transcript: str
    call_summary: str
    worker: Worker
    brief: str


# The runtime's AI gateway: ChatOpenAI reads OPENAI_BASE_URL and OPENAI_API_KEY.
llm = ChatOpenAI(model=os.environ["AGENT_MODEL"])
planner = llm | PydanticOutputParser(pydantic_object=Plan)
advisor = llm | PydanticOutputParser(pydantic_object=Recommendation)


async def orchestrator(state: State) -> dict:
    plan = await planner.ainvoke([("system", ORCHESTRATOR_PROMPT), ("human", state["transcript"])])
    return {"call_summary": plan.call_summary, "briefs": plan.briefs}


def assign_workers(state: State) -> list[Send]:
    """Every worker gets the transcript, the summary and its own brief (its job, if none came)."""
    shared = {"transcript": state["transcript"], "call_summary": state["call_summary"]}
    return [
        Send("worker", {**shared, "worker": worker, "brief": state["briefs"].get(worker, job)})
        for worker, job in WORKERS.items()
    ]


async def worker(state: WorkerState) -> dict:
    name = state["worker"]
    system = WORKER_PROMPT.format(worker=name, job=WORKERS[name])
    human = (
        f"Summary of the call:\n{state['call_summary']}\n\nYour brief: {state['brief']}"
        f"\n\nTranscript:\n{state['transcript']}"
    )
    report = await llm.ainvoke([("system", system), ("human", human)])
    return {"reports": {name: report.text}}


async def synthesizer(state: State) -> dict:
    reports = "\n\n".join(f"## {worker}\n{report}" for worker, report in state["reports"].items())
    human = f"Summary of the call:\n{state['call_summary']}\n\n{reports}"
    recommendation = await advisor.ainvoke([("system", SYNTHESIZER_PROMPT), ("human", human)])
    return {"recommendation": recommendation}


builder = StateGraph(State)
builder.add_node("orchestrator", orchestrator)
builder.add_node("worker", worker)
builder.add_node("synthesizer", synthesizer)
builder.add_edge(START, "orchestrator")
builder.add_conditional_edges("orchestrator", assign_workers, ["worker"])
builder.add_edge("worker", "synthesizer")
builder.add_edge("synthesizer", END)
graph = builder.compile()
