/**
 * One-time cleanup for bay/location labels that still carry an old "(MIX-N)"
 * suffix (e.g. "EF3 (MIX-13)"). That suffix belongs on the pallet, not the
 * bay - and in practice the pallet already carries it in almost every case -
 * so this strips it back off the location.
 *
 * Some locations collide once stripped (e.g. both "AE3" and "AE3 (MIX-4)"
 * exist as separate bays) because the plain-named bay was already created
 * later. Those are merged: any pallets on the "(MIX-N)" bay move onto the
 * plain bay, and the now-empty "(MIX-N)" bay is removed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type MixRename = { bayId: number; area: string; from: string; to: string };
export type MixMerge = {
  srcBayId: number;
  destBayId: number;
  area: string;
  from: string;
  to: string;
  palletsToMove: number;
};
export type MixPlan = { renames: MixRename[]; merges: MixMerge[] };

type Bay = { id: number; area: string; label: string };

export const stripMixSuffix = (label: string): string => {
  let s = label.replace(/\(\s*MIX-\d+\)?/gi, "");
  s = s.replace(/\[\s+/g, "[").replace(/\s+\]/g, "]"); // tidy spacing a removal left inside brackets
  s = s.replace(/\[\s*\]/g, ""); // drop brackets a removal left empty
  s = s.replace(/\s{2,}/g, " ");
  s = s.replace(/\s*\.\s*$/, ""); // stray trailing period some of these picked up
  return s.trim();
};

async function fetchAllBays(supabase: SupabaseClient): Promise<Bay[]> {
  let all: Bay[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("bay")
      .select("id, area, label")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    all = all.concat(data as Bay[]);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchPalletCounts(
  supabase: SupabaseClient,
  bayIds: number[]
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (bayIds.length === 0) return counts;

  const { data, error } = await supabase.from("pallet").select("bay_id").in("bay_id", bayIds);
  if (error) throw new Error(error.message);

  for (const row of data as { bay_id: number }[]) {
    counts.set(row.bay_id, (counts.get(row.bay_id) ?? 0) + 1);
  }
  return counts;
}

export async function buildMixPlan(supabase: SupabaseClient): Promise<MixPlan> {
  const bays = await fetchAllBays(supabase);
  const byAreaLabel = new Map(bays.map((b) => [`${b.area}::${b.label.trim().toUpperCase()}`, b]));

  const mixBays = bays.filter((b) => {
    const stripped = stripMixSuffix(b.label);
    return stripped !== "" && stripped !== b.label;
  });

  const palletCounts = await fetchPalletCounts(
    supabase,
    mixBays.map((b) => b.id)
  );

  const renames: MixRename[] = [];
  const merges: MixMerge[] = [];

  for (const b of mixBays) {
    const to = stripMixSuffix(b.label);
    const existing = byAreaLabel.get(`${b.area}::${to.toUpperCase()}`);

    if (existing && existing.id !== b.id) {
      merges.push({
        srcBayId: b.id,
        destBayId: existing.id,
        area: b.area,
        from: b.label,
        to,
        palletsToMove: palletCounts.get(b.id) ?? 0
      });
    } else {
      renames.push({ bayId: b.id, area: b.area, from: b.label, to });
    }
  }

  renames.sort((a, b) => a.from.localeCompare(b.from));
  merges.sort((a, b) => a.from.localeCompare(b.from));

  return { renames, merges };
}

export type MixApplyResult = {
  renamed: number;
  merged: number;
  skipped: { bayId: number; from: string; reason: string }[];
};

export async function applyMixPlan(
  supabaseAdmin: SupabaseClient,
  plan: MixPlan
): Promise<MixApplyResult> {
  const result: MixApplyResult = { renamed: 0, merged: 0, skipped: [] };

  for (const r of plan.renames) {
    const { error } = await supabaseAdmin.from("bay").update({ label: r.to }).eq("id", r.bayId);
    if (error) {
      result.skipped.push({ bayId: r.bayId, from: r.from, reason: error.message });
    } else {
      result.renamed++;
    }
  }

  for (const m of plan.merges) {
    if (m.palletsToMove > 0) {
      const [{ data: srcPallets, error: srcErr }, { data: destPallets, error: destErr }] =
        await Promise.all([
          supabaseAdmin.from("pallet").select("id, label").eq("bay_id", m.srcBayId),
          supabaseAdmin.from("pallet").select("label").eq("bay_id", m.destBayId)
        ]);

      if (srcErr || destErr) {
        result.skipped.push({
          bayId: m.srcBayId,
          from: m.from,
          reason: (srcErr ?? destErr)!.message
        });
        continue;
      }

      const destLabels = new Set((destPallets ?? []).map((p) => p.label));
      const conflict = (srcPallets ?? []).find((p) => destLabels.has(p.label));

      if (conflict) {
        result.skipped.push({
          bayId: m.srcBayId,
          from: m.from,
          reason: `Pallet "${conflict.label}" already exists on ${m.to} - merge needs a manual look`
        });
        continue;
      }

      const { error: moveErr } = await supabaseAdmin
        .from("pallet")
        .update({ bay_id: m.destBayId })
        .eq("bay_id", m.srcBayId);

      if (moveErr) {
        result.skipped.push({ bayId: m.srcBayId, from: m.from, reason: moveErr.message });
        continue;
      }
    }

    const { error: delErr } = await supabaseAdmin.from("bay").delete().eq("id", m.srcBayId);
    if (delErr) {
      result.skipped.push({ bayId: m.srcBayId, from: m.from, reason: delErr.message });
    } else {
      result.merged++;
    }
  }

  return result;
}
