"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { findPort } from "@/lib/containers/ports";
import { emptyTrackingRow, type TrackingRow } from "@/lib/containers/tracking";
import { parseTrackingRows, readTrackingWords } from "@/lib/containers/trackingOcr";

type MapEntry = { container: string; supplierRef: string; updatedAt: string };

export default function AdminContainersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [rows, setRows] = useState<TrackingRow[] | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const [map, setMap] = useState<MapEntry[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [newContainer, setNewContainer] = useState("");
  const [newSupplierRef, setNewSupplierRef] = useState("");
  const [mapError, setMapError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadMap = () => {
    setMapLoading(true);
    fetch("/api/container-map")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the supplier ref mappings");
        return data;
      })
      .then((data) => setMap(data.map ?? []))
      .catch((err) =>
        setMapError(err instanceof Error ? err.message : "Could not load the supplier ref mappings")
      )
      .finally(() => setMapLoading(false));
  };

  useEffect(() => {
    loadMap();
  }, []);

  const mapByContainer = useMemo(
    () => new Map(map.map((entry) => [entry.container, entry.supplierRef])),
    [map]
  );

  const handleRead = async () => {
    if (!file) return;

    setReading(true);
    setReadError("");
    setRows(null);
    setSaveMessage("");
    setSaveError("");

    try {
      const words = await readTrackingWords(file);
      const parsed = parseTrackingRows(words);

      if (!parsed.length) {
        throw new Error(
          "No rows were read from that screenshot. Check it shows the tracking table clearly, or add rows by hand below."
        );
      }

      setRows(
        parsed.map((row) => ({
          ...row,
          supplierRef: row.supplierRef || mapByContainer.get(row.container) || ""
        }))
      );
    } catch (err) {
      setReadError(err instanceof Error ? err.message : "Could not read the screenshot");
    } finally {
      setReading(false);
    }
  };

  const updateRow = (index: number, patch: Partial<TrackingRow>) => {
    setRows((current) =>
      current ? current.map((row, i) => (i === index ? { ...row, ...patch } : row)) : current
    );
  };

  const removeRow = (index: number) => {
    setRows((current) => (current ? current.filter((_, i) => i !== index) : current));
  };

  const addRow = () => {
    setRows((current) => [...(current ?? []), emptyTrackingRow()]);
  };

  const handleSave = async () => {
    if (!rows?.length) return;

    setSaving(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const res = await fetch("/api/containers/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      setSaveMessage(data.message || "Saved");
      loadMap();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setRows(null);
    setReadError("");
    setSaveMessage("");
    setSaveError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const saveMapping = async (container: string, supplierRef: string) => {
    setMapError("");
    try {
      const res = await fetch("/api/container-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ container, supplierRef })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      loadMap();
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "Could not save the mapping");
    }
  };

  const deleteMapping = async (container: string) => {
    setMapError("");
    try {
      const res = await fetch("/api/container-map", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ container })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setMap((current) => current.filter((entry) => entry.container !== container));
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "Could not delete the mapping");
    }
  };

  const unmappedCount = rows?.filter((row) => !row.supplierRef.trim()).length ?? 0;

  return (
    <main className="page-shell page-shell-wide">
      <AppHeader title="Containers" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 1</p>
            <h2>Tracking screenshot</h2>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Screenshot</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="control"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRows(null);
              setReadError("");
            }}
          />
        </label>

        <p className="helper-text">
          A screenshot of the tracking site&apos;s container list (Container / From / To / Last
          status columns). It is read by OCR, so check every row below before saving - and fix
          anything that looks wrong.
        </p>
      </section>

      <section className="panel">
        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            onClick={handleRead}
            disabled={!file || reading}
          >
            {reading ? "Reading the screenshot..." : "Read the screenshot"}
          </button>

          {(rows || file) && (
            <button type="button" className="button" onClick={handleReset}>
              Start again
            </button>
          )}
        </div>

        {readError && <p className="search-error">{readError}</p>}
      </section>

      {rows && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Step 2</p>
              <h2>
                {rows.length} container{rows.length === 1 ? "" : "s"} read
              </h2>
            </div>

            <div className="button-row">
              <button type="button" className="button" onClick={addRow}>
                Add row
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save to Containers tab"}
              </button>
            </div>
          </div>

          {unmappedCount > 0 && (
            <p className="helper-text">
              {unmappedCount} container{unmappedCount === 1 ? " has" : "s have"} no supplier ref yet -
              type one in before saving and it is remembered for next time.
            </p>
          )}

          {saveMessage && <p className="helper-text">{saveMessage}</p>}
          {saveError && <p className="search-error">{saveError}</p>}

          <div className="table-wrap">
            <table className="data-table container-table">
              <thead>
                <tr>
                  <th>Container</th>
                  <th>Supplier ref</th>
                  <th>From</th>
                  <th>Loaded/departed</th>
                  <th>To</th>
                  <th>ETA</th>
                  <th>Last location</th>
                  <th>Last status</th>
                  <th>Status date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const knownPort = row.lastLocation ? findPort(row.lastLocation) : null;
                  const flagged = !row.supplierRef.trim() || (row.lastLocation && !knownPort);

                  return (
                    <tr key={index} className={flagged ? "row-flagged" : undefined}>
                      <td>
                        <input
                          className="cell-input cell-input-wide"
                          value={row.container}
                          onChange={(e) =>
                            updateRow(index, { container: e.target.value.toUpperCase() })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input cell-input-wide"
                          value={row.supplierRef}
                          onChange={(e) => updateRow(index, { supplierRef: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input cell-input-wide"
                          value={row.originPort}
                          onChange={(e) => updateRow(index, { originPort: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="cell-input"
                          value={row.originDate}
                          onChange={(e) => updateRow(index, { originDate: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input cell-input-wide"
                          value={row.destPort}
                          onChange={(e) => updateRow(index, { destPort: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="cell-input"
                          value={row.eta}
                          onChange={(e) => updateRow(index, { eta: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input cell-input-wide"
                          value={row.lastLocation}
                          onChange={(e) => updateRow(index, { lastLocation: e.target.value })}
                        />
                        {row.lastLocation && !knownPort && (
                          <div className="row-review">Unrecognised port - won&apos;t show on the map</div>
                        )}
                      </td>
                      <td>
                        <input
                          className="cell-input cell-input-wide"
                          value={row.lastStatus}
                          onChange={(e) => updateRow(index, { lastStatus: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="cell-input"
                          value={row.lastStatusDate}
                          onChange={(e) => updateRow(index, { lastStatusDate: e.target.value })}
                        />
                      </td>
                      <td>
                        <button type="button" className="button button-danger" onClick={() => removeRow(index)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Reference</p>
            <h2>Supplier ref mappings</h2>
            <p>
              Remembered container → supplier ref pairs. New ones are added automatically when
              saved above; edit or remove one here any time.
            </p>
          </div>
        </div>

        {mapError && <p className="search-error">{mapError}</p>}

        <div className="form-stack form-grid">
          <label className="field">
            <span className="field-label">Container</span>
            <input
              className="control"
              value={newContainer}
              onChange={(e) => setNewContainer(e.target.value.toUpperCase())}
              placeholder="e.g. TRHU2302436"
            />
          </label>
          <label className="field">
            <span className="field-label">Supplier ref</span>
            <input
              className="control"
              value={newSupplierRef}
              onChange={(e) => setNewSupplierRef(e.target.value)}
              placeholder="e.g. GDPA (126ES)"
            />
          </label>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            disabled={!newContainer.trim() || !newSupplierRef.trim()}
            onClick={async () => {
              await saveMapping(newContainer.trim(), newSupplierRef.trim());
              setNewContainer("");
              setNewSupplierRef("");
            }}
          >
            Add mapping
          </button>
        </div>

        {mapLoading ? (
          <p className="helper-text">Loading...</p>
        ) : map.length === 0 ? (
          <p className="empty-state">No mappings saved yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Container</th>
                  <th>Supplier ref</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {map.map((entry) => (
                  <tr key={entry.container}>
                    <td>{entry.container}</td>
                    <td>
                      <input
                        className="cell-input cell-input-wide"
                        defaultValue={entry.supplierRef}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value && value !== entry.supplierRef) {
                            saveMapping(entry.container, value);
                          }
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button-danger"
                        onClick={() => deleteMapping(entry.container)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
