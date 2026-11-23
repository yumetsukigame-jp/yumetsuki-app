import Link from "next/link";
import { isNanikaShipping } from "../../app/lib/nanikaGachaDisplay";

export default function ShippingPoints({ record, label, admin = false }: {
  record: { cost?: number; nanikaImageId?: unknown; image?: unknown }; label: string; admin?: boolean;
}) {
  if (!isNanikaShipping(record)) return <p><strong>{label}：</strong> {record.cost} pt</p>;
  return <>
    <p><strong>発送時の追加消費：</strong> 0 pt</p>
    {admin ? <p>受取ポイント（発送では付与されません）：{record.cost} pt</p>
      : <p>抽選時の消費ポイントは<Link href="/nanika-gacha/history">当選・受取</Link>で確認できます。</p>}
  </>;
}
