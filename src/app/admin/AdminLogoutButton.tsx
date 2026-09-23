"use client";

import { useRouter } from "next/navigation";

export default function AdminLogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/admin-logout", { method: "POST" });
    router.push("/tools");
    router.refresh();
  };

  return (
    <button type="button" onClick={handleLogout} className="button button-secondary">
      Log out
    </button>
  );
}
