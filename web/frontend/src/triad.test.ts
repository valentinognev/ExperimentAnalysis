// @vitest-environment node
import { describe, it, expect } from "vitest";
import { triadTraces } from "./triad";
import { sceneLayout } from "./view3dLayout";

type EnuPos = { e: number; n: number; u: number };

function traceByName(
  traces: ReturnType<typeof triadTraces>,
  name: string,
) {
  const trace = traces.find((t) => t.name === name);
  if (!trace) throw new Error(`trace ${name} not found`);
  return trace;
}

function traceEnd(trace: { x: number[]; y: number[]; z: number[] }) {
  return [trace.x[1], trace.y[1], trace.z[1]] as const;
}

describe("triadTraces", () => {
  const identity: [number, number, number, number] = [0, 0, 0, 1];
  const origin: EnuPos = { e: 0, n: 0, u: 0 };

  it("identity at origin scale=1: body x→(0,1,0), y→(1,0,0), z→(0,0,-1)", () => {
    const traces = triadTraces(origin, identity, 1);
    expect(traces).toHaveLength(3);

    expect(traceEnd(traceByName(traces, "body x"))).toEqual([0, 1, 0]);
    expect(traceEnd(traceByName(traces, "body y"))).toEqual([1, 0, 0]);
    expect(traceEnd(traceByName(traces, "body z"))).toEqual([0, 0, -1]);
  });

  it("pos offset: identity at {e:10,n:20,u:30} shifts all trace ends", () => {
    const pos: EnuPos = { e: 10, n: 20, u: 30 };
    const traces = triadTraces(pos, identity, 1);

    expect(traceEnd(traceByName(traces, "body x"))).toEqual([10, 21, 30]);
    expect(traceEnd(traceByName(traces, "body y"))).toEqual([11, 20, 30]);
    expect(traceEnd(traceByName(traces, "body z"))).toEqual([10, 20, 29]);
  });
});

describe("View3D sceneLayout", () => {
  it("keeps camera while datarevision follows pose T", () => {
    const at0 = sceneLayout({ datarevision: "t=0" });
    const at10 = sceneLayout({ datarevision: "t=10" });
    expect(at0.uirevision).toBe("camera");
    expect(at10.uirevision).toBe(at0.uirevision);
    expect(at0.datarevision).toBe("t=0");
    expect(at10.datarevision).toBe("t=10");
  });

  it("keeps the legend inside the plot so it cannot cover the 2D map", () => {
    const layout = sceneLayout();
    expect(layout.legend?.x).toBeLessThanOrEqual(1);
    expect(layout.legend?.y).toBeLessThanOrEqual(1);
    expect(layout.legend?.xanchor).toBe("left");
  });

  it("uses night paper and scene colors by default", () => {
    const layout = sceneLayout();
    expect(layout.paper_bgcolor).toBe("#09090b");
    expect(layout.scene?.bgcolor).toBe("#18181b");
    for (const axis of [
      layout.scene?.xaxis,
      layout.scene?.yaxis,
      layout.scene?.zaxis,
    ]) {
      expect(axis?.color).toBe("#e4e4e7");
      expect(axis?.gridcolor).toBe("#3f3f46");
      expect(axis?.backgroundcolor).toBe("#18181b");
      expect(axis?.showbackground).toBe(true);
    }
  });

  it("uses a white scene when skin is day", () => {
    const layout = sceneLayout({ skin: "day" });
    expect(layout.paper_bgcolor).toBe("#fafafa");
    expect(layout.scene?.bgcolor).toBe("#ffffff");
    expect(layout.uirevision).toBe("camera");
    expect(layout.legend?.x).toBeLessThanOrEqual(1);
    expect(layout.legend?.y).toBeLessThanOrEqual(1);
  });

  it("locks Plotly axes to East / North / Up", () => {
    const layout = sceneLayout();
    const xTitle = String(
      (layout.scene?.xaxis?.title as { text?: string } | undefined)?.text ?? "",
    );
    const yTitle = String(
      (layout.scene?.yaxis?.title as { text?: string } | undefined)?.text ?? "",
    );
    const zTitle = String(
      (layout.scene?.zaxis?.title as { text?: string } | undefined)?.text ?? "",
    );

    expect(xTitle).toMatch(/East|^E$/i);
    expect(yTitle).toMatch(/North|^N$/i);
    expect(zTitle).toMatch(/Up|^U$/i);
  });
});
