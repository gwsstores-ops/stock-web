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
/** .container-map-label is 12px bold - roughly 7px a character, 14px a line. */
const LABEL_CHAR_W = 7;
const LABEL_LINE = 14;
const LABEL_ASCENT = 9;
/** Dots closer than this get their labels split above/below to keep them apart. */
const NEIGHBOUR_PX = 160;

type Box = { x0: number; x1: number; y0: number; y1: number };
type LabelSpot = { anchor: "start" | "middle" | "end"; x: number; top: number };

const labelWidth = (lines: string[]) => Math.max(...lines.map((l) => l.length)) * LABEL_CHAR_W;

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

  // Each label sits centred directly above or below its own dot, so it's
  // obvious which dot it belongs to. Where two dots are near each other the
  // higher one's label goes above and the lower one's below, pushing the
  // labels apart rather than into the gap between them (eg JINDING above
  // Rotterdam, 126ES below Cork). Either way a label takes the first spot
  // that's on the map and clear of every dot, destination label and label
  // already placed - falling back to beside the dot if above and below are
  // both blocked.
  const labelSpots = useMemo(() => {
    const taken: Box[] = [
      ...markers.map((m) => ({ x0: m.x - 6, x1: m.x + 6, y0: m.y - 6, y1: m.y + 6 })),
      ...destinations.map((d) => {
        const [x, y] = projection([d.lon, d.lat]) ?? [0, 0];
        const w = labelWidth([d.labels.join(" + ")]);
        return { x0: x - 10 - w, x1: x + 6, y0: y - 6, y1: y + 6 };
      })
    ];

    return markers.map((m) => {
      const width = labelWidth(m.labels);
      const height = (m.labels.length - 1) * LABEL_LINE + LABEL_ASCENT + 2;
      const centreX = Math.min(Math.max(m.x, width / 2 + 4), WIDTH - 4 - width / 2);

      const hasHigherNeighbour = markers.some(
        (o) =>
          o !== m &&
          Math.hypot(o.x - m.x, o.y - m.y) < NEIGHBOUR_PX &&
          (o.y < m.y - 1 || (Math.abs(o.y - m.y) <= 1 && o.x > m.x))
      );

      const above = { anchor: "middle", x: centreX, top: m.y - 10 - height + 2 } as const;
      const below = { anchor: "middle", x: centreX, top: m.y + 10 } as const;
      const spots: LabelSpot[] = [
        ...(hasHigherNeighbour ? [below, above] : [above, below]),
        { anchor: "start", x: m.x + 10, top: m.y - LABEL_ASCENT / 2 },
        { anchor: "end", x: m.x - 10, top: m.y - LABEL_ASCENT / 2 }
      ];

      const boxOf = (spot: LabelSpot): Box => {
        const x0 = spot.anchor === "start" ? spot.x : spot.anchor === "end" ? spot.x - width : spot.x - width / 2;
        return { x0, x1: x0 + width, y0: spot.top, y1: spot.top + height };
      };

      const onMap = (b: Box) => b.x0 >= 0 && b.x1 <= WIDTH && b.y0 >= 0 && b.y1 <= HEIGHT;
      const clear = (b: Box) => !taken.some((t) => b.x0 < t.x1 && t.x0 < b.x1 && b.y0 < t.y1 && t.y0 < b.y1);

      const spot =
        spots.find((sp) => onMap(boxOf(sp)) && clear(boxOf(sp))) ??
        spots.find((sp) => onMap(boxOf(sp))) ??
        spots[0];
      taken.push(boxOf(spot));
      return spot;
    });
  }, [markers, destinations, projection]);

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
        const { anchor, x, top } = labelSpots[i];

        return (
          <g key={`pt-${i}`}>
            <circle cx={m.x} cy={m.y} r={6} className="container-map-pos" />
            <text x={x} y={top + LABEL_ASCENT} textAnchor={anchor} className="container-map-label">
              {m.labels.map((label, li) => (
                <tspan key={label} x={x} dy={li ? LABEL_LINE : 0}>
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
