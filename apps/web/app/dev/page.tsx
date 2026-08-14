"use client";

import { useRef, useState, type CSSProperties } from "react";
import type { Cow, FarmEvent, FarmState, Paddock } from "@grazingcattle/game-types";

const MAX_EVENTS_SHOWN = 50;

const isLive = (cow: Cow): boolean => {
  return cow.status !== "dead" && cow.status !== "sold" && cow.status !== "slaughtered";
};

const mean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

// Explicit colors on every element here rather than relying on inherited
// defaults — globals.css is now always-light (see its own comment), but
// pinning colors locally means this page doesn't silently break again if
// that ever changes.
const tableStyle: CSSProperties = {
  borderCollapse: "collapse",
  marginBottom: 24,
  fontSize: 14,
  color: "#111",
};
const thStyle: CSSProperties = {
  border: "1px solid #999",
  padding: "8px 14px",
  textAlign: "left",
  background: "#e8e8e8",
  color: "#111",
};
const tdStyle: CSSProperties = {
  border: "1px solid #ccc",
  padding: "8px 14px",
  color: "#111",
};
const buttonStyle: CSSProperties = {
  border: "1px solid #888",
  borderRadius: 4,
  padding: "6px 12px",
  background: "#f5f5f5",
  color: "#111",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "inherit",
};

const paddockStats = (farm: FarmState, paddock: Paddock) => {
  const cellIds = new Set(paddock.cellIds);
  const cells = farm.cells.filter((c) => cellIds.has(c.id));
  const cows = farm.cows.filter((c) => isLive(c) && c.currentPaddockId === paddock.id);
  return {
    cowCount: cows.length,
    meanGrass: mean(cells.map((c) => c.grassBiomassKgHa)),
    meanSoil: mean(cells.map((c) => c.soilHealth)),
    meanRoots: mean(cells.map((c) => c.rootHealth)),
  };
};

