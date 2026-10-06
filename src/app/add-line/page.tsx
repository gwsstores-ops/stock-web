"use client";

import { useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { areaLabel } from "@/lib/areas";

type FilterOption = {
  value: string;
  label: string;
};

const AREAS = ["GWS", "W3", "W4"];

export default function AddLinePage() {
  const [area, setArea] = useState("");
  const [location, setLocation] = useState("");
  const [bayOptions, setBayOptions] = useState<string[]>([]);
  const [palletId, setPalletId] = useState("");

  const [cat, setCat] = useState("");
  const [item, setItem] = useState("");
  const [diam, setDiam] = useState("");
  const [length, setLength] = useState("");
  const [size, setSize] = useState("");

  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [diameters, setDiameters] = useState<FilterOption[]>([]);
  const [lengths, setLengths] = useState<FilterOption[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [hasLength, setHasLength] = useState(true);

  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const bayRequestRef = useRef(0);

  // LOAD CATEGORIES
  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data.categories || []));
  }, []);

  // CATEGORY CHANGED
  useEffect(() => {
    if (!cat) return;

    fetch(`/api/items?cat=${encodeURIComponent(cat)}`)
      .then((res) => res.json())
      .then((data) => setItems(data.items || []));
  }, [cat]);

  // ITEM CHANGED
  useEffect(() => {
    if (!item) return;

    fetch(`/api/diameters?cat=${encodeURIComponent(cat)}&item=${encodeURIComponent(item)}`)
      .then((res) => res.json())
      .then((data) => {
        const sorted = (data.diameters || []).sort(
          (a: FilterOption, b: FilterOption) => Number(a.value) - Number(b.value)
        );
        setDiameters(sorted);
        if (sorted.length === 1) setDiam(sorted[0].value);
      });
  }, [cat, item]);

  // DIAM CHANGED
  useEffect(() => {
    if (!diam) return;

    fetch(
      `/api/lengths?cat=${encodeURIComponent(cat)}&item=${encodeURIComponent(item)}&diam=${encodeURIComponent(diam)}`
    )
      .then((res) => res.json())
      .then((data) => {
        const list: FilterOption[] = data.lengths || [];

        if (list.length === 0) {
          setHasLength(false);
          setLengths([]);
          setLength("");
          return;
        }

        setHasLength(true);
        const sorted = list.sort((a, b) => Number(a.value) - Number(b.value));
        setLengths(sorted);
        if (sorted.length === 1) setLength(sorted[0].value);
      });
  }, [cat, item, diam]);

  // DIAM (no length) OR LENGTH CHANGED -> resolve the matching size(s)
  useEffect(() => {
    if (!diam) return;
    if (hasLength && !length) return;

    const params = new URLSearchParams({ cat, item, diam });
    if (hasLength) params.set("length", length);

    fetch(`/api/search?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        const distinctSizes = [
          ...new Set((data.rows || []).map((row: { size: string }) => row.size))
        ] as string[];
        setSizes(distinctSizes);
        setSize(distinctSizes.length === 1 ? distinctSizes[0] : "");
      });
  }, [cat, item, diam, length, hasLength]);

  const handleCategoryChange = (value: string) => {
    setCat(value);
    setItem("");
    setDiam("");
    setLength("");
    setSize("");
    setItems([]);
    setDiameters([]);
    setLengths([]);
    setSizes([]);
  };

  const handleItemChange = (value: string) => {
    setItem(value);
    setDiam("");
    setLength("");
    setSize("");
    setDiameters([]);
    setLengths([]);
    setSizes([]);
  };

  const handleDiamChange = (value: string) => {
    setDiam(value);
    setLength("");
    setSize("");
    setLengths([]);
    setSizes([]);
  };

  const handleLengthChange = (value: string) => {
    setLength(value);
    setSize("");
    setSizes([]);
  };

  const handleLocationChange = async (value: string) => {
    const upper = value.toUpperCase();
    setLocation(upper);

    const requestId = ++bayRequestRef.current;
    if (!area || upper.trim().length < 1) {
      setBayOptions([]);
      return;
    }

    try {
      const res = await fetch(
        `/api/bays?area=${encodeURIComponent(area)}&q=${encodeURIComponent(upper.trim())}`
      );
      const data = await res.json();
      if (requestId !== bayRequestRef.current) return;
      setBayOptions(res.ok ? data.labels || [] : []);
    } catch {
      if (requestId === bayRequestRef.current) setBayOptions([]);
    }
  };

  const selectedDiam = diameters.find((d) => d.value === diam);
  const selectedLength = lengths.find((l) => l.value === length);

  const canSubmit =
    area &&
    location.trim() &&
    cat &&
    item &&
    diam &&
    size &&
    (!hasLength || length) &&
    qty.trim() !== "" &&
    Number(qty) >= 0 &&
    !submitting;

  const resetProduct = () => {
    setCat("");
    setItem("");
    setDiam("");
    setLength("");
    setSize("");
    setItems([]);
    setDiameters([]);
    setLengths([]);
    setSizes([]);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/add-stock-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area,
          location: location.trim(),
          palletId: palletId.trim(),
          cat,
          item,
          size,
          diamValue: Number(diam),
          diamDisplay: selectedDiam?.label ?? diam,
          lengthValue: hasLength ? Number(length) : null,
          lengthDisplay: hasLength ? (selectedLength?.label ?? length) : null,
          qty: Number(qty),
          note: note.trim(),
          code: code.trim()
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Add line failed");

      setSuccess(`Added ${Number(qty).toLocaleString()} × ${item} (${size}) at ${location.trim()}`);
      setQty("");
      setNote("");
      setCode("");
      setPalletId("");
      setLocation("");
      setBayOptions([]);
      resetProduct();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add line failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-shell">
      <AppHeader title="Add Line" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 1</p>
            <h2>Where is it going?</h2>
          </div>
        </div>

        <div className="form-stack form-grid">
          <label className="field">
            <span className="field-label">Area</span>
            <select
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setLocation("");
                setBayOptions([]);
              }}
              className="control"
            >
              <option value="">Select area</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {areaLabel(a)}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span className="field-label">Location</span>
            <div className="autocomplete">
              <input
                type="text"
                value={location}
                onChange={(e) => handleLocationChange(e.target.value)}
                className="control"
                placeholder="Bay label"
                autoComplete="off"
                disabled={!area}
              />
              {bayOptions.length > 0 && (
                <div className="suggestions" role="listbox">
                  {bayOptions.map((label) => (
                    <button
                      type="button"
                      key={label}
                      className="suggestion"
                      onClick={() => {
                        bayRequestRef.current++;
                        setLocation(label);
                        setBayOptions([]);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="field">
            <span className="field-label">Pallet ID (optional)</span>
            <input
              type="text"
              value={palletId}
              onChange={(e) => setPalletId(e.target.value.toUpperCase())}
              className="control"
              placeholder="Defaults to the location"
              autoComplete="off"
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 2</p>
            <h2>What is it?</h2>
          </div>
        </div>

        <div className="form-stack form-grid">
          <label className="field">
            <span className="field-label">Category</span>
            <select value={cat} onChange={(e) => handleCategoryChange(e.target.value)} className="control">
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Item</span>
            <select
              value={item}
              onChange={(e) => handleItemChange(e.target.value)}
              className="control"
              disabled={!cat}
            >
              <option value="">Select item</option>
              {items.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Diameter</span>
            <select
              value={diam}
              onChange={(e) => handleDiamChange(e.target.value)}
              className="control"
              disabled={!item}
            >
              <option value="">Select diameter</option>
              {diameters.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          {hasLength && (
            <label className="field">
              <span className="field-label">Length</span>
              <select
                value={length}
                onChange={(e) => handleLengthChange(e.target.value)}
                className="control"
                disabled={!diam || lengths.length === 0}
              >
                <option value="">Select length</option>
                {lengths.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {sizes.length > 1 && (
            <label className="field">
              <span className="field-label">Size</span>
              <select value={size} onChange={(e) => setSize(e.target.value)} className="control">
                <option value="">Select size</option>
                {sizes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}

          {diam && (hasLength ? length : true) && sizes.length === 0 && (
            <p className="search-error">
              No existing catalog entry matches that selection. Import it as a new product first.
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 3</p>
            <h2>How much?</h2>
          </div>
        </div>

        <div className="form-stack form-grid">
          <label className="field">
            <span className="field-label">Quantity</span>
            <input
              type="number"
              min={0}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="control"
            />
          </label>

          <label className="field">
            <span className="field-label">Note (optional)</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="control" />
          </label>

          <label className="field">
            <span className="field-label">Code (optional)</span>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} className="control" />
          </label>
        </div>

        {error && <p className="search-error">{error}</p>}
        {success && <p style={{ color: "#15803d", fontWeight: 600 }}>{success}</p>}

        <button
          type="button"
          className="button button-primary button-block"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? "Adding…" : "Add line"}
        </button>
      </section>
    </main>
  );
}
