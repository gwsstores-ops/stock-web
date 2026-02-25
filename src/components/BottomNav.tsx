"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const pathname = usePathname();

  const navItemStyle = (path: string) => {
    const active = pathname === path;

    return {
      textDecoration: "none",
      color: active ? "#000" : "#666",
      flex: 1,
      textAlign: "center" as const,
      paddingTop: 8,
      paddingBottom: 6,
      borderTop: active ? "3px solid #000" : "3px solid transparent",
      background: active ? "#eaeaea" : "transparent",
      transition: "0.2s",
    };
  };

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 70,
        background: "#f5f5f5",
        borderTop: "1px solid #ddd",
        display: "flex",
        alignItems: "center",
      }}
    >
      <Link href="/" style={navItemStyle("/")}>
        <div>
          <img src="/search-icon.png" width={24} alt="Search" />
          <div style={{ fontSize: 12, marginTop: 4 }}>Search</div>
        </div>
      </Link>

      <Link href="/move" style={navItemStyle("/move")}>
        <div>
          <img src="/move-icon.png" width={24} alt="Move" />
          <div style={{ fontSize: 12, marginTop: 4 }}>Move</div>
        </div>
      </Link>

      <Link href="/qr-move" style={navItemStyle("/qr-move")}>
        <div>
          <img src="/qr-icon.png" width={24} alt="QR Move" />
          <div style={{ fontSize: 12, marginTop: 4 }}>QR</div>
        </div>
      </Link>
    </nav>
  );
}
