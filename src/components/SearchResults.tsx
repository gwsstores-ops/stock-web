"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

export type SearchResultRow = {
  id: number;
  location: string | null;
  pallet_id: string | null;
  area: string;
  item: string;
  size: string;
  qty: number | null;
};

type SearchResultsProps = {
  rows: SearchResultRow[];
};

const areas = ["GWS", "W3", "W4"];

const areaIcon = (area: string) => {
  if (area === "GWS") return "/gws.png";
  if (area === "W3") return "/w3.png";
  if (area === "W4") return "/w4.png";
  return "";
};

const locationIcon = (area: string) =>
  area === "GWS" ? "/icons/BAY.png" : "/icons/stack.png";

const getItemStyle = (item: string): CSSProperties => {
  if (item.toUpperCase().includes("HDG")) {
    return { color: "#777" };
  }
  return {};
};

const isMixPallet = (palletId: string | null) =>
  !!palletId && palletId.toUpperCase().includes("(MIX-");

export default function SearchResults({ rows }: SearchResultsProps) {
  const [mixModalPalletId, setMixModalPalletId] = useState<string | null>(null);
  const [mixModalRows, setMixModalRows] = useState<SearchResultRow[]>([]);
  const [mixModalLoading, setMixModalLoading] = useState(false);

  const openMixModal = async (palletId: string) => {
    setMixModalPalletId(palletId);
    setMixModalLoading(true);
    setMixModalRows([]);

    try {
      const res = await fetch(
        `/api/preview?field=pallet_id&match=exact&location=${encodeURIComponent(palletId)}`
      );
      const data = await res.json();
      setMixModalRows(data.rows || []);
    } finally {
      setMixModalLoading(false);
    }
  };

  const closeMixModal = () => {
    setMixModalPalletId(null);
    setMixModalRows([]);
  };

  const filteredRows = rows.filter((row) => areas.includes(row.area));

  if (filteredRows.length === 0) return null;

  const grouped = filteredRows.reduce<Record<string, SearchResultRow[]>>(
    (acc, row) => {
      if (!acc[row.area]) acc[row.area] = [];
      acc[row.area].push(row);
      return acc;
    },
    {}
  );

  return (
    <>
      <section className="panel panel-flat product-summary">
        <div>
          <p className="section-kicker">Current selection</p>
          <div
            className="product-name"
            style={getItemStyle(filteredRows[0].item)}
          >
            {filteredRows[0].item}
          </div>
        </div>
        <span className="product-size">{filteredRows[0].size}</span>
      </section>

      <div className="qty-unknown-note" role="note">
        QTY 1 = QTY UNKNOWN
      </div>

      <div aria-live="polite">
        {areas
          .filter((area) => grouped[area])
          .map((area) => (
            <section key={area} className="panel area-section">
              <div
                className={`area-header area-header-${area.toLowerCase()}`}
              >
                <Image
                  src={areaIcon(area)}
                  className="area-icon"
                  alt={area}
                  width={42}
                  height={42}
                />
                <div className="area-title">{area}</div>
                <div className="area-count">
                  {grouped[area].length} location
                  {grouped[area].length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>
                        <span className="location-header">
                          <Image
                            src={locationIcon(area)}
                            className="location-icon"
                            alt="Location"
                            width={96}
                            height={96}
                          />
                        </span>
                      </th>
                      <th>Pallet ID</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[area]
                      .sort((a, b) =>
                        (a.location ?? a.pallet_id ?? "").localeCompare(
                          b.location ?? b.pallet_id ?? ""
                        )
                      )
                      .map((row) => (
                        <tr key={row.id}>
                          <td>{row.location ?? "—"}</td>
                          <td>
                            {isMixPallet(row.pallet_id) ? (
                              <button
                                type="button"
                                className="pallet-id-link"
                                onClick={() => openMixModal(row.pallet_id!)}
                              >
                                {row.pallet_id}
                              </button>
                            ) : (
                              row.pallet_id ?? "—"
                            )}
                          </td>
                          <td>{(row.qty ?? 0).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
      </div>

      {mixModalPalletId && (
        <div className="modal-overlay" onClick={closeMixModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="section-kicker">Mixed pallet</p>
                <h2>{mixModalPalletId}</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeMixModal}
              >
                Close
              </button>
            </div>

            {mixModalLoading ? (
              <div className="empty-state">Loading…</div>
            ) : mixModalRows.length === 0 ? (
              <div className="empty-state">No items found for this pallet.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Size</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mixModalRows.map((row) => (
                      <tr key={row.id}>
                        <td style={getItemStyle(row.item)}>{row.item}</td>
                        <td>{row.size}</td>
                        <td>{(row.qty ?? 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
