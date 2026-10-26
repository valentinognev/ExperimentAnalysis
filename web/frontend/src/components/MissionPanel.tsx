const EM_DASH = "—";

export type MissionSnapshot = {
  mission_type: number | null;
  mission_label: string | null;
  vmax: number | null;
  altitude_m: number | null;
  delta_m: number | null;
  radius_m: number | null;
  heading_deg: number | null;
  dest_x_m: number | null;
  dest_y_m: number | null;
};

function formatNumber(value: number | null): string {
  if (value === null) return EM_DASH;
  return String(value);
}

function formatMeters(value: number | null): string {
  if (value === null) return EM_DASH;
  return `${value} m`;
}

export default function MissionPanel({
  mission,
}: {
  mission: MissionSnapshot | null;
}) {
  if (mission === null) return null;

  return (
    <section className="rounded border border-zinc-800 p-3 text-sm">
      <h2 className="mb-2 font-medium">Mission</h2>
      <p>{mission.mission_label ?? EM_DASH}</p>
      <p>
        Vmax <span aria-label="Vmax">{formatNumber(mission.vmax)}</span>
      </p>
      <p>
        <span aria-label="altitude">{formatMeters(mission.altitude_m)}</span>
      </p>
      <p>
        Δ <span aria-label="Δ">{formatMeters(mission.delta_m)}</span>
      </p>
      <p>
        R <span aria-label="R">{formatNumber(mission.radius_m)}</span>
      </p>
      <p>
        H <span aria-label="H">{formatNumber(mission.heading_deg)}</span>
      </p>
      <p>
        Dest X <span aria-label="Dest X">{formatNumber(mission.dest_x_m)}</span>{" "}
        Y <span aria-label="Dest Y">{formatNumber(mission.dest_y_m)}</span>
      </p>
    </section>
  );
}
