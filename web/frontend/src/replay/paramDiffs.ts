export function paramDiffs(
  original: Record<string, number | string>,
  edited: Record<string, number | string>,
): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const k of Object.keys(edited)) {
    const e = edited[k];
    const o = original[k];
    const unchanged =
      typeof e === "number" && typeof o === "number"
        ? Object.is(e, o)
        : e === o;
    if (!unchanged) {
      out[k] = e;
    }
  }
  return out;
}
