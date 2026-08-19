"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import AppHeader from "@/components/AppHeader";
import { splitStockLocation } from "@/lib/stockLocation";

type Row = {
  id: number;
  location: string;
  area?: string
  item: string;
  size: string;
  qty: number;
};

export default function MoveClient() {
  const [palletId, setPalletId] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [previewRows, setPreviewRows] = useState<Row[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const searchParams = useSearchParams();
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionRequestRef = useRef<AbortController | null>(null);

  const cancelSuggestionSearch = () => {
    if (suggestionTimerRef.current) {
      clearTimeout(suggestionTimerRef.current);
      suggestionTimerRef.current = null;
    }

    suggestionRequestRef.current?.abort();
    suggestionRequestRef.current = null;
  };

  /* ==============================
     PREVIEW
  ============================== */

  const handlePreview = useCallback(async (target: string) => {
    if (!target) return;

    try {
      const res = await fetch(
        `/api/preview?palletId=${encodeURIComponent(target)}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Pallet lookup failed");
      }

      const rows: Row[] = data.rows || [];
      setPreviewRows(rows);
      setSelectedLocation(rows[0]?.location || "");
    } catch (error) {
      setPreviewRows([]);
      setSelectedLocation("");
      const message =
        error instanceof Error ? error.message : "Pallet lookup failed";
      alert(message);
    }
  }, []);

  /* ==============================
     MOVE
  ============================== */

 const handleMove = async (targetArea: string) => {
  if (!previewRows.length || loading) return;

  const confirmMove = confirm(
    `Move ${previewRows.length} row(s) to ${targetArea}?`
  );
  if (!confirmMove) return;

  setLoading(true);

  try {
    const res = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: selectedLocation,
        target: targetArea
      })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Move failed");
    }

    alert(data.message || "Move complete");

    setPalletId("");
    setSelectedLocation("");
    setPreviewRows([]);
    setSuggestions([]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Move failed";
    alert(`Move failed: ${message}`);
  } finally {
    setLoading(false);
  }
};


  /* ==============================
     AUTOCOMPLETE
  ============================== */

  const handlePalletIdChange = (value: string) => {
    const upper = value.toUpperCase();
    setPalletId(upper);
    setSelectedLocation("");
    setPreviewRows([]);
    cancelSuggestionSearch();

    if (upper.length < 2) {
      setSuggestions([]);
      return;
    }

    suggestionTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      suggestionRequestRef.current = controller;

      try {
        const res = await fetch(
          `/api/preview?palletId=${encodeURIComponent(upper)}&match=contains`,
          { signal: controller.signal }
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Pallet search failed");
        }

        setSuggestions(data.locations || []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setSuggestions([]);
      }
    }, 300);
  };

  useEffect(() => {
    return () => cancelSuggestionSearch();
  }, []);

  /* ==============================
     QR AUTO-FILL
  ============================== */

  useEffect(() => {
    const scannedLocation = searchParams.get("location");

    if (scannedLocation) {
      const scannedValue = scannedLocation.toUpperCase();
      const parsed = splitStockLocation(scannedValue);
      const scannedPalletId = parsed.palletId || scannedValue;
      setPalletId(scannedPalletId);
      handlePreview(scannedPalletId);
    }
  }, [searchParams, handlePreview]);

  const iconMap: Record<string, string> = {
    GWS: "/gws.png",
    W3: "/w3.png",
    W4: "/w4.png"
  };

  return (
    <main className="page-shell">
      <AppHeader title="Move Stock" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 1</p>
            <h2>Find a pallet</h2>
          </div>
        </div>

        <div className="autocomplete">
          <label className="field">
            <span className="field-label">Pallet ID</span>
            <input
              type="text"
              placeholder="For example: YONG176_33"
              value={palletId}
              onChange={(e) => handlePalletIdChange(e.target.value)}
              className="control"
              autoComplete="off"
            />
          </label>

        {suggestions.length > 0 && (
          <div className="suggestions" role="listbox">
            {suggestions.map((suggestion) => {
              const parsed = splitStockLocation(suggestion);
              const suggestionPalletId = parsed.palletId || suggestion;

              return (
                <button
                  type="button"
                  key={suggestion}
                  className="suggestion suggestion-pallet"
                  onClick={() => {
                    cancelSuggestionSearch();
                    setPalletId(suggestionPalletId);
                    setSelectedLocation(suggestion);
                    setSuggestions([]);
                    handlePreview(suggestionPalletId);
                  }}
                >
                  <span>{suggestionPalletId}</span>
                  <small>Location: {parsed.location}</small>
                </button>
              );
            })}
          </div>
        )}
        </div>
      </section>

      {previewRows.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Pallet contents</p>
              <h2>{previewRows.length} stock line{previewRows.length === 1 ? "" : "s"}</h2>
            </div>
          </div>

          <div className="preview-list">
            {previewRows.map((row) => {
              const parsed = splitStockLocation(row.location);

              return (
                <div key={row.id} className="preview-card">
                  <div className="preview-topline">
                    <div className="preview-location-details">
                      <div className="stock-result-field">
                        <span className="stock-result-label">Location</span>
                        <span className="preview-location">
                          {parsed.location}
                        </span>
                      </div>
                      <div className="stock-result-field">
                        <span className="stock-result-label">Pallet ID</span>
                        <span className="pallet-id">
                          {parsed.palletId || "—"}
                        </span>
                      </div>
                    </div>
                    {row.area && (
                      <span
                        className={`area-badge area-badge-${row.area
                          .toLowerCase()
                          .replaceAll("_", "-")}`}
                      >
                        {row.area}
                      </span>
                    )}
                  </div>
                  <div className="preview-item">
                    {row.item} — {row.size}
                  </div>
                  <div className="preview-qty">
                    Quantity: {row.qty?.toLocaleString() ?? 0}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 2</p>
            <h2>Move to</h2>
          </div>
        </div>

        <div className="destination-grid">
          {["GWS", "W3", "W4"].map((area) => {
            const disabled = previewRows.length === 0 || loading;

            return (
              <button
                type="button"
                key={area}
                className="destination-button"
                disabled={disabled}
                onClick={() => handleMove(area)}
              >
                <Image
                  src={iconMap[area]}
                  alt=""
                  className="destination-icon"
                  width={58}
                  height={58}
                />
                <span>{loading ? "Moving…" : area}</span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
