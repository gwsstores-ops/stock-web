"use client";

import { useState } from "react";
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
};

export default function Page() {
  const [location, setLocation] = useState("");
  const [lookupArea, setLookupArea] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [outstandingRows, setOutstandingRows] = useState<Row[]>([]);
  const [filterArea, setFilterArea] = useState("");
  const [filterLocation, setFilterLocation] = useState("");

  /* ==============================
     SEARCH
  ============================== */

  const handleSearch = async (loc?: string, area?: string) => {
    const target = loc ?? location;
    const areaValue = area ?? lookupArea;
    if (!target && !areaValue) return;

    const params = new URLSearchParams();
    if (target) params.set("location", target);
    if (areaValue) params.set("area", areaValue);

    const res = await fetch(`/api/preview?${params.toString()}`);
    const data = await res.json();
    setRows(data.rows || []);
  };

  /* ==============================
     AREA (sticky filter)
  ============================== */

  const handleAreaChange = (value: string) => {
    setLookupArea(value);
    setSuggestions([]);
    handleSearch(location, value);
  };

  /* ==============================
     AUTOCOMPLETE
  ============================== */

  const handleLocationChange = async (value: string) => {
    const upper = value.toUpperCase();
    setLocation(upper);

    if (upper.length >= 2) {
      const params = new URLSearchParams({ location: upper });
      if (lookupArea) params.set("area", lookupArea);

      const res = await fetch(`/api/preview?${params.toString()}`);
      const data = await res.json();

      const uniqueLocations: string[] = Array.from(
        new Set((data.rows || []).map((r: Row) => r.location))
      );

      setSuggestions(uniqueLocations);
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

    handleSearch();
    loadOutstanding();
  };

  /* ==============================
     RESET ALL STOCK CHECKS
  ============================== */

  const resetAllStockChecks = async () => {
    const confirmReset = confirm("Reset ALL stock checks to unchecked?");
    if (!confirmReset) return;

    await fetch("/api/reset-stock-check", { method: "POST" });

    handleSearch();
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

    const headers = ["Location", "Item", "Size", "Qty"];

    const csvRows = [
      headers.join(","),
      ...outstandingRows.map((row) =>
        [row.location, `"${row.item}"`, `"${row.size}"`, row.qty ?? 0].join(",")
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
            <span className="field-label">Location</span>
            <input
              value={location}
              onChange={(e) => handleLocationChange(e.target.value)}
              placeholder="Enter location"
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
                  setLocation(s);
                  setSuggestions([]);
                  handleSearch(s);
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
            <span className="field-label">Location begins with</span>
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
                  <th>Item</th>
                  <th>Size</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {outstandingRows
                  .slice()
                  .sort((a, b) => a.location.localeCompare(b.location))
                  .map((row) => (
                    <tr key={row.id}>
                      <td>{row.location}</td>
                      <td style={getItemStyle(row.item)}>{row.item}</td>
                      <td>{row.size}</td>
                      <td>{row.qty?.toLocaleString()}</td>
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
