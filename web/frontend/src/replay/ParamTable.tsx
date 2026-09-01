import { useEffect, useRef, useState, type ReactNode } from "react";
import { filterParams } from "./paramFilter";
import { paramDiffs } from "./paramDiffs";
import { groupParams, paramCount, type ParamGroup } from "./paramGroup";
import {
  asNumber,
  bitOn,
  enumOptionValues,
  paramKind,
  paramMeta,
  setBit,
} from "./paramMeta";
import { loadSession, mergeOverrides, saveSessionPartial } from "./sessionPrefs";
import { BTN, INPUT, LABEL } from "./ui";

type Param = { name: string; value: number | string };

function toRecord(params: Param[]): Record<string, number | string> {
  return Object.fromEntries(params.map((p) => [p.name, p.value]));
}

function ParamValueEditor({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number | string;
  onChange: (raw: string) => void;
}) {
  const meta = paramMeta(name);
  const n = asNumber(value);
  const kind = paramKind(meta);
  const unit = meta?.unit;

  let extra: ReactNode = null;
  if (kind === "enum" && meta && "options" in meta) {
    const codes = enumOptionValues(meta);
    const known = codes.includes(n);
    extra = (
      <select
        className={`${INPUT} min-w-min w-max max-w-xl shrink-0`}
        aria-label={`${name} enum`}
        value={String(n)}
        onChange={(e) => onChange(e.target.value)}
      >
        {meta.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value} — {o.label}
          </option>
        ))}
        {known ? null : (
          <option value={n}>custom ({n})</option>
        )}
      </select>
    );
  } else if (kind === "boolean") {
    const known = n === 0 || n === 1;
    extra = (
      <select
        className={`${INPUT} min-w-min w-max max-w-xl shrink-0`}
        aria-label={`${name} boolean`}
        value={String(n)}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={0}>Off</option>
        <option value={1}>On</option>
        {known ? null : (
          <option value={n}>custom ({n})</option>
        )}
      </select>
    );
  } else if (kind === "bitmask" && meta && "bits" in meta) {
    extra = (
      <div className="flex min-w-0 flex-wrap gap-2">
        {meta.bits.map((b) => (
          <label key={b.index} className={`${LABEL} inline-flex items-center gap-1`}>
            <input
              type="checkbox"
              aria-label={`${name} bit ${b.index}: ${b.label}`}
              checked={bitOn(n, b.index)}
              onChange={(e) =>
                onChange(String(setBit(n, b.index, e.target.checked)))
              }
            />
            {b.label}
          </label>
        ))}
      </div>
    );
  }

  const beside = extra !== null || Boolean(unit);
  return (
    <div className={beside ? "flex min-w-0 items-center gap-2" : undefined}>
      <input
        className={`${INPUT} ${beside ? "w-24 shrink-0" : "w-full"}`}
        name={name}
        type={typeof value === "number" ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {unit ? (
        <span className={`${LABEL} shrink-0`} aria-label={`${name} unit`}>
          {unit}
        </span>
      ) : null}
      {extra}
    </div>
  );
}

export function ParamTable({
  params,
  onOverrides,
}: {
  params: Param[];
  onOverrides: (diffs: Record<string, number | string>) => void;
}) {
  const [original, setOriginal] = useState(() => toRecord(params));
  const [filter, setFilter] = useState(() => loadSession().filter);
  const [edited, setEdited] = useState(() => toRecord(params));
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const paramsRef = useRef(params);
  const appliedRestore = useRef(params.length > 0);

  useEffect(() => {
    if (paramsRef.current === params) return;
    paramsRef.current = params;
    const next = toRecord(params);
    setOriginal(next);
    if (!appliedRestore.current && params.length > 0) {
      appliedRestore.current = true;
      const merged = mergeOverrides(next, loadSession().overrides);
      setEdited(merged);
      onOverrides(paramDiffs(next, merged));
      return;
    }
    setEdited(next);
    onOverrides({});
    saveSessionPartial({ overrides: {} });
  }, [params]);

  useEffect(() => {
    setToggles({});
  }, [filter]);

  const displayed = params.map((p) => ({
    name: p.name,
    value: edited[p.name] ?? p.value,
  }));
  const visible = filterParams(displayed, filter);
  const groups = groupParams(visible);

  function isOpen(path: string, depth: number): boolean {
    if (Object.hasOwn(toggles, path)) return toggles[path];
    return depth === 0 && filter !== "";
  }

  function toggle(path: string, depth: number) {
    setToggles((prev) => ({ ...prev, [path]: !isOpen(path, depth) }));
  }

  function renderGroup(node: ParamGroup, depth: number) {
    const open = isOpen(node.path, depth);
    return (
      <div
        key={node.path}
        className={depth > 0 ? "ml-3 border-l border-zinc-800 pl-1" : undefined}
      >
        <button
          type="button"
          className={`${BTN} w-full text-left`}
          aria-expanded={open}
          onClick={() => toggle(node.path, depth)}
        >
          {open ? "-" : "+"} {node.group} ({paramCount(node)})
        </button>
        {open ? (
          <>
            {node.groups.map((child) => renderGroup(child, depth + 1))}
            {node.params.length > 0 ? (
              <table className="w-full text-sm">
                <tbody>
                  {node.params.map((p) => {
                    const changed = !Object.is(edited[p.name], original[p.name]);
                    return (
                      <tr key={p.name} data-edited={changed ? "true" : undefined}>
                        <td className="px-2 py-1 font-mono text-zinc-300">{p.name}</td>
                        <td className="px-2 py-1">
                          <ParamValueEditor
                            name={p.name}
                            value={p.value}
                            onChange={(raw) => onCellChange(p.name, raw)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  function apply(next: Record<string, number | string>) {
    const diffs = paramDiffs(original, next);
    setEdited(next);
    onOverrides(diffs);
    saveSessionPartial({ overrides: diffs });
  }

  function onCellChange(name: string, raw: string) {
    const orig = original[name];
    const value = typeof orig === "number" ? Number(raw) : raw;
    apply({ ...edited, [name]: value });
  }

  function onReset() {
    apply(original);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className={LABEL} htmlFor="param-filter">
          Filter
        </label>
        <input
          id="param-filter"
          className={INPUT}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            saveSessionPartial({ filter: e.target.value });
          }}
        />
        <button type="button" className={BTN} onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="max-h-80 overflow-auto rounded border border-zinc-800">
        {groups.map((node) => renderGroup(node, 0))}
      </div>
    </div>
  );
}
