"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import AppHeader from "@/components/AppHeader";

type Row = {
  id: number;
  location: string | null;
  pallet_id: string | null;
  area?: string
  item: string;
  size: string;
  qty: number;
};

export default function MoveClient() {
  const [palletId, setPalletId] = useState("");
  const [previewRows, setPreviewRows] = useState<Row[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultModal, setResultModal] = useState<{
    area: string;
    message: string;
  } | null>(null);
  const [locationModalArea, setLocationModalArea] = useState<string | null>(null);
  const [newLocationValue, setNewLocationValue] = useState("");
  const [relocating, setRelocating] = useState(false);

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
        `/api/preview?location=${encodeURIComponent(target)}&match=exact&field=pallet_id`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Location lookup failed");
      }

      setPreviewRows(data.rows || []);
    } catch (error) {
      setPreviewRows([]);
      const message =
        error instanceof Error ? error.message : "Location lookup failed";
      alert(message);
    }
  }, []);

  /* ==============================
     MOVE
  ============================== */

 const handleMove = async (targetArea: string) => {
  if (!previewRows.length || loading) return;

  const uniquePalletIds = Array.from(
    new Set(previewRows.map((row) => row.pallet_id ?? row.location ?? "Unknown"))
  );
  const palletMessage =
    uniquePalletIds.length === 1
      ? `Pallet: ${uniquePalletIds[0]}`
      : `Pallets: ${uniquePalletIds.join(", ")}`;

  setLoading(true);

  try {
    const res = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: palletId,
        target: targetArea,
        field: "pallet_id"
      })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Move failed");
    }

    setResultModal({ area: targetArea, message: palletMessage });

    setPalletId("");
    setPreviewRows([]);
    setSuggestions([]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Move failed";
    setResultModal({ area: targetArea, message: `Move failed: ${message}` });
  } finally {
    setLoading(false);
  }
};

  const normalizeArea = (area: string) => {
    const upper = area.toUpperCase();
    if (upper.startsWith("GWS")) return "GWS";
    if (upper.startsWith("W3")) return "W3";
    if (upper.startsWith("W4")) return "W4";
    return upper;
  };

  const isSameArea = (targetArea: string) =>
    previewRows.length > 0 &&
    previewRows.every((row) => row.area && normalizeArea(row.area) === targetArea);

  const handleDestinationClick = (targetArea: string) => {
    if (!previewRows.length || loading) return;

    if (isSameArea(targetArea)) {
      setNewLocationValue(previewRows[0]?.location ?? "");
      setLocationModalArea(targetArea);
      return;
    }

    handleMove(targetArea);
  };

  /* ==============================
     RELOCATE (same-area location change)
  ============================== */

  const handleRelocate = async () => {
    const trimmed = newLocationValue.trim().toUpperCase();
    if (!trimmed || relocating) return;

    setRelocating(true);

    try {
      const res = await fetch("/api/relocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: palletId, newLocation: trimmed })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Location update failed");
      }

      const area = locationModalArea ?? "GWS";
      setLocationModalArea(null);
      setResultModal({ area, message: `Location: ${trimmed}` });

      setPalletId("");
      setPreviewRows([]);
      setSuggestions([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Location update failed";
      const area = locationModalArea ?? "GWS";
      setLocationModalArea(null);
      setResultModal({ area, message: `Location update failed: ${message}` });
    } finally {
      setRelocating(false);
    }
  };

  /* ==============================
     AUTOCOMPLETE
  ============================== */

  const handleLocationChange = (value: string) => {
    const upper = value.toUpperCase();
    setPalletId(upper);
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
          `/api/preview?location=${encodeURIComponent(upper)}&match=contains&field=pallet_id`,
          { signal: controller.signal }
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Location search failed");
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
      setPalletId(scannedValue);
      handlePreview(scannedValue);
    }
  }, [searchParams, handlePreview]);

  const iconMap: Record<string, string> = {
    GWS: "/gws.png",
    W3: "/w3.png",
    W4: "/w4.png"
  };

  const moveIconMap: Record<string, string> = {
    GWS: "/icons/move_gws.png",
    W3: "/icons/move_w3.png",
    W4: "/icons/move_w4.png"
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
              placeholder="For example: 3A98 or BRK5230-17"
              value={palletId}
              onChange={(e) => handleLocationChange(e.target.value)}
              className="control"
              autoComplete="off"
            />
          </label>

        {suggestions.length > 0 && (
          <div className="suggestions" role="listbox">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s}
                className="suggestion"
                onClick={() => {
                  cancelSuggestionSearch();
                  setPalletId(s);
                  setSuggestions([]);
                  handlePreview(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        </div>
      </section>

      {previewRows.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Location contents</p>
              <h2>{previewRows.length} stock line{previewRows.length === 1 ? "" : "s"}</h2>
            </div>
          </div>

          <div className="preview-list">
            {previewRows.map((row) => (
              <div key={row.id} className="preview-card">
                <div className="preview-topline">
                  <div className="preview-location">
                    {row.pallet_id ?? row.location}
                    {row.location && row.pallet_id && row.location !== row.pallet_id && (
                      <span className="preview-sublocation">
                        {" "}
                        · {row.location}
                      </span>
                    )}
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
            ))}
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
                onClick={() => handleDestinationClick(area)}
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

      {locationModalArea && (
        <div className="modal-overlay" onClick={() => setLocationModalArea(null)}>
          <div className="modal-panel move-modal" onClick={(e) => e.stopPropagation()}>
            <p className="section-kicker">Same area</p>
            <h2>Move location</h2>
            <input
              type="text"
              className="control"
              value={newLocationValue}
              onChange={(e) => setNewLocationValue(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRelocate();
              }}
              placeholder="New location"
              autoComplete="off"
              autoFocus
            />
            <button
              type="button"
              className="button button-primary button-block"
              onClick={handleRelocate}
              disabled={relocating || !newLocationValue.trim()}
            >
              {relocating ? "Updating…" : "Enter"}
            </button>
          </div>
        </div>
      )}

      {resultModal && (
        <div className="modal-overlay" onClick={() => setResultModal(null)}>
          <div className="modal-panel move-modal" onClick={(e) => e.stopPropagation()}>
            <Image
              src={moveIconMap[resultModal.area]}
              alt={resultModal.area}
              width={96}
              height={96}
              className="move-modal-icon"
            />
            <p className="move-modal-text">{resultModal.message}</p>
            <button
              type="button"
              className="button button-primary button-block"
              onClick={() => setResultModal(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
