export type FieldSeries = {
  t_original: number[];
  original: number[];
  t_replayed: number[];
  replayed: number[];
};

export type ScatterTrace = {
  name: string;
  x: number[];
  y: number[];
  type: "scatter";
  mode: "lines";
};

export function tracesForField(field: FieldSeries): ScatterTrace[] {
  return [
    {
      name: "original",
      x: field.t_original,
      y: field.original,
      type: "scatter",
      mode: "lines",
    },
    {
      name: "replayed",
      x: field.t_replayed,
      y: field.replayed,
      type: "scatter",
      mode: "lines",
    },
  ];
}
