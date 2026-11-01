import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import type {
  NeraiuchiAdminEvent, NeraiuchiDraft, NeraiuchiEntry, NeraiuchiEvent, NeraiuchiPage,
  NeraiuchiPrize, NeraiuchiRevealedEntry, NeraiuchiResultRow, NeraiuchiListedEvent, NeraiuchiHomeStatus,
} from "@/functions/src/neraiuchiTypes";
export type {
  NeraiuchiAdminEvent, NeraiuchiDraft, NeraiuchiEntry, NeraiuchiEvent, NeraiuchiPage,
  NeraiuchiPrize, NeraiuchiRevealedEntry, NeraiuchiResultRow, NeraiuchiListedEvent, NeraiuchiHomeStatus,
};

export const neraiuchiEnabled = process.env.NEXT_PUBLIC_NERAIUCHI_ENABLED === "true";

type Api = {
  listNeraiuchiEvents: [{ cursor?: string }, NeraiuchiPage<NeraiuchiListedEvent> & { enabled: boolean; latestEnded: NeraiuchiListedEvent | null }];
  getNeraiuchiHomeStatus: [Record<string, never>, NeraiuchiHomeStatus];
  getNeraiuchiEvent: [{ eventId: string }, { event: NeraiuchiEvent; entry: NeraiuchiEntry | null; enabled: boolean; serverNow: number }];
  joinNeraiuchi: [{ eventId: string }, { entry: NeraiuchiEntry }];
  getNeraiuchiHistory: [{ cursor?: string }, NeraiuchiPage<NeraiuchiEntry>];
  adminListNeraiuchiEvents: [{ cursor?: string; archived?: boolean }, NeraiuchiPage<NeraiuchiAdminEvent>];
  adminGetNeraiuchiEvent: [{ eventId: string }, { event: NeraiuchiAdminEvent; serverNow: number }];
  adminSaveNeraiuchiDraft: [NeraiuchiDraft & { eventId?: string; expectedVersion?: number }, { eventId: string; version: number }];
  adminPublishNeraiuchi: [{ eventId: string; expectedVersion: number }, { eventId: string; version: number; roundNumber: number; title: string }];
  adminCloseNeraiuchi: [{ eventId: string; expectedVersion: number; reason: string }, { eventId: string; version: number }];
  adminArchiveNeraiuchi: [{ eventId: string; expectedVersion: number }, { eventId: string; version: number }];
  adminListNeraiuchiEntries: [{ eventId: string; cursor?: string }, NeraiuchiPage<NeraiuchiRevealedEntry & { uid: string; displayName: string; isSelf: boolean; acceptedAtNanoseconds: number }>];
  getNeraiuchiResults: [{ eventId: string; cursor?: string; aroundSelf?: true }, NeraiuchiPage<NeraiuchiResultRow>];
  claimNeraiuchiPrize: [{ eventId: string; choice: "points" | "shipping" }, { entry: NeraiuchiRevealedEntry }];
};

export async function callNeraiuchi<K extends keyof Api>(name: K, data: Api[K][0]): Promise<Api[K][1]> {
  const call = httpsCallable<Api[K][0], Api[K][1]>(functions, name, { timeout: 120000 });
  return (await call(data)).data;
}

export const availabilityLabels = {
  upcoming: "受付前", open: "受付中", ended: "期限終了",
  full: "参加上限に到達", closed: "受付終了", disabled: "新規参加停止中",
} as const;
