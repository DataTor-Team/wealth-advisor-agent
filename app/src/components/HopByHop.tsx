import { ArrowRight, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Hop, type Run, type Worker, WORKERS } from "../agent";
import { seconds } from "../time";

interface ModelRequest {
  model: string | null;
  messages: { role: string; content: unknown }[];
  tools: string[];
}

interface ModelResponse {
  content: unknown;
  finish_reason: string | null;
  usage: { input_tokens: number; output_tokens: number } | null;
  seconds: number;
}

const NAMES: Record<string, string> = {
  app: "Banker app",
  api: "Agent API",
  graph: "Graph",
  orchestrator: "Orchestrator",
  router: "Router",
  state: "State",
  synthesizer: "Synthesizer",
  model: "Model",
};

const DOTS: Record<string, string> = {
  orchestrator: "var(--color-brass)",
  synthesizer: "var(--color-brass)",
  model: "var(--color-sea)",
  "worker:sentiment": "var(--color-umber)",
  "worker:opportunities": "var(--color-teal)",
  "worker:risk_profile": "var(--color-mauve)",
  "worker:action_items": "var(--color-olive)",
};

const KINDS: Record<Hop["kind"], string> = {
  request: "Request",
  invoke: "Invoke",
  input: "Input",
  route: "Route",
  update: "State update",
  response: "Response",
  output: "Output",
  error: "Error",
};

const nameOf = (id: string) =>
  id.startsWith("worker:") ? `${WORKERS[id.slice(7) as Worker]?.label ?? id.slice(7)} worker` : (NAMES[id] ?? id);

const text = (content: unknown) => (typeof content === "string" ? content : JSON.stringify(content, null, 2));

const toolsOf = (request: ModelRequest) =>
  request.tools.length ? `offering tools: ${request.tools.join(", ")}` : "no tools";

/** Every hop of the run in order: who sent what to whom, with the full payload behind each one. */
export function HopByHop({ run, now }: { run: Run | null; now: number }) {
  const hops = run?.hops ?? [];
  const [open, setOpen] = useState<Set<number>>(new Set());
  const list = useRef<HTMLOListElement>(null);
  const running = Boolean(run && !run.advice && !run.error);
  const waiting = running ? waitingOnModel(hops) : new Set<number>();

  // Follow new hops as they arrive, unless the reader has scrolled up to an earlier one.
  useEffect(() => {
    const element = list.current;
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 200) {
      element.scrollTop = element.scrollHeight;
    }
  }, [hops.length]);

  function toggle(n: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  const status = !run
    ? "Not run yet"
    : `${hops.length} hops · ${
        run.advice ? seconds(run.advice.at - run.startedAt) : run.error ? "stopped" : seconds(now - run.startedAt)
      }`;

  return (
    <aside className="sheet reveal flex flex-col overflow-hidden lg:col-span-2 xl:sticky xl:top-24 xl:col-span-1 xl:max-h-[calc(100vh-7.5rem)]">
      <header className="border-b border-rule/70 p-6 pb-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow">Hop by hop</p>
          <p className="font-mono text-[11px] text-ink-soft">{status}</p>
        </div>
        <h2 className="mt-2 font-display text-[24px] leading-tight">Every request and response</h2>
        <p className="mt-1 text-[13px] leading-[1.5] text-ink-soft">
          Each hop between the banker app, the agent API, the graph, its nodes and the model, in the order it
          happened. Open a hop to see its full payload. ‹transcript› marks where the call transcript is passed
          along.
        </p>
        {hops.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(open.size > 0 ? new Set() : new Set(hops.map((hop) => hop.n)))}
            className="mt-3 text-[12px] font-medium text-brass hover:underline"
          >
            {open.size > 0 ? "Collapse all" : "Expand all"}
          </button>
        )}
      </header>

      <ol ref={list} className="flex-1 space-y-1 overflow-y-auto p-4">
        {hops.length === 0 && (
          <li className="p-2 text-[13px] text-ink-soft">
            {run ? "Waiting for the first hop…" : "Run the agent to see each hop."}
          </li>
        )}
        {hops.map((hop) => (
          <HopRow
            key={hop.n}
            hop={hop}
            open={open.has(hop.n)}
            onToggle={() => toggle(hop.n)}
            waitedMs={run && waiting.has(hop.n) ? now - run.startedAt - hop.t * 1000 : null}
          />
        ))}
      </ol>
    </aside>
  );
}

interface HopRowProps {
  hop: Hop;
  open: boolean;
  onToggle: () => void;
  waitedMs: number | null;
}

