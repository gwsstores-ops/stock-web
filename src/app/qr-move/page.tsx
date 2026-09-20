"use client";

import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import Image from "next/image";
import AppHeader from "@/components/AppHeader";

export default function QrMovePage() {
  const qrRef = useRef<Html5Qrcode | null>(null);
  const startingRef = useRef(false);
  const handlingScanRef = useRef(false);
  const [scanning, setScanning] = useState(false);

  const stopScanner = async () => {
    const qr = qrRef.current;
    qrRef.current = null;

    if (qr) {
      // Best-effort stop/clear (don't crash UI if already stopped).
      await qr.stop().catch(() => {});
      try {
        qr.clear();
      } catch {
        // The scanner may already be clear.
      }
    }

    setScanning(false);
  };

  const handleScan = async (decodedText: string) => {
    const value = decodedText.trim();

    // The camera fires the callback repeatedly until it has stopped; act on the first scan only.
    if (!value || handlingScanRef.current) return;
    handlingScanRef.current = true;

    await stopScanner();

    // Auto-fill the move page with the scanned pallet ID.
    window.location.href = `/move?location=${encodeURIComponent(value)}`;
  };

  const startScanner = async () => {
    if (startingRef.current || qrRef.current) return;
    startingRef.current = true;
    handlingScanRef.current = false;

    // The reader is hidden until scanning, and the camera needs it laid out to size the video.
    setScanning(true);
    window.scrollTo({ top: 0 });

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      const qr = new Html5Qrcode("qr-reader");
      qrRef.current = qr;

      await qr.start(
        { facingMode: "environment" },
        {
          fps: 10,
          // Scan box scales down on small screens instead of overflowing the video
          qrbox: (width: number, height: number) => {
            const size = Math.floor(Math.min(250, Math.min(width, height) * 0.8));
            return { width: size, height: size };
          }
        },
        (decodedText: string) => {
          void handleScan(decodedText);
        },
        () => {
          // Ignore scan noise (camera throws constant decode errors while scanning)
        }
      );
    } catch (err) {
      console.error("Scanner failed:", err);
      qrRef.current = null;
      setScanning(false);
      alert("Camera failed to start.");
    } finally {
      startingRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      const qr = qrRef.current;
      qrRef.current = null;

      if (qr) {
        void qr.stop().catch(() => {}).finally(() => {
          try {
            qr.clear();
          } catch {
            // The scanner may already be clear.
          }
        });
      }
    };
  }, []);

  return (
    <main className="page-shell">
      <AppHeader title="QR Move" />

      <section className={`panel scanner-panel${scanning ? " is-scanning" : ""}`}>
        <div className="scanner-icon">
          <Image src="/qr-icon.png" alt="" width={38} height={38} />
        </div>
        <div className="scanner-title">
          {scanning ? "Camera ready" : "Scan a location"}
        </div>
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
