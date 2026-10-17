import { useEffect, useRef, useState } from "react";
import { BOARD_DATA, BOARD_LABELS } from "../board/themes";
import { applyTheme, usePrefs, type BoardStyle, type ThemePref } from "../store/prefs";
import { IconSettings } from "./icons";

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "is-on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span>{label}</span>
      <input type="checkbox" className="toggle" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Settings() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const p = usePrefs();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const setTheme = (theme: ThemePref) => {
    p.set({ theme });
    applyTheme(theme);
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="icon-btn" aria-label="Settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconSettings />
      </button>
      {open && (
        <div className="popover right-0 w-80" role="dialog" aria-label="Settings">
          <div className="popover-title">Appearance</div>
          <Segmented<ThemePref>
            label="Theme"
            value={p.theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Paper" },
              { value: "dark", label: "Night" },
              { value: "system", label: "System" },
            ]}
          />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(Object.keys(BOARD_LABELS) as BoardStyle[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => p.set({ board: b })}
                className={`board-swatch ${p.board === b ? "is-on" : ""}`}
                aria-pressed={p.board === b}
              >
                <img src={BOARD_DATA[b]} alt="" className="aspect-square w-full rounded-sm" />
                <span>{BOARD_LABELS[b]}</span>
              </button>
            ))}
          </div>
          <div className="popover-title mt-4">Reading</div>
          <Toggle label="Board follows the text as you scroll" checked={p.followReading} onChange={(v) => p.set({ followReading: v })} />
          <Toggle label="Board coordinates" checked={p.coordinates} onChange={(v) => p.set({ coordinates: v })} />
          <Toggle label="Move sounds" checked={p.sound} onChange={(v) => p.set({ sound: v })} />
          <div className="popover-title mt-4">Engine (Play it out)</div>
          <label className="block py-1">
            <span className="flex justify-between">
              <span>Strength</span>
              <span className="tabular-nums text-[var(--ink-soft)]">{p.engineElo ? `${p.engineElo} Elo` : "Full"}</span>
            </span>
            <input
              type="range"
              min={1320}
              max={3200}
              step={40}
              value={p.engineElo ?? 3200}
              onChange={(e) => {
                const v = Number(e.target.value);
                p.set({ engineElo: v >= 3200 ? null : v });
              }}
              className="w-full accent-[var(--accent)]"
              aria-label="Engine strength"
            />
          </label>
          <p className="mt-3 text-xs text-[var(--ink-faint)]">
            Keys: ← → moves · ↑ ↓ diagrams · Home/End · F flip · Esc leave analysis
          </p>
        </div>
      )}
    </div>
  );
}
