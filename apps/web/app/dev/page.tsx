"use client";

import { useRef, useState } from "react";
import type { Cow, FarmEvent, FarmState, Paddock } from "@grazingcattle/game-types";
import type { ScenarioName } from "@grazingcattle/simulation";

const SCENARIOS: ScenarioName[] = ["sustainable", "overstocked", "rotational"];
const MAX_EVENTS_SHOWN = 50;

function isLive(cow: Cow): boolean {
  return cow.status !== "dead" && cow.status !== "sold" && cow.status !== "slaughtered";
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function paddockStats(farm: FarmState, paddock: Paddock) {
  const cellIds = new Set(paddock.cellIds);
  const cells = farm.cells.filter((c) => cellIds.has(c.id));
  const cows = farm.cows.filter((c) => isLive(c) && c.currentPaddockId === paddock.id);
  return {
    cowCount: cows.length,
    meanGrass: mean(cells.map((c) => c.grassBiomassKgHa)),
    meanSoil: mean(cells.map((c) => c.soilHealth)),
    meanRoots: mean(cells.map((c) => c.rootHealth)),
  };
}

export default function DevPage() {
  const [farm, setFarm] = useState<FarmState | null>(null);
  const [events, setEvents] = useState<FarmEvent[]>([]);
  const [scenario, setScenario] = useState<ScenarioName>("sustainable");
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

  async function loadScenario(name: ScenarioName) {
    if (isRequestInFlightRef.current) return;
    isRequestInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dev/scenario?name=${name}`);
      if (!res.ok) throw new Error(`Failed to load scenario: ${res.status}`);
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
  }

  async function advance(hours: number) {
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
  }

  function moveHerdToPaddock() {
    if (!farm || !targetPaddockId) return;
    setFarm({
      ...farm,
      cows: farm.cows.map((cow) =>
        isLive(cow) ? { ...cow, currentPaddockId: targetPaddockId } : cow,
      ),
    });
  }

  function sellCow(cowId: string) {
    if (!farm) return;
    setFarm({
      ...farm,
      cows: farm.cows.map((cow) =>
        cow.id === cowId
          ? { ...cow, status: "sold" as const, currentPaddockId: null, exitSimHour: farm.simHour }
          : cow,
      ),
    });
  }

  const liveCows = farm?.cows.filter(isLive) ?? [];
  const day = farm ? Math.floor(farm.simHour / 24) : 0;

  return (
    <main style={{ fontFamily: "monospace", padding: 24, maxWidth: 1000 }}>
      <h1>Grazing Cattle — dev screen</h1>
      <p style={{ color: "#666" }}>
        Not the real UI. Prints raw simulation state so we can see whether the sim is doing
        something interesting before any graphics exist.
      </p>

      <section style={{ marginBottom: 16 }}>
        <label>
          Scenario:{" "}
          <select value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioName)}>
            {SCENARIOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>{" "}
        <button onClick={() => loadScenario(scenario)} disabled={loading}>
          Load / Reset
        </button>
      </section>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {!farm && <p>Load a scenario to begin.</p>}

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

          <section style={{ marginBottom: 16 }}>
            <button onClick={() => advance(24)} disabled={loading}>
              +1 day
            </button>{" "}
            <button onClick={() => advance(24 * 7)} disabled={loading}>
              +7 days
            </button>{" "}
            <button onClick={() => advance(24 * 30)} disabled={loading}>
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
            <button onClick={moveHerdToPaddock}>Move</button>
          </section>

          <h2>Paddocks</h2>
          <table border={1} cellPadding={4} style={{ borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Paddock</th>
                <th>Cows</th>
                <th>Mean grass (kg/ha)</th>
                <th>Mean soil health</th>
                <th>Mean root health</th>
              </tr>
            </thead>
            <tbody>
              {farm.paddocks.map((p) => {
                const stats = paddockStats(farm, p);
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{stats.cowCount}</td>
                    <td>{stats.meanGrass.toFixed(0)}</td>
                    <td>{stats.meanSoil.toFixed(2)}</td>
                    <td>{stats.meanRoots.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h2>Cows ({liveCows.length})</h2>
          <table border={1} cellPadding={4} style={{ borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Sex</th>
                <th>Age (yr)</th>
                <th>Weight (kg)</th>
                <th>BCS</th>
                <th>Health</th>
                <th>Paddock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {liveCows.map((cow) => (
                <tr key={cow.id}>
                  <td>{cow.id}</td>
                  <td>{cow.status}</td>
                  <td>{cow.sex}</td>
                  <td>{(cow.ageDays / 365).toFixed(1)}</td>
                  <td>{cow.weightKg.toFixed(0)}</td>
                  <td>{cow.bodyConditionScore.toFixed(1)}</td>
                  <td>{cow.health.toFixed(2)}</td>
                  <td>{cow.currentPaddockId}</td>
                  <td>
                    <button onClick={() => sellCow(cow.id)}>Sell</button>
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
