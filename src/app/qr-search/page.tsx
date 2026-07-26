"use client";

import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import Image from "next/image";
import AppHeader from "@/components/AppHeader";
import SearchResults, {
  type SearchResultRow
} from "@/components/SearchResults";

type SearchStatus = "idle" | "searching" | "found" | "not-found" | "error";

export default function QrSearchPage() {
  const qrRef = useRef<Html5Qrcode | null>(null);
  const handlingScanRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [rows, setRows] = useState<SearchResultRow[]>([]);

  const stopScanner = async () => {
    const qr = qrRef.current;
    qrRef.current = null;

    if (qr) {
      await qr.stop().catch(() => {});
      try {
        qr.clear();
      } catch {
        // The scanner may already be clear.
      }
    }

    setScanning(false);
  };

  const searchCode = async (decodedText: string) => {
    if (handlingScanRef.current || !decodedText.trim()) return;

    handlingScanRef.current = true;
    setStatus("searching");
    setRows([]);

    try {
      await stopScanner();

      const response = await fetch(
        `/api/qr-search?code=${encodeURIComponent(decodedText.trim())}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "QR search failed");
      }

      const nextRows: SearchResultRow[] = data.rows || [];
      setRows(nextRows);
      setStatus(nextRows.length > 0 ? "found" : "not-found");
    } catch (error) {
      console.error("QR search failed:", error);
      setStatus("error");
    } finally {
      handlingScanRef.current = false;
    }
  };

  const startScanner = async () => {
    try {
      setRows([]);
      setStatus("idle");
      handlingScanRef.current = false;

      const { Html5Qrcode } = await import("html5-qrcode");
      const qr = new Html5Qrcode("qr-search-reader");
      qrRef.current = qr;

      await qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText: string) => {
          void searchCode(decodedText);
        },
        () => {
          // Decode errors are expected while the camera is scanning.
        }
      );

      setScanning(true);
    } catch (error) {
      console.error("Scanner failed:", error);
      setStatus("error");
      setScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      const qr = qrRef.current;
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
      <AppHeader title="QR Search" />

      <section className="panel scanner-panel">
        <div className="scanner-icon">
          <Image src="/qr-icon.png" alt="" width={38} height={38} />
        </div>
        <div className="scanner-title">
          {scanning ? "Camera ready" : "Scan a stock code"}
        </div>

        {!scanning ? (
          <button
            type="button"
            onClick={startScanner}
            className="button button-primary button-block"
            disabled={status === "searching"}
          >
            {status === "found" || status === "not-found"
              ? "Scan another code"
              : status === "searching"
                ? "Searching"
                : "Start camera"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stopScanner()}
            className="button button-secondary button-block"
          >
            Stop scanning
          </button>
        )}

        <div id="qr-search-reader" />
      </section>

      {status === "not-found" && (
        <section className="panel not-in-stock" role="status">
          NOT IN STOCK
        </section>
      )}

      {status === "error" && (
        <section className="panel search-error" role="alert">
          SEARCH FAILED
        </section>
      )}

      <SearchResults rows={rows} />
    </main>
  );
}
