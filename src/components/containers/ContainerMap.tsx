"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";

export type MapPoint = {
  lon: number;
  lat: number;
  labels: string[];
};

type ContainerMapProps = {
  points: MapPoint[];
  destinations: MapPoint[];
};

const WORLD_ATLAS_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const WIDTH = 680;
const HEIGHT = 400;
const PAD = 10;

let worldPromise: Promise<FeatureCollection<Geometry>> | null = null;

const loadWorld = (): Promise<FeatureCollection<Geometry>> => {
  if (!worldPromise) {
    worldPromise = fetch(WORLD_ATLAS_URL)
      .then((res) => res.json())
      .then((topo: Topology) => {
        const countries = topo.objects.countries as GeometryCollection;
        return feature(topo, countries) as unknown as FeatureCollection<Geometry>;
      })
      .catch((err) => {
        worldPromise = null;
        throw err;
      });
  }

  return worldPromise;
};

export default function ContainerMap({ points, destinations }: ContainerMapProps) {
  const [world, setWorld] = useState<FeatureCollection<Geometry> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    loadWorld()
      .then((fc) => {
        if (active) setWorld(fc);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const projection = useMemo(() => {
    const coords = [...points, ...destinations].map((p): [number, number] => [p.lon, p.lat]);
    if (!coords.length) coords.push([-8.47, 51.9]);

    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const padLon = Math.max((maxLon - minLon) * 0.15, 10);
    const padLat = Math.max((maxLat - minLat) * 0.15, 8);

    return geoMercator().fitExtent(
      [
        [PAD, PAD],
        [WIDTH - PAD, HEIGHT - PAD]
      ],
      {
        type: "MultiPoint",
        coordinates: [
          [minLon - padLon, minLat - padLat],
          [maxLon + padLon, maxLat + padLat]
        ]
      }
    );
  }, [points, destinations]);

  const pathGenerator = useMemo(() => geoPath(projection), [projection]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label="Map of last reported container positions"
      className="container-map"
    >
      <rect width={WIDTH} height={HEIGHT} rx={12} className="container-map-sea" />

      {world && !failed && (
        <g>
          {world.features.map((f, i) => (
            <path key={i} d={pathGenerator(f) ?? undefined} className="container-map-land" />
          ))}
        </g>
      )}

      {destinations.map((d, i) => {
        const [x, y] = projection([d.lon, d.lat]) ?? [0, 0];
        return (
          <g key={`dest-${i}`}>
            <rect x={x - 6} y={y - 6} width={12} height={12} rx={2} className="container-map-dest" />
            <text x={x - 10} y={y + 4} textAnchor="end" className="container-map-label">
              {d.labels.join(" + ")}
            </text>
          </g>
        );
      })}

      {points.map((p, i) => {
        const [x, y] = projection([p.lon, p.lat]) ?? [0, 0];
        const anchor = i % 2 === 0 ? "start" : "end";
        const dx = anchor === "start" ? 9 : -9;

        return (
          <g key={`pt-${i}`}>
            <circle cx={x} cy={y} r={6} className="container-map-pos" />
            <text x={x + dx} y={y - 8} textAnchor={anchor} className="container-map-label">
              {p.labels.map((label, li) => (
                <tspan key={label} x={x + dx} dy={li ? 14 : 0}>
                  {label}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
