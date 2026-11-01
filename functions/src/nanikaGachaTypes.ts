export const NANIKA_TIERS = [
  { id: "psa", label: "何かのPSAガチャ", thumbnail: "01-nanika-psa-yumetsuki-v2" },
  { id: "satellite", label: "何かのPSA10ガチャ（衛星級）", thumbnail: "02-satellite-psa10-yumetsuki-v2" },
  { id: "planet", label: "何かのPSA10ガチャ（惑星級）", thumbnail: "03-planet-psa10-yumetsuki-v2" },
  { id: "star", label: "何かのPSA10ガチャ（恒星級）", thumbnail: "04-star-psa10-yumetsuki-v2" },
] as const;
export type NanikaTier = typeof NANIKA_TIERS[number]["id"];
export const NANIKA_HOLD_MS = 72 * 60 * 60 * 1000;
export type NanikaChoice = "pending" | "points" | "shipping";
export type NanikaSlot = {
  tier: NanikaTier;
  fee: number | null;
  exchangePoints: number | null;
  visible: boolean;
  publishedAt: number | null;
  version: number;
  roundId: string | null;
  available: number;
  remainingUses: number;
  xAccounts?: string[];
};
export type NanikaReceipt = {
  id: string;
  tier: NanikaTier;
  roundId: string;
  imageId: string;
  name: string;
  image: string;
  fee: number;
  exchangePoints: number;
  acceptedAt: number;
  deadline: number;
  choice: NanikaChoice;
  automatic: boolean;
};
export type NanikaImage = {
  id: string;
  tier: NanikaTier;
  name: string;
  image: string;
  state: "ready" | "reserved" | "shipping" | "removed";
  largeBytes: number;
  thumbnailBytes: number;
  canPurge: boolean;
};
export type NanikaPrize = Pick<NanikaImage, "id" | "tier" | "name" | "image">;
export type NanikaRound = { id: string; tier: NanikaTier; closedAt: number; archiveComplete: boolean };
export type NanikaPage<T> = { items: T[]; nextCursor: string | null };
