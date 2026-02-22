"use client";

import { useEffect, useMemo, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

type Row = {
  id: number;
  location: string;
  area?: string;
  item: string;
  size: string;
  qty: number | null;
};

function extractLocation(raw: string): string {
  // Adjust this if your QR contains extra text like "LOC:3A98"
  // This extracts first "token" and uppercases it.
  const trimmed = (raw || "").trim();
  const token = trimmed.split(/\s+/)[0];
  return token.toUpperCase();
}

export default function Page() {
  const [scanned, setScanned] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [scanning, setScanning] = useState<boolean>(false);
  const [loadingMove, setLoadingMove] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");

  const scannerRegionId = "qr-reader";
  const iconMap: Record<string, string> = {
    GWS: "/gws.png",
    W3: "/w3.png",
    W4: "/w4.png",
  };

  const moveDisabled = rows.length === 0;

  const preview = async (loc: string) => {
    if (!loc) return;
    const res = await fetch(`/api/preview?location=${encodeURIComponent(loc)}`);
    const data = await res.json();
    setRows(data.rows || []);
  };

  const handleMove = async (targetArea: "GWS" | "W3" | "W4") => {
    if (moveDisabled) return;

    const ok = confirm(`Move ${rows.length} row(s) starting with ${location} to ${targetArea}?`);
    if (!ok) return;

    setLoadingMove(true);
    setErr("");

    try {
      const res = await fetch("/api/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, target: targetArea }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErr(data.error || "Move failed");
      } else {
        alert(data.message || "Move complete");
        // Refresh preview after move so user sees updated state immediately
        await preview(location);
      }
    } catch (e: any) {
      setErr(e?.message || "Move failed");
    } finally {
      setLoadingMove(false);
    }
  };

  // Start/stop scanner
  useEffect(() => {
    if (!scanning) return;

    let isActive = true;
    const qr = new Html5Qrcode(scannerRegionId);

    (async () => {
      try {
        setErr("");
        // Use environment-facing camera when possible
        await qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          async (decodedText) => {
            if (!isActive) return;

            const loc = extractLocation(decodedText);
            setScanned(decodedText);
            setLocation(loc);

            // Auto-preview immediately
            await preview(loc);

            // Optional: stop scanning after a successful scan
            await qr.stop();
            setScanning(false);
          },
          // ignore scan errors
          () => {}
        );
      } catch (e: any) {
        setErr(
          e?.message ||
            "Camera failed to start. (Tip: allow camera permissions; HTTPS required on deployed site.)"
        );
        setScanning(false);
      }
    })();

    return () => {
      isActive = false;
      // Best-effort stop/clear
      qr.stop().catch(() => {});
      qr.clear().catch(() => {});
    };
  }, [scanning]);

  return (
    <div style={{ padding: 30, maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 10 }}>QR Move</h2>

      <div style={{ marginBottom: 12, color: "#555" }}>
        Scan a QR code containing a location (e.g. <b>3A98</b>). Preview loads automatically.
      </div>

      {err && (
        <div style={{ marginBottom: 12, color: "crimson" }}>
          {err}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
        <button
          onClick={() => setScanning(true)}
          disabled={scanning}
          style={{ padding: "8px 12px", cursor: scanning ? "not-allowed" : "pointer" }}
        >
          Start Scan
        </button>

        <button
          onClick={() => {
            setScanning(false);
            setRows([]);
            setLocation("");
            setScanned("");
            setErr("");
          }}
          style={{ padding: "8px 12px", cursor: "pointer" }}
        >
          Reset
        </button>

        {location && (
          <div style={{ marginLeft: "auto" }}>
            Location: <b>{location}</b>
          </div>
        )}
      </div>

      {/* Scanner */}
      <div
        id={scannerRegionId}
        style={{
          width: "100%",
          maxWidth: 420,
          margin: "0 auto 18px auto",
          border: "1px solid #ddd",
          borderRadius: 8,
          overflow: "hidden",
        }}
      />

      {/* Preview rows */}
      {rows.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {rows.map((row) => (
            <div key={row.id} style={{ padding: "6px 0" }}>
              {row.location} ➜ {row.item} {row.size} — QTY:{" "}
              <b>{(row.qty ?? 0).toLocaleString()}</b>
            </div>
          ))}
        </div>
      )}

      {/* Move To */}
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <h3 style={{ marginBottom: 14 }}>Move To</h3>

        <div style={{ display: "flex", gap: 28, justifyContent: "center", alignItems: "center" }}>
          {(["GWS", "W3", "W4"] as const).map((area) => (
            <img
              key={area}
              src={iconMap[area]}
              alt={area}
              style={{
                width: 90,
                opacity: moveDisabled ? 0.3 : 1,
                cursor: moveDisabled || loadingMove ? "not-allowed" : "pointer",
                transition: "0.2s",
              }}
              onClick={() => {
                if (!moveDisabled && !loadingMove) handleMove(area);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}