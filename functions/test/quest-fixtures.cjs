module.exports.rules = {
  boardVersion: "quest-board-v2", maxTurns: 14, stepStarPoints: 1,
  levelPoints: 12, levelScore: 2, percentMax: 80, percentDecimals: 1,
  middleMin: 52, upperMin: 64, topMinProgress: 61, topMinLevel: 6,
  distribution: { mode: "admin", releaseAt: [], dailyStartHourJst: 6 },
  rescue: { enabled: true, adminEnabled: true, eventSources: ["nibuichi", "neraiuchi"],
    fromTurn: 12, belowScore: 52, maxGrants: 1, simulationRate: 0.1, simulationTurn: 14 },
};
