"use client";

import { useState, useRef } from "react";

export default function QrMovePage() {
  const qrRef = useRef<any>(null);
  const [scanning, setScanning] = useState(false);

  const startScanner = async () => {
    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      const qr = new Html5Qrcode("qr-reader");
      qrRef.current = qr;

      await qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText: string) => {
          console.log("Scanned value:", decodedText);

          if (!decodedText) {
            console.log("Empty scan result");
            return;
          }

          // Stop scanner safely
          qr.stop()
            .then(() => qr.clear())
            .then(() => {
              setScanning(false);

              // Auto-fill your move page with scanned location
              window.location.href = `/move?location=${encodeURIComponent(
                decodedText
              )}`;
            })
            .catch((err: any) => {
              console.error("Error stopping scanner:", err);
            });
        },
        (errorMessage: string) => {
          // Ignore scan noise (camera throws constant decode errors while scanning)
          // console.log("Scan error (normal while scanning):", errorMessage);
        }
      );

      setScanning(true);
    } catch (err) {
      console.error("Scanner failed:", err);
      alert("Camera failed to start.");
    }
  };

  const stopScanner = async () => {
    try {
      if (qrRef.current) {
        // best-effort stop/clear (don’t crash UI if already stopped)
        await qrRef.current.stop().catch(() => {});
        await qrRef.current.clear().catch(() => {});
        qrRef.current = null;
      }
    } finally {
      setScanning(false);
    }
  };

  return (
    <div style={{ padding: 30, maxWidth: 700, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 16 }}>QR Move</h2>

      {!scanning && (
        <button
          onClick={startScanner}
          style={{
            width: "100%",
            padding: "18px 0",
            fontSize: 24,
            fontWeight: 800,
            backgroundColor: "#0d47a1",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            letterSpacing: 3,
            boxShadow: "0 4px 10px rgba(0,0,0,0.2)"
          }}
        >
          SCAN
        </button>
      )}

      {scanning && (
        <button
          onClick={stopScanner}
          style={{
            width: "100%",
            padding: "14px 0",
            fontSize: 18,
            fontWeight: 700,
            backgroundColor: "#eee",
            border: "1px solid #ccc",
            borderRadius: 10,
            cursor: "pointer"
          }}
        >
          Stop Scanning
        </button>
      )}

      <div id="qr-reader" style={{ width: "100%", marginTop: 20 }} />
    </div>
  );
}
