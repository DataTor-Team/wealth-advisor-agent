import { useCallback, useRef, useState } from "react";
import { applyEvent, type Run, streamAgent } from "./agent";
import { AdvicePanel } from "./components/AdvicePanel";
import { AgentSteps } from "./components/AgentSteps";
import { HopByHop } from "./components/HopByHop";
import { type Transcript, TranscriptPanel } from "./components/TranscriptPanel";
import { useNow } from "./time";

// One side panel at a time: turning one on turns the other off.
type Panel = "steps" | "hops";

const COLUMNS: Record<Panel | "none", string> = {
  none: "",
  steps: "xl:grid-cols-[minmax(300px,340px)_minmax(0,1fr)_minmax(360px,440px)]",
  hops: "xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(440px,560px)]",
};

export function App() {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const controller = useRef<AbortController>(null);
  const running = Boolean(run && !run.advice && !run.error);
  const now = useNow(running);

  const start = useCallback((text: string) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    // A newer run, or Clear, aborts this one, and its late events are dropped.
    const update = (change: (current: Run) => Run) =>
      setRun((current) => (current && !abort.signal.aborted ? change(current) : current));

    setRun({ startedAt: performance.now(), reports: {}, hops: [] });
    streamAgent(text, (event) => update((current) => applyEvent(current, event)), abort.signal)
      .then(() =>
        update((current) =>
          current.advice || current.error ? current : { ...current, error: "The agent stopped before it wrote the advice." },
        ),
      )
      .catch((error: Error) => update((current) => ({ ...current, error: error.message })));
  }, []);

  function load(next: Transcript) {
    setTranscript(next);
    start(next.text);
  }

  function clear() {
    controller.current?.abort();
    setTranscript(null);
    setRun(null);
  }

  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-rule/70 bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-[1680px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-ink pb-0.5 font-display text-[21px] italic text-[#d9b46a]">
              W
            </span>
            <div>
              <p className="font-display text-[21px] leading-none tracking-[-0.01em]">Wealth Advisor</p>
              <p className="eyebrow mt-1">Client call review</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Switch label="Agent steps" on={panel === "steps"} onClick={() => toggle("steps")} />
            <Switch label="Hop by hop" on={panel === "hops"} onClick={() => toggle("hops")} />
          </div>
        </div>
      </header>

      <main
        className={`mx-auto grid max-w-[1680px] items-start gap-6 p-6 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] ${
          COLUMNS[panel ?? "none"]
        }`}
      >
        <TranscriptPanel
          transcript={transcript}
          busy={running}
          onLoad={load}
          onRerun={() => transcript && start(transcript.text)}
          onClear={clear}
        />
        <AdvicePanel run={run} now={now} />
        {panel === "steps" && <AgentSteps run={run} now={now} />}
        {panel === "hops" && <HopByHop key={run?.startedAt} run={run} now={now} />}
      </main>
    </div>
  );
}

function Switch({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-3">
      <span className="eyebrow">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onClick}
        className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-ink" : "bg-rule"}`}
      >
        <span
          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-sheet shadow-sm transition-transform ${
            on ? "translate-x-5" : ""
          }`}
        />
      </button>
    </label>
  );
}
