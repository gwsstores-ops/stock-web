"use client";

import { useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { sortPdfs, type SortResult } from "@/lib/pdfSorter/sort";

const OUTPUT_NAME = "found_pdfs.zip";

// webkitdirectory/directory aren't in React's input prop types, but every
// major browser supports them on a plain file input.
const FOLDER_INPUT_PROPS = { webkitdirectory: "", directory: "" } as Record<string, string>;

export default function PdfSorterPage() {
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [serialsText, setSerialsText] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SortResult | null>(null);
  const [error, setError] = useState("");

  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const handleSort = async () => {
    if (!pdfFiles.length || !csvFile || !serialsText.trim()) return;

    setWorking(true);
    setError("");
    setResult(null);
    setProgress(null);

    try {
      const csvText = await csvFile.text();
      setResult(
        await sortPdfs(pdfFiles, serialsText, csvText, (done, total) =>
          setProgress({ done, total })
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sort the PDFs");
    } finally {
      setWorking(false);
      setProgress(null);
    }
  };

  const handleDownload = () => {
    if (!result) return;

    const url = URL.createObjectURL(result.zipBlob);
    const link = document.createElement("a");

    link.href = url;
    link.download = OUTPUT_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setPdfFiles([]);
    setSerialsText("");
    setCsvFile(null);
    setResult(null);
    setError("");
    if (csvInputRef.current) csvInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  return (
    <main className="page-shell page-shell-wide">
      <AppHeader title="PDF Sorter" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 1</p>
            <h2>PDF library</h2>
          </div>
        </div>

        <label className="field">
          <span className="field-label">all_pdfs folder</span>
          <input
            ref={folderInputRef}
            type="file"
            className="control"
            onChange={(e) => {
              setPdfFiles(Array.from(e.target.files ?? []));
              setResult(null);
              setError("");
            }}
            {...FOLDER_INPUT_PROPS}
          />
        </label>

        <p className="helper-text">
          Pick the all_pdfs folder (or wherever the certs live) - every PDF inside it,
          including subfolders, is searched. Nothing is uploaded anywhere; the browser
          reads the files locally.
          {pdfFiles.length > 0 && (
            <> {pdfFiles.filter((f) => f.name.toLowerCase().endsWith(".pdf")).length} PDF(s) found.</>
          )}
        </p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 2</p>
            <h2>Heat numbers (serials.txt)</h2>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Paste the contents of serials.txt</span>
          <textarea
            className="control"
            rows={10}
            value={serialsText}
            onChange={(e) => {
              setSerialsText(e.target.value);
              setResult(null);
              setError("");
            }}
            placeholder={
              "NEW CERTS INVOICE SI00023519 PO 732-DSJF-00361 REF DUB41 LOAD 217\nJ40D\nGD9457051024D"
            }
          />
        </label>

        <details className="rules-panel">
          <summary>How this is grouped</summary>
          <ul className="rules-list">
            <li>
              A heading line must start with &quot;NEW &quot; - everything after it becomes the
              batch name, and the SI number in it is looked up in the invoice/customer CSV.
            </li>
            <li>
              Each line under a heading is one heat number. A heat number must match a whole
              word/code in a PDF&apos;s filename (case-insensitive) - J50T matches
              &quot;16X50 HDG J50T.pdf&quot; but not &quot;AJ50T.pdf&quot;.
            </li>
            <li>If more than one PDF matches, the first one alphabetically is used.</li>
            <li>A heat number with no match gets a &quot;NOT FOUND&quot; placeholder page instead.</li>
          </ul>
        </details>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 3</p>
            <h2>Invoice → customer CSV</h2>
          </div>
        </div>

        <label className="field">
          <span className="field-label">invoice_customer.csv</span>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="control"
            onChange={(e) => {
              setCsvFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError("");
            }}
          />
        </label>

        <p className="helper-text">Must have columns named Number and Customer.</p>
      </section>

      <section className="panel">
        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            onClick={handleSort}
            disabled={!pdfFiles.length || !csvFile || !serialsText.trim() || working}
          >
            {working ? "Sorting..." : "Sort PDFs"}
          </button>

          {(result || pdfFiles.length || csvFile || serialsText) && (
            <button type="button" className="button" onClick={handleReset}>
              Start again
            </button>
          )}
        </div>

        {progress && (
          <p className="helper-text">
            Processing item {progress.done} of {progress.total}...
          </p>
        )}

        {error && <p className="search-error">{error}</p>}
      </section>

      {result && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Done</p>
              <h2>
                {result.stats.itemsFound} found, {result.stats.itemsNotFound} not found
              </h2>
            </div>

            <button type="button" className="button button-primary" onClick={handleDownload}>
              Download {OUTPUT_NAME}
            </button>
          </div>

          <p className="helper-text">
            {result.stats.pdfFilesChecked} PDFs checked
            {result.stats.multipleMatchCount > 0 && (
              <>, {result.stats.multipleMatchCount} heat number(s) matched more than one PDF</>
            )}
            . Check summary.txt inside the zip for the full run log.
          </p>

          {result.customerNotes.length > 0 && (
            <>
              <p className="field-label">Customer lookup issues</p>
              <div className="table-wrap">
                <table className="data-table">
                  <tbody>
                    {result.customerNotes.map((note, i) => (
                      <tr key={i}>
                        <td>{note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result.notFoundItems.length > 0 && (
            <>
              <p className="field-label">Not found</p>
              <div className="table-wrap">
                <table className="data-table">
                  <tbody>
                    {result.notFoundItems.map((note, i) => (
                      <tr key={i}>
                        <td>{note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
