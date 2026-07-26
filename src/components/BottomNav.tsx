"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/",
    label: "Search",
    icon: "/search-icon.png"
  },
  {
    href: "/ask-stock",
    label: "Ask Stock",
    icon: "/search-icon.png"
  },
  {
    href: "/qr-search",
    label: "QR Search",
    icon: "/qr-icon.png"
  },
  {
    href: "/move",
    label: "Move",
    icon: "/move-icon.png"
  },
  {
    href: "/qr-move",
    label: "QR Move",
    icon: "/qr-icon.png"
  }
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="bottom-nav-inner">
        {items.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${active ? " nav-item-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="nav-icon-wrap">
                <Image
                  src={item.icon}
                  alt=""
                  width={26}
                  height={26}
                  className="nav-icon"
                />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
