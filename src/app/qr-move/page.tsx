"use client";

import { useState, useRef } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import Image from "next/image";
import AppHeader from "@/components/AppHeader";

export default function QrMovePage() {
  const qrRef = useRef<Html5Qrcode | null>(null);
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
            .catch((err: unknown) => {
              console.error("Error stopping scanner:", err);
            });
        },
        () => {
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
        // Best-effort stop/clear (don’t crash UI if already stopped).
        await qrRef.current.stop().catch(() => {});
        try {
          qrRef.current.clear();
        } catch {
          // The scanner may already be clear.
        }
        qrRef.current = null;
      }
    } finally {
      setScanning(false);
    }
  };

  return (
    <main className="page-shell">
      <AppHeader
        title="QR Move"
        subtitle="Scan a warehouse location and open it on the Move screen."
      />

      <section className="panel scanner-panel">
        <div className="scanner-icon">
          <Image src="/qr-icon.png" alt="" width={38} height={38} />
        </div>
        <div className="scanner-title">
          {scanning ? "Camera ready" : "Scan a location"}
        </div>
        <p className="scanner-copy">
          Hold the QR code inside the camera frame. The matching location will
          open automatically.
        </p>

        {!scanning ? (
          <button
            type="button"
            onClick={startScanner}
            className="button button-primary button-block"
          >
            Start camera
          </button>
        ) : (
          <button
            type="button"
            onClick={stopScanner}
            className="button button-secondary button-block"
          >
            Stop scanning
          </button>
        )}

        <div id="qr-reader" />
      </section>
    </main>
  );
}
