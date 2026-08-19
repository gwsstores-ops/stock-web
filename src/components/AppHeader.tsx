import Image from "next/image";
import { ReactNode } from "react";

type AppHeaderProps = {
  title: string;
  children?: ReactNode;
};

export default function AppHeader({
  title,
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
        <h1>{title}</h1>
      </div>

      {children}
    </header>
  );
}
