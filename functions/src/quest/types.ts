export type QuestFlag = "public" | "limited" | "subscriber" | "nibuichi_winner" | "x_account_match";
export type QuestGroup = "top" | "upper" | "middle" | "lower";
export type QuestRules = {
  boardVersion: "quest-board-v2" | "quest-board-v3";
  maxTurns: number;
  psaLimit?: number;
  stepStarPoints: number;
  levelPoints: number;
  levelScore: number;
  percentMax: number;
  percentDecimals: number;
  middleMin: number;
  upperMin: number;
  topMinProgress: number;
  topMinLevel: number;
  distribution: {
    mode: "schedule" | "daily" | "interval" | "admin";
    releaseAt: number[];
    dailyStartHourJst: number;
    intervalHours?: number;
    intervalCount?: number;
  };
  rescue: {
    enabled: boolean;
    adminEnabled: boolean;
    eventSources: ("neraiuchi" | "nibuichi")[];
    fromTurn: number;
    belowScore: number;
    maxGrants: number;
    simulationRate: number;
    simulationTurn: number;
  };
};
export type QuestPending = { kind: "branch"; steps: number } | { kind: "shortcut"; steps: 0 };
export type QuestStep = { from: string; to: string; kind: "walk" | "return" | "warp" | "stage" };
export type QuestTrace = { steps: QuestStep[]; rewards: { label: string; points: number; tileId: string }[] };
export type QuestState = {
  psaFragments?: number;
  psaCollectedTiles?: string[];
  psaReserved?: boolean;
  psaTicketIssued?: boolean;
  visitedPaths?: QuestStep[];
  lastTrace?: QuestTrace;
  tileId: string;
  starPoints: number;
  level: number;
  score: number;
  used: number;
  version: number;
  originalRolls: number[];
  pending: QuestPending | null;
  branch: "bridge" | "flower" | null;
  loopSteps: number;
  effects: string[];
  reachedStages: number[];
  rescueCredits: number;
  rescueUsed: boolean;
  shortcut: "tracking" | "missed" | "offered" | "used" | "declined";
  souvenirs: string[];
  lastDie: number | null;
};
export type QuestResult = {
  tileId: string; level: number; score: number; naturalGroup: QuestGroup; group: QuestGroup;
  used: number; souvenirs: string[]; rescueUsed: boolean;
};
export type QuestDraft = {
  title: string; description: string; thumbnail: string; startsAt: number; endsAt: number;
  publicFlags: QuestFlag[]; xAccountList: string[]; accessCode: string;
  rules: QuestRules;
};
export type QuestPublicRun = Omit<QuestDraft, "xAccountList" | "accessCode"> & {
  id: string; version: number; state: "draft" | "published" | "settling" | "archived" | "deleting";
  adminReleased?: number;
  psaRemaining?: number;
  summary?: QuestSummary;
};
export type QuestPlayer = QuestState & {
  publicId: string; displayName: string; normalGranted: number; rescueGranted: number;
  bulkGranted?: number;
  result: QuestResult | null; eligibleAt: number; eligibility: QuestFlag[];
};
export type QuestProgress = {
  id: string; displayName: string; tileId: string; level: number; used: number; score: number; rank?: number;
};
export type QuestSummary = {
  total: number; groups: Record<QuestGroup, number>;
  completed: number; completedGroups: Record<QuestGroup, number>; stages: Record<string, number>;
};
export type QuestAction = "roll" | "bridge" | "flower" | "shortcut-use" | "shortcut-skip" | "rescue";
export type QuestSimulation = {
  trials: number; policy: "bridge" | "flower" | "mixed"; shortcutUse: boolean;
  groups: Record<QuestGroup, number>; stage3: number; stage4: number; shortcutOffered: number;
  rescued: number;
  psaTickets?: Record<QuestGroup, number>;
};
