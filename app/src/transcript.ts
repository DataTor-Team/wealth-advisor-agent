export interface Turn {
  time: string;
  speaker: string;
  text: string;
}

const CUE = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,]\d{3}\s+-->/;
const SAID = /^([^:]{1,48}):\s+(.+)$/;

/** Speaker turns from a WebVTT or "Name: words" transcript. Other lines join the turn before them. */
export function parseTranscript(text: string): Turn[] {
  const turns: Turn[] = [];
  let time = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line === "WEBVTT" || /^\d+$/.test(line)) continue;
    const cue = CUE.exec(line);
    if (cue) {
      const [, hours, minutes, seconds] = cue;
      time = `${Number(hours ?? 0) * 60 + Number(minutes)}:${seconds}`;
      continue;
    }
    const said = SAID.exec(line);
    if (said) turns.push({ time, speaker: said[1], text: said[2] });
    else if (turns.length > 0) turns[turns.length - 1].text += ` ${line}`;
    else turns.push({ time, speaker: "", text: line });
  }
  return turns;
}
