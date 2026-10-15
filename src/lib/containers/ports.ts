/** A small lookup of shipping ports, by the city name as the tracker shows it. */
export type Port = {
  /** Canonical "City, Country" label. */
  name: string;
  /** [longitude, latitude]. */
  coords: [number, number];
};

const PORTS: Port[] = [
  { name: "Cork, Ireland", coords: [-8.47, 51.9] },
  { name: "Dublin, Ireland", coords: [-6.24, 53.35] },
  { name: "Southampton, United Kingdom", coords: [-1.4, 50.9] },
  { name: "Felixstowe, United Kingdom", coords: [1.35, 51.96] },
  { name: "Antwerp, Belgium", coords: [4.4, 51.26] },
  { name: "Zeebrugge, Belgium", coords: [3.21, 51.33] },
  { name: "Rotterdam, Netherlands", coords: [4.48, 51.92] },
  { name: "Hamburg, Germany", coords: [9.97, 53.55] },
  { name: "Le Havre, France", coords: [0.11, 49.49] },
  { name: "Algeciras, Spain", coords: [-5.45, 36.14] },
  { name: "Valencia, Spain", coords: [-0.33, 39.46] },
  { name: "Gdansk, Poland", coords: [18.65, 54.35] },
  { name: "Piraeus, Greece", coords: [23.63, 37.94] },
  { name: "Mundra, India", coords: [69.72, 22.84] },
  { name: "Nhava Sheva, India", coords: [72.95, 18.95] },
  { name: "Chennai, India", coords: [80.29, 13.08] },
  { name: "Vizhinjam, India", coords: [76.99, 8.37] },
  { name: "Colombo, Sri Lanka", coords: [79.84, 6.93] },
  { name: "Singapore, Singapore", coords: [103.84, 1.26] },
  { name: "Tanjong Pelepas, Malaysia", coords: [103.55, 1.36] },
  { name: "Port Klang, Malaysia", coords: [101.39, 3.0] },
  { name: "Ningbo, China", coords: [121.55, 29.87] },
  { name: "Shanghai, China", coords: [121.47, 31.23] },
  { name: "Qingdao, China", coords: [120.33, 36.07] },
  { name: "Tianjin, China", coords: [117.7, 39.0] },
  { name: "Xiamen, China", coords: [118.08, 24.48] },
  { name: "Shenzhen, China", coords: [113.92, 22.54] },
  { name: "Yantian, China", coords: [114.27, 22.58] },
  { name: "Hong Kong", coords: [114.16, 22.3] },
  { name: "Kaohsiung, Taiwan", coords: [120.28, 22.61] },
  { name: "Busan, South Korea", coords: [129.08, 35.1] },
  { name: "Jebel Ali, United Arab Emirates", coords: [55.02, 25.01] }
];

const stripSuffixes = (value: string) =>
  value
    .replace(/\bsea\s*port\b/gi, "")
    .replace(/\bport\b/gi, "")
    .trim();

const normalise = (raw: string) => stripSuffixes(raw.split(",")[0]).toLowerCase().trim();

const BY_CITY = new Map<string, Port>(PORTS.map((port) => [normalise(port.name), port]));

/** Matches a free-text location (eg "Vizhinjam Seaport, India") to a known port. */
export const findPort = (raw: string | null | undefined): Port | null => {
  if (!raw) return null;

  const key = normalise(raw);
  if (!key) return null;

  const exact = BY_CITY.get(key);
  if (exact) return exact;

  for (const [city, port] of BY_CITY) {
    if (city.length > 2 && (key.includes(city) || city.includes(key))) return port;
  }

  return null;
};

export const PORT_LIST = PORTS;
