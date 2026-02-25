"use client";

import { useState } from "react";

type Row = {
  id: number;
  location: string;
  area?: string;
  item: string;
  size: string;
  qty: number | null;
  stock_check: boolean | null;
};

export default function Page() {
  const [location, setLocation] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [outstandingRows, setOutstandingRows] = useState<Row[]>([]);
  const [filterArea, setFilterArea] = useState("");
  const [filterLocation, setFilterLocation] = useState("");

  /* ==============================
     SEARCH
  ============================== */

  const handleSearch = async (loc?: string) => {
    const target = loc || location;
    if (!target) return;

    const res = await fetch(`/api/preview?location=${target}`);
    const data = await res.json();
    setRows(data.rows || []);
  };

  /* ==============================
     AUTOCOMPLETE
  ============================== */

  const handleLocationChange = async (value: string) => {
    const upper = value.toUpperCase();
    setLocation(upper);

    if (upper.length >= 2) {
      const res = await fetch(`/api/preview?location=${upper}`);
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
     CHECK ALL
  ============================== */

  const markAllChecked = async () => {
    if (!rows.length) return;

    const confirmAll = confirm(
      `Mark all ${rows.length} lines as checked?`
    );

    if (!confirmAll) return;

    await fetch("/api/mark-all-checked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location })
    });

    handleSearch();
    loadOutstanding();
  };

  const allChecked =
    rows.length > 0 &&
    rows.every((row) => row.stock_check === true);

  /* ==============================
     RESET ALL STOCK CHECKS
  ============================== */

  const resetAllStockChecks = async () => {
    const confirmReset = confirm(
      "Reset ALL stock checks to unchecked?"
    );

    if (!confirmReset) return;

    await fetch("/api/reset-stock-check", {
      method: "POST"
    });

    handleSearch();
    loadOutstanding();
  };

  /* ==============================
     LOAD OUTSTANDING
  ============================== */

  const loadOutstanding = async () => {
    const params = new URLSearchParams();

    if (filterArea) params.append("area", filterArea);
    if (filterLocation)
      params.append("location", filterLocation);

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
        [
          row.location,
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
      `outstanding_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
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

    if (upper.includes("HDB SC")) {
      return { fontWeight: 700, color: "#000" };
    }

    if (upper.includes("HDG")) {
      return { fontWeight: 700, color: "#777" };
    }

    return {};
  };

  return (
    <div style={{ padding: 30, maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 20 }}>Stock Check</h2>

      {/* INPUT + AUTOCOMPLETE */}
      <div style={{ position: "relative", marginBottom: 30 }}>
        <input
          value={location}
          onChange={(e) =>
            handleLocationChange(e.target.value)
          }
          placeholder="Enter Location"
          style={{
            padding: 10,
            width: 300,
            fontSize: 16
          }}
        />

        {suggestions.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: 42,
              left: 0,
              width: 300,
              background: "white",
              border: "1px solid #ccc",
              zIndex: 10
            }}
          >
            {suggestions.map((s) => (
              <div
                key={s}
                style={{
                  padding: 8,
                  cursor: "pointer"
                }}
                onClick={() => {
                  setLocation(s);
                  setSuggestions([]);
                  handleSearch(s);
                }}
              >
                {s}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CHECK ALL BUTTON */}
      {rows.length > 1 && (
        <div style={{ marginBottom: 15 }}>
          <button
            onClick={markAllChecked}
            disabled={allChecked}
            style={{
              padding: "6px 12px",
              fontSize: 14,
              cursor: allChecked ? "not-allowed" : "pointer",
              opacity: allChecked ? 0.6 : 1
            }}
          >
            Check All
          </button>
        </div>
      )}

      {/* LOCATION RESULTS */}
      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            padding: 10,
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div>
            <strong>{row.location}</strong> —{" "}
            <span style={getItemStyle(row.item)}>
              {row.item}
            </span>{" "}
            {row.size} — QTY:{" "}
            {row.qty?.toLocaleString()}
          </div>

          <input
            type="checkbox"
            checked={row.stock_check === true}
            disabled={row.stock_check === true}
            onChange={() => markChecked(row.id)}
            style={{ width: 18, height: 18 }}
          />
        </div>
      ))}

      {/* OUTSTANDING SECTION */}
      <hr style={{ margin: "40px 0" }} />

      <h3
        style={{
          marginBottom: 15,
          letterSpacing: 1.5,
          fontWeight: 700
        }}
      >
        OUTSTANDING
      </h3>

            {/* RESET BUTTON */}
      <div style={{ marginBottom: 15 }}>
        <button
          onClick={resetAllStockChecks}
          style={{
            padding: "8px 14px",
            fontSize: 14,
            backgroundColor: "#c62828",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 600,
            transition: "0.2s"
          }}
          onMouseOver={(e) =>
            (e.currentTarget.style.backgroundColor = "#b71c1c")
          }
          onMouseOut={(e) =>
            (e.currentTarget.style.backgroundColor = "#c62828")
          }
        >
          Reset All Stock Checks
        </button>
      </div>

      {/* FILTERS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
        <select
          value={filterArea}
          onChange={(e) => setFilterArea(e.target.value)}
        >
          <option value="">All Areas</option>
          <option value="GWS">GWS</option>
          <option value="W3">W3</option>
          <option value="W4">W4</option>
        </select>

        <input
          placeholder="Location begins with"
          value={filterLocation}
          onChange={(e) =>
            setFilterLocation(e.target.value.toUpperCase())
          }
        />

        <button onClick={loadOutstanding}>
          Load
        </button>
      </div>

      {/* EXPORT BUTTON */}
      {outstandingRows.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={exportOutstandingCSV}
            style={{
              padding: "6px 12px",
              fontSize: 14,
              cursor: "pointer"
            }}
          >
            Export CSV
          </button>
        </div>
      )}

      {/* TABLE */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 14
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #ccc" }}>
            <th align="left">Location</th>
            <th align="left">Item</th>
            <th align="left">Size</th>
            <th align="right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {outstandingRows.map((row) => (
            <tr
              key={row.id}
              style={{ borderBottom: "1px solid #eee" }}
            >
              <td>{row.location}</td>
              <td style={getItemStyle(row.item)}>
                {row.item}
              </td>
              <td>{row.size}</td>
              <td align="right">
                {row.qty?.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}