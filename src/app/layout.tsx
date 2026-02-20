import "./globals.css";
import Link from "next/link";
import { ReactNode } from "react";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif" }}>
        
        {/* Main Content */}
        <div style={{ paddingBottom: 80 }}>
          {children}
        </div>

        {/* Bottom Navigation */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: 60,
            background: "#f5f5f5",
            borderTop: "1px solid #ddd",
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
            fontWeight: 600
          }}
        >
          <Link href="/" style={{ textDecoration: "none" }}>
            🔎 Search
          </Link>

          <Link href="/move" style={{ textDecoration: "none" }}>
            🚚 Move
          </Link>
        </div>

      </body>
    </html>
  );
}
