import meta from "./paramMeta.json";

export type EnumOption = { value: number; label: string };
export type Bit = { index: number; label: string };
export type EnumMeta = { kind: "enum"; options: EnumOption[] };
export type BitmaskMeta = { kind: "bitmask"; bits: Bit[] };
export type BooleanMeta = { kind: "boolean" };
export type ParamMeta = EnumMeta | BitmaskMeta | BooleanMeta;

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
