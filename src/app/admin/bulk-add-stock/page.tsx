"use client";

import { useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { parseStockCsv, type RawStockRow, type RowCheck } from "@/lib/stock/bulkAddStock";

type Summary = { total: number; errors: number; newProducts: number; existingProducts: number };

export default function BulkAddStockPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<RawStockRow[] | null>(null);
  const [parseError, setParseError] = useState("");

  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [results, setResults] = useState<RowCheck[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [addMessage, setAddMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setFile(null);
    setRawRows(null);
    setParseError("");
    setResults(null);
    setSummary(null);
    setCheckError("");
    setAddError("");
    setAddMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (f: File | null) => {
    setFile(f);
    setResults(null);
    setSummary(null);
    setCheckError("");
    setAddError("");
    setAddMessage("");
    setParseError("");

    if (!f) {
      setRawRows(null);
      return;
    }

    try {
      const text = await f.text();
      const rows = parseStockCsv(text);
      if (rows.length === 0) throw new Error("No rows found in that file");
      setRawRows(rows);
    } catch (err) {
      setRawRows(null);
      setParseError(err instanceof Error ? err.message : "Could not read that file");
    }
  };

  const handleCheck = async () => {
    if (!rawRows?.length) return;

    setChecking(true);
    setCheckError("");
    setAddError("");
    setAddMessage("");
    setResults(null);
    setSummary(null);

    try {
      const res = await fetch("/api/bulk-add-stock/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rawRows })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed");

      setResults(data.results);
      setSummary(data.summary);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  };

  const handleAdd = async () => {
    if (!rawRows?.length || !summary || summary.errors > 0) return;

    setAdding(true);
    setAddError("");
    setAddMessage("");

    try {
      const res = await fetch("/api/bulk-add-stock/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rawRows })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Add failed");

      setAddMessage(data.message || "Added");
      setResults(null);
      setSummary(null);
      setRawRows(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAdding(false);
    }
  };

  return (
    <main className="page-shell page-shell-wide">
      <AppHeader title="Bulk Add Stock" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 1</p>
            <h2>Stock CSV</h2>
          </div>
        </div>

        <label className="field">
          <span className="field-label">File</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="control"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <p className="helper-text">
          Same columns as the old Supabase table import: area, location, pallet_id, cat, item,
          size, diam_value, diam_display, length_value, length_display, qty (note and code are
          optional). Every row is checked against the existing catalog first - nothing is added
          until you confirm below, and a row that would collide with an existing product is
          flagged instead of silently failing the whole import.
        </p>

        {parseError && <p className="search-error">{parseError}</p>}

        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            onClick={handleCheck}
            disabled={!rawRows?.length || checking}
          >
            {checking ? "Checking..." : `Check ${rawRows?.length ?? ""} row${rawRows?.length === 1 ? "" : "s"}`}
          </button>
          {(file || results) && (
            <button type="button" className="button" onClick={reset}>
              Start again
            </button>
          )}
        </div>

        {checkError && <p className="search-error">{checkError}</p>}
      </section>

      {results && summary && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Step 2</p>
              <h2>
                {summary.total} row{summary.total === 1 ? "" : "s"} checked
              </h2>
              <p>
                {summary.errors > 0
                  ? `${summary.errors} row${summary.errors === 1 ? "" : "s"} need fixing before you can add stock - correct them in the CSV and upload it again.`
                  : `${summary.newProducts} new catalog ${summary.newProducts === 1 ? "entry" : "entries"}, ${summary.existingProducts} adding to existing stock.`}
              </p>
            </div>

            <div className="button-row">
              <button type="button" className="button button-primary" onClick={handleAdd} disabled={adding || summary.errors > 0}>
                {adding ? "Adding..." : `Add ${summary.total} stock line${summary.total === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>

          {addMessage && <p className="helper-text">{addMessage}</p>}
          {addError && <p className="search-error">{addError}</p>}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Location</th>
                  <th>Pallet</th>
                  <th>Area</th>
                  <th>Cat</th>
                  <th>Item</th>
                  <th>Size</th>
                  <th>Diam</th>
                  <th>Length</th>
                  <th>Qty</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.index}
                    className={r.status === "error" ? "row-error" : r.status === "new-product" ? "row-flagged" : undefined}
                  >
                    <td>{r.index}</td>
                    <td>{r.row.location || "-"}</td>
                    <td>{r.row.palletId || "-"}</td>
                    <td>{r.row.area || "-"}</td>
                    <td>{r.row.cat || "-"}</td>
                    <td>{r.row.item || "-"}</td>
                    <td>{r.row.size || "-"}</td>
                    <td>{r.row.diamDisplay || "-"}</td>
                    <td>{r.row.lengthDisplay || "-"}</td>
                    <td>{r.row.qty ?? "-"}</td>
                    <td className={r.status === "error" ? "row-error-message" : r.status === "new-product" ? "row-review" : undefined}>
                      {r.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
