import Image from "next/image";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import AdminLogoutButton from "./AdminLogoutButton";

const tools = [
  {
    href: "/stock-check",
    label: "Stock Check",
    icon: "/icons/stock-check-icon.svg"
  },
  {
    href: "/cert-combine",
    label: "Cert Combine",
    icon: "/icons/cert-combine.svg"
  }
];

export default function AdminPage() {
  return (
    <main className="page-shell">
      <AppHeader title="Admin">
        <AdminLogoutButton />
      </AppHeader>

      <section className="panel panel-flat">
        <div className="tool-grid">
          {tools.map((tool) => (
            <Link key={tool.href} href={tool.href} className="tool-tile">
              <span className="tool-tile-icon">
                <Image src={tool.icon} alt="" width={32} height={32} />
              </span>
              <span className="tool-tile-label">{tool.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
