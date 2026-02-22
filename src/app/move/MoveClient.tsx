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

  const handlePreview = async (loc?: string) => {
    const target = loc || location;
    if (!target) return;

    const res = await fetch(`/api/preview?location=${target}`);
    const data = await res.json();
    setPreviewRows(data.rows || []);
  };

  useEffect(() => {
    const scannedLocation = searchParams.get("location");

    if (scannedLocation) {
      const upper = scannedLocation.toUpperCase();
      setLocation(upper);
      handlePreview(upper);
    }
  }, [searchParams]);

  return (
    <div style={{ padding: 40 }}>
      <h2>Move Location</h2>
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value.toUpperCase())}
        placeholder="Enter Location"
      />
      <button onClick={() => handlePreview()}>
        Preview
      </button>

      {previewRows.map((row) => (
        <div key={row.id}>
          {row.location} — {row.item} {row.size} — QTY {row.qty}
        </div>
      ))}
    </div>
  );
}