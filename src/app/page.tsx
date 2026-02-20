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

  const itemRef = useRef<HTMLSelectElement>(null);
  const diamRef = useRef<HTMLSelectElement>(null);
  const lengthRef = useRef<HTMLSelectElement>(null);
  const catRef = useRef<HTMLSelectElement>(null);

  const allowedAreas = ["GWS", "W3", "W4"];

  // Load categories
  useEffect(() => {
    fetch("/api/categories")
      .then(res => res.json())
      .then(data => setCategories(data.categories || []));
  }, []);

  // When category changes
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

  // When item changes
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

        const sorted = list.sort((a, b) => Number(a) - Number(b));
	setDiameters(sorted);

        if (list.length === 1) {
          setDiam(list[0]);
          setTimeout(() => diamRef.current?.focus(), 100);
        }
      });
  }, [item]);

  // When diameter changes
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

      // 🔥 If no lengths exist, skip length step
      if (list.length === 0) {
        fetch(
          `/api/search?cat=${cat}&item=${item}&diam=${diam}`
        )
          .then(res => res.json())
          .then(data => setRows(data.rows || []));
        return;
      }

      setLengths(list.sort((a, b) => Number(a) - Number(b)));

      if (list.length === 1) {
        setLength(list[0]);
        setTimeout(() => lengthRef.current?.focus(), 100);
      }
    });
}, [diam]);


  // When length changes → fetch results
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

  const filteredRows = rows.filter(
    row => allowedAreas.includes(row.area)
  );

  const grouped = filteredRows.reduce((acc: any, row) => {
    if (!acc[row.area]) acc[row.area] = [];
    acc[row.area].push(row);
    return acc;
  }, {});

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

  return (
    <div style={{ padding: 40, maxWidth: 700, margin: "0 auto" }}>
      
      {/* LOGO */}
      <div style={{ textAlign: "center", marginBottom: 25 }}>
        <img src="/logo.png" height={70} />
      </div>

      {/* DROPDOWNS */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        <select
          ref={catRef}
          value={cat}
          onChange={e => setCat(e.target.value)}
        >
          <option value="">Select Category</option>
          {categories.map(c => (
            <option key={c}>{c}</option>
          ))}
        </select>

        <select
          ref={itemRef}
          value={item}
          onChange={e => setItem(e.target.value)}
        >
          <option value="">Select Item</option>
          {items.map(i => {
  const isHDG = i.toUpperCase().includes("HDG");
  const isZP = i.toUpperCase().includes("ZP");

  let marker = "";

  if (isHDG) marker = " 🔘 ";
  if (isZP) marker = " 🔵 ";

  return (
    <option key={i} value={i}>
      {i}{marker}
    </option>
  );
})}


        </select>

        <select
          ref={diamRef}
          value={diam}
          onChange={e => setDiam(e.target.value)}
        >
          <option value="">Select Diameter</option>
          {diameters.map(d => (
            <option key={d}>{d}</option>
          ))}
        </select>

        <select
          ref={lengthRef}
          value={length}
          onChange={e => setLength(e.target.value)}
        >
          <option value="">Select Length</option>
          {lengths.map(l => (
            <option key={l}>{l}</option>
          ))}
        </select>

        <button
          onClick={resetAll}
          style={{
            marginTop: 10,
            padding: "8px 12px",
            backgroundColor: "#eee",
            border: "1px solid #ccc",
            cursor: "pointer"
          }}
        >
          Reset
        </button>
      </div>

      {/* TITLE */}
      {item && diam && length && (
        <div style={{ marginTop: 30, marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>
            {item} – {diam} X {length}
          </h2>
        </div>
      )}

      {/* RESULTS */}
      <div>
        {["GWS", "W3", "W4"]
          .filter(area => grouped[area])
          .map(area => (
            <div key={area} style={{ marginBottom: 35 }}>
              <div style={{ marginBottom: 10 }}>
                <img src={areaIcon(area)} width={50} />
              </div>

              {grouped[area]
                .sort((a: Row, b: Row) =>
                  a.location.localeCompare(b.location)
                )
                .map(row => (
                  <div
                    key={row.id}
                    style={{
                      padding: "6px 0",
                      fontSize: 16
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