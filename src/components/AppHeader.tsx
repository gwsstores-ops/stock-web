import Image from "next/image";
import { ReactNode } from "react";

type AppHeaderProps = {
  title: string;
  subtitle: string;
  children?: ReactNode;
};

export default function AppHeader({
  title,
  subtitle,
  children
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-mark">
        <Image
          src="/logo.png"
          alt="GWS"
          width={443}
          height={189}
          priority
          className="brand-logo"
        />
      </div>

      <div className="page-heading">
        <p className="eyebrow">Warehouse stock system</p>
        <h1>{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>

      {children}
    </header>
  );
}
