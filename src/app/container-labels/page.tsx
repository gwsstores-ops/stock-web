"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { extractPdf, type ExtractProgress } from "@/lib/containers/extract";
import { buildRows, toCsv } from "@/lib/containers/csv";
import { findSupplier, SUPPLIERS } from "@/lib/containers/suppliers";
import type { ParsedLine } from "@/lib/containers/types";

type Vocab = {
  cats: string[];
  itemsByCat: Record<string, string[]>;
};

const emptyVocab: Vocab = { cats: [], itemsByCat: {} };

export default function ContainerLabelsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [cont, setCont] = useState("");

  const [lines, setLines] = useState<ParsedLine[] | null>(null);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [ocrPages, setOcrPages] = useState<number[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [vocab, setVocab] = useState<Vocab>(emptyVocab);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const supplier = supplierId ? findSupplier(supplierId) : null;
  const contRef = cont.trim().toUpperCase();

  useEffect(() => {
    let active = true;

    fetch("/api/container-vocab")
      .then((res) => res.json())
      .then((data) => {
        if (active && data.cats) setVocab(data);
      })
      .catch(() => {
        // The tool still works without the name lists, they are only a guide.
      });

    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(
    () => (lines ? buildRows(lines, contRef || "CONT") : []),
    [lines, contRef]
  );

  const flaggedCount = rows.filter((row) => row.review.length > 0).length;

  const canRead = Boolean(file && supplier?.ready && contRef);

  const handleRead = async () => {
    if (!file || !supplier || !canRead) return;

    setReading(true);
    setError("");
    setLines(null);
    setOcrPages([]);
    setProgress(null);

    try {
      const pages = await extractPdf(file, setProgress);
      const parsed = supplier.parse(pages);

      if (!parsed.length) {
        throw new Error(
          "No line items were found. Check the PDF is a packing list from this supplier."
        );
      }

      setOcrPages(pages.filter((page) => page.ocr).map((page) => page.page));
      setLines(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the PDF");
    } finally {
      setReading(false);
      setProgress(null);
    }
  };

  const updateLine = (index: number, patch: Partial<ParsedLine>) => {
    setLines((current) =>
      current
        ? current.map((line, i) => (i === index ? { ...line, ...patch } : line))
        : current
    );
  };

  const handleDownload = () => {
    const csv = toCsv(rows, contRef);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${contRef}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFile(null);
    setLines(null);
    setError("");
    setOcrPages([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <main className="page-shell page-shell-wide">
      <AppHeader title="Container Labels" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 1</p>
            <h2>Packing list</h2>
          </div>
        </div>

        <label className="field">
          <span className="field-label">PDF</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="control"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setLines(null);
              setError("");
            }}
          />
        </label>

        <p className="helper-text">
          Scanned packing lists are read by OCR, which takes a little longer and
          is worth checking line by line.
        </p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 2</p>
            <h2>Supplier</h2>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Supplier</span>
          <select
            className="control"
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setLines(null);
              setError("");
            }}
          >
            <option value="">Choose a supplier</option>
            {SUPPLIERS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
                {entry.ready ? "" : " (rules not written yet)"}
              </option>
            ))}
          </select>
        </label>

        {supplier && (
          <details className="rules-panel">
            <summary>How {supplier.label} packing lists are read</summary>
            <ul className="rules-list">
              {supplier.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 3</p>
            <h2>Container reference</h2>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Supplier ref</span>
          <input
            type="text"
            className="control"
            placeholder="For example: GD78ES"
            value={cont}
            autoComplete="off"
            onChange={(e) => setCont(e.target.value.toUpperCase())}
          />
        </label>

        <p className="helper-text">
          This becomes the <strong>cont</strong> column, and every pallet is
          labelled {contRef || "REF"}_01, {contRef || "REF"}_02 and so on.
        </p>
      </section>

      <section className="panel">
        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            onClick={handleRead}
            disabled={!canRead || reading}
          >
            {reading ? "Reading the PDF..." : "Read the packing list"}
          </button>

          {lines && (
            <button type="button" className="button" onClick={handleReset}>
              Start again
            </button>
          )}
        </div>

        {progress && (
          <p className="helper-text">
            {progress.stage === "ocr"
              ? `Running OCR on page ${progress.page} of ${progress.pages}...`
              : `Reading page ${progress.page} of ${progress.pages}...`}
          </p>
        )}

        {supplier && !supplier.ready && (
          <p className="helper-text">
            {supplier.label} packing lists are not supported yet. Send one over
            with the CSV it should produce and the rules can be added.
          </p>
        )}

        {error && <p className="search-error">{error}</p>}
      </section>

      {lines && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Step 4</p>
              <h2>
                {rows.length} line{rows.length === 1 ? "" : "s"} read
              </h2>
            </div>

            <button
              type="button"
              className="button button-primary"
              onClick={handleDownload}
            >
              Download {contRef}.csv
            </button>
          </div>

          {ocrPages.length > 0 && (
            <p className="helper-text">
              Page{ocrPages.length === 1 ? "" : "s"} {ocrPages.join(", ")} had no
              text layer and {ocrPages.length === 1 ? "was" : "were"} read by
              OCR. Check {ocrPages.length === 1 ? "that page" : "those pages"}{" "}
              closely.
            </p>
          )}

          <p className="helper-text">
            {flaggedCount === 0
              ? "Nothing was flagged. Every line still worth a look before importing."
              : `${flaggedCount} line${flaggedCount === 1 ? "" : "s"} need${
                  flaggedCount === 1 ? "s" : ""
                } checking - see the last column. Anything here can be edited.`}
          </p>

          <datalist id="container-cats">
            {vocab.cats.map((cat) => (
              <option key={cat} value={cat} />
            ))}
          </datalist>

          <div className="table-wrap">
            <table className="data-table container-table">
              <thead>
                <tr>
                  <th>Pallet</th>
                  <th>Location</th>
                  <th>Category</th>
                  <th>Item</th>
                  <th>Diam</th>
                  <th>Length</th>
                  <th>Size</th>
                  <th>Qty</th>
                  <th>PO</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={`${row.pallet}-${index}`}
                    className={row.review.length ? "row-flagged" : undefined}
                  >
                    <td>
                      <input
                        className="cell-input cell-input-narrow"
                        value={row.pallet}
                        onChange={(e) =>
                          updateLine(index, { pallet: e.target.value })
                        }
                      />
                    </td>
                    <td className="pallet-id">{row.location}</td>
                    <td>
                      <input
                        className="cell-input cell-input-wide"
                        list="container-cats"
                        value={row.cat ?? ""}
                        onChange={(e) =>
                          updateLine(index, { cat: e.target.value || null })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="cell-input cell-input-wide"
                        list={`items-${index}`}
                        value={row.item ?? ""}
                        onChange={(e) =>
                          updateLine(index, { item: e.target.value || null })
                        }
                      />
                      <datalist id={`items-${index}`}>
                        {(vocab.itemsByCat[row.cat ?? ""] ?? []).map((item) => (
                          <option key={item} value={item} />
                        ))}
                      </datalist>
                    </td>
                    <td>
                      <input
                        className="cell-input cell-input-narrow"
                        value={row.diamDisplay}
                        onChange={(e) => {
                          const text = e.target.value;
                          const value = Number(text);
                          updateLine(index, {
                            diamDisplay: text,
                            diamValue:
                              text.trim() && Number.isFinite(value) ? value : null
                          });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="cell-input cell-input-narrow"
                        value={row.lengthDisplay}
                        onChange={(e) => {
                          const text = e.target.value;
                          const value = Number(text);
                          updateLine(index, {
                            lengthDisplay: text,
                            lengthValue:
                              text.trim() && Number.isFinite(value) ? value : null
                          });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="cell-input"
                        value={row.size}
                        onChange={(e) =>
                          updateLine(index, { sizeOverride: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="cell-input cell-input-narrow"
                        value={row.qty ?? ""}
                        onChange={(e) => {
                          const text = e.target.value;
                          const value = Number(text);
                          updateLine(index, {
                            qty:
                              text.trim() && Number.isFinite(value) ? value : null
                          });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="cell-input cell-input-narrow"
                        value={row.po}
                        onChange={(e) => updateLine(index, { po: e.target.value })}
                      />
                    </td>
                    <td className="row-review">
                      {row.review.length > 0 && (
                        <>
                          {row.review.join("; ")}
                          <span className="row-source">
                            {row.description} {row.rawSize}
                          </span>
                        </>
                      )}
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
