import { useEffect, useRef, useState } from "react";
import {
  advance,
  type Direction,
  type Speed,
} from "../timeCursor";

export type PlaybackAction = "play" | "reverse" | "pause";

export function nextDirection(action: PlaybackAction): Direction {
  switch (action) {
    case "play":
      return 1;
    case "reverse":
      return -1;
    case "pause":
      return 0;
  }
}

export type TransportButton = {
  action: PlaybackAction;
  label: string;
  disabled: boolean;
};

export function transportButtons(direction: Direction): [TransportButton, TransportButton] {
  if (direction === 1) {
    return [
      { action: "pause", label: "Pause", disabled: false },
      { action: "reverse", label: "Reverse", disabled: true },
    ];
  }
  if (direction === -1) {
    return [
      { action: "play", label: "Play", disabled: true },
      { action: "pause", label: "Pause", disabled: false },
    ];
  }
  return [
    { action: "play", label: "Play", disabled: false },
    { action: "reverse", label: "Reverse", disabled: false },
  ];
}

const SPEEDS: Speed[] = [0.25, 1, 2, 4];

type Props = {
  t: number;
  tMax: number;
  onTChange: (t: number) => void;
};

export default function Timeline({ t, tMax, onTChange }: Props) {
  const [direction, setDirection] = useState<Direction>(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const tRef = useRef(t);
  const onTChangeRef = useRef(onTChange);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    onTChangeRef.current = onTChange;
  }, [onTChange]);

  useEffect(() => {
    if (direction === 0) return;

    let rafId = 0;
    let lastTs: number | null = null;

    const tick = (ts: number) => {
      if (lastTs !== null) {
        const dt = (ts - lastTs) / 1000;
        const next = advance(tRef.current, dt, direction, speed, tMax);
        if (next !== tRef.current) {
          tRef.current = next;
          onTChangeRef.current(next);
        }
        if (
          (direction === 1 && next >= tMax) ||
          (direction === -1 && next <= 0)
        ) {
          setDirection(0);
          return;
        }
      }
      lastTs = ts;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [direction, speed, tMax]);

  function handleAction(action: PlaybackAction) {
    setDirection(nextDirection(action));
  }

  function handleSlider(value: number) {
    setDirection(0);
    onTChange(value);
  }

  function handleNumericInput(raw: string) {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    setDirection(0);
    onTChange(Math.min(tMax, Math.max(0, parsed)));
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="flex gap-1">
        {transportButtons(direction).map((btn, slot) => (
          <button
            key={slot}
            type="button"
            aria-label={btn.label}
            disabled={btn.disabled}
            onClick={() => handleAction(btn.action)}
            className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-zinc-800"
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`${s}×`}
            aria-pressed={speed === s}
            onClick={() => setSpeed(s)}
            className={`rounded px-2 py-1 text-sm ${
              speed === s
                ? "bg-sky-700 text-white"
                : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        T
        <input
          type="number"
          min={0}
          max={tMax}
          step={0.01}
          value={Number.isFinite(t) ? t : 0}
          onChange={(e) => handleNumericInput(e.target.value)}
          className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
        />
      </label>

      <input
        type="range"
        min={0}
        max={tMax}
        step={0.01}
        value={t}
        onChange={(e) => handleSlider(Number.parseFloat(e.target.value))}
        className="min-w-[12rem] flex-1"
        aria-label="Time scrubber"
      />
      <span className="text-xs text-zinc-500">/ {tMax.toFixed(1)} s</span>
    </div>
  );
}
