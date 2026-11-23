export type QuestFlag = "public" | "limited" | "subscriber" | "nibuichi_winner" | "x_account_match";
export type QuestGroup = "top" | "upper" | "middle" | "lower";
export type QuestRules = {
  boardVersion: "quest-board-v2";
  maxTurns: 14;
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
    mode: "schedule" | "daily" | "admin";
    releaseAt: number[];
    dailyStartHourJst: number;
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
export type QuestState = {
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
  id: string; version: number; state: "draft" | "published" | "settling" | "archived";
  summary?: QuestSummary;
};
export type QuestPlayer = QuestState & {
  publicId: string; displayName: string; normalGranted: number; rescueGranted: number;
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
};
