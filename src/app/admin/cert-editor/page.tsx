"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import AppHeader from "@/components/AppHeader";
import { applyCertRules, type EditedCert } from "@/lib/certs/editor/apply";
import { renderPage } from "@/lib/certs/editor/preview";
import { CERT_SUPPLIERS, findCertSupplier } from "@/lib/certs/editor/suppliers";

type Done = EditedCert & { source: string };

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function CertEditorPage() {
  const [supplierId, setSupplierId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [results, setResults] = useState<Done[]>([]);
  const [shown, setShown] = useState(0);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const supplier = supplierId ? findCertSupplier(supplierId) : null;
  const canApply = Boolean(files.length && supplier?.ready);
  const current = results[shown] ?? null;

  // The preview is of whichever edited cert is being looked at.
  useEffect(() => {
    if (!current) {
      setPreview("");
      return;
    }

    let active = true;

    renderPage(current.blob, current.editedPages[0] ?? 1)
      .then((url) => {
        if (active) setPreview(url);
      })
      .catch(() => {
        if (active) setPreview("");
      });

    return () => {
      active = false;
    };
  }, [current]);

  const clearResults = () => {
    setResults([]);
    setShown(0);
    setPreview("");
    setError("");
  };

  const handleApply = async () => {
    if (!supplier || !canApply) return;

    setWorking(true);
    clearResults();
    setProgress({ done: 0, total: files.length });

    const done: Done[] = [];

    try {
      for (const file of files) {
        done.push({
          ...(await applyCertRules(file, supplier)),
          source: file.name
        });
        setProgress({ done: done.length, total: files.length });
      }

      setResults(done);
    } catch (err) {
      setResults(done);
      setError(
        err instanceof Error ? err.message : "Could not edit the certificate"
      );
    } finally {
      setWorking(false);
      setProgress(null);
    }
  };

  const handleDownloadAll = async () => {
    if (results.length === 1) {
      download(results[0].blob, results[0].name);
      return;
    }

    const zip = new JSZip();

    for (const result of results) {
      zip.file(result.name, await result.blob.arrayBuffer());
    }

    download(
      await zip.generateAsync({ type: "blob" }),
      `${supplier?.label ?? "certs"} GWS.zip`
    );
  };

  const handleReset = () => {
    setFiles([]);
    clearResults();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const warnings = results.filter((result) => result.warning);

  return (
    <main className="page-shell page-shell-wide">
      <AppHeader title="Cert Editor" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 1</p>
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
              clearResults();
            }}
          >
            <option value="">Choose a supplier</option>
            {CERT_SUPPLIERS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
                {entry.ready ? "" : " (rules not written yet)"}
              </option>
            ))}
          </select>
        </label>

        {supplier && (
          <details className="rules-panel">
            <summary>What is changed on a {supplier.label} cert</summary>
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
            <p className="section-kicker">Step 2</p>
            <h2>Original certs</h2>
          </div>
        </div>

        <label className="field">
          <span className="field-label">PDFs</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="control"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []));
              clearResults();
            }}
          />
        </label>

        <p className="helper-text">
          Pick as many as you like. Every one gets the same edit, and more than
          one comes back as a zip.
        </p>
      </section>

      <section className="panel">
        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            onClick={handleApply}
            disabled={!canApply || working}
          >
            {working ? "Editing..." : "Apply the edit"}
          </button>

          {(results.length > 0 || files.length > 0) && (
            <button type="button" className="button" onClick={handleReset}>
              Start again
            </button>
          )}
        </div>

        {progress && (
          <p className="helper-text">
            Cert {Math.min(progress.done + 1, progress.total)} of{" "}
            {progress.total}...
          </p>
        )}

        {supplier && !supplier.ready && (
          <p className="helper-text">
            {supplier.label} certs are not supported yet. Put an original and an
            edited version of it in the <strong>certs templates</strong> folder
            and the rules can be added.
          </p>
        )}

        {error && <p className="search-error">{error}</p>}
      </section>

      {results.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Step 3</p>
              <h2>
                {results.length} cert{results.length === 1 ? "" : "s"} edited
              </h2>
            </div>

            <div className="button-row">
              <button
                type="button"
                className="button button-primary"
                onClick={handleDownloadAll}
              >
                {results.length === 1 ? "Download the cert" : "Download all"}
              </button>
            </div>
          </div>

          {warnings.length > 0 && (
            <p className="search-error">
              {warnings.map((result) => result.source).join(", ")} did not read
              like {warnings.length === 1 ? "a " : ""}
              {supplier?.label} cert{warnings.length === 1 ? "" : "s"}. Check
              the supplier before sending{" "}
              {warnings.length === 1 ? "it" : "them"} out.
            </p>
          )}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Original</th>
                  <th>Edited</th>
                  <th>Pages</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {results.map((result, index) => (
                  <tr key={result.source}>
                    <td>{result.source}</td>
                    <td>{result.name}</td>
                    <td>{result.pages}</td>
                    <td>
                      <div className="button-row">
                        <button
                          type="button"
                          className="button"
                          onClick={() => setShown(index)}
                          disabled={index === shown}
                        >
                          {index === shown ? "Showing" : "Show"}
                        </button>
                        <button
                          type="button"
                          className="button"
                          onClick={() => download(result.blob, result.name)}
                        >
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="helper-text">
            Check the header and the signature line before these go out. Nothing
            the manufacturer certified is changed, the edits are drawn over the
            original page.
          </p>

          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={`${current?.name ?? "Edited cert"} preview`}
              className="cert-preview"
            />
          ) : (
            <p className="helper-text">Drawing the preview...</p>
          )}
        </section>
      )}
    </main>
  );
}
