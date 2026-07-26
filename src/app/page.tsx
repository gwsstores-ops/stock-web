"use client";

import { useEffect, useState, useRef } from "react";
import AppHeader from "@/components/AppHeader";
import SearchResults, {
  type SearchResultRow
} from "@/components/SearchResults";

export default function Page() {
  const [cat, setCat] = useState("");
  const [item, setItem] = useState("");
  const [diam, setDiam] = useState("");
  const [length, setLength] = useState("");

  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [diameters, setDiameters] = useState<string[]>([]);
  const [lengths, setLengths] = useState<string[]>([]);
  const [rows, setRows] = useState<SearchResultRow[]>([]);

  const [locationCounts, setLocationCounts] = useState({
    W3: 0,
    W4: 0
  });

  const itemRef = useRef<HTMLSelectElement>(null);
  const diamRef = useRef<HTMLSelectElement>(null);
  const lengthRef = useRef<HTMLSelectElement>(null);
  const catRef = useRef<HTMLSelectElement>(null);

  // LOAD COUNTS
  useEffect(() => {
    fetch("/api/location-counts")
      .then(res => res.json())
      .then(data =>
        setLocationCounts({
          W3: data.W3 || 0,
          W4: data.W4 || 0
        })
      );
  }, []);

  // LOAD CATEGORIES
  useEffect(() => {
    fetch("/api/categories")
      .then(res => res.json())
      .then(data => setCategories(data.categories || []));
  }, []);

  // CATEGORY CHANGED
  useEffect(() => {
    if (!cat) return;

    fetch(`/api/items?cat=${encodeURIComponent(cat)}`)
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

  // ITEM CHANGED
  useEffect(() => {
    if (!item) return;

    fetch(
      `/api/diameters?cat=${encodeURIComponent(cat)}&item=${encodeURIComponent(item)}`
    )
      .then(res => res.json())
      .then(data => {
        const list = (data.diameters || []).map(
          (d: { diam_display: string }) => d.diam_display
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
  }, [cat, item]);

  // DIAM CHANGED
  useEffect(() => {
    if (!diam) return;

    fetch(
      `/api/lengths?cat=${encodeURIComponent(cat)}&item=${encodeURIComponent(item)}&diam=${encodeURIComponent(diam)}`
    )
      .then(res => res.json())
      .then(data => {
        const list = (data.lengths || []).map(
          (l: { length_display: string }) => l.length_display
        );

        if (list.length === 0) {
          fetch(
            `/api/search?cat=${encodeURIComponent(cat)}&item=${encodeURIComponent(item)}&diam=${encodeURIComponent(diam)}`
          )
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
  }, [cat, item, diam]);

  // LENGTH CHANGED
  useEffect(() => {
    if (!length) return;

    fetch(
      `/api/search?cat=${encodeURIComponent(cat)}&item=${encodeURIComponent(item)}&diam=${encodeURIComponent(diam)}&length=${encodeURIComponent(length)}`
    )
      .then(res => res.json())
      .then(data => setRows(data.rows || []));
  }, [cat, item, diam, length]);

  const handleCategoryChange = (value: string) => {
    setCat(value);
    setItem("");
    setDiam("");
    setLength("");
    setItems([]);
    setDiameters([]);
    setLengths([]);
    setRows([]);
  };

  const handleItemChange = (value: string) => {
    setItem(value);
    setDiam("");
    setLength("");
    setDiameters([]);
    setLengths([]);
    setRows([]);
  };

  const handleDiameterChange = (value: string) => {
    setDiam(value);
    setLength("");
    setLengths([]);
    setRows([]);
  };

  const handleLengthChange = (value: string) => {
    setLength(value);
    setRows([]);
  };

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
    <main className="page-shell">
      <AppHeader title="Stock Search">
        <div className="header-stats">
          <div className="stat-card">
            <span className="stat-dot stat-dot-w3" />
            <div>
              <div className="stat-label">W3 pallets</div>
              <div className="stat-value">{locationCounts.W3}</div>
            </div>
          </div>

          <div className="stat-card">
            <span className="stat-dot stat-dot-w4" />
            <div>
              <div className="stat-label">W4 pallets</div>
              <div className="stat-value">{locationCounts.W4}</div>
            </div>
          </div>
        </div>
      </AppHeader>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Search filters</p>
            <h2>Choose an item</h2>
          </div>
        </div>

        <div className="form-stack form-grid">
          <label className="field">
            <span className="field-label">Category</span>
            <select
              ref={catRef}
              value={cat}
              onChange={e => handleCategoryChange(e.target.value)}
              className="control"
            >
              <option value="">Select category</option>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Item</span>
            <select
              ref={itemRef}
              value={item}
              onChange={e => handleItemChange(e.target.value)}
              className="control"
              disabled={!cat}
            >
              <option value="">Select item</option>
              {items.map(i => <option key={i}>{i}</option>)}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Diameter</span>
            <select
              ref={diamRef}
              value={diam}
              onChange={e => handleDiameterChange(e.target.value)}
              className="control"
              disabled={!item}
            >
              <option value="">Select diameter</option>
              {diameters.map(d => <option key={d}>{d}</option>)}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Length</span>
            <select
              ref={lengthRef}
              value={length}
              onChange={e => handleLengthChange(e.target.value)}
              className="control"
              disabled={!diam || lengths.length === 0}
            >
              <option value="">Select length</option>
              {lengths.map(l => <option key={l}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="button-row">
          <button onClick={resetAll} className="button button-secondary">
            Reset search
          </button>
        </div>
      </section>

      <SearchResults rows={rows} />
    </main>
  );
}
