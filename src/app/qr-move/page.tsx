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
          alert("Scanned: " + decodedText);

          qr.stop().then(() => {
            qr.clear();
            setScanning(false);
          });
        },
        () => {}
      );

      setScanning(true);
    } catch (err) {
      console.error("Scanner failed:", err);
      alert("Camera failed to start.");
    }
  };

  const stopScanner = async () => {
    if (qrRef.current) {
      await qrRef.current.stop();
      await qrRef.current.clear();
      setScanning(false);
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h2>QR Move</h2>

      {!scanning && (
        <button onClick={startScanner}>
          Start Scanning
        </button>
      )}

      {scanning && (
        <button onClick={stopScanner}>
          Stop Scanning
        </button>
      )}

      <div
        id="qr-reader"
        style={{ width: "100%", marginTop: 20 }}
      />
    </div>
  );
}