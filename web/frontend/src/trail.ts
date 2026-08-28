export type TrailSeries = {
  t: number[];
  e: number[];
  n: number[];
  u: number[];
};

export type TrailPos = { e: number; n: number; u: number };

export function sliceTrail(series: TrailSeries, t: number): TrailPos[] {
  const ts = series.t;
  if (ts.length === 0) return [];

  const out: TrailPos[] = [];
  let i = 0;
  for (; i < ts.length; i++) {
    if (ts[i] > t) break;
    out.push({ e: series.e[i], n: series.n[i], u: series.u[i] });
  }
  if (out.length === 0) return [];
  if (i > 0 && i < ts.length && ts[i - 1] < t) {
    const t0 = ts[i - 1];
    const t1 = ts[i];
    const a = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    out.push({
      e: series.e[i - 1] + a * (series.e[i] - series.e[i - 1]),
      n: series.n[i - 1] + a * (series.n[i] - series.n[i - 1]),
      u: series.u[i - 1] + a * (series.u[i] - series.u[i - 1]),
    });
  }
  return out;
}
