import { Check, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import Markdown from "react-markdown";
import { type Run, stageOf, type Worker, WORKERS } from "../agent";
import { seconds } from "../time";

type State = "waiting" | "running" | "done" | "error";

/** The orchestrator-worker flow as it runs: what each node was asked to do, and what it produced. */
export function AgentSteps({ run, now }: { run: Run | null; now: number }) {
  const stage = run ? stageOf(run) : null;
  const plan = run?.plan;
  const reports = run?.reports ?? {};
  const workers = Object.keys(WORKERS) as Worker[];
  const reportTimes = workers.map((worker) => reports[worker]?.at ?? 0);
  const workersDoneAt = Math.max(0, ...reportTimes);
  const finished = reportTimes.filter(Boolean).length;

  const state = (node: "orchestrator" | "workers" | "synthesizer"): State => {
    const order = ["orchestrator", "workers", "synthesizer", "done"];
    if (!run || !stage) return "waiting";
    if (order.indexOf(stage) > order.indexOf(node)) return "done";
    if (stage !== node) return "waiting";
    return run.error ? "error" : "running";
  };

  return (
    <aside className="sheet reveal flex flex-col overflow-hidden lg:col-span-2 xl:sticky xl:top-24 xl:col-span-1 xl:max-h-[calc(100vh-7.5rem)]">
      <header className="border-b border-rule/70 p-6 pb-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow">Agent steps</p>
          <p className="font-mono text-[11px] text-ink-soft">
            {!run
              ? "Not run yet"
              : run.advice
                ? `Done in ${seconds(run.advice.at - run.startedAt)}`
                : run.error
                  ? "Stopped"
                  : `Running · ${seconds(now - run.startedAt)}`}
          </p>
        </div>
        <h2 className="mt-2 font-display text-[24px] leading-tight">How the advice is made</h2>
        <p className="mt-1 text-[13px] leading-[1.5] text-ink-soft">
          An orchestrator summarises the call and briefs every worker, the workers read the call in parallel,
          and a synthesizer writes the advice from the summary and their reports.
        </p>
      </header>

      <ol className="flex-1 overflow-y-auto p-6">
        <Step
          state={state("orchestrator")}
          title="Orchestrator"
          timing={run && (plan ? seconds(plan.at - run.startedAt) : !run.error && seconds(now - run.startedAt))}
          job="Reads the transcript once, writes a summary of the call, and writes each worker a brief."
        >
          {plan && (
            <div className="reveal mt-3 rounded-xl bg-paper/80 p-4">
              <p className="eyebrow">Summary of the call</p>
              <p className="mt-1.5 text-[13px] leading-[1.55]">{plan.call_summary}</p>
            </div>
          )}
        </Step>

        <Step
          state={state("workers")}
          title="Workers"
          tag="in parallel"
          timing={plan && `${finished} of ${workers.length} done`}
          job="Every worker gets the summary, its brief and the whole transcript. They run at the same time."
        >
          <ul className="lanes mt-4 space-y-4">
            {workers.map((worker) => (
              <Lane key={`${run?.startedAt}-${worker}`} worker={worker} run={run} now={now} />
            ))}
          </ul>
        </Step>

        <Step
          state={state("synthesizer")}
          title="Synthesizer"
          timing={
            run &&
            plan &&
            (run.advice
              ? seconds(run.advice.at - workersDoneAt)
              : stage === "synthesizer" && !run.error && seconds(now - workersDoneAt))
          }
          job="Reads the summary and the four reports, decides yes or no, and writes the advice."
        >
          {run?.advice && (
            <div className="reveal mt-3 rounded-xl bg-paper/80 p-4">
              <p
                className={`font-display text-[22px] leading-none ${
                  run.advice.recommendation.decision === "yes" ? "text-proceed" : "text-hold"
                }`}
              >
                {run.advice.recommendation.decision === "yes" ? "Proceed." : "Hold."}
              </p>
              <p className="mt-2 text-[13px] leading-[1.55] text-ink-soft">{run.advice.recommendation.summary}</p>
            </div>
          )}
          {run?.error && <p className="mt-3 break-words text-[13px] leading-[1.55] text-hold">{run.error}</p>}
        </Step>
      </ol>
    </aside>
  );
}

interface StepProps {
  state: State;
  title: string;
  tag?: string;
  timing?: ReactNode;
  job: string;
  children?: ReactNode;
}

function Step({ state, title, tag, timing, job, children }: StepProps) {
  return (
    <li className="step" data-state={state}>
      <span className="node">
        <Mark state={state} />
      </span>
      <div className="min-w-0 flex-1 pt-[3px]">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium">
            {title}
            {tag && <span className="eyebrow ml-2">{tag}</span>}
          </p>
          <p className="shrink-0 font-mono text-[11px] tabular-nums text-ink-soft">{timing || ""}</p>
        </div>
        <p className="mt-1 text-[13px] leading-[1.5] text-ink-soft">{job}</p>
        {children}
      </div>
    </li>
  );
}

function Lane({ worker, run, now }: { worker: Worker; run: Run | null; now: number }) {
  const [open, setOpen] = useState(false);
  const plan = run?.plan;
  const brief = plan?.briefs[worker];
  const report = run?.reports[worker];
  const state: State = !plan ? "waiting" : report ? "done" : run?.error ? "error" : "running";
  const timing =
    plan && report ? seconds(report.at - plan.at) : plan && state === "running" ? seconds(now - plan.at) : "";

  return (
    <li data-state={state} className="relative flex gap-3">
      <span className="node small">
        <Mark state={state} small />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[14px] font-medium">{WORKERS[worker].label}</p>
          <p className="shrink-0 font-mono text-[11px] tabular-nums text-ink-soft">{timing}</p>
        </div>
        {brief ? (
          <p className="mt-1 text-[12.5px] leading-[1.5]">
            <span className="eyebrow mr-1.5 text-brass">Brief</span>
            <span className="text-ink-soft">{brief}</span>
          </p>
        ) : (
          <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-soft">{WORKERS[worker].job}</p>
        )}
        {report && (
          <div className="reveal mt-3 rounded-xl border border-rule/70 bg-paper/60 p-3">
            <div className={`report ${open ? "" : "clamped"}`}>
              <Markdown>{report.text}</Markdown>
            </div>
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="mt-2 text-[12px] font-medium text-brass hover:underline"
            >
              {open ? "Show less" : "Read the report"}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function Mark({ state, small }: { state: State; small?: boolean }) {
  const size = small ? "h-2.5 w-2.5" : "h-3.5 w-3.5";
  if (state === "done") return <Check className={size} strokeWidth={3} />;
  if (state === "error") return <X className={size} strokeWidth={3} />;
  return null;
}
