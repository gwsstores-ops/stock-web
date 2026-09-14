"use client";

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { AREA_OPTIONS, CAT_OPTIONS, ITEM_OPTIONS } from "@/lib/containerDrops";

const FIELD_KEYS = [
  "area",
  "cont",
  "pal",
  "location",
  "cat",
  "item",
  "diam_value",
  "length_value",
  "size",
  "qty",
  "diam_display",
  "length_display",
  "NOTE"
] as const;

type FieldKey = (typeof FIELD_KEYS)[number];
type RowData = Record<FieldKey, string>;

const emptyRow: RowData = {
  area: "",
  cont: "",
  pal: "",
  location: "",
  cat: "",
  item: "",
  diam_value: "",
  length_value: "",
  size: "",
  qty: "",
  diam_display: "",
  length_display: "",
  NOTE: ""
};

type SavedRow = RowData & { key: string };

const fields: {
  key: FieldKey;
  label: string;
  type: "select" | "text";
  options?: string[];
  inputMode?: "numeric";
}[] = [
  { key: "area", label: "Area", type: "select", options: AREA_OPTIONS },
  { key: "cont", label: "Container", type: "text" },
  { key: "pal", label: "Pallet", type: "text" },
  { key: "location", label: "Location", type: "text" },
  { key: "cat", label: "Category", type: "select", options: CAT_OPTIONS },
  { key: "item", label: "Item", type: "select", options: ITEM_OPTIONS },
  { key: "diam_value", label: "Diameter value", type: "text", inputMode: "numeric" },
  { key: "diam_display", label: "Diameter display", type: "text" },
  { key: "length_value", label: "Length value", type: "text", inputMode: "numeric" },
  { key: "length_display", label: "Length display", type: "text" },
  { key: "size", label: "Size", type: "text" },
  { key: "qty", label: "Qty", type: "text", inputMode: "numeric" },
  { key: "NOTE", label: "Note", type: "text" }
];

function csvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(rows: SavedRow[]) {
  const header = FIELD_KEYS.join(",");
  const lines = rows.map((row) =>
    FIELD_KEYS.map((key) => csvCell(row[key])).join(",")
  );
  return [header, ...lines].join("\r\n");
}

export default function ContainersPage() {
  const [form, setForm] = useState<RowData>({ ...emptyRow });
  const [rows, setRows] = useState<SavedRow[]>([]);

  const updateField = (key: FieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { ...form, key: `${Date.now()}-${Math.random().toString(36).slice(2)}` }
    ]);
    setForm({ ...emptyRow });
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((row) => row.key !== key));
  };

  const clearAll = () => {
    if (rows.length === 0) return;
    if (!confirm(`Remove all ${rows.length} row(s)?`)) return;
    setRows([]);
  };

  const downloadCsv = () => {
    if (rows.length === 0) return;

    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const stamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 12);

    const link = document.createElement("a");
    link.href = url;
    link.download = `containers-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="page-shell">
      <AppHeader title="Containers" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">New entry</p>
            <h2>Add a row</h2>
          </div>
        </div>

        <div className="form-stack form-grid">
          {fields.map((field) => (
            <label className="field" key={field.key}>
              <span className="field-label">{field.label}</span>
              {field.type === "select" ? (
                <select
                  value={form[field.key]}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="control"
                >
                  <option value="">Select {field.label.toLowerCase()}</option>
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  inputMode={field.inputMode}
                  value={form[field.key]}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="control"
                  autoComplete="off"
                />
              )}
            </label>
          ))}
        </div>

        <div className="button-row">
          <button onClick={addRow} className="button button-primary">
            Add row
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Ready to export</p>
            <h2>
              {rows.length} row{rows.length === 1 ? "" : "s"}
            </h2>
          </div>
        </div>

        <div className="button-row">
          <button
            onClick={downloadCsv}
            disabled={rows.length === 0}
            className="button button-primary"
          >
            Download CSV
          </button>
          <button
            onClick={clearAll}
            disabled={rows.length === 0}
            className="button button-danger"
          >
            Clear all
          </button>
        </div>

        {rows.length > 0 && (
          <div className="preview-list" style={{ marginTop: 14 }}>
            {rows.map((row, index) => (
              <div key={row.key} className="preview-card">
                <div className="preview-topline">
                  <div className="preview-location">
                    #{index + 1} {row.area || "—"}
                    {row.cont ? ` · ${row.cont}` : ""}
                    {row.pal ? ` / ${row.pal}` : ""}
                  </div>
                  <button
                    onClick={() => removeRow(row.key)}
                    className="button button-danger"
                    style={{ minHeight: 32, padding: "0 12px" }}
                  >
                    Remove
                  </button>
                </div>
                <div className="preview-item">
                  {row.cat || "—"} — {row.item || "—"}
                </div>
                <div className="preview-qty">
                  Location: {row.location || "—"} · Size: {row.size || "—"} · Qty:{" "}
                  {row.qty || "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
