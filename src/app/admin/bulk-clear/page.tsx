"use client";

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { areaLabel } from "@/lib/areas";

const AREAS = ["GWS-IN", "GWS", "W3", "W4", "CONTAINER"];

type LocationTotal = {
  location: string;
  lines: number;
  qty: number;
};

type Preview = {
  area: string;
  prefix: string;
  locations: LocationTotal[];
  totalLines: number;
  totalQty: number;
};

export default function BulkClearPage() {
  const [area, setArea] = useState("");
  const [prefix, setPrefix] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // The confirm button only ever acts on a preview that matches the current
  // inputs exactly, so editing area/prefix after previewing can't delete the
  // wrong thing.
  const previewMatchesInputs =
    !!preview && preview.area === area && preview.prefix === prefix.trim().toUpperCase();

  const handlePreview = async () => {
    if (!area) return;

    setLoadingPreview(true);
    setError("");
    setSuccess("");
    setPreview(null);

    try {
      const trimmedPrefix = prefix.trim().toUpperCase();
      const res = await fetch(
        `/api/bulk-clear-preview?area=${encodeURIComponent(area)}&prefix=${encodeURIComponent(trimmedPrefix)}`
      );
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Preview failed");

      setPreview({
        area,
        prefix: trimmedPrefix,
        locations: data.locations || [],
        totalLines: data.totalLines ?? 0,
        totalQty: data.totalQty ?? 0
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!previewMatchesInputs || !preview) return;

    setDeleting(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/bulk-clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area: preview.area, prefix: preview.prefix })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Delete failed");

      setSuccess(data.message || "Deleted");
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="page-shell">
      <AppHeader title="Bulk Clear" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 1</p>
            <h2>What to clear</h2>
          </div>
        </div>

        <div className="form-stack form-grid">
          <label className="field">
            <span className="field-label">Area</span>
            <select
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setPreview(null);
                setSuccess("");
              }}
              className="control"
            >
              <option value="">Select area</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {areaLabel(a)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Location starts with (optional)</span>
            <input
              type="text"
              value={prefix}
              onChange={(e) => {
                setPrefix(e.target.value.toUpperCase());
                setPreview(null);
                setSuccess("");
              }}
              className="control"
              placeholder="e.g. AA — leave blank for every location in the area"
              autoComplete="off"
            />
          </label>
        </div>

        <button
          type="button"
          className="button button-secondary button-block"
          onClick={handlePreview}
          disabled={!area || loadingPreview}
        >
          {loadingPreview ? "Checking…" : "Preview"}
        </button>
      </section>

      {preview && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Step 2</p>
              <h2>
                {preview.totalLines} stock line{preview.totalLines === 1 ? "" : "s"} in{" "}
                {preview.locations.length} location{preview.locations.length === 1 ? "" : "s"}
              </h2>
            </div>
          </div>

          {preview.totalLines === 0 ? (
            <div className="empty-state">Nothing matches that area and location prefix.</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Lines</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.locations.map((loc) => (
                      <tr key={loc.location}>
                        <td>{loc.location}</td>
                        <td>{loc.lines}</td>
                        <td>{loc.qty.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                className="button button-danger button-block"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting
                  ? "Deleting…"
                  : `Delete all ${preview.totalLines} line${preview.totalLines === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </section>
      )}

      {(error || success) && (
        <section className="panel">
          {error && <p className="search-error">{error}</p>}
          {success && <p style={{ color: "#15803d", fontWeight: 600 }}>{success}</p>}
        </section>
      )}
    </main>
  );
}