function HopRow({ hop, open, onToggle, waitedMs }: HopRowProps) {
  return (
    <li className="reveal grid grid-cols-[3rem_minmax(0,1fr)] gap-2">
      <div className="pt-[11px] text-right font-mono text-[10.5px] leading-[1.45] tabular-nums text-ink-soft">
        <p className="text-ink">#{String(hop.n).padStart(2, "0")}</p>
        <p>{hop.t.toFixed(2)} s</p>
      </div>
      <div className={`min-w-0 rounded-xl border transition-colors ${open ? "border-rule bg-paper/60" : "border-transparent"}`}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-paper/70"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Chip id={hop.from} />
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-brass" />
            <Chip id={hop.to} />
            <span className={`eyebrow ml-auto shrink-0 pl-2 ${hop.kind === "error" ? "text-hold" : ""}`}>
              {KINDS[hop.kind]}
            </span>
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform ${open ? "rotate-90" : ""}`}
            />
          </span>
          <span className="mt-1.5 block text-[12.5px] leading-[1.5] text-ink-soft">{summary(hop)}</span>
          {waitedMs !== null && (
            <span className="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-brass">
              <span className="waiting-dot" />
              waiting for the model · {seconds(waitedMs)}
            </span>
          )}
        </button>
        {open && (
          <div className="space-y-3 px-3 pb-3">
            <Payload hop={hop} />
          </div>
        )}
      </div>
    </li>
  );
}

function Chip({ id }: { id: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-rule bg-sheet px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.08em]">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: DOTS[id] ?? "var(--color-ink-soft)" }} />
      <span className="truncate">{nameOf(id)}</span>
    </span>
  );
}

function summary(hop: Hop): string {
  if (hop.to === "model") {
    const request = hop.data as ModelRequest;
    const roles = request.messages.map((message) => message.role).join(" + ");
    return `${roles} messages, ${toolsOf(request)}`;
  }
  if (hop.from === "model" && hop.kind === "response") {
    const response = hop.data as ModelResponse;
    const usage = response.usage
      ? `, ${response.usage.input_tokens.toLocaleString()} tokens in, ${response.usage.output_tokens.toLocaleString()} out`
      : "";
    return `Text, ${text(response.content).length.toLocaleString()} characters${usage}, after ${response.seconds.toFixed(1)} s`;
  }
  const data = hop.data as Record<string, unknown>;
  switch (hop.kind) {
    case "request":
      return `${data.method} ${data.path} with the transcript`;
    case "invoke":
      return "Starts the graph with the transcript as its state";
    case "input":
      return hop.to.startsWith("worker:")
        ? `A Send with the summary, the transcript and its brief: ${data.brief}`
        : `Node input: ${Object.keys(data).join(", ")}`;
    case "route": {
      const sends = hop.data as { arg: { worker: string } }[];
      const workers = sends.map((send) => nameOf(`worker:${send.arg.worker}`)).join(", ");
      return `Sends all ${sends.length} workers the summary, the transcript and a brief each: ${workers}`;
    }
    case "update":
      return describeUpdate(data);
    case "output":
      return `Final state: ${Object.keys(data).join(", ")}`;
    case "response":
      return "HTTP 200: the event stream ends";
    case "error":
      return String(data.error);
  }
}

function describeUpdate(update: Record<string, unknown>): string {
  if (update.call_summary) {
    const briefs = Object.keys(update.briefs as Record<string, string>).length;
    return `Writes the summary of the call and ${briefs} briefs`;
  }
  if (update.reports) {
    const [[worker, report]] = Object.entries(update.reports as Record<string, string>);
    return `Writes reports.${worker}: ${report.length.toLocaleString()} characters, merged with the others`;
  }
  if (update.recommendation) {
    const { decision } = update.recommendation as { decision: string };
    return `Writes the recommendation: ${decision === "yes" ? "proceed" : "hold"}`;
  }
  return `Writes ${Object.keys(update).join(", ")}`;
}

function Payload({ hop }: { hop: Hop }) {
  if (hop.to === "model") {
    const request = hop.data as ModelRequest;
    return (
      <>
        <Facts items={{ model: request.model, tools: request.tools.join(", ") || "none" }} />
        {request.messages.map((message, index) => (
          <Block key={index} label={`${message.role} message`}>
            {text(message.content)}
          </Block>
        ))}
      </>
    );
  }
  if (hop.from === "model" && hop.kind === "response") {
    const response = hop.data as ModelResponse;
    return (
      <>
        <Facts
          items={{
            "finish reason": response.finish_reason,
            "tokens in": response.usage?.input_tokens,
            "tokens out": response.usage?.output_tokens,
            took: `${response.seconds} s`,
          }}
        />
        <Block label="Text">{text(response.content)}</Block>
      </>
    );
  }
  return <Block label="Payload">{JSON.stringify(hop.data, null, 2)}</Block>;
}

function Facts({ items }: { items: Record<string, string | number | null | undefined> }) {
  const shown = Object.entries(items).filter(([, value]) => value !== null && value !== undefined);
  return (
    <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
      {shown.map(([label, value]) => `${label} ${value}`).join(" · ")}
    </p>
  );
}

function Block({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-rule/60 bg-sheet p-2.5 font-mono text-[11px] leading-[1.55]">
        {children}
      </pre>
    </div>
  );
}

/** Model requests still waiting for their response, by hop number. */
function waitingOnModel(hops: Hop[]): Set<number> {
  const asked = new Map<string, number>();
  for (const hop of hops) {
    if (hop.to === "model") asked.set(hop.from, hop.n);
    if (hop.from === "model") asked.delete(hop.to);
  }
  return new Set(asked.values());
}
