import {
  createBoardDefinition,
  createClassicBoard,
  createClassicRuleset,
  simulateClassicGame,
} from "../packages/game-core/dist/index.js";

const gamesArgument = process.argv.find((argument) => argument.startsWith("--games="));
const games = gamesArgument ? Number(gamesArgument.split("=")[1]) : 200;
const shortcutsArgument = process.argv.find((argument) =>
  argument.startsWith("--shortcuts="),
);
const shortcutsEnabled = shortcutsArgument
  ? shortcutsArgument.split("=")[1] !== "false"
  : true;

if (!Number.isInteger(games) || games <= 0) {
  throw new Error("--games must be a positive whole number.");
}

const playerIds = ["red", "yellow", "blue", "green"];
const completeBoard = createClassicBoard();
const board = shortcutsEnabled
  ? completeBoard
  : createBoardDefinition(
      Object.values(completeBoard.nodes),
      Object.values(completeBoard.routes),
    );
const ruleset = createClassicRuleset();
const results = Array.from({ length: games }, (_, seed) =>
  simulateClassicGame({ seed, playerIds, board, ruleset }),
);

const turns = results.map((result) => result.turnCount).sort((a, b) => a - b);
const actions = results
  .map((result) => result.actionCount)
  .sort((a, b) => a - b);
const wins = Object.fromEntries(
  playerIds.map((playerId) => [
    playerId,
    results.filter((result) => result.winnerId === playerId).length,
  ]),
);

console.log(
  JSON.stringify(
    {
      games,
      shortcutsEnabled,
      turns: summarize(turns),
      actions: summarize(actions),
      wins,
    },
    null,
    2,
  ),
);

function summarize(values) {
  return {
    mean: Math.round(values.reduce((total, value) => total + value, 0) / values.length),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.at(-1),
  };
}

function percentile(values, percentileValue) {
  return values[Math.floor((values.length - 1) * percentileValue)];
}
