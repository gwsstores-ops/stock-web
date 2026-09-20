"use client";

import { useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { combineCerts, type CombineResult } from "@/lib/certs/combine";

const OUTPUT_NAME = "Combined_Filtered_Products.xlsx";

export default function CertCombinePage() {
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [listFile, setListFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [result, setResult] = useState<CombineResult | null>(null);
  const [error, setError] = useState("");

  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const listInputRef = useRef<HTMLInputElement | null>(null);

  const handleCombine = async () => {
    if (!zipFile) return;

    setWorking(true);
    setError("");
    setResult(null);
    setProgress(null);

    try {
      setResult(
        await combineCerts(zipFile, listFile, (done, total) =>
          setProgress({ done, total })
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not combine the files");
    } finally {
      setWorking(false);
      setProgress(null);
    }
  };

  const handleDownload = () => {
    if (!result) return;

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = OUTPUT_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setZipFile(null);
    setListFile(null);
    setResult(null);
    setError("");
    if (zipInputRef.current) zipInputRef.current.value = "";
    if (listInputRef.current) listInputRef.current.value = "";
  };

  return (
    <main className="page-shell page-shell-wide">
      <AppHeader title="Cert Combine" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 1</p>
            <h2>Excel files</h2>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Zip of .xlsx files</span>
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            className="control"
            onChange={(e) => {
              setZipFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError("");
            }}
          />
        </label>

        <details className="rules-panel">
          <summary>How the files are combined</summary>
          <ul className="rules-list">
            <li>
              Only rows whose Product starts with ISO4017G or 933CEASS, or
              contains HSFG, are kept.
            </li>
            <li>
              Files are put in order of the first number in their filename and
              labelled 01, 02 and so on in the File column.
            </li>
            <li>A blank row is added before each file&apos;s rows.</li>
          </ul>
        </details>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 2 (optional)</p>
            <h2>Invoice list</h2>
          </div>
        </div>

        <label className="field">
          <span className="field-label">List CSV</span>
          <input
            ref={listInputRef}
            type="file"
            accept=".csv,text/csv"
            className="control"
            onChange={(e) => {
              setListFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError("");
            }}
          />
        </label>

        <p className="helper-text">
          The BLANK column is written into Confirmation Notes on the blank row
          before each file, matched by order only - so the list needs the same
          number of rows as there are files, in the same order. If BLANK is
          empty it is built from Number, Customer Ref and Job Number.
        </p>
      </section>

      <section className="panel">
        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            onClick={handleCombine}
            disabled={!zipFile || working}
          >
            {working ? "Combining..." : "Combine files"}
          </button>

          {(result || zipFile || listFile) && (
            <button type="button" className="button" onClick={handleReset}>
              Start again
            </button>
          )}
        </div>

        {progress && (
          <p className="helper-text">
            Reading file {progress.done} of {progress.total}...
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
                {result.files} file{result.files === 1 ? "" : "s"},{" "}
                {result.matchedRows} row{result.matchedRows === 1 ? "" : "s"} kept
              </h2>
            </div>

            <button
              type="button"
              className="button button-primary"
              onClick={handleDownload}
            >
              Download {OUTPUT_NAME}
            </button>
          </div>

          <p className="helper-text">
            {listFile
              ? "Certificate notes were added to the blank row before each file."
              : "No list was supplied, so the blank rows are empty."}
          </p>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Source</th>
                  <th>Rows kept</th>
                </tr>
              </thead>
              <tbody>
                {result.perFile.map((file, index) => (
                  <tr key={`${file.name}-${index}`}>
                    <td>{file.label}</td>
                    <td>{file.name}</td>
                    <td>{file.matched}</td>
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
