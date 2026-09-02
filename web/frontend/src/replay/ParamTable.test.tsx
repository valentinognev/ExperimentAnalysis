// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ParamTable } from "./ParamTable";
import { loadSession, saveSession } from "./sessionPrefs";

const params = [
  { name: "EKF2_RNG_NOISE", value: 0.1 },
  { name: "MC_ROLL_P", value: 6 },
];

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function paramInput(name: string) {
  return document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
}

it("default filter hides MC_ROLL_P", () => {
  render(<ParamTable params={params} onOverrides={() => {}} />);
  expect(screen.getByLabelText("Filter")).toHaveValue("EKF2");
  expect(paramInput("MC_ROLL_P")).not.toBeInTheDocument();
  expect(paramInput("EKF2_RNG_NOISE")).toBeInTheDocument();
});

it("clearing filter shows collapsed groups; expand reveals MC_ROLL_P", async () => {
  render(<ParamTable params={params} onOverrides={() => {}} />);
  await userEvent.clear(screen.getByLabelText("Filter"));
  expect(paramInput("MC_ROLL_P")).not.toBeInTheDocument();
  expect(paramInput("EKF2_RNG_NOISE")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "+ MC (1)" }));
  expect(paramInput("MC_ROLL_P")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "- MC (1)" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

it("default filter auto-expands EKF2 group", () => {
  render(<ParamTable params={params} onOverrides={() => {}} />);
  const header = screen.getByRole("button", { name: "- EKF2 (1)" });
  expect(header).toHaveAttribute("aria-expanded", "true");
  expect(paramInput("EKF2_RNG_NOISE")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /MC/ })).not.toBeInTheDocument();
});

