export type NeraiuchiState = "draft" | "published" | "closed" | "archived";
export type NeraiuchiAvailability = "upcoming" | "open" | "ended" | "full" | "closed" | "disabled";

export type NeraiuchiPrize = {
  number: number;
  label: string;
  points: number;
  shippingEnabled: boolean;
};

export type NeraiuchiClaim = {
  choice: "points" | "shipping";
  requestId: string;
  claimedAt: number;
};

export type NeraiuchiEvent = {
  id: string;
  title: string;
  description: string;
  thumbnailPath: string;
  startsAt: number;
  endsAt: number;
  entryCost: 0;
  maxPerAccount: 1;
  rewardLabel: string;
  claimInstructions: string;
  version: number;
  availability: NeraiuchiAvailability;
  resultsReleased: boolean;
};

export type NeraiuchiParticipation = {
  eventId: string;
  eventTitleSnapshot: string;
  eventVersion: number;
  acceptedAt: number;
};

export type NeraiuchiRevealedEntry = NeraiuchiParticipation & {
  resultsReleased: true;
  number: number;
  isWinner: boolean;
  rewardLabelSnapshot: string;
  claimInstructionsSnapshot: string;
  prize: Omit<NeraiuchiPrize, "number"> | null;
  claim: NeraiuchiClaim | null;
};

export type NeraiuchiEntry = NeraiuchiRevealedEntry |
  (NeraiuchiParticipation & { resultsReleased: false });

export type NeraiuchiListedEvent = NeraiuchiEvent & { entry: NeraiuchiEntry | null };

export type NeraiuchiHomeStatus = {
  event: Pick<NeraiuchiEvent, "id" | "title" | "startsAt" | "endsAt"> | null;
  refreshAt: number | null;
  serverNow: number;
};

export type NeraiuchiResultRow = {
  number: number;
  acceptedAt: number;
  acceptedAtNanoseconds: number;
  displayName: string;
  isSelf: boolean;
  isWinner: boolean;
  rewardLabel: string | null;
};

export type NeraiuchiDraft = {
  title: string;
  description: string;
  thumbnailPath: string;
  startsAt: number;
  endsAt: number;
  maxEntries: number;
  prizes: NeraiuchiPrize[];
  claimInstructions: string;
};

export type NeraiuchiAdminEvent = NeraiuchiEvent & {
  state: NeraiuchiState;
  maxEntries: number;
  winningNumbers: number[];
  prizes: NeraiuchiPrize[];
  acceptedCount: number;
  rewardMode: "claim" | "manual";
};

export type NeraiuchiPage<T> = {
  items: T[];
  nextCursor: string | null;
  serverNow: number;
};
