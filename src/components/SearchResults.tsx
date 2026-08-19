import Image from "next/image";
import type { CSSProperties } from "react";
import { splitStockLocation } from "@/lib/stockLocation";

export type SearchResultRow = {
  id: number;
  location: string;
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

const getItemStyle = (item: string): CSSProperties => {
  if (item.toUpperCase().includes("HDG")) {
    return { color: "#777" };
  }
  return {};
};

export default function SearchResults({ rows }: SearchResultsProps) {
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

              <div className="location-list">
                {grouped[area]
                  .sort((a, b) => a.location.localeCompare(b.location))
                  .map((row) => {
                    const { location, palletId } = splitStockLocation(
                      row.location
                    );

                    return (
                      <div key={row.id} className="location-row">
                        <div className="stock-result-details">
                          <div className="stock-result-field">
                            <span className="stock-result-label">Location</span>
                            <span className="location-code">{location}</span>
                          </div>
                          <div className="stock-result-field">
                            <span className="stock-result-label">Pallet ID</span>
                            <span className="pallet-id">{palletId || "—"}</span>
                          </div>
                        </div>
                        <span className="qty-pill">
                          QTY&nbsp;
                          <strong>{(row.qty ?? 0).toLocaleString()}</strong>
                        </span>
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
      </div>
    </>
  );
}
