"use client";

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { areaLabel } from "@/lib/areas";

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
  const [area, setArea] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const [outstandingRows, setOutstandingRows] = useState<Row[]>([]);
  const [checkedRows, setCheckedRows] = useState<Row[]>([]);

  const [newLabelRows, setNewLabelRows] = useState<Row[] | null>(null);

  /* ==============================
     LOAD OUTSTANDING / CHECKED
     (both driven by the same area + location filter)
  ============================== */

  const loadOutstanding = async (areaVal = area, locationVal = locationFilter) => {
    const params = new URLSearchParams();
    if (areaVal) params.append("area", areaVal);
    if (locationVal) params.append("location", locationVal);

    const res = await fetch(`/api/checked?${params}`);
    const data = await res.json();
    setOutstandingRows(data.rows || []);
  };

  const loadChecked = async (areaVal = area, locationVal = locationFilter) => {
    const params = new URLSearchParams({ status: "checked" });
    if (areaVal) params.append("area", areaVal);
    if (locationVal) params.append("location", locationVal);

    const res = await fetch(`/api/checked?${params}`);
    const data = await res.json();
    setCheckedRows(data.rows || []);
  };

  const loadBoth = async (areaVal = area, locationVal = locationFilter) => {
    await Promise.all([loadOutstanding(areaVal, locationVal), loadChecked(areaVal, locationVal)]);
  };

  const handleAreaChange = (value: string) => {
    setArea(value);
    loadBoth(value, locationFilter);
  };

  /* ==============================
     SINGLE CHECK / UNCHECK
  ============================== */

  const markOutstandingChecked = async (id: number) => {
    const res = await fetch("/api/mark-checked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });

    if (!res.ok) return;

    setOutstandingRows((prev) => prev.filter((row) => row.id !== id));
    loadChecked();
  };

  const markCheckedUnchecked = async (id: number) => {
    const res = await fetch("/api/mark-checked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, value: false })
    });

    if (!res.ok) return;

    setCheckedRows((prev) => prev.filter((row) => row.id !== id));
    loadOutstanding();
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

    setOutstandingRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, needs_label: value } : row))
    );
    setCheckedRows((prev) =>
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

  const clearAllNewLabels = async () => {
    if (!newLabelRows || newLabelRows.length === 0) return;

    const confirmClear = confirm("Clear all new label flags?");
    if (!confirmClear) return;

    const results = await Promise.all(
      newLabelRows.map((row) =>
        fetch("/api/mark-new-label", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id, value: false })
        })
      )
    );

    if (results.some((res) => !res.ok)) {
      alert("Some labels could not be cleared. Showing current state.");
    }

    loadNewLabels();
    loadBoth();
  };

  const editPalletIdLocally = (id: number, value: string) => {
    setNewLabelRows((prev) =>
      prev ? prev.map((row) => (row.id === id ? { ...row, pallet_id: value } : row)) : prev
    );
    setOutstandingRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, pallet_id: value } : row))
    );
    setCheckedRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, pallet_id: value } : row))
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
      loadBoth();
    }
  };

  const editLocationLocally = (id: number, value: string) => {
    setOutstandingRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, location: value } : row))
    );
  };

  // Relocate matches by Pallet ID (same as Move's "same area" relocate), so a
  // row with no Pallet ID yet has nothing to key the move off and is skipped.
  const saveLocation = async (row: Row, value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !row.pallet_id) return;

    const res = await fetch("/api/relocate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: row.pallet_id, newLocation: trimmed })
    });

    if (!res.ok) {
      alert("Could not update location");
      loadBoth();
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

    loadBoth();
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

  const exportCheckedCSV = () => {
    if (!checkedRows.length) return;

    const headers = ["Location", "Pallet ID", "Item", "Size", "Qty"];

    const csvRows = [
      headers.join(","),
      ...checkedRows.map((row) =>
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
      `checked_${new Date().toISOString().slice(0, 10)}.csv`
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

  const checkedPalletCount = new Set(
    checkedRows.map((row) => row.pallet_id ?? `id-${row.id}`)
  ).size;

  return (
    <main className="page-shell page-shell-wide">
      <AppHeader title="Stock Check" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Filter</p>
            <h2>Area &amp; location</h2>
          </div>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span className="field-label">Area</span>
            <select
              value={area}
              onChange={(e) => handleAreaChange(e.target.value)}
              className="control"
            >
              <option value="">All areas</option>
              <option value="GWS">GWS</option>
              <option value="W3">{areaLabel("W3")}</option>
              <option value="W4">{areaLabel("W4")}</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Location is</span>
            <input
              placeholder="Optional location filter"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value.toUpperCase())}
              className="control"
            />
          </label>

          <button
            type="button"
            onClick={() => loadBoth()}
            className="button button-primary"
          >
            Load
          </button>
        </div>
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
                      <td className="pallet-id">
                        <input
                          type="text"
                          value={row.location}
                          onChange={(e) => editLocationLocally(row.id, e.target.value)}
                          onBlur={(e) => saveLocation(row, e.target.value)}
                          aria-label={`Edit location for ${row.pallet_id ?? row.location}`}
                          className="control"
                        />
                      </td>
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

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Checked</p>
            <h2>
              Checked stock
              {checkedRows.length > 0 && (
                <> &mdash; {checkedPalletCount} pallet{checkedPalletCount === 1 ? "" : "s"}</>
              )}
            </h2>
          </div>
        </div>

        <div className="outstanding-actions">
          {checkedRows.length > 0 && (
            <button
              type="button"
              onClick={exportCheckedCSV}
              className="button button-secondary"
            >
              Export CSV
            </button>
          )}
        </div>

        <div className="table-wrap" style={{ marginTop: 16 }}>
          {checkedRows.length === 0 ? (
            <div className="empty-state">
              Load the list to see checked stock.
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
                  <th>Uncheck</th>
                  <th>New Label</th>
                </tr>
              </thead>
              <tbody>
                {checkedRows
                  .slice()
                  .sort(
                    (a, b) =>
                      a.location.localeCompare(b.location) ||
                      (a.pallet_id ?? "").localeCompare(b.pallet_id ?? "")
                  )
                  .map((row) => (
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
                      <td>{row.size}</td>
                      <td>{row.qty?.toLocaleString()}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Mark ${row.location} ${row.item} unchecked`}
                          checked={true}
                          onChange={() => markCheckedUnchecked(row.id)}
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
            <>
              <button
                type="button"
                onClick={exportNewLabelsCSV}
                className="button button-secondary"
              >
                Export CSV
              </button>

              <button
                type="button"
                onClick={clearAllNewLabels}
                className="button button-danger"
              >
                Clear all
              </button>
            </>
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
    </main>
  );
}