it("collapsing EKF2 hides its rows", async () => {
  render(<ParamTable params={params} onOverrides={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "- EKF2 (1)" }));
  expect(paramInput("EKF2_RNG_NOISE")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "+ EKF2 (1)" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

it("editing EKF2_RNG_NOISE fires diffs", async () => {
  const onOverrides = vi.fn();
  render(<ParamTable params={params} onOverrides={onOverrides} />);
  const input = paramInput("EKF2_RNG_NOISE")!;
  await userEvent.clear(input);
  await userEvent.type(input, "0.2");
  expect(onOverrides).toHaveBeenCalledWith({ EKF2_RNG_NOISE: 0.2 });
});

it("Reset restores originals and calls onOverrides({})", async () => {
  const onOverrides = vi.fn();
  render(<ParamTable params={params} onOverrides={onOverrides} />);
  const input = paramInput("EKF2_RNG_NOISE")!;
  await userEvent.clear(input);
  await userEvent.type(input, "0.2");
  await userEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(onOverrides).toHaveBeenLastCalledWith({});
  expect(input).toHaveValue(0.1);
});

it("edited row has data-edited true", async () => {
  render(<ParamTable params={params} onOverrides={() => {}} />);
  const input = paramInput("EKF2_RNG_NOISE")!;
  await userEvent.clear(input);
  await userEvent.type(input, "0.2");
  expect(input.closest("[data-edited]")).toHaveAttribute("data-edited", "true");
});

it("resets original and edited when params change", async () => {
  const onOverrides = vi.fn();
  const { rerender } = render(
    <ParamTable params={params} onOverrides={onOverrides} />,
  );
  await userEvent.clear(paramInput("EKF2_RNG_NOISE")!);
  await userEvent.type(paramInput("EKF2_RNG_NOISE")!, "0.2");
  expect(onOverrides).toHaveBeenCalledWith({ EKF2_RNG_NOISE: 0.2 });

  rerender(
    <ParamTable
      params={[
        { name: "EKF2_RNG_NOISE", value: 0.5 },
        { name: "EKF2_BARO_NOISE", value: 0.3 },
      ]}
      onOverrides={onOverrides}
    />,
  );

  expect(paramInput("EKF2_RNG_NOISE")).toHaveValue(0.5);
  expect(paramInput("EKF2_BARO_NOISE")).toHaveValue(0.3);
  expect(paramInput("MC_ROLL_P")).not.toBeInTheDocument();
  expect(onOverrides).toHaveBeenLastCalledWith({});
});

it("restores saved filter instead of the EKF2 default", () => {
  saveSession({
    ulgPath: "",
    filter: "MC",
    experimentName: "",
    overrides: {},
    slug: "",
    droneId: null,
  });
  render(<ParamTable params={params} onOverrides={() => {}} />);
  expect(screen.getByLabelText("Filter")).toHaveValue("MC");
  expect(paramInput("MC_ROLL_P")).toBeInTheDocument();
  expect(paramInput("EKF2_RNG_NOISE")).not.toBeInTheDocument();
});

it("applies saved overrides once when params first arrive", () => {
  saveSession({
    ulgPath: "",
    filter: "EKF2",
    experimentName: "",
    overrides: { EKF2_RNG_NOISE: 0.2, GONE: 1 },
    slug: "",
    droneId: null,
  });
  const onOverrides = vi.fn();
  const { rerender } = render(
    <ParamTable params={[]} onOverrides={onOverrides} />,
  );
  rerender(<ParamTable params={params} onOverrides={onOverrides} />);
  expect(paramInput("EKF2_RNG_NOISE")).toHaveValue(0.2);
  expect(onOverrides).toHaveBeenLastCalledWith({ EKF2_RNG_NOISE: 0.2 });
});

it("changing filter saves it for the next session", async () => {
  render(<ParamTable params={params} onOverrides={() => {}} />);
  await userEvent.clear(screen.getByLabelText("Filter"));
  await userEvent.type(screen.getByLabelText("Filter"), "MC");
  expect(loadSession().filter).toBe("MC");
});

it("editing a param saves overrides for the next session", async () => {
  render(<ParamTable params={params} onOverrides={() => {}} />);
  await userEvent.clear(paramInput("EKF2_RNG_NOISE")!);
  await userEvent.type(paramInput("EKF2_RNG_NOISE")!, "0.2");
  expect(loadSession().overrides).toEqual({ EKF2_RNG_NOISE: 0.2 });
});

const nestedParams = [
  { name: "EKF2_RNG_NOISE", value: 0.1 },
  { name: "EKF2_RNG_AID", value: 1 },
  { name: "EKF2_BARO_NOISE", value: 0.3 },
];

it("nested underscore groups start collapsed under an open prefix", () => {
  render(<ParamTable params={nestedParams} onOverrides={() => {}} />);
  expect(screen.getByRole("button", { name: "- EKF2 (3)" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getByRole("button", { name: "+ RNG (2)" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(paramInput("EKF2_RNG_NOISE")).not.toBeInTheDocument();
  expect(paramInput("EKF2_RNG_AID")).not.toBeInTheDocument();
  expect(paramInput("EKF2_BARO_NOISE")).toBeInTheDocument();
});

it("expanding a nested group reveals its params", async () => {
  render(<ParamTable params={nestedParams} onOverrides={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "+ RNG (2)" }));
  expect(screen.getByRole("button", { name: "- RNG (2)" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(paramInput("EKF2_RNG_NOISE")).toBeInTheDocument();
  expect(paramInput("EKF2_RNG_AID")).toBeInTheDocument();
});

const editorParams = [
  { name: "EKF2_HGT_REF", value: 1 },
  { name: "EKF2_GPS_CTRL", value: 7 },
  { name: "EKF2_BARO_CTRL", value: 1 },
  { name: "MC_ROLL_P", value: 6 },
];

it("enum select shows QGC labels and writing a number updates the select", async () => {
  render(<ParamTable params={editorParams} onOverrides={() => {}} />);
  const sel = screen.getByRole("combobox", { name: "EKF2_HGT_REF enum" });
  expect(sel).toHaveValue("1");
  expect(screen.getByRole("option", { name: "1 — GPS" })).toBeInTheDocument();
  await userEvent.clear(paramInput("EKF2_HGT_REF")!);
  await userEvent.type(paramInput("EKF2_HGT_REF")!, "0");
  expect(sel).toHaveValue("0");
});

it("choosing an enum option writes the number override", async () => {
  const onOverrides = vi.fn();
  render(<ParamTable params={editorParams} onOverrides={onOverrides} />);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "EKF2_HGT_REF enum" }),
    "0",
  );
  expect(onOverrides).toHaveBeenCalledWith({ EKF2_HGT_REF: 0 });
  expect(paramInput("EKF2_HGT_REF")).toHaveValue(0);
});

it("unmatched enum value shows custom option", () => {
  render(
    <ParamTable
      params={[{ name: "EKF2_HGT_REF", value: 99 }]}
      onOverrides={() => {}}
    />,
  );
  expect(
    screen.getByRole("combobox", { name: "EKF2_HGT_REF enum" }),
  ).toHaveValue("99");
  expect(screen.getByRole("option", { name: "custom (99)" })).toBeInTheDocument();
});

it("bitmask checkboxes follow the number and toggling writes OR", async () => {
  const onOverrides = vi.fn();
  render(<ParamTable params={editorParams} onOverrides={onOverrides} />);
  const lon = screen.getByRole("checkbox", {
    name: "EKF2_GPS_CTRL bit 0: Lon/lat",
  });
  const dual = screen.getByRole("checkbox", {
    name: "EKF2_GPS_CTRL bit 3: Dual antenna heading",
  });
  expect(lon).toBeChecked();
  expect(dual).not.toBeChecked();
  await userEvent.click(lon);
  expect(onOverrides).toHaveBeenCalledWith({ EKF2_GPS_CTRL: 6 });
});

it("boolean select Off/On writes 0/1", async () => {
  const onOverrides = vi.fn();
  render(<ParamTable params={editorParams} onOverrides={onOverrides} />);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "EKF2_BARO_CTRL boolean" }),
    "0",
  );
  expect(onOverrides).toHaveBeenCalledWith({ EKF2_BARO_CTRL: 0 });
});

it("params without metadata have no extra combobox", () => {
  render(
    <ParamTable
      params={[{ name: "EKF2_RNG_NOISE", value: 0.1 }]}
      onOverrides={() => {}}
    />,
  );
  expect(paramInput("EKF2_RNG_NOISE")).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});

it("shows QGC unit beside the number when present", () => {
  render(
    <ParamTable
      params={[
        { name: "EKF2_RNG_NOISE", value: 0.1 },
        { name: "EKF2_HGT_REF", value: 1 },
      ]}
      onOverrides={() => {}}
    />,
  );
  expect(screen.getByLabelText("EKF2_RNG_NOISE unit")).toHaveTextContent("m");
  expect(screen.queryByLabelText("EKF2_HGT_REF unit")).not.toBeInTheDocument();
});
