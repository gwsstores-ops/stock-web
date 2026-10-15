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

  // Two ports can be close enough in the real world to land on (or near) the
  // same pixel at this map's scale (eg Tanjong Pelepas and Singapore) - left
  // as separate markers their labels would just print on top of each other,
  // so anything within CLUSTER_PX of another marker is folded into it.
  const markers = useMemo(() => {
    const CLUSTER_PX = 22;
    const projected = points.map((p) => {
      const [x, y] = projection([p.lon, p.lat]) ?? [0, 0];
      return { x, y, labels: p.labels };
    });

    const clusters: { x: number; y: number; labels: string[] }[] = [];

    for (const p of projected) {
      const near = clusters.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < CLUSTER_PX);

      if (near) {
        for (const label of p.labels) {
          if (!near.labels.includes(label)) near.labels.push(label);
        }
      } else {
        clusters.push({ x: p.x, y: p.y, labels: [...p.labels] });
      }
    }

    return clusters;
  }, [points, projection]);

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

      {markers.map((m, i) => {
        // Labels default to the right of their marker, but one that close to
        // the map's right edge would then run off it (SVG clips anything
        // outside the viewBox) - so markers out there flip to the left.
        const anchor = m.x > WIDTH - 140 ? "end" : "start";
        const dx = anchor === "start" ? 9 : -9;

        return (
          <g key={`pt-${i}`}>
            <circle cx={m.x} cy={m.y} r={6} className="container-map-pos" />
            <text x={m.x + dx} y={m.y - 8} textAnchor={anchor} className="container-map-label">
              {m.labels.map((label, li) => (
                <tspan key={label} x={m.x + dx} dy={li ? 14 : 0}>
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
