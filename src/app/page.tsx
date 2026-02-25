"use client";

import { useEffect, useState, useRef } from "react";

type Row = {
  id: number;
  location: string;
  area: string;
  item: string;
  size: string;
  qty: number | null;
};

export default function Page() {
  const [cat, setCat] = useState("");
  const [item, setItem] = useState("");
  const [diam, setDiam] = useState("");
  const [length, setLength] = useState("");

  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [diameters, setDiameters] = useState<string[]>([]);
  const [lengths, setLengths] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);

  const [locationCounts, setLocationCounts] = useState({
    W3: 0,
    W4: 0
  });

  const itemRef = useRef<HTMLSelectElement>(null);
  const diamRef = useRef<HTMLSelectElement>(null);
  const lengthRef = useRef<HTMLSelectElement>(null);
  const catRef = useRef<HTMLSelectElement>(null);

  const allowedAreas = ["GWS", "W3", "W4"];

  const selectStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 16,
    borderRadius: 6,
    border: "1px solid #ccc",
    background: "#fff"
  };

  // ---------- LOAD COUNTS ----------
  useEffect(() => {
    fetch("/api/location-counts")
      .then(res => res.json())
      .then(data => {
        setLocationCounts({
          W3: data.W3 || 0,
          W4: data.W4 || 0
        });
      });
  }, []);

  // ---------- LOAD CATEGORIES ----------
  useEffect(() => {
    fetch("/api/categories")
      .then(res => res.json())
      .then(data => setCategories(data.categories || []));
  }, []);

  // ---------- CATEGORY CHANGED ----------
  useEffect(() => {
    if (!cat) return;

    setItem("");
    setDiam("");
    setLength("");
    setRows([]);

    fetch(`/api/items?cat=${cat}`)
      .then(res => res.json())
      .then(data => {
        const list = data.items || [];
        setItems(list);

        if (list.length === 1) {
          setItem(list[0]);
          setTimeout(() => itemRef.current?.focus(), 100);
        }
      });
  }, [cat]);

  // ---------- ITEM CHANGED ----------
  useEffect(() => {
    if (!item) return;

    setDiam("");
    setLength("");
    setRows([]);

    fetch(`/api/diameters?cat=${cat}&item=${item}`)
      .then(res => res.json())
      .then(data => {
        const list = (data.diameters || []).map(
          (d: any) => d.diam_display
        );

        const sorted = list.sort(
          (a: string, b: string) => Number(a) - Number(b)
        );

        setDiameters(sorted);

        if (sorted.length === 1) {
          setDiam(sorted[0]);
          setTimeout(() => diamRef.current?.focus(), 100);
        }
      });
  }, [item]);

  // ---------- DIAM CHANGED ----------
  useEffect(() => {
    if (!diam) return;

    setLength("");
    setRows([]);

    fetch(`/api/lengths?cat=${cat}&item=${item}&diam=${diam}`)
      .then(res => res.json())
      .then(data => {
        const list = (data.lengths || []).map(
          (l: any) => l.length_display
        );

        if (list.length === 0) {
          fetch(`/api/search?cat=${cat}&item=${item}&diam=${diam}`)
            .then(res => res.json())
            .then(data => setRows(data.rows || []));
          return;
        }

        const sorted = list.sort(
          (a: string, b: string) => Number(a) - Number(b)
        );

        setLengths(sorted);

        if (sorted.length === 1) {
          setLength(sorted[0]);
          setTimeout(() => lengthRef.current?.focus(), 100);
        }
      });
  }, [diam]);

  // ---------- LENGTH CHANGED ----------
  useEffect(() => {
    if (!length) return;

    fetch(
      `/api/search?cat=${cat}&item=${item}&diam=${diam}&length=${length}`
    )
      .then(res => res.json())
      .then(data => setRows(data.rows || []));
  }, [length]);

  const areaIcon = (area: string) => {
    if (area === "GWS") return "/gws.png";
    if (area === "W3") return "/w3.png";
    if (area === "W4") return "/w4.png";
    return "";
  };

  const filteredRows = rows.filter(row =>
    allowedAreas.includes(row.area)
  );

  const grouped = filteredRows.reduce<Record<string, Row[]>>(
    (acc, row) => {
      if (!acc[row.area]) acc[row.area] = [];
      acc[row.area].push(row);
      return acc;
    },
    {}
  );

  const resetAll = () => {
    setCat("");
    setItem("");
    setDiam("");
    setLength("");
    setItems([]);
    setDiameters([]);
    setLengths([]);
    setRows([]);
    setTimeout(() => catRef.current?.focus(), 100);
  };

  const getItemStyle = (item: string): React.CSSProperties => {
    if (item.toUpperCase().includes("HDG")) {
      return { color: "#777" };
    }
    return {};
  };

  return (
    <div
      style={{
        padding: "18px 14px 24px",
        maxWidth: 700,
        margin: "0 auto"
      }}
    >
      {/* HEADER WITH COUNTS */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20
        }}
      >
        <div style={{ textAlign: "center", minWidth: 100 }}>
          <div style={{ fontSize: 18, color: "#777" }}>W3 PALLETS</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {locationCounts.W3}
          </div>
        </div>

        <img src="/logo.png" height={60} />

        <div style={{ textAlign: "center", minWidth: 100 }}>
          <div style={{ fontSize: 18, color: "#777" }}>W4 PALLETS </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {locationCounts.W4}
          </div>
        </div>
      </div>

      {/* DROPDOWNS */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <select
          ref={catRef}
          value={cat}
          onChange={e => setCat(e.target.value)}
          style={selectStyle}
        >
          <option value="">CAT</option>
          {categories.map(c => (
            <option key={c}>{c}</option>
          ))}
        </select>

        <select
          ref={itemRef}
          value={item}
          onChange={e => setItem(e.target.value)}
          style={selectStyle}
        >
          <option value="">ITEM</option>
          {items.map(i => (
            <option key={i}>{i}</option>
          ))}
        </select>

        <select
          ref={diamRef}
          value={diam}
          onChange={e => setDiam(e.target.value)}
          style={selectStyle}
        >
          <option value="">DIAMETER</option>
          {diameters.map(d => (
            <option key={d}>{d}</option>
          ))}
        </select>

        <select
          ref={lengthRef}
          value={length}
          onChange={e => setLength(e.target.value)}
          style={selectStyle}
        >
          <option value="">LENGTH</option>
          {lengths.map(l => (
            <option key={l}>{l}</option>
          ))}
        </select>

        <button
          onClick={resetAll}
          style={{
            marginTop: 8,
            padding: "10px 14px",
            backgroundColor: "#eee",
            border: "1px solid #ccc",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 15
          }}
        >
          Reset
        </button>
      </div>

      {/* TITLE */}
      {rows.length > 0 && (
        <div style={{ marginTop: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 20 }}>
            <span
              style={{
                fontWeight: 700,
                ...getItemStyle(rows[0].item)
              }}
            >
              {rows[0].item}
            </span>

            <span style={{ marginLeft: 18, color: "#555" }}>
              {rows[0].size}
            </span>
          </div>
        </div>
      )}

      {/* RESULTS */}
      <div>
        {["GWS", "W3", "W4"]
          .filter(area => grouped[area])
          .map(area => (
            <div key={area} style={{ marginBottom: 28 }}>
              <div style={{ marginBottom: 8 }}>
                <img src={areaIcon(area)} width={45} />
              </div>

              {grouped[area]
                .sort((a, b) =>
                  a.location.localeCompare(b.location)
                )
                .map(row => (
                  <div
                    key={row.id}
                    style={{
                      padding: "4px 0",
                      fontSize: 15
                    }}
                  >
                    {row.location} → QTY:{" "}
                    <strong>
                      {(row.qty ?? 0).toLocaleString()}
                    </strong>
                  </div>
                ))}
            </div>
        ))}
      </div>
    </div>
  );
}