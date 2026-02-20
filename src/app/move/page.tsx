"use client";

import { useState } from "react";

type Row = {
  id: number;
  location: string;
  item: string;
  size: string;
  qty: number;
};

export default function Page() {
  const [location, setLocation] = useState("");
  const [previewRows, setPreviewRows] = useState<Row[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handlePreview = async (loc?: string) => {
    const target = loc || location;
    if (!target) return;

    const res = await fetch(`/api/preview?location=${target}`);
    const data = await res.json();
    setPreviewRows(data.rows || []);
  };

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

    await handlePreview(location);
    setLoading(false);
  };

  const handleLocationChange = async (value: string) => {
    const upper = value.toUpperCase();
    setLocation(upper);

    if (upper.length >= 2) {
      const res = await fetch(`/api/preview?location=${upper}`);
      const data = await res.json();

      const uniqueLocations = [
        ...new Set((data.rows || []).map((r: Row) => r.location))
      ];

      setSuggestions(uniqueLocations);
    } else {
      setSuggestions([]);
    }
  };

  const iconMap: Record<string, string> = {
    GWS: "/gws.png",
    W3: "/w3.png",
    W4: "/w4.png"
  };

  return (
    <div style={{ padding: 40, maxWidth: 700, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 20 }}>Move Location</h2>

      {/* LOCATION INPUT + AUTOCOMPLETE */}
      <div style={{ position: "relative", marginBottom: 40 }}>
        <input
          type="text"
          placeholder="Enter Location (e.g. 3A98)"
          value={location}
          onChange={(e) => handleLocationChange(e.target.value)}
          style={{
            padding: 10,
            width: "100%",
            fontSize: 16
          }}
        />

        {suggestions.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: 45,
              left: 0,
              right: 0,
              background: "white",
              border: "1px solid #ccc",
              zIndex: 10
            }}
          >
            {suggestions.map((s) => (
              <div
                key={s}
                style={{
                  padding: 8,
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
  <div style={{ marginBottom: 40 }}>
    {previewRows.map((row) => (
      <div key={row.id}>
        {row.location} ➡ ➡  {row.item} {row.size}➡➡ QTY:{" "}
        {row.qty?.toLocaleString()}
      </div>
    ))}
  </div>
)}


      {/* MOVE TO SECTION */}
      <div style={{ marginTop: 30, textAlign: "center" }}>
        <h3 style={{ marginBottom: 15 }}>Move To</h3>

        <div
          style={{
            display: "flex",
            gap: 30,
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
                  width: 90,
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
