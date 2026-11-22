"use client";

import { NANIKA_TIERS, type NanikaTier } from "@/functions/src/nanikaGachaTypes";

export type RewardDelivery = "points" | "shipping" | NanikaTier;

export default function RewardDeliverySelect({ value, onChange, includePoints = false }: {
  value: RewardDelivery; onChange: (value: RewardDelivery) => void; includePoints?: boolean;
}) {
  return <label>
    景品の受取内容
    <select value={value} onChange={event => onChange(event.target.value as RewardDelivery)}>
      {includePoints && <option value="points">ポイントのみ（発送なし）</option>}
      <option value="shipping">通常の景品（発送）</option>
      {NANIKA_TIERS.map(tier => <option key={tier.id} value={tier.id}>{tier.label}の権利（1回分）</option>)}
    </select>
  </label>;
}
