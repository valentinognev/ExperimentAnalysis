import meta from "./paramMeta.json";

export type EnumOption = { value: number; label: string };
export type Bit = { index: number; label: string };
export type EnumMeta = { kind: "enum"; options: EnumOption[]; unit?: string };
export type BitmaskMeta = { kind: "bitmask"; bits: Bit[]; unit?: string };
export type BooleanMeta = { kind: "boolean"; unit?: string };
export type NumericMeta = { unit: string };
export type ParamMeta = EnumMeta | BitmaskMeta | BooleanMeta | NumericMeta;

export function paramKind(
  meta: ParamMeta | undefined,
): "enum" | "bitmask" | "boolean" | undefined {
  return meta && "kind" in meta ? meta.kind : undefined;
}

type ParamMetaMap = Record<string, ParamMeta>;

const PARAM_META = meta as ParamMetaMap;

export function paramMeta(name: string): ParamMeta | undefined {
  return PARAM_META[name];
}

export function bitOn(value: number, index: number): boolean {
  return (value & (1 << index)) !== 0;
}

export function setBit(value: number, index: number, on: boolean): number {
  if (on) {
    return value | (1 << index);
  }
  return (value & ~(1 << index)) >>> 0;
}

export function enumOptionValues(meta: EnumMeta): number[] {
  return meta.options.map((o) => o.value);
}

export function asNumber(value: number | string): number {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}
