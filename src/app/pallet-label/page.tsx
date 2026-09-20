"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { buildLabelPdf, formatLabelDate, MAX_SIZES } from "@/lib/labelPdf";

export default function PalletLabelPage() {
  const [sizeCount, setSizeCount] = useState(1);
  const [sizes, setSizes] = useState<string[]>(Array(MAX_SIZES).fill(""));
  const [item, setItem] = useState("");
  const [palletId, setPalletId] = useState("");
  const [itemOptions, setItemOptions] = useState<string[]>([]);
  const [today, setToday] = useState("");
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setToday(formatLabelDate(new Date()));
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/container-vocab")
      .then((res) => res.json())
      .then((data) => {
        if (!active || !data.itemsByCat) return;

        const all = new Set<string>();
        for (const items of Object.values<string[]>(data.itemsByCat)) {
          for (const name of items) all.add(name);
        }
        setItemOptions([...all].sort());
      })
      .catch(() => {
        // Free typing still works without the list, it is only a guide.
      });

    return () => {
      active = false;
    };
  }, []);

  const activeSizes = sizes.slice(0, sizeCount);
  const ready =
    item.trim() !== "" &&
    palletId.trim() !== "" &&
    activeSizes.every((size) => size.trim() !== "");

  const updateSize = (index: number, value: string) => {
    setSizes((current) => current.map((s, i) => (i === index ? value.toUpperCase() : s)));
  };

  const handleDownload = async () => {
    if (!ready || building) return;

    setBuilding(true);
    setError("");

    try {
      const now = new Date();
      const blob = await buildLabelPdf({
        item,
        sizes: activeSizes,
        palletId,
        date: now
      });

      const safeId = palletId.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "_");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `label_${safeId}_${formatLabelDate(now)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make the label");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <main className="page-shell">
      <AppHeader title="Pallet Label" />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">A4 label</p>
            <h2>Make a pallet label</h2>
          </div>
        </div>

        <div className="field">
          <span className="field-label">How many sizes?</span>
          <div style={{ display: "flex", gap: 8 }}>
            {Array.from({ length: MAX_SIZES }, (_, i) => i + 1).map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setSizeCount(count)}
                aria-pressed={sizeCount === count}
                className={`button ${sizeCount === count ? "button-primary" : "button-secondary"}`}
                style={{ flex: 1 }}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <label className="field" style={{ marginTop: 14 }}>
          <span className="field-label">Item</span>
          <input
            value={item}
            onChange={(e) => setItem(e.target.value.toUpperCase())}
            list="label-items"
            placeholder="Start typing, or enter your own"
            className="control"
            autoComplete="off"
          />
        </label>
        <datalist id="label-items">
          {itemOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {activeSizes.map((size, index) => (
          <label key={index} className="field" style={{ marginTop: 14 }}>
            <span className="field-label">
              {sizeCount === 1 ? "Size" : `Size ${index + 1}`}
            </span>
            <input
              value={size}
              onChange={(e) => updateSize(index, e.target.value)}
              placeholder="For example: 20 X 80"
              className="control"
              autoComplete="off"
            />
          </label>
        ))}

        <label className="field" style={{ marginTop: 14 }}>
          <span className="field-label">Pallet ID</span>
          <input
            value={palletId}
            onChange={(e) => setPalletId(e.target.value.toUpperCase())}
            placeholder="For example: 415ES_04"
            className="control"
            autoComplete="off"
          />
        </label>

        <p className="helper-text">
          Date on the label: <strong>{today}</strong> (today). The pallet ID is also printed as a QR code.
        </p>

        {error && (
          <p className="helper-text" role="alert" style={{ color: "#a51620" }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleDownload}
          disabled={!ready || building}
          className="button button-primary button-block"
          style={{ marginTop: 16 }}
        >
          {building ? "Making label…" : "Download PDF"}
        </button>
      </section>
    </main>
  );
}
