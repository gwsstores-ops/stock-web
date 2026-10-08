"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Row = {
  id: number;
  location: string | null;
  pallet_id: string | null;
  item: string;
  size: string;
  qty: number | null;
  gws_in_since: string | null;
};

const formatMovedAt = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${weekday}. ${day}/${month}/${year} ${time}`;
};

export default function FloorToGwsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [movingPalletId, setMovingPalletId] = useState<string | null>(null);
  const [movingAll, setMovingAll] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/gws-in");
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Load failed");

      setRows(data.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const movePallet = async (palletId: string) => {
    setMovingPalletId(palletId);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/accept-gws-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ palletId })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Move failed");

      setRows((prev) => prev.filter((row) => row.pallet_id !== palletId));
      setSuccess(`Moved pallet ${palletId} to GWS`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move failed");
    } finally {
      setMovingPalletId(null);
    }
  };

  const moveAll = async () => {
    const palletIds = [...new Set(rows.map((row) => row.pallet_id).filter(Boolean))] as string[];
    if (palletIds.length === 0) return;

    const confirmMove = confirm(`Move all ${palletIds.length} pallet(s) to GWS?`);
    if (!confirmMove) return;

    setMovingAll(true);
    setError("");
    setSuccess("");

    const results = await Promise.all(
      palletIds.map((palletId) =>
        fetch("/api/accept-gws-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ palletId })
        })
      )
    );

    if (results.some((res) => !res.ok)) {
      setError("Some pallets could not be moved. Showing current state.");
    } else {
      setSuccess(`Moved ${palletIds.length} pallet(s) to GWS`);
    }

    setMovingAll(false);
    load();
  };

  const palletCount = new Set(rows.map((row) => row.pallet_id ?? `id-${row.id}`)).size;

  return (
    <main className="page-shell">
      <AppHeader title="Floor To GWS" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">GWS-IN</p>
            <h2>
              {rows.length} stock line{rows.length === 1 ? "" : "s"} — {palletCount} pallet
              {palletCount === 1 ? "" : "s"}
            </h2>
          </div>
        </div>

        <div className="outstanding-actions">
          <button type="button" onClick={load} className="button button-secondary" disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>

          {rows.length > 0 && (
            <button
              type="button"
              onClick={moveAll}
              className="button button-primary"
              disabled={movingAll || movingPalletId !== null}
            >
              {movingAll ? "Moving…" : "Move all to GWS"}
            </button>
          )}
        </div>

        {error && <p className="search-error">{error}</p>}
        {success && <p style={{ color: "#15803d", fontWeight: 600 }}>{success}</p>}

        <div className="table-wrap" style={{ marginTop: 16 }}>
          {rows.length === 0 ? (
            <div className="empty-state">
              {loading ? "Loading…" : "Nothing is currently on the floor (GWS-IN)."}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Pallet ID</th>
                  <th>Item</th>
                  <th>Size</th>
                  <th>Qty</th>
                  <th>Moved</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.location ?? "—"}</td>
                    <td>{row.pallet_id ?? "—"}</td>
                    <td>{row.item}</td>
                    <td>{row.size}</td>
                    <td>{(row.qty ?? 0).toLocaleString()}</td>
                    <td>{formatMovedAt(row.gws_in_since)}</td>
                    <td>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => row.pallet_id && movePallet(row.pallet_id)}
                        disabled={!row.pallet_id || movingPalletId !== null || movingAll}
                      >
                        {movingPalletId === row.pallet_id ? "Moving…" : "Move to GWS"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
