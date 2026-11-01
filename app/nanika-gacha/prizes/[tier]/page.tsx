import { notFound } from "next/navigation";
import { NANIKA_TIERS } from "@/functions/src/nanikaGachaTypes";
import NanikaPrizeGallery from "@/components/nanika-gacha/NanikaPrizeGallery";

export default async function NanikaPrizePage({ params }: { params: Promise<{ tier: string }> }) {
  const { tier } = await params;
  const selected = NANIKA_TIERS.find(item => item.id === tier);
  if (!selected) notFound();
  return <NanikaPrizeGallery key={selected.id} tier={selected.id} />;
}
