import "./globals.css";
import { ReactNode } from "react";
import BottomNav from "../components/BottomNav";

export const metadata = {
  title: "GWS Stock",
  description: "GWS Warehouse Stock System",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-frame">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
