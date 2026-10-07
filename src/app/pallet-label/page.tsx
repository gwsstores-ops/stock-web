"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { buildLabelPdf, formatLabelDate, MAX_ITEMS, MAX_SIZES } from "@/lib/labelPdf";

type ItemBlock = {
  item: string;
  sizeCount: number;
  sizes: string[];
  qtys: string[];
};

const newBlock = (): ItemBlock => ({
  item: "",
  sizeCount: 1,
  sizes: Array(MAX_SIZES).fill(""),
  qtys: Array(MAX_SIZES).fill("")
});

export default function PalletLabelPage() {
  const [items, setItems] = useState<ItemBlock[]>([newBlock()]);
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

  const ready =
    palletId.trim() !== "" &&
    items.every(
      (block) =>
        block.item.trim() !== "" &&
        block.sizes.slice(0, block.sizeCount).every((size) => size.trim() !== "")
    );

  const updateItemName = (blockIndex: number, value: string) => {
    setItems((current) =>
      current.map((b, i) => (i === blockIndex ? { ...b, item: value.toUpperCase() } : b))
    );
  };

  const updateSize = (blockIndex: number, sizeIndex: number, value: string) => {
    setItems((current) =>
      current.map((b, i) =>
        i !== blockIndex
          ? b
          : { ...b, sizes: b.sizes.map((s, j) => (j === sizeIndex ? value.toUpperCase() : s)) }
      )
    );
  };

  const updateQty = (blockIndex: number, sizeIndex: number, value: string) => {
    setItems((current) =>
      current.map((b, i) =>
        i !== blockIndex ? b : { ...b, qtys: b.qtys.map((q, j) => (j === sizeIndex ? value : q)) }
      )
    );
  };

  // Inserts a blank size/qty row right after `sizeIndex` in this item, shifting later rows down.
  const insertSizeAfter = (blockIndex: number, sizeIndex: number) => {
    setItems((current) =>
      current.map((b, i) => {
        if (i !== blockIndex) return b;
        const sizeCount = Math.min(MAX_SIZES, b.sizeCount + 1);
        const sizes = [...b.sizes.slice(0, sizeIndex + 1), "", ...b.sizes.slice(sizeIndex + 1)].slice(
          0,
          MAX_SIZES
        );
        const qtys = [...b.qtys.slice(0, sizeIndex + 1), "", ...b.qtys.slice(sizeIndex + 1)].slice(
          0,
          MAX_SIZES
        );
        return { ...b, sizeCount, sizes, qtys };
      })
    );
  };

  // Removes the size row at `sizeIndex` in this item, shifting later rows up.
  const removeSizeAt = (blockIndex: number, sizeIndex: number) => {
    setItems((current) =>
      current.map((b, i) => {
        if (i !== blockIndex) return b;
        const sizeCount = Math.max(1, b.sizeCount - 1);
        const sizes = [...b.sizes.slice(0, sizeIndex), ...b.sizes.slice(sizeIndex + 1), ""];
        const qtys = [...b.qtys.slice(0, sizeIndex), ...b.qtys.slice(sizeIndex + 1), ""];
        return { ...b, sizeCount, sizes, qtys };
      })
    );
  };

  // Adds a whole new item (its own name and sizes) below the others.
  const addItem = () => {
    setItems((current) => (current.length >= MAX_ITEMS ? current : [...current, newBlock()]));
  };

  const removeItem = (blockIndex: number) => {
    setItems((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== blockIndex)));
  };

  const handleDownload = async () => {
    if (!ready || building) return;

    setBuilding(true);
    setError("");

    try {
      const now = new Date();
      const blob = await buildLabelPdf({
        items: items.map((block) => ({
          item: block.item,
          sizes: block.sizes.slice(0, block.sizeCount),
          qtys: block.qtys.slice(0, block.sizeCount)
        })),
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

        {items.map((block, blockIndex) => (
          <div
            key={blockIndex}
            style={{
              marginTop: 14,
              padding: 14,
              border: "1px solid var(--line)",
              borderRadius: 14
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="field-label">
                  {items.length === 1 ? "Item" : `Item ${blockIndex + 1}`}
                </span>
                <input
                  value={block.item}
                  onChange={(e) => updateItemName(blockIndex, e.target.value)}
                  list="label-items"
                  placeholder="Start typing, or enter your own"
                  className="control"
                  autoComplete="off"
                />
              </label>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(blockIndex)}
                  title="Remove this item"
                  aria-label="Remove this item"
                  className="button button-secondary"
                  style={{ width: 40, flex: "0 0 auto" }}
                >
                  ×
                </button>
              )}
            </div>

            {block.sizes.slice(0, block.sizeCount).map((size, sizeIndex) => (
              <div
                key={sizeIndex}
                style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "flex-end" }}
              >
                <label className="field" style={{ flex: 1 }}>
                  <span className="field-label">
                    {block.sizeCount === 1 ? "Size" : `Size ${sizeIndex + 1}`}
                  </span>
                  <input
                    value={size}
                    onChange={(e) => updateSize(blockIndex, sizeIndex, e.target.value)}
                    placeholder="For example: 20 X 80"
                    className="control"
                    autoComplete="off"
                  />
                </label>
                <label className="field" style={{ width: 110 }}>
                  <span className="field-label">Qty</span>
                  <input
                    value={block.qtys[sizeIndex]}
                    onChange={(e) => updateQty(blockIndex, sizeIndex, e.target.value)}
                    placeholder="1000"
                    className="control"
                    autoComplete="off"
                    inputMode="numeric"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => insertSizeAfter(blockIndex, sizeIndex)}
                  disabled={block.sizeCount >= MAX_SIZES}
                  title="Insert a new size below this one"
                  aria-label="Insert a new size below this one"
                  className="button button-secondary"
                  style={{ width: 40, flex: "0 0 auto" }}
                >
                  +
                </button>
                {block.sizeCount > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSizeAt(blockIndex, sizeIndex)}
                    title="Remove this size"
                    aria-label="Remove this size"
                    className="button button-secondary"
                    style={{ width: 40, flex: "0 0 auto" }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
        <datalist id="label-items">
          {itemOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <button
          type="button"
          onClick={addItem}
          disabled={items.length >= MAX_ITEMS}
          className="button button-secondary button-block"
          style={{ marginTop: 14 }}
        >
          + Add another item
        </button>

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
