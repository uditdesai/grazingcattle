"use client";

import { createClient } from "@/lib/supabase/client";
import type { FarmEvent, FarmState, Paddock } from "@grazingcattle/game-types";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

const MAX_EVENTS_SHOWN = 50;

const isLive = (status: string) =>
  status !== "dead" && status !== "sold" && status !== "slaughtered";

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

const tableStyle: CSSProperties = { borderCollapse: "collapse", marginBottom: 24, fontSize: 14, color: "#111" };
const thStyle: CSSProperties  = { border: "1px solid #999", padding: "8px 14px", textAlign: "left", background: "#e8e8e8", color: "#111" };
const tdStyle: CSSProperties  = { border: "1px solid #ccc", padding: "8px 14px", color: "#111" };
const btnStyle: CSSProperties = { border: "1px solid #888", borderRadius: 4, padding: "6px 12px", background: "#f5f5f5", color: "#111", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" };

const paddockStats = (farm: FarmState, paddock: Paddock) => {
  const ids = new Set(paddock.cellIds);
  const cells = farm.cells.filter((c) => ids.has(c.id));
  const cowCount = farm.cows.filter((c) => isLive(c.status) && c.currentPaddockId === paddock.id).length;
  return {
    cowCount,
    meanGrass: mean(cells.map((c) => c.grassBiomassKgHa)),
    meanSoil:  mean(cells.map((c) => c.soilHealth)),
    meanRoots: mean(cells.map((c) => c.rootHealth)),
  };
};

export default function DevPage() {
  const router = useRouter();
  const [farm, setFarm] = useState<FarmState | null>(null);
  const [events, setEvents] = useState<FarmEvent[]>([]);
  const [catchUpHours, setCatchUpHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetPaddockId, setTargetPaddockId] = useState("");
  const inFlight = useRef(false);

  // Load (or create) the farm as soon as the page mounts.
  useEffect(() => {
    void initialLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/farms");
      if (!res.ok) throw new Error(`Load failed: ${res.status}`);
      const data: { farm: FarmState; events: FarmEvent[]; catchUpHours: number } = await res.json();
      setFarm(data.farm);
      setEvents(data.events.slice(0, MAX_EVENTS_SHOWN));
      setCatchUpHours(data.catchUpHours);
      setTargetPaddockId(data.farm.paddocks[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const advance = async (hours: number) => {
    if (!farm || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/farms/${farm.id}/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      if (!res.ok) throw new Error(`Step failed: ${res.status}`);
      const data: { farm: FarmState; events: FarmEvent[] } = await res.json();
      setFarm(data.farm);
      setEvents((prev) => [...data.events, ...prev].slice(0, MAX_EVENTS_SHOWN));
      setCatchUpHours(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const moveHerd = async () => {
    if (!farm || !targetPaddockId || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/farms/${farm.id}/move-herd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPaddockId }),
      });
      if (!res.ok) throw new Error(`Move failed: ${res.status}`);
      const data: { farm: FarmState } = await res.json();
      setFarm(data.farm);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const sellCow = async (cowId: string) => {
    if (!farm || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/farms/${farm.id}/sell-cow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cowId }),
      });
      if (!res.ok) throw new Error(`Sell failed: ${res.status}`);
      const data: { farm: FarmState; event: FarmEvent } = await res.json();
      setFarm(data.farm);
      setEvents((prev) => [data.event, ...prev].slice(0, MAX_EVENTS_SHOWN));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const liveCows = farm?.cows.filter((c) => isLive(c.status)) ?? [];
  const day = farm ? Math.floor(farm.simHour / 24) + 1 : 1;

  return (
    <main style={{ fontFamily: "monospace", padding: 24, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 style={{ margin: 0 }}>Grazing Cattle — dev screen</h1>
        <button style={{ ...btnStyle, fontSize: 12 }} onClick={signOut}>
          Sign out
        </button>
      </div>
      <p style={{ color: "#555", marginBottom: 16 }}>
        Not the real UI — raw simulation state for testing.
      </p>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {loading && !farm && <p style={{ color: "#555" }}>Loading farm…</p>}

      {catchUpHours > 0 && (
        <p style={{ background: "#fffbe6", border: "1px solid #ffe58f", padding: "8px 12px", borderRadius: 4, marginBottom: 16 }}>
          While you were away, {catchUpHours} farm hours passed ({(catchUpHours / 24).toFixed(1)} farm days).
          Check the events log below for what happened.
        </p>
      )}

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
            <button style={btnStyle} onClick={() => advance(24)} disabled={loading}>+1 day</button>
            <button style={btnStyle} onClick={() => advance(24 * 7)} disabled={loading}>+7 days</button>
            <button style={btnStyle} onClick={() => advance(24 * 30)} disabled={loading}>+30 days</button>
          </section>

          <section style={{ marginBottom: 16 }}>
            Move entire herd to:{" "}
            <select
              value={targetPaddockId}
              onChange={(e) => setTargetPaddockId(e.target.value)}
              style={{ fontFamily: "monospace", fontSize: 14 }}
            >
              {farm.paddocks.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>{" "}
            <button style={btnStyle} onClick={moveHerd} disabled={loading}>Move</button>
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
                const s = paddockStats(farm, p);
                return (
                  <tr key={p.id}>
                    <td style={tdStyle}>{p.name}</td>
                    <td style={tdStyle}>{s.cowCount}</td>
                    <td style={tdStyle}>{s.meanGrass.toFixed(0)}</td>
                    <td style={tdStyle}>{s.meanSoil.toFixed(2)}</td>
                    <td style={tdStyle}>{s.meanRoots.toFixed(2)}</td>
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
                    <button style={btnStyle} onClick={() => sellCow(cow.id)} disabled={loading}>
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
            {events.map((e) => (
              <li key={e.id}>
                day {Math.floor(e.simHour / 24) + 1} — {e.type} — {JSON.stringify(e.data)}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
