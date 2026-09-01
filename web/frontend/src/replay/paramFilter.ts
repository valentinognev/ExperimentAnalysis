export const DEFAULT_PARAM_FILTER = "EKF2";

export function filterParams(
  params: { name: string; value: number | string }[],
  query: string,
): { name: string; value: number | string }[] {
  if (query === "") {
    return params;
  }
  const needle = query.toLowerCase();
  return params.filter((p) => p.name.toLowerCase().includes(needle));
}
