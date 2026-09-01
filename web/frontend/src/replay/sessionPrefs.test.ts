// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  DEFAULT_SESSION,
  SESSION_STORAGE_KEY,
  loadSession,
  mergeOverrides,
  parseSession,
  saveSession,
  saveSessionPartial,
} from "./sessionPrefs";

afterEach(() => {
  localStorage.clear();
});

it("uses ea-replay-session storage key", () => {
  expect(SESSION_STORAGE_KEY).toBe("ea-replay-session");
});

it("parseSession fills defaults for missing and invalid fields", () => {
  expect(parseSession(null)).toEqual({
    ulgPath: "",
    filter: "EKF2",
    experimentName: "",
    overrides: {},
  });
  expect(
    parseSession({
      ulgPath: "/tmp/a.ulg",
      filter: "MC",
      experimentName: "run1",
      overrides: { EKF2_RNG_NOISE: 0.2, skip: true },
    }),
  ).toEqual({
    ulgPath: "/tmp/a.ulg",
    filter: "MC",
    experimentName: "run1",
    overrides: { EKF2_RNG_NOISE: 0.2 },
  });
});

it("loadSession returns defaults when empty or corrupt", () => {
  expect(loadSession()).toEqual(DEFAULT_SESSION);
  localStorage.setItem(SESSION_STORAGE_KEY, "{not json");
  expect(loadSession()).toEqual(DEFAULT_SESSION);
});

it("saveSession then loadSession round-trips prefs", () => {
  const prefs = {
    ulgPath: "/data/log.ulg",
    filter: "EKF2_GPS",
    experimentName: "gps-tune",
    overrides: { EKF2_GPS_P_NOISE: 0.5 },
  };
  saveSession(prefs);
  expect(loadSession()).toEqual(prefs);
});

it("saveSessionPartial merges into stored prefs", () => {
  saveSession({
    ulgPath: "/old.ulg",
    filter: "EKF2",
    experimentName: "keep-me",
    overrides: { A: 1 },
  });
  saveSessionPartial({ ulgPath: "/new.ulg", filter: "MC" });
  expect(loadSession()).toEqual({
    ulgPath: "/new.ulg",
    filter: "MC",
    experimentName: "keep-me",
    overrides: { A: 1 },
  });
});

it("mergeOverrides copies only keys present on the original", () => {
  expect(
    mergeOverrides(
      { EKF2_A: 1, EKF2_B: 2 },
      { EKF2_A: 9, EKF2_C: 3 },
    ),
  ).toEqual({ EKF2_A: 9, EKF2_B: 2 });
});
