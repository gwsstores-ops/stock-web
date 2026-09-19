// Read-only export of the live tables to backups/<table>-<timestamp>.json
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => /^NEXT_PUBLIC_SUPABASE/.test(l))
    .map((l) => l.split(/=(.*)/s).slice(0, 2))
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
fs.mkdirSync("backups", { recursive: true });

for (const table of ["stock", "move_log"]) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").order("id").range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const file = `backups/${table}-${ts}.json`;
  fs.writeFileSync(file, JSON.stringify(rows, null, 1));
  const back = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(table, rows.length, "rows ->", file, "| reread ok:", back.length === rows.length, "| unique ids:", new Set(back.map((r) => r.id)).size);
}
