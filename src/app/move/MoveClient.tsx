"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

type Row = {
  id: number;
  location: string;
  item: string;
  size: string;
  qty: number;
};

export default function MoveClient() {
  const [location, setLocation] = useState("");
  const [previewRows, setPreviewRows] = useState<Row[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const searchParams = useSearchParams();

  /* ==============================
     PREVIEW
  ============================== */

  const handlePreview = async (loc?: string) => {
    const target = loc || location;
    if (!target) return;

    const res = await fetch(`/api/preview?location=${target}`);
    const data = await res.json();

    setPreviewRows(data.rows || []);
  };

  /* ==============================
     MOVE
  ============================== */

 const handleMove = async (targetArea: string) => {
  if (!previewRows.length) return;

  const confirmMove = confirm(
    `Move ${previewRows.length} row(s) to ${targetArea}?`
  );
  if (!confirmMove) return;

  setLoading(true);

  await fetch("/api/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location,
      target: targetArea
    })
  });

  alert("Move complete");

  // ✅ AUTO RESET
  setLocation("");
  setPreviewRows([]);
  setSuggestions([]);

  setLoading(false);
};


  /* ==============================
     AUTOCOMPLETE
  ============================== */

  const handleLocationChange = async (value: string) => {
    const upper = value.toUpperCase();
    setLocation(upper);

    if (upper.length >= 2) {
      const res = await fetch(`/api/preview?location=${upper}`);
      const data = await res.json();

      const uniqueLocations: string[] = Array.from(
        new Set((data.rows || []).map((r: Row) => r.location))
      );

      setSuggestions(uniqueLocations);
    } else {
      setSuggestions([]);
    }
  };

  /* ==============================
     QR AUTO-FILL
  ============================== */

  useEffect(() => {
    const scannedLocation = searchParams.get("location");

    if (scannedLocation) {
      const upper = scannedLocation.toUpperCase();
      setLocation(upper);
      handlePreview(upper);
    }
  }, [searchParams]);

  const iconMap: Record<string, string> = {
    GWS: "/gws.png",
    W3: "/w3.png",
    W4: "/w4.png"
  };

  return (
    <div
      style={{
        padding: "18px 14px 24px",
        maxWidth: 700,
        margin: "0 auto"
      }}
    >
      <h2 style={{ marginBottom: 16 }}>↓ MOVE ↓</h2>

      {/* INPUT + AUTOCOMPLETE */}
      <div style={{ position: "relative", marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Enter Location (e.g. 3A98)"
          value={location}
          onChange={(e) => handleLocationChange(e.target.value)}
          style={{
            padding: "10px 12px",
            width: "100%",
            fontSize: 17,
            borderRadius: 6,
            border: "1px solid #ccc"
          }}
        />

        {suggestions.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: 44,
              left: 0,
              right: 0,
              background: "white",
              border: "1px solid #ccc",
              borderRadius: 6,
              zIndex: 10
            }}
          >
            {suggestions.map((s) => (
              <div
                key={s}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer"
                }}
                onClick={() => {
                  setLocation(s);
                  setSuggestions([]);
                  handlePreview(s);
                }}
              >
                {s}
              </div>
            ))}
          </div>
        )}
      </div>

     {/* PREVIEW RESULTS */}
{previewRows.length > 0 && (
  <div style={{ marginBottom: 28 }}>
    {previewRows.map((row) => (
      <div
        key={row.id}
        style={{
          padding: "10px 0",
          borderBottom: "1px solid #e5e5e5"
        }}
      >
        {/* LOCATION */}
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 0.5
          }}
        >
          {row.location}

        </div>
{row.area && (
  <div
    style={{
      fontSize: 14,
      fontWeight: 600,
      color: "#666",
      marginTop: 2,
      marginBottom: 6
    }}
  >
    AREA: {row.area}
  </div>
)}

        {/* ITEM + SIZE */}
        <div
          style={{
            fontSize: 15,
            marginTop: 3,
            color: "#444"
          }}
        >
          {row.item} — {row.size}
        </div>

        {/* QTY */}
        <div
          style={{
            fontSize: 15,
            marginTop: 4,
            color: "#333"
          }}
        >
          QTY: {row.qty?.toLocaleString()}
        </div>
      </div>
    ))}
  </div>
)}
      {/* MOVE TO SECTION */}
      <div style={{ marginTop: 20, textAlign: "center" }}>
        <h3 style={{ marginBottom: 12 }}>TO</h3>

        <div
          style={{
            display: "flex",
            gap: 24,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          {["GWS", "W3", "W4"].map((area) => {
            const disabled = previewRows.length === 0;

            return (
              <img
                key={area}
                src={iconMap[area]}
                alt={area}
                style={{
                  width: 80,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.3 : 1,
                  transition: "0.2s"
                }}
                onClick={() => {
                  if (!disabled) handleMove(area);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}