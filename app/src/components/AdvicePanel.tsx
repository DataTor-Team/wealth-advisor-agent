import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { type Recommendation, type Run, stageOf, WORKERS } from "../agent";
import { seconds } from "../time";

export function AdvicePanel({ run, now }: { run: Run | null; now: number }) {
  return (
    <section className="sheet min-h-[560px] p-8 lg:p-12">
      {!run ? (
        <Empty />
      ) : run.advice ? (
        <Advice key={run.startedAt} run={run} recommendation={run.advice.recommendation} answeredAt={run.advice.at} />
      ) : run.error ? (
        <Stopped error={run.error} />
      ) : (
        <Working run={run} now={now} />
      )}
    </section>
  );
}

function Empty() {
  const steps = [
    "Add the call transcript, a .vtt or .txt file from Zoom.",
    "The agent reads the whole call. It takes under a minute.",
    "You get a yes or no on investing, what to say, and what to do next.",
  ];
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="eyebrow">Advice</p>
      <h2 className="mt-3 max-w-[16ch] font-display text-[46px] leading-[1.04] tracking-[-0.02em]">
        Upload a client call to see the advice.
      </h2>
      <ol className="mt-10 max-w-[54ch] space-y-4">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-4 text-[15px] leading-[1.55]">
            <span className="pt-[3px] font-mono text-[12px] text-brass">{String(index + 1).padStart(2, "0")}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const STAGES = [
  { stage: "orchestrator", label: "Reading the call" },
  { stage: "workers", label: "Analysing the call" },
  { stage: "synthesizer", label: "Writing the advice" },
] as const;

function Working({ run, now }: { run: Run; now: number }) {
  const current = STAGES.findIndex((step) => step.stage === stageOf(run));
  const workers = Object.keys(WORKERS);
  const finished = Object.keys(run.reports).length;
  const detail = [
    run.plan ? "Summary written, 4 workers briefed" : "Summarising the call",
    `${finished} of ${workers.length} workers done`,
    "Weighing the summary and the reports",
  ];
  return (
    <div aria-live="polite">
      <p className="eyebrow">Working · {seconds(now - run.startedAt)}</p>
      <h2 className="mt-3 font-display text-[38px] leading-tight tracking-[-0.015em]">{STAGES[current].label}…</h2>
      <ol className="mt-10 max-w-[480px] space-y-5">
        {STAGES.map((step, index) => (
          <li
            key={step.stage}
            data-state={index < current ? "done" : index === current ? "running" : "waiting"}
            className="flex items-center gap-4"
          >
            <span className="node small">{index < current && <Check className="h-3 w-3" strokeWidth={3} />}</span>
            <span className={index > current ? "text-ink-soft" : ""}>{step.label}</span>
            <span className="ml-auto font-mono text-[11px] text-ink-soft">{index <= current ? detail[index] : ""}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Stopped({ error }: { error: string }) {
  return (
    <div role="alert" className="border-l-[3px] border-hold pl-6">
      <p className="eyebrow text-hold">Stopped</p>
      <h2 className="mt-3 font-display text-[32px] leading-tight">The agent could not finish this call.</h2>
      <p className="mt-3 max-w-[64ch] break-words text-[14px] leading-[1.6] text-ink-soft">{error}</p>
      <p className="mt-3 text-[14px] text-ink-soft">Check that the agent is running, then choose Run again.</p>
    </div>
  );
}

interface AdviceProps {
  run: Run;
  recommendation: Recommendation;
  answeredAt: number;
}

function Advice({ run, recommendation, answeredAt }: AdviceProps) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [copyNote, setCopyNote] = useState("");
  const yes = recommendation.decision === "yes";

  function toggle(index: number) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function copy() {
    const copied = await navigator.clipboard.writeText(asText(recommendation)).then(
      () => true,
      () => false,
    );
    setCopyNote(copied ? "Copied" : "The browser blocked copying");
    setTimeout(() => setCopyNote(""), 2500);
  }

  return (
    <article>
      <section className="reveal">
        <p className="eyebrow">01 · Recommendation</p>
        <div className={`mt-5 border-l-[3px] pl-6 ${yes ? "border-proceed" : "border-hold"}`}>
          <h2
            className={`font-display text-[76px] leading-[0.92] tracking-[-0.03em] ${yes ? "text-proceed" : "text-hold"}`}
          >
            {yes ? "Proceed." : "Hold."}
          </h2>
          <p className="mt-3 eyebrow">{yes ? "Proceed with investments" : "Hold off on investments for now"}</p>
        </div>
        <p className="mt-8 max-w-[64ch] font-display text-[21px] leading-[1.5]">{recommendation.summary}</p>
      </section>

      <section className="reveal mt-14" style={{ animationDelay: "120ms" }}>
        <Heading number="02" title="Say to the client" />
        <ul className="mt-6 space-y-5">
          {recommendation.talking_points.map((point) => (
            <li key={point} className="grid grid-cols-[1.75rem_1fr] gap-3">
              <span aria-hidden className="font-display text-[44px] leading-[0.8] text-brass">
                “
              </span>
              <p className="max-w-[68ch] text-[16px] leading-[1.6]">{unquote(point)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="reveal mt-14" style={{ animationDelay: "240ms" }}>
        <Heading
          number="03"
          title="Next steps"
          note={`${ticked.size} of ${recommendation.next_steps.length} done`}
        />
        <ol className="mt-2">
          {recommendation.next_steps.map((step, index) => {
            const done = ticked.has(index);
            return (
              <li key={step} className="border-b border-rule/60 last:border-0">
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  aria-pressed={done}
                  className="group flex w-full items-start gap-4 py-4 text-left"
                >
                  <span
                    className={`mt-[3px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors ${
                      done ? "border-ink bg-ink text-sheet" : "border-rule group-hover:border-ink/50"
                    }`}
                  >
                    {done && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span
                    className={`max-w-[68ch] flex-1 text-[15px] leading-[1.6] transition-colors ${
                      done ? "text-ink-soft line-through decoration-rule" : ""
                    }`}
                  >
                    {step}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <footer
        className="reveal mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-rule/70 pt-5"
        style={{ animationDelay: "360ms" }}
      >
        <p className="font-mono text-[11px] text-ink-soft">
          Answered in {seconds(answeredAt - run.startedAt)} · {Object.keys(run.reports).length} workers
        </p>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2 text-[13px] transition-colors hover:border-ink/40"
        >
          {copyNote === "Copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copyNote || "Copy advice"}
        </button>
      </footer>
    </article>
  );
}

function Heading({ number, title, note }: { number: string; title: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-rule/70 pb-3">
      <span className="font-mono text-[11px] text-brass">{number}</span>
      <h3 className="font-display text-[25px] leading-none tracking-[-0.01em]">{title}</h3>
      {note && <span className="ml-auto font-mono text-[11px] text-ink-soft">{note}</span>}
    </div>
  );
}

const unquote = (text: string) => text.replace(/^["“]+|["”]+$/g, "");

function asText(recommendation: Recommendation): string {
  return [
    recommendation.decision === "yes" ? "Proceed with investments." : "Hold off on investments for now.",
    "",
    recommendation.summary,
    "",
    "Say to the client:",
    ...recommendation.talking_points.map((point) => `- ${unquote(point)}`),
    "",
    "Next steps:",
    ...recommendation.next_steps.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}
