// The agent's contract: POST /v1/advice/stream answers with server-sent events: one per finished
// node (the orchestrator's summary and briefs, each worker's report, the synthesizer's advice), and
// one per hop between the app, the API, the graph, its nodes and the model.

export type Worker = "sentiment" | "opportunities" | "risk_profile" | "action_items";

/** What the orchestrator hands every worker: one summary of the call, and a brief each. */
export interface Plan {
  call_summary: string;
  briefs: Partial<Record<Worker, string>>;
}

export interface Recommendation {
  decision: "yes" | "no";
  summary: string;
  talking_points: string[];
  next_steps: string[];
}

/** One hop: who sent what to whom, t seconds after the request reached the agent. */
export interface Hop {
  n: number;
  t: number;
  from: string;
  to: string;
  kind: "request" | "invoke" | "input" | "route" | "update" | "response" | "output" | "error";
  data: unknown;
}

export type AgentEvent =
  | { orchestrator: Plan }
  | { worker: { reports: Partial<Record<Worker, string>> } }
  | { synthesizer: { recommendation: Recommendation } }
  | { hop: Hop }
  | { error: string };

export const WORKERS: Record<Worker, { label: string; job: string }> = {
  sentiment: { label: "Sentiment", job: "How the client feels: mood, trust in the bank, worries, readiness." },
  opportunities: { label: "Opportunities", job: "Investments the client raised or that suit them, with amounts and timing." },
  risk_profile: { label: "Risk profile", job: "Risk tolerance, time horizon, goals, liquidity needs and taxes." },
  action_items: { label: "Action items", job: "Follow-ups agreed on the call, with an owner and a date." },
};

/** One run of the agent, built up event by event. Times are performance.now() readings. */
export interface Run {
  startedAt: number;
  plan?: Plan & { at: number };
  reports: Partial<Record<Worker, { text: string; at: number }>>;
  advice?: { recommendation: Recommendation; at: number };
  hops: Hop[];
  error?: string;
}

export type Stage = "orchestrator" | "workers" | "synthesizer" | "done";

/** The node the run is waiting on. */
export function stageOf(run: Run): Stage {
  if (run.advice) return "done";
  if (!run.plan) return "orchestrator";
  return (Object.keys(WORKERS) as Worker[]).every((worker) => run.reports[worker]) ? "synthesizer" : "workers";
}

export function applyEvent(run: Run, event: AgentEvent, at = performance.now()): Run {
  if ("hop" in event) return { ...run, hops: [...run.hops, event.hop] };
  if ("orchestrator" in event) return { ...run, plan: { ...event.orchestrator, at } };
  if ("worker" in event) {
    const reports = { ...run.reports };
    for (const [worker, text] of Object.entries(event.worker.reports)) {
      reports[worker as Worker] = { text: text ?? "", at };
    }
    return { ...run, reports };
  }
  if ("synthesizer" in event) {
    return { ...run, advice: { recommendation: event.synthesizer.recommendation, at } };
  }
  return { ...run, error: event.error };
}

/** Sends the transcript and hands each event to onEvent until the stream ends. */
export async function streamAgent(
  transcript: string,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch("/v1/advice/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
    signal,
  });
  if (!response.ok || !response.body) {
    const detail = (await response.text()).trim() || response.statusText;
    throw new Error(`The agent answered ${response.status}${detail ? `: ${detail}` : ""}.`);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      if (event.startsWith("data: ")) onEvent(JSON.parse(event.slice("data: ".length)));
    }
  }
}
