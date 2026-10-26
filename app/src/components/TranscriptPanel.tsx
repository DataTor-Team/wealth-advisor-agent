import { FileText, RotateCcw, Upload, X } from "lucide-react";
import { type DragEvent, useMemo, useRef, useState } from "react";
import { parseTranscript } from "../transcript";

export interface Transcript {
  name: string;
  text: string;
}

interface Props {
  transcript: Transcript | null;
  busy: boolean;
  onLoad: (transcript: Transcript) => void;
  onRerun: () => void;
  onClear: () => void;
}

const SPEAKER_COLORS = ["text-ink", "text-brass"];

export function TranscriptPanel({ transcript, busy, onLoad, onRerun, onClear }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const turns = useMemo(() => (transcript ? parseTranscript(transcript.text) : []), [transcript]);
  const speakers = [...new Set(turns.map((turn) => turn.speaker).filter(Boolean))];

  async function read(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    if (!text.trim()) {
      setNotice(`${file.name} has no text in it.`);
      return;
    }
    setNotice("");
    onLoad({ name: file.name, text });
  }

  async function loadSample() {
    const response = await fetch("/sample-call.vtt");
    onLoad({ name: "sample-call.vtt", text: await response.text() });
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    read(event.dataTransfer.files[0]);
  }

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={`sheet flex flex-col overflow-hidden lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] ${
        dragging ? "ring-2 ring-brass/40" : ""
      }`}
    >
      <input
        ref={picker}
        type="file"
        accept=".vtt,.txt,text/vtt,text/plain"
        className="hidden"
        onChange={(event) => {
          read(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {transcript ? (
        <>
          <header className="border-b border-rule/70 p-6 pb-5">
            <p className="eyebrow">Transcript</p>
            <div className="mt-3 flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-brass" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{transcript.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                  {[`${turns.length} turns`, `${speakers.length} speakers`, turns.at(-1)?.time].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClear}
                aria-label="Remove the transcript"
                className="rounded-full p-1.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRerun}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-sheet transition-colors hover:bg-ink/85 disabled:cursor-default disabled:bg-ink/40"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${busy ? "animate-spin [animation-direction:reverse]" : ""}`} />
                {busy ? "Reading the call" : "Run again"}
              </button>
              <button
                type="button"
                onClick={() => picker.current?.click()}
                className="rounded-full border border-rule px-4 py-2 text-[13px] transition-colors hover:border-ink/40"
              >
                Replace file
              </button>
            </div>
            {notice && <p className="mt-3 text-[13px] text-hold">{notice}</p>}
          </header>

          <ol className="flex-1 space-y-4 overflow-y-auto p-6">
            {turns.map((turn, index) => (
              <li key={index} className="grid grid-cols-[2.75rem_1fr] gap-3">
                <span className="pt-[2px] font-mono text-[11px] tabular-nums text-ink-soft">{turn.time}</span>
                <div className="min-w-0">
                  {turn.speaker && (
                    <p className={`eyebrow ${SPEAKER_COLORS[speakers.indexOf(turn.speaker)] ?? ""}`}>
                      {turn.speaker}
                    </p>
                  )}
                  <p className="mt-1 text-[14px] leading-[1.55]">{turn.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="p-6">
          <p className="eyebrow">Transcript</p>
          <h2 className="mt-2 font-display text-[26px] leading-tight">The client call</h2>
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className={`mt-6 flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center transition-colors ${
              dragging ? "border-brass bg-brass/5" : "border-rule hover:border-ink/35"
            }`}
          >
            <Upload className="h-6 w-6 text-brass" strokeWidth={1.5} />
            <span className="text-[15px] font-medium">Drop the Zoom transcript here</span>
            <span className="text-[13px] text-ink-soft">or click to choose a .vtt or .txt file</span>
          </button>
          {notice && <p className="mt-3 text-[13px] text-hold">{notice}</p>}
          <button
            type="button"
            onClick={loadSample}
            className="mt-5 text-[13px] text-ink-soft underline decoration-rule underline-offset-4 transition-colors hover:text-ink hover:decoration-ink/40"
          >
            No file to hand? Use a sample call
          </button>
        </div>
      )}
    </section>
  );
}
