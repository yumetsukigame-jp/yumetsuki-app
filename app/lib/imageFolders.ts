export const GACHA_REGULAR_FOLDER = "gacha/regular";
export const GACHA_EVENT_FOLDER = "gacha/event";
export const LEGACY_GACHA_FOLDER = "gacha";

export const IMAGE_FOLDER_OPTIONS = [
  { value: GACHA_REGULAR_FOLDER, label: "ガチャ（レギュラー）" },
  { value: GACHA_EVENT_FOLDER, label: "ガチャ（イベント）" },
  { value: "banners", label: "banners" },
  { value: "icons", label: "icons" },
  { value: "questicon", label: "questicon" },
  { value: "character-select", label: "character-select" },
  { value: "rewards", label: "rewards" },
  { value: "memories", label: "memories" },
  { value: "orica", label: "orica" },
  { value: "quiz", label: "quiz" },
  { value: "misc", label: "misc" },
] as const;

export const isRegularGachaFolder = (folder: unknown) =>
  folder === GACHA_REGULAR_FOLDER || folder === LEGACY_GACHA_FOLDER;

export const isEventGachaFolder = (folder: unknown) =>
  folder === GACHA_EVENT_FOLDER;

export const isGachaFolder = (folder: unknown) =>
  isRegularGachaFolder(folder) || isEventGachaFolder(folder);

export const normalizeImageFolder = (folder: unknown) =>
  folder === LEGACY_GACHA_FOLDER
    ? GACHA_REGULAR_FOLDER
    : typeof folder === "string"
      ? folder
      : GACHA_REGULAR_FOLDER;
