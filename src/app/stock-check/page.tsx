"use client";

import { useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Row = {
  id: number;
  location: string;
  pallet_id?: string | null;
  area?: string;
  item: string;
  size: string;
  qty: number | null;
  stock_check: boolean | null;
  needs_label?: boolean | null;
};

export default function Page() {
  const [location, setLocation] = useState("");
  const [lookupArea, setLookupArea] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [outstandingRows, setOutstandingRows] = useState<Row[]>([]);
  const [filterArea, setFilterArea] = useState("");
  const [filterLocation, setFilterLocation] = useState("");

  const [newLabelRows, setNewLabelRows] = useState<Row[] | null>(null);

  /* ==============================
     SEARCH (by pallet ID)
  ============================== */

  // "exact" = a suggestion was picked; "contains-rows" = whatever was typed
  type SearchMode = "exact" | "contains-rows";

  const lastSearch = useRef<{ target: string; area: string; mode: SearchMode } | null>(null);
  const suggestionRequest = useRef(0);

  const runSearch = async (target: string, area: string, mode: SearchMode) => {
    if (!target && !area) return;
    lastSearch.current = { target, area, mode };

    const params = new URLSearchParams({ field: "pallet_id" });
    if (target) {
      params.set("location", target);
      params.set("match", mode);
    }
    if (area) params.set("area", area);

    const res = await fetch(`/api/preview?${params.toString()}`);
    const data = await res.json();
    setRows(data.rows || []);
  };

  // Re-run the search that produced the list on screen (after ticking a box, or a reset)
  const refreshSearch = () => {
    const last = lastSearch.current;
    if (last) runSearch(last.target, last.area, last.mode);
  };

  /* ==============================
     AREA (sticky filter)
  ============================== */

  const handleAreaChange = (value: string) => {
    setLookupArea(value);
    setSuggestions([]);

    const last = lastSearch.current;
    const stillExact = last?.mode === "exact" && last.target === location;
    runSearch(location, value, stillExact ? "exact" : "contains-rows");
  };

  /* ==============================
     AUTOCOMPLETE
  ============================== */

  const handleLocationChange = async (value: string) => {
    const upper = value.toUpperCase();
    setLocation(upper);

    const requestId = ++suggestionRequest.current;

    if (upper.length >= 2) {
      const params = new URLSearchParams({
        location: upper,
        match: "contains",
        field: "pallet_id"
      });
      if (lookupArea) params.set("area", lookupArea);

      const res = await fetch(`/api/preview?${params.toString()}`);
      const data = await res.json();

      // a slower, older keystroke must not overwrite the newest suggestions
      if (requestId !== suggestionRequest.current) return;
      setSuggestions(data.locations || []);
    } else {
      setSuggestions([]);
    }
  };

  /* ==============================
     SINGLE CHECK
  ============================== */

  const markChecked = async (id: number) => {
    await fetch("/api/mark-checked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });

    refreshSearch();
    loadOutstanding();
  };

  const deleteRow = async (id: number) => {
    const confirmDelete = confirm("Delete this stock line? This cannot be undone.");
    if (!confirmDelete) return;

    const res = await fetch("/api/delete-stock-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || "Could not delete stock line");
      return;
    }

    setRows((prev) => prev.filter((row) => row.id !== id));
    loadOutstanding();
  };

  const markOutstandingChecked = async (id: number) => {
    const res = await fetch("/api/mark-checked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });

    if (!res.ok) return;

    setOutstandingRows((prev) => prev.filter((row) => row.id !== id));
    refreshSearch();
  };

  /* ==============================
     NEW LABEL FLAG
  ============================== */

  const setNewLabelFlag = async (id: number, value: boolean) => {
    const res = await fetch("/api/mark-new-label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, value })
    });

    if (!res.ok) return;

    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, needs_label: value } : row))
    );
    setOutstandingRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, needs_label: value } : row))
    );

    if (newLabelRows) {
      if (value) {
        loadNewLabels();
      } else {
        setNewLabelRows((prev) => prev?.filter((row) => row.id !== id) ?? prev);
      }
    }
  };

  const loadNewLabels = async () => {
    const res = await fetch("/api/new-labels");
    const data = await res.json();
    setNewLabelRows(data.rows || []);
  };

  const clearNewLabel = async (id: number) => {
    await setNewLabelFlag(id, false);
  };

  const editPalletIdLocally = (id: number, value: string) => {
    setNewLabelRows((prev) =>
      prev ? prev.map((row) => (row.id === id ? { ...row, pallet_id: value } : row)) : prev
    );
  };

  const savePalletId = async (id: number, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const res = await fetch("/api/rename-pallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, label: trimmed })
    });

    if (!res.ok) {
      alert("Could not update pallet ID");
      loadNewLabels();
    }
  };

  const exportNewLabelsCSV = () => {
    if (!newLabelRows || newLabelRows.length === 0) return;

    const headers = ["Location", "Pallet ID", "Item", "Size", "Qty"];

    const csvRows = [
      headers.join(","),
      ...newLabelRows.map((row) =>
        [
          row.location,
          `"${row.pallet_id ?? ""}"`,
          `"${row.item}"`,
          `"${row.size}"`,
          row.qty ?? 0
        ].join(",")
      )
    ];

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.setAttribute(
      "download",
      `new_labels_${new Date().toISOString().slice(0, 10)}.csv`
    );

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ==============================
     RESET ALL STOCK CHECKS
  ============================== */

  const resetAllStockChecks = async () => {
    const confirmReset = confirm("Reset ALL stock checks to unchecked?");
    if (!confirmReset) return;

    await fetch("/api/reset-stock-check", { method: "POST" });

    refreshSearch();
    loadOutstanding();
  };

  /* ==============================
     LOAD OUTSTANDING
  ============================== */

  const loadOutstanding = async () => {
    const params = new URLSearchParams();

    if (filterArea) params.append("area", filterArea);
    if (filterLocation) params.append("location", filterLocation);

    const res = await fetch(`/api/checked?${params}`);
    const data = await res.json();
    setOutstandingRows(data.rows || []);
  };

  /* ==============================
     EXPORT CSV
  ============================== */

  const exportOutstandingCSV = () => {
    if (!outstandingRows.length) return;

    const headers = ["Location", "Pallet ID", "Item", "Size", "Qty"];

    const csvRows = [
      headers.join(","),
      ...outstandingRows.map((row) =>
        [
          row.location,
          `"${row.pallet_id ?? ""}"`,
          `"${row.item}"`,
          `"${row.size}"`,
          row.qty ?? 0
        ].join(",")
      )
    ];

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.setAttribute(
      "download",
      `outstanding_${new Date().toISOString().slice(0, 10)}.csv`
    );

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ==============================
     ITEM STYLE RULES
  ============================== */

  const getItemStyle = (item: string): React.CSSProperties => {
    const upper = item.toUpperCase();

    if (upper.includes("HDB SC")) return { fontWeight: 700, color: "#000" };
    if (upper.includes("HDG")) return { fontWeight: 700, color: "#777" };

    return {};
  };

  const getSizeBadgeClass = (size: string): string => {
    const upper = size.toUpperCase();

    if (upper.startsWith("12 X") || upper.startsWith("M12")) return "size-badge size-badge-red";
    if (upper.startsWith("16 X") || upper.startsWith("M16")) return "size-badge size-badge-blue";
    if (upper.startsWith("20 X") || upper.startsWith("M20")) return "size-badge size-badge-yellow";
    if (upper.startsWith("24 X") || upper.startsWith("M24")) return "size-badge size-badge-green";
    if (upper.startsWith("30 X") || upper.startsWith("M30")) return "size-badge size-badge-black";

    return "";
  };

  const palletCount = new Set(rows.map((row) => row.pallet_id ?? `id-${row.id}`)).size;

  return (
    <main className="page-shell page-shell-wide">
      <AppHeader title="Stock Check" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Location lookup</p>
            <h2>Find stock to check</h2>
          </div>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span className="field-label">Area</span>
            <select
              value={lookupArea}
              onChange={(e) => handleAreaChange(e.target.value)}
              className="control"
            >
              <option value="">All areas</option>
              <option value="GWS">GWS</option>
              <option value="W3">W3</option>
              <option value="W4">W4</option>
            </select>
          </label>
        </div>

        <div className="autocomplete">
          <label className="field">
            <span className="field-label">Pallet ID</span>
            <input
              value={location}
              onChange={(e) => handleLocationChange(e.target.value)}
              placeholder="Enter pallet ID"
              className="control"
              autoComplete="off"
            />
          </label>

        {suggestions.length > 0 && (
          <div className="suggestions" role="listbox">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s}
                className="suggestion"
                onClick={() => {
                  suggestionRequest.current++;
                  setLocation(s);
                  setSuggestions([]);
                  runSearch(s, lookupArea, "exact");
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        </div>
      </section>

      {rows.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Location results</p>
              <h2>
                {palletCount} pallet{palletCount === 1 ? "" : "s"}
              </h2>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pallet ID</th>
                  <th>Item</th>
                  <th>Size</th>
                  <th>Qty</th>
                  <th>Checked</th>
                  <th>New Label</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="pallet-id">{row.pallet_id ?? "—"}</td>
                    <td style={getItemStyle(row.item)}>{row.item}</td>
                    <td>
                      <span className={getSizeBadgeClass(row.size)}>{row.size}</span>
                    </td>
                    <td>{row.qty?.toLocaleString() ?? 0}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Mark pallet ${row.pallet_id ?? row.id} checked`}
                        checked={row.stock_check === true}
                        disabled={row.stock_check === true}
                        onChange={() => markChecked(row.id)}
                        className="check-box"
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Flag pallet ${row.pallet_id ?? row.id} for a new label`}
                        checked={row.needs_label === true}
                        onChange={(e) => setNewLabelFlag(row.id, e.target.checked)}
                        className="check-box"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => deleteRow(row.id)}
                        className="button button-danger"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">New Label</p>
            <h2>Labels to print</h2>
          </div>
        </div>

        <div className="outstanding-actions">
          <button
            type="button"
            onClick={loadNewLabels}
            className="button button-primary"
          >
            Show new labels required
          </button>

          {newLabelRows && newLabelRows.length > 0 && (
            <button
              type="button"
              onClick={exportNewLabelsCSV}
              className="button button-secondary"
            >
              Export CSV
            </button>
          )}
        </div>

        {newLabelRows && (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            {newLabelRows.length === 0 ? (
              <div className="empty-state">No labels currently flagged.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Pallet ID</th>
                    <th>Item</th>
                    <th>Size</th>
                    <th>Qty</th>
                    <th>Clear</th>
                  </tr>
                </thead>
                <tbody>
                  {newLabelRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.location}</td>
                      <td className="pallet-id">
                        <input
                          type="text"
                          value={row.pallet_id ?? ""}
                          onChange={(e) => editPalletIdLocally(row.id, e.target.value)}
                          onBlur={(e) => savePalletId(row.id, e.target.value)}
                          aria-label={`Edit pallet ID for ${row.location}`}
                          className="control"
                        />
                      </td>
                      <td style={getItemStyle(row.item)}>{row.item}</td>
                      <td>
                        <span className={getSizeBadgeClass(row.size)}>{row.size}</span>
                      </td>
                      <td>{row.qty?.toLocaleString() ?? 0}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => clearNewLabel(row.id)}
                          className="button button-secondary"
                        >
                          Clear
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Outstanding</p>
            <h2>Unchecked stock</h2>
          </div>
        </div>

        <div className="outstanding-actions">
          <button
            type="button"
            onClick={resetAllStockChecks}
            className="button button-danger"
          >
            Reset all checks
          </button>

          {outstandingRows.length > 0 && (
            <button
              type="button"
              onClick={exportOutstandingCSV}
              className="button button-secondary"
            >
              Export CSV
            </button>
          )}
        </div>

        <div className="filter-grid">
          <label className="field">
            <span className="field-label">Area</span>
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="control"
            >
              <option value="">All areas</option>
              <option value="GWS">GWS</option>
              <option value="W3">W3</option>
              <option value="W4">W4</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Location is</span>
            <input
              placeholder="Optional location filter"
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value.toUpperCase())}
              className="control"
            />
          </label>

          <button
            type="button"
            onClick={loadOutstanding}
            className="button button-primary"
          >
            Load
          </button>
        </div>

        <div className="table-wrap" style={{ marginTop: 16 }}>
          {outstandingRows.length === 0 ? (
            <div className="empty-state">
              Load the list to see outstanding stock checks.
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
                  <th>Check</th>
                  <th>New Label</th>
                </tr>
              </thead>
              <tbody>
                {outstandingRows
                  .slice()
                  .sort(
                    (a, b) =>
                      a.location.localeCompare(b.location) ||
                      (a.pallet_id ?? "").localeCompare(b.pallet_id ?? "")
                  )
                  .map((row) => (
                    <tr key={row.id}>
                      <td>{row.location}</td>
                      <td className="pallet-id">{row.pallet_id ?? "—"}</td>
                      <td style={getItemStyle(row.item)}>{row.item}</td>
                      <td>{row.size}</td>
                      <td>{row.qty?.toLocaleString()}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Mark ${row.location} ${row.item} checked`}
                          checked={false}
                          onChange={() => markOutstandingChecked(row.id)}
                          className="check-box"
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Flag ${row.location} ${row.item} for a new label`}
                          checked={row.needs_label === true}
                          onChange={(e) => setNewLabelFlag(row.id, e.target.checked)}
                          className="check-box"
                        />
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
