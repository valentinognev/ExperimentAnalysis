import { expect, it } from "vitest";
import { groupKey, groupParams, paramCount } from "./paramGroup";

it("groupKey is the prefix before the first underscore", () => {
  expect(groupKey("EKF2_RNG_NOISE")).toBe("EKF2");
  expect(groupKey("MC_ROLL_P")).toBe("MC");
  expect(groupKey("SYS")).toBe("SYS");
});

it("groupParams groups by prefix, sorts groups, keeps input order inside a group", () => {
  const params = [
    { name: "MC_ROLL_P", value: 6 },
    { name: "EKF2_RNG_NOISE", value: 0.1 },
    { name: "EKF2_BARO_NOISE", value: 0.3 },
    { name: "SYS", value: 1 },
  ];
  expect(groupParams(params)).toEqual([
    {
      group: "EKF2",
      path: "EKF2",
      groups: [],
      params: [
        { name: "EKF2_RNG_NOISE", value: 0.1 },
        { name: "EKF2_BARO_NOISE", value: 0.3 },
      ],
    },
    {
      group: "MC",
      path: "MC",
      groups: [],
      params: [{ name: "MC_ROLL_P", value: 6 }],
    },
    {
      group: "SYS",
      path: "SYS",
      groups: [],
      params: [{ name: "SYS", value: 1 }],
    },
  ]);
});

it("nests a shared next underscore token; singleton tokens stay leaves", () => {
  const params = [
    { name: "EKF2_RNG_NOISE", value: 0.1 },
    { name: "EKF2_BARO_NOISE", value: 0.3 },
    { name: "EKF2_RNG_AID", value: 1 },
    { name: "EKF2_HGT_MODE", value: 2 },
  ];
  expect(groupParams(params)).toEqual([
    {
      group: "EKF2",
      path: "EKF2",
      groups: [
        {
          group: "RNG",
          path: "EKF2/RNG",
          groups: [],
          params: [
            { name: "EKF2_RNG_NOISE", value: 0.1 },
            { name: "EKF2_RNG_AID", value: 1 },
          ],
        },
      ],
      params: [
        { name: "EKF2_BARO_NOISE", value: 0.3 },
        { name: "EKF2_HGT_MODE", value: 2 },
      ],
    },
  ]);
});

it("nests further when a deeper token is also shared", () => {
  const params = [
    { name: "EKF2_GPS_P_NOISE", value: 0.1 },
    { name: "EKF2_GPS_V_NOISE", value: 0.2 },
    { name: "EKF2_GPS_P_GATE", value: 5 },
  ];
  expect(groupParams(params)).toEqual([
    {
      group: "EKF2",
      path: "EKF2",
      groups: [
        {
          group: "GPS",
          path: "EKF2/GPS",
          groups: [
            {
              group: "P",
              path: "EKF2/GPS/P",
              groups: [],
              params: [
                { name: "EKF2_GPS_P_NOISE", value: 0.1 },
                { name: "EKF2_GPS_P_GATE", value: 5 },
              ],
            },
          ],
          params: [{ name: "EKF2_GPS_V_NOISE", value: 0.2 }],
        },
      ],
      params: [],
    },
  ]);
});

it("paramCount sums nested groups and leaves", () => {
  const [ekf2] = groupParams([
    { name: "EKF2_GPS_P_NOISE", value: 0.1 },
    { name: "EKF2_GPS_V_NOISE", value: 0.2 },
    { name: "EKF2_GPS_P_GATE", value: 5 },
    { name: "EKF2_HGT_MODE", value: 1 },
  ]);
  expect(paramCount(ekf2)).toBe(4);
  expect(paramCount(ekf2.groups[0])).toBe(3);
});