export default function DevPage() {
  const [farm, setFarm] = useState<FarmState | null>(null);
  const [events, setEvents] = useState<FarmEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetPaddockId, setTargetPaddockId] = useState<string>("");

  // `loading` (React state) only disables the buttons after a re-render,
  // which isn't synchronous — two clicks fired back-to-back can both pass
  // the disabled check before either request's setLoading(true) has
  // painted. A ref is a plain mutable value, checked and set immediately,
  // so it closes that gap. Without it, rapid double-clicks on "+30 days"
  // fired two requests against the SAME stale `farm` snapshot (neither had
  // seen the other's result yet), silently discarding one of the advances.
  const isRequestInFlightRef = useRef(false);

  const loadFarm = async () => {
    if (isRequestInFlightRef.current) return;
    isRequestInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/scenario");
      if (!res.ok) throw new Error(`Failed to load farm: ${res.status}`);
      const data: { farm: FarmState } = await res.json();
      setFarm(data.farm);
      setEvents([]);
      setTargetPaddockId(data.farm.paddocks[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      isRequestInFlightRef.current = false;
      setLoading(false);
    }
  };

  const advance = async (hours: number) => {
    if (!farm || isRequestInFlightRef.current) return;
    isRequestInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farm, hours }),
      });
      if (!res.ok) throw new Error(`Step failed: ${res.status}`);
      const data: { farm: FarmState; events: FarmEvent[] } = await res.json();
      setFarm(data.farm);
      setEvents((prev) => [...data.events, ...prev].slice(0, MAX_EVENTS_SHOWN));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      isRequestInFlightRef.current = false;
      setLoading(false);
    }
  };

  const moveHerdToPaddock = () => {
    if (!farm || !targetPaddockId) return;
    setFarm({
      ...farm,
      cows: farm.cows.map((cow) =>
        isLive(cow) ? { ...cow, currentPaddockId: targetPaddockId } : cow,
      ),
    });
  };

  const sellCow = (cowId: string) => {
    if (!farm) return;
    setFarm({
      ...farm,
      cows: farm.cows.map((cow) =>
        cow.id === cowId
          ? { ...cow, status: "sold" as const, currentPaddockId: null, exitSimHour: farm.simHour }
          : cow,
      ),
    });
  };

  const liveCows = farm?.cows.filter(isLive) ?? [];
  const day = farm ? Math.floor(farm.simHour / 24) : 0;

  return (
    <main style={{ fontFamily: "monospace", padding: 24, maxWidth: 1100 }}>
      <h1>Grazing Cattle — dev screen</h1>
      <p style={{ color: "#555" }}>
        Not the real UI. Prints raw simulation state so we can see whether the sim is doing
        something interesting before any graphics exist.
      </p>

      <section style={{ marginBottom: 16 }}>
        <button style={buttonStyle} onClick={loadFarm} disabled={loading}>
          {farm ? "New Farm (reset)" : "Start Farm"}
        </button>
      </section>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {!farm && <p>Click &quot;Start Farm&quot; to begin.</p>}

      {farm && (
        <>
          <section style={{ marginBottom: 16 }}>
            <strong>{farm.name}</strong>
            <br />
            Day {day} · {farm.season} · {farm.weatherToday.temperatureC.toFixed(1)}°C ·{" "}
            {farm.weatherToday.rainfallMm.toFixed(1)}mm rain ·{" "}
            {farm.weatherToday.sunlightHours.toFixed(1)}h sun
            <br />
            Herd: {liveCows.length} live · ${farm.moneyUsd.toFixed(0)}
          </section>

          <section style={{ marginBottom: 16, display: "flex", gap: 8 }}>
            <button style={buttonStyle} onClick={() => advance(24)} disabled={loading}>
              +1 day
            </button>
            <button style={buttonStyle} onClick={() => advance(24 * 7)} disabled={loading}>
              +7 days
            </button>
            <button style={buttonStyle} onClick={() => advance(24 * 30)} disabled={loading}>
              +30 days
            </button>
          </section>

          <section style={{ marginBottom: 16 }}>
            Move entire herd to:{" "}
            <select value={targetPaddockId} onChange={(e) => setTargetPaddockId(e.target.value)}>
              {farm.paddocks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>{" "}
            <button style={buttonStyle} onClick={moveHerdToPaddock}>
              Move
            </button>
          </section>

          <h2>Paddocks</h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Paddock</th>
                <th style={thStyle}>Cows</th>
                <th style={thStyle}>Mean grass (kg/ha)</th>
                <th style={thStyle}>Mean soil health</th>
                <th style={thStyle}>Mean root health</th>
              </tr>
            </thead>
            <tbody>
              {farm.paddocks.map((p) => {
                const stats = paddockStats(farm, p);
                return (
                  <tr key={p.id}>
                    <td style={tdStyle}>{p.name}</td>
                    <td style={tdStyle}>{stats.cowCount}</td>
                    <td style={tdStyle}>{stats.meanGrass.toFixed(0)}</td>
                    <td style={tdStyle}>{stats.meanSoil.toFixed(2)}</td>
                    <td style={tdStyle}>{stats.meanRoots.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h2>Cows ({liveCows.length})</h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Sex</th>
                <th style={thStyle}>Age (yr)</th>
                <th style={thStyle}>Weight (kg)</th>
                <th style={thStyle}>BCS</th>
                <th style={thStyle}>Health</th>
                <th style={thStyle}>Paddock</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {liveCows.map((cow) => (
                <tr key={cow.id}>
                  <td style={tdStyle}>{cow.id}</td>
                  <td style={tdStyle}>{cow.status}</td>
                  <td style={tdStyle}>{cow.sex}</td>
                  <td style={tdStyle}>{(cow.ageDays / 365).toFixed(1)}</td>
                  <td style={tdStyle}>{cow.weightKg.toFixed(0)}</td>
                  <td style={tdStyle}>{cow.bodyConditionScore.toFixed(1)}</td>
                  <td style={tdStyle}>{cow.health.toFixed(2)}</td>
                  <td style={tdStyle}>{cow.currentPaddockId}</td>
                  <td style={tdStyle}>
                    <button style={buttonStyle} onClick={() => sellCow(cow.id)}>
                      Sell
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Events (most recent {MAX_EVENTS_SHOWN})</h2>
          <ul>
            {events.length === 0 && <li style={{ color: "#666" }}>None yet.</li>}
            {events.map((event) => (
              <li key={event.id}>
                day {Math.floor(event.simHour / 24)} — {event.type} —{" "}
                {JSON.stringify(event.data)}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
