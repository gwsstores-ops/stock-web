"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [diameters, setDiameters] = useState<any[]>([]);
  const [lengths, setLengths] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);

  const [cat, setCat] = useState("");
  const [item, setItem] = useState("");
  const [diam, setDiam] = useState("");
  const [length, setLength] = useState("");

  // Load categories on mount
  useEffect(() => {
    fetch("/api/categories")
      .then(res => res.json())
      .then(data => setCategories(data.categories || []));
  }, []);

  // When CAT changes
  useEffect(() => {
    if (!cat) return;

    setItem("");
    setDiam("");
    setLength("");
    setItems([]);
    setDiameters([]);
    setLengths([]);
    setRows([]);

    fetch(`/api/items?cat=${encodeURIComponent(cat)}`)
      .then(res => res.json())
      .then(data => {
        setItems(data.items || []);
        if (data.items?.length === 1) {
          setItem(data.items[0]);
        }
      });
  }, [cat]);

  // When ITEM changes
  useEffect(() => {
    if (!item) return;

    setDiam("");
    setLength("");
    setDiameters([]);
    setLengths([]);
    setRows([]);

    fetch(
      `/api/diameters?cat=${encodeURIComponent(cat)}&item=${encodeURIComponent(item)}`
    )
      .then(res => res.json())
      .then(data => {
        setDiameters(data.diameters || []);
        if (data.diameters?.length === 1) {
          setDiam(String(data.diameters[0].diam_value));
        }
      });
  }, [item]);

  // When DIAM changes
  useEffect(() => {
    if (!diam) return;

    setLength("");
    setLengths([]);
    setRows([]);

    fetch(
      `/api/lengths?cat=${encodeURIComponent(cat)}&item=${encodeURIComponent(item)}&diam_value=${diam}`
    )
      .then(res => res.json())
      .then(data => {
        setLengths(data.lengths || []);
        if (data.lengths?.length === 1) {
          setLength(String(data.lengths[0].length_value));
        }
      });
  }, [diam]);

  // When LENGTH changes
  useEffect(() => {
    if (!length) return;

    fetch(
      `/api/stock?cat=${encodeURIComponent(cat)}&item=${encodeURIComponent(
        item
      )}&diam_value=${diam}&length_value=${length}`
    )
      .then(res => res.json())
      .then(data => setRows(data.rows || []));
  }, [length]);

  return (
    <div style={{ padding: 40 }}>
      <h2>Stock Search</h2>

      {/* Dropdowns */}
      <div style={{ display: "flex", gap: 20, marginBottom: 40 }}>
        <select value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">Select Category</option>
          {categories.map(c => (
            <option key={c}>{c}</option>
          ))}
        </select>

        <select
          value={item}
          onChange={e => setItem(e.target.value)}
          disabled={!items.length}
        >
          <option value="">Select Item</option>
          {items.map(i => (
            <option key={i}>{i}</option>
          ))}
        </select>

        <select
          value={diam}
          onChange={e => setDiam(e.target.value)}
          disabled={!diameters.length}
        >
          <option value="">Select Diameter</option>
          {diameters.map(d => (
            <option key={d.diam_value} value={d.diam_value}>
              {d.diam_display}
            </option>
          ))}
        </select>

        <select
          value={length}
          onChange={e => setLength(e.target.value)}
          disabled={!lengths.length}
        >
          <option value="">Select Length</option>
          {lengths.map(l => (
            <option key={l.length_value} value={l.length_value}>
              {l.length_display}
            </option>
          ))}
        </select>
      </div>

      {/* Results */}
      {rows.length > 0 && (
        <div>

          {/* Title */}
          <div
            style={{
              fontSize: 26,
              fontWeight: "bold",
              marginBottom: 40
            }}
          >
            {rows[0].item} - {rows[0].size}
          </div>

          {Object.entries(
            rows.reduce((acc: any, row: any) => {
              if (!acc[row.area]) acc[row.area] = [];
              acc[row.area].push(row);
              return acc;
            }, {})
          ).map(([area, areaRows]: any) => (
            <div key={area} style={{ marginBottom: 50 }}>

              {/* Area Label */}
              <div
                style={{
                  fontSize: 18,
                  fontWeight: "bold",
                  marginBottom: 20
                }}
              >
                {area}
              </div>

              {areaRows.map((r: any) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    paddingBottom: 25,
                    borderBottom: "1px solid #ddd",
                    marginBottom: 25
                  }}
                >
                  {/* ICON PLACEHOLDER */}
                  <div
                    style={{
                      width: 90,
                      height: 90,
                      background: "#eee",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                      marginBottom: 15
                    }}
                  >
                    {area}
                  </div>

                  {/* Location + Qty */}
                  <div style={{ fontSize: 16 }}>
                    {r.location} → QTY: {r.qty.toLocaleString()}
                  </div>
                </div>
              ))}

            </div>
          ))}

        </div>
      )}
    </div>
  );
}
