"use client";

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import type { MixMerge, MixPlan, MixRename } from "@/lib/mixLocations";

type ApplyResult = {
  renamed: number;
  merged: number;
  skipped: { bayId: number; from: string; reason: string }[];
};

export default function CleanLocationsPage() {
  const [plan, setPlan] = useState<MixPlan | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState("");

  const handlePreview = async () => {
    setLoadingPreview(true);
    setError("");
    setResult(null);
    setPlan(null);

    try {
      const res = await fetch("/api/mix-locations-preview");
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Preview failed");

      setPlan(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleApply = async () => {
    if (!plan) return;

    const total = plan.renames.length + plan.merges.length;
    const confirmApply = confirm(`Clean up ${total} location(s)? This can't be undone.`);
    if (!confirmApply) return;

    setApplying(true);
    setError("");

    try {
      const res = await fetch("/api/mix-locations-apply", { method: "POST" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Apply failed");

      setResult(data);
      setPlan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  const total = plan ? plan.renames.length + plan.merges.length : 0;

  return (
    <main className="page-shell page-shell-wide">
      <AppHeader title="Clean Locations" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 1</p>
            <h2>Find &quot;(MIX-N)&quot; locations</h2>
          </div>
        </div>

        <p className="field-hint">
          Strips the old &quot;(MIX-N)&quot; tag off locations that still carry it (it belongs on the
          Pallet ID, which already has it in almost every case). Locations that collide once the
          tag is stripped are merged into the existing plain-named location.
        </p>

        <button
          type="button"
          className="button button-primary button-block"
          onClick={handlePreview}
          disabled={loadingPreview}
          style={{ marginTop: 16 }}
        >
          {loadingPreview ? "Checking…" : "Preview"}
        </button>
      </section>

      {plan && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Step 2</p>
              <h2>{total} location(s) to clean up</h2>
            </div>
          </div>

          {total === 0 ? (
            <div className="empty-state">No &quot;(MIX-N)&quot; locations found.</div>
          ) : (
            <>
              {plan.renames.length > 0 && (
                <>
                  <h3 style={{ marginTop: 16 }}>Rename ({plan.renames.length})</h3>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Area</th>
                          <th>From</th>
                          <th>To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.renames.map((r: MixRename) => (
                          <tr key={r.bayId}>
                            <td>{r.area}</td>
                            <td>{r.from}</td>
                            <td>{r.to}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {plan.merges.length > 0 && (
                <>
                  <h3 style={{ marginTop: 16 }}>Merge into existing location ({plan.merges.length})</h3>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Area</th>
                          <th>From</th>
                          <th>Merges into</th>
                          <th>Pallets to move</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.merges.map((m: MixMerge) => (
                          <tr key={m.srcBayId}>
                            <td>{m.area}</td>
                            <td>{m.from}</td>
                            <td>{m.to}</td>
                            <td>{m.palletsToMove}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <button
                type="button"
                className="button button-danger button-block"
                onClick={handleApply}
                disabled={applying}
                style={{ marginTop: 16 }}
              >
                {applying ? "Applying…" : `Apply ${total} change(s)`}
              </button>
            </>
          )}
        </section>
      )}

      {(error || result) && (
        <section className="panel">
          {error && <p className="search-error">{error}</p>}
          {result && (
            <>
              <p style={{ color: "#15803d", fontWeight: 600 }}>
                Renamed {result.renamed}, merged {result.merged}
                {result.skipped.length > 0 && `, skipped ${result.skipped.length}`}.
              </p>
              {result.skipped.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 16 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>From</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.skipped.map((s) => (
                        <tr key={s.bayId}>
                          <td>{s.from}</td>
                          <td>{s.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
