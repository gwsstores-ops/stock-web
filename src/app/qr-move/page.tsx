"use client";

import { useEffect, useRef, useState } from "react";

export default function QrMovePage() {
  const qrRef = useRef<any>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!scanning) return;

    let isMounted = true;

    const startScanner = async () => {
      const { Html5Qrcode } = await import("html5-qrcode");

      if (!isMounted) return;

      const qr = new Html5Qrcode("qr-reader");
      qrRef.current = qr;

      try {
        await qr.start(
  { facingMode: "environment" },
  { fps: 10, qrbox: 250 },
  (decodedText) => {
    alert("Scanned: " + decodedText);
    qr.stop().then(() => qr.clear());
    setScanning(false);
  },
  (errorMessage) => {
    // ignore scan errors (they happen constantly while scanning)
    console.log("QR scan error:", errorMessage);
  }
);
      } catch (err) {
        console.error("QR start error:", err);
      }
    };

    startScanner();

    return () => {
      isMounted = false;

      if (qrRef.current) {
        qrRef.current.stop().catch(() => {});
        qrRef.current.clear().catch(() => {});
      }
    };
  }, [scanning]);

  return (
    <div style={{ padding: 30 }}>
      <h2>QR Move</h2>

      {!scanning && (
        <button onClick={() => setScanning(true)}>
          Start Scanning
        </button>
      )}

      <div
        id="qr-reader"
        style={{ width: "100%", marginTop: 20 }}
      />
    </div>
  );
}