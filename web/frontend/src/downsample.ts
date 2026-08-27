/** Keep first, last, and samples at least 1/maxHz apart from the last kept. */
export function downsampleHz(ts: number[], maxHz = 20): boolean[] {
  const keep = new Array<boolean>(ts.length).fill(false);
  if (ts.length === 0) return keep;

  const minInterval = 1 / maxHz;
  keep[0] = true;
  let lastKept = 0;

  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[lastKept] >= minInterval) {
      keep[i] = true;
      lastKept = i;
    }
  }

  keep[ts.length - 1] = true;
  return keep;
}
