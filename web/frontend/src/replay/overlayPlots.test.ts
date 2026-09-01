import { expect, it } from "vitest";
import { tracesForField } from "./overlayPlots";

it("tracesForField uses independent original and replayed lengths", () => {
  const traces = tracesForField({
    t_original: [0, 1, 2],
    original: [10, 20, 30],
    t_replayed: [0, 0.5],
    replayed: [11, 21],
  });
  expect(traces).toHaveLength(2);
  expect(traces[0].name).toBe("original");
  expect(traces[0].type).toBe("scatter");
  expect(traces[0].mode).toBe("lines");
  expect(traces[0].x).toEqual([0, 1, 2]);
  expect(traces[0].y).toEqual([10, 20, 30]);
  expect(traces[0].x).toHaveLength(traces[0].y.length);
  expect(traces[1].name).toBe("replayed");
  expect(traces[1].type).toBe("scatter");
  expect(traces[1].mode).toBe("lines");
  expect(traces[1].x).toEqual([0, 0.5]);
  expect(traces[1].y).toEqual([11, 21]);
  expect(traces[1].x).toHaveLength(traces[1].y.length);
  expect(traces[0].x).toHaveLength(3);
  expect(traces[1].x).toHaveLength(2);
});
