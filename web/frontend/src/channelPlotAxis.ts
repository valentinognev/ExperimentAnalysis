export function experimentTimeAxis(tMax: number) {
  return {
    title: { text: "t (s)" },
    gridcolor: "#3f3f46",
    range: [0, tMax] as [number, number],
    autorange: false as const,
  };
}
