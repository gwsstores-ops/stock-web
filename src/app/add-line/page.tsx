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
  const [diamText, setDiamText] = useState("");
  const [lengthText, setLengthText] = useState("");
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

  // A typed value that exactly matches an existing option reuses that option's
  // underlying numeric value, so retyping an existing diameter/length can never
  // create a near-duplicate product. Anything else is a genuinely new value.
  const matchedDiam = diameters.find(
    (d) => d.label.trim().toLowerCase() === diamText.trim().toLowerCase()
  );
  const matchedLength = lengths.find(
    (l) => l.label.trim().toLowerCase() === lengthText.trim().toLowerCase()
  );

  const parseLeadingNumber = (text: string): number | null => {
    const match = text.trim().match(/^-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : null;
  };

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
        if (sorted.length === 1) setDiamText(sorted[0].label);
      });
  }, [cat, item]);

  // DIAM CHANGED (only meaningful once it matches an existing diameter - a brand
  // new diameter has nothing to look lengths up against, so Length is left as a
  // plain optional free-text field in that case)
  useEffect(() => {
    const matched = diameters.find(
      (d) => d.label.trim().toLowerCase() === diamText.trim().toLowerCase()
    );
    if (!matched) {
      setHasLength(true);
      setLengths([]);
      return;
    }

    fetch(
      `/api/lengths?cat=${encodeURIComponent(cat)}&item=${encodeURIComponent(item)}&diam=${encodeURIComponent(matched.value)}`
    )
      .then((res) => res.json())
      .then((data) => {
        const list: FilterOption[] = data.lengths || [];

        if (list.length === 0) {
          setHasLength(false);
          setLengths([]);
          setLengthText("");
          return;
        }

        setHasLength(true);
        const sorted = list.sort((a, b) => Number(a.value) - Number(b.value));
        setLengths(sorted);
        if (sorted.length === 1) setLengthText(sorted[0].label);
      });
  }, [cat, item, diamText, diameters]);

  // DIAM (no length) OR LENGTH CHANGED -> resolve the matching size(s).
  // Only possible when diameter (and length, if this item has one) match an
  // existing catalog entry - a brand new diameter/length has no sizes to look up,
  // so Size is left as a plain free-text field (typing one there creates a new product).
  useEffect(() => {
    const matched = diameters.find(
      (d) => d.label.trim().toLowerCase() === diamText.trim().toLowerCase()
    );
    if (!matched) {
      setSizes([]);
      return;
    }

    const matchedLen = lengths.find(
      (l) => l.label.trim().toLowerCase() === lengthText.trim().toLowerCase()
    );
    if (hasLength && !matchedLen) {
      setSizes([]);
      return;
    }

    const params = new URLSearchParams({ cat, item, diam: matched.value });
    if (hasLength && matchedLen) params.set("length", matchedLen.value);

    fetch(`/api/search?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        const distinctSizes = [
          ...new Set((data.rows || []).map((row: { size: string }) => row.size))
        ] as string[];
        setSizes(distinctSizes);
        setSize(distinctSizes.length === 1 ? distinctSizes[0] : "");
      });
  }, [cat, item, diamText, lengthText, diameters, lengths, hasLength]);

  const handleCategoryChange = (value: string) => {
    setCat(value);
    setItem("");
    setDiamText("");
    setLengthText("");
    setSize("");
    setItems([]);
    setDiameters([]);
    setLengths([]);
    setSizes([]);
  };

  const handleItemChange = (value: string) => {
    setItem(value);
    setDiamText("");
    setLengthText("");
    setSize("");
    setDiameters([]);
    setLengths([]);
    setSizes([]);
  };

  const handleDiamTextChange = (value: string) => {
    setDiamText(value);
    setLengthText("");
    setSize("");
    setLengths([]);
    setSizes([]);
  };

  const handleLengthTextChange = (value: string) => {
    setLengthText(value);
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

  const canSubmit =
    area &&
    location.trim() &&
    cat &&
    item &&
    diamText.trim() &&
    size.trim() &&
    (!hasLength || lengthText.trim()) &&
    qty.trim() !== "" &&
    Number(qty) >= 0 &&
    !submitting;

  const resetProduct = () => {
    setCat("");
    setItem("");
    setDiamText("");
    setLengthText("");
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
          size: size.trim(),
          diamValue: matchedDiam ? Number(matchedDiam.value) : parseLeadingNumber(diamText),
          diamDisplay: matchedDiam ? matchedDiam.label : diamText.trim(),
          lengthValue: lengthText.trim()
            ? matchedLength
              ? Number(matchedLength.value)
              : parseLeadingNumber(lengthText)
            : null,
          lengthDisplay: lengthText.trim() ? (matchedLength ? matchedLength.label : lengthText.trim()) : null,
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
            <input
              type="text"
              list="diameter-options"
              value={diamText}
              onChange={(e) => handleDiamTextChange(e.target.value)}
              className="control"
              placeholder="Select or type a new diameter"
              autoComplete="off"
              disabled={!item}
            />
            <datalist id="diameter-options">
              {diameters.map((d) => (
                <option key={d.value} value={d.label} />
              ))}
            </datalist>
          </label>

          {hasLength && (
            <label className="field">
              <span className="field-label">Length</span>
              <input
                type="text"
                list="length-options"
                value={lengthText}
                onChange={(e) => handleLengthTextChange(e.target.value)}
                className="control"
                placeholder="Select or type a new length"
                autoComplete="off"
                disabled={!diamText.trim()}
              />
              <datalist id="length-options">
                {lengths.map((l) => (
                  <option key={l.value} value={l.label} />
                ))}
              </datalist>
            </label>
          )}

          {diamText.trim() && (hasLength ? lengthText.trim() : true) && (
            <label className="field">
              <span className="field-label">Size</span>
              <input
                type="text"
                list="size-options"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="control"
                placeholder="Select or type a new size"
                autoComplete="off"
              />
              <datalist id="size-options">
                {sizes.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              {sizes.length === 0 && (
                <span className="field-hint">
                  No existing catalog entry matches that diameter/length - this will add a new product.
                </span>
              )}
            </label>
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
