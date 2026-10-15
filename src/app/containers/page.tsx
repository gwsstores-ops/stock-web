"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import AppHeader from "@/components/AppHeader";
import { findPort } from "@/lib/containers/ports";
import type { TrackingRow } from "@/lib/containers/tracking";

const ContainerMap = dynamic(() => import("@/components/containers/ContainerMap"), {
  ssr: false,
  loading: () => <p className="helper-text">Drawing the map...</p>
});

type ApiRow = TrackingRow;

type CardGroup = {
  key: string;
  title: string;
  eta: string;
  unmapped: boolean;
};

const groupKey = (row: ApiRow) =>
  [row.originPort, row.originDate, row.destPort, row.eta, row.lastLocation, row.lastStatus, row.lastStatusDate].join(
    "|"
  );

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THUR", "FRI", "SAT"];

/** THUR.15/10/2026 */
const formatWeekdayDate = (d: Date) => {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${WEEKDAYS[d.getDay()]}.${day}/${month}/${d.getFullYear()}`;
};

const formatDate = (value: string) => {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return formatWeekdayDate(d);
};

/** THUR.15/10/2026  10:06:57 AM */
const formatLastUpdated = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
  return `${formatWeekdayDate(d)}  ${time}`;
};

export default function ContainersPage() {
  const [rows, setRows] = useState<ApiRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    fetch("/api/containers")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load container positions");
        return data;
      })
      .then((data) => {
        if (!active) return;
        setRows(data.rows ?? []);
        setLastUpdated(data.lastUpdated ?? null);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load container positions");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const cards = useMemo<CardGroup[]>(() => {
    const groups = new Map<string, { rows: ApiRow[] }>();

    for (const row of rows) {
      const key = groupKey(row);
      const existing = groups.get(key);
      if (existing) existing.rows.push(row);
      else groups.set(key, { rows: [row] });
    }

    return Array.from(groups.values()).map(({ rows: grouped }) => {
      const first = grouped[0];
      const title = grouped
        .map((r) => r.supplierRef || r.container)
        .join(" + ");

      return {
        key: groupKey(first),
        title,
        eta: first.eta,
        unmapped: grouped.some((r) => !r.supplierRef)
      };
    });
  }, [rows]);

  const mapPoints = useMemo(() => {
    const byPort = new Map<string, { lon: number; lat: number; labels: string[] }>();

    for (const row of rows) {
      const port = findPort(row.lastLocation);
      if (!port) continue;

      const label = row.supplierRef || row.container;
      const existing = byPort.get(port.name);

      if (existing) {
        if (!existing.labels.includes(label)) existing.labels.push(label);
      } else {
        byPort.set(port.name, { lon: port.coords[0], lat: port.coords[1], labels: [label] });
      }
    }

    return Array.from(byPort.values());
  }, [rows]);

  const unlocatedCount = useMemo(
    () => rows.filter((row) => row.lastLocation && !findPort(row.lastLocation)).length,
    [rows]
  );

  const mapDestinations = useMemo(() => {
    const byPort = new Map<string, { lon: number; lat: number; labels: string[] }>();

    for (const row of rows) {
      const port = findPort(row.destPort);
      if (!port) continue;

      if (!byPort.has(port.name)) {
        byPort.set(port.name, {
          lon: port.coords[0],
          lat: port.coords[1],
          labels: [port.name.split(",")[0]]
        });
      }
    }

    return Array.from(byPort.values());
  }, [rows]);

  return (
    <main className="page-shell page-shell-wide">
      <AppHeader title="Containers">
        {lastUpdated && (
          <span className="last-updated">Last updated: {formatLastUpdated(lastUpdated)}</span>
        )}
      </AppHeader>

      <section className="panel">
        {loading && <p className="helper-text">Loading...</p>}
        {error && <p className="search-error">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="empty-state">No containers are currently being tracked.</p>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="container-map-wrap">
              <ContainerMap points={mapPoints} destinations={mapDestinations} />
            </div>

            <div className="map-legend">
              <span className="map-legend-item">
                <span className="map-legend-dot" style={{ background: "var(--green-600)" }} />
                Last reported position
              </span>
              <span className="map-legend-item">
                <span className="map-legend-square" style={{ background: "var(--amber-600)" }} />
                Destination
              </span>
            </div>

            {unlocatedCount > 0 && (
              <p className="helper-text">
                {unlocatedCount} container{unlocatedCount === 1 ? "" : "s"} could not be placed on the
                map (last location not recognised) - see the cards below.
              </p>
            )}

            <div className="container-card-grid">
              {cards.map((card) => (
                <div key={card.key} className="container-card">
                  <div className="container-card-title">{card.title}</div>
                  <div className="container-card-eta">ETA {card.eta ? formatDate(card.eta) : "-"}</div>
                  {card.unmapped && (
                    <div className="container-card-unmapped">Supplier ref not set yet</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
