const assert = require('node:assert/strict');
const fs = require('node:fs');
const rules = require('../game.js');
const storage = require('../storage.js');
const { analyze } = require('../scripts/explore.cjs');

// Coordinate validation is independent of the production move implementation.
function validJump(a, b, puzzle) {
  if (![a, b].every(i => Number.isInteger(i) && i >= 0 && i < puzzle.rows * puzzle.columns && !puzzle.blocked.includes(i))) return false;
  const delta = [Math.abs(Math.floor(a / puzzle.columns) - Math.floor(b / puzzle.columns)), Math.abs(a % puzzle.columns - b % puzzle.columns)].sort();
  return delta[0] === 1 && delta[1] === 2;
}
assert.deepEqual({ rows: rules.puzzles[0].rows, columns: rules.puzzles[0].columns, blocked: rules.puzzles[0].blocked, start: rules.puzzles[0].start },
  { rows: 3, columns: 4, blocked: [], start: 0 }, 'Puzzle 1 must remain unchanged');
assert.equal(rules.puzzles.length, 5);
const results = [];
for (const puzzle of rules.puzzles) {
  const result = analyze({ ...puzzle, name: `PUZZLE ${puzzle.id}` });
  assert.equal(result.exhaustive, true);
  assert.ok(result.solution, `Puzzle ${puzzle.id} needs a complete solution`);
  results.push({ id: puzzle.id, ...result });
  for (let a = -1; a <= puzzle.rows * puzzle.columns; a++) for (let b = -1; b <= puzzle.rows * puzzle.columns; b++) {
    assert.equal(rules.isKnightMove(a, b, puzzle), validJump(a, b, puzzle));
  }
  const path = result.solution;
  assert.equal(path[0], puzzle.start);
  assert.equal(path.length, puzzle.total);
  assert.equal(new Set(path).size, puzzle.total);
  assert.ok(path.every(i => puzzle.cells.includes(i)));
  path.slice(1).forEach((cell, i) => assert.ok(validJump(path[i], cell, puzzle)));
  if (puzzle.closed) assert.ok(validJump(path.at(-1), path[0], puzzle));

  const game = rules.createGame(puzzle.id);
  assert.equal(game.undo(), false);
  for (const illegal of [puzzle.start, -1, puzzle.rows * puzzle.columns, 1.5, NaN, '6', ...puzzle.blocked]) assert.equal(game.move(illegal), false);
  for (const cell of path.slice(1)) {
    assert.equal(game.complete, false, 'No early wins');
    assert.equal(game.move(cell), true);
  }
  assert.equal(game.complete, true);
  assert.deepEqual(game.moves, []);
  assert.equal(game.move(puzzle.start), false, 'No extra move back onto a visited start');
  assert.equal(game.undo(), true);
  assert.equal(game.complete, false);
  assert.equal(game.move(path.at(-1)), true);
  assert.equal(rules.createGame(puzzle.id, game.path).complete, true);
  game.restart();
  assert.deepEqual(game.path, [puzzle.start]);
  assert.equal(game.complete, false);
  assert.equal(game.move(path[1]), true);
  assert.equal(game.move(puzzle.start), false);
  assert.deepEqual(rules.createGame(puzzle.id, game.path).path, game.path);
  // Reject bad storage paths, including duplicates, blocked cells and wrong starts.
  for (const invalid of [[], null, {}, [99], [puzzle.start, 99], [puzzle.start, path[1], puzzle.start], [puzzle.start, ...puzzle.blocked, 99]]) {
    assert.deepEqual(rules.createGame(puzzle.id, invalid).path, [puzzle.start]);
  }
  if (puzzle.closed) {
    assert.ok(result.nonClosingPath, 'Include a full route that fails the return condition');
    game.restart();
    for (const cell of result.nonClosingPath.slice(1)) assert.equal(game.move(cell), true);
    assert.equal(game.allVisited, true);
    assert.equal(game.complete, false, 'Visiting every cell alone is insufficient for Puzzle 5');
    assert.equal(rules.createGame(puzzle.id, game.path).complete, false);
    assert.equal(game.undo(), true);
  }
  // Exercise production undo at every reachable leaf, not only the happy path.
  let deadEnds = 0, wins = 0;
  game.restart();
  function explore() {
    const before = game.path;
    if (!game.moves.length) {
      if (game.complete) wins++;
      else deadEnds++;
      assert.equal(game.undo(), true);
      assert.ok(game.moves.includes(before.at(-1)));
      assert.equal(game.move(before.at(-1)), true);
    }
    for (const next of game.moves) {
      assert.equal(game.move(next), true);
      explore();
      assert.equal(game.undo(), true);
      assert.deepEqual(game.path, before);
    }
  }
  explore();
  assert.equal(wins, result.solutions);
  assert.equal(deadEnds, result.deadEnds);
  console.log(`PASS Puzzle ${puzzle.id}: ${puzzle.total} cells, ${wins} solutions, ${deadEnds} recoverable dead ends${puzzle.closed ? ', return jump verified' : ''}`);
}
// Puzzle 3 has an early choice which is still playable but cannot reach a win.
const third = rules.getPuzzle(3);
const earlyTrap = [1, 8, 14, 5];
assert.deepEqual(rules.createGame(3, earlyTrap).path, earlyTrap);
assert.ok(rules.legalMoves(earlyTrap, third).length > 0);
function canFinish(path) {
  if (path.length === third.total) return true;
  return rules.legalMoves(path, third).some(next => canFinish([...path, next]));
}
assert.equal(canFinish(earlyTrap), false);
// Deterministic storage checks, including corrupt data and unavailable storage.
const memory = new Map();
const fakeStorage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
const snapshot = { currentId: 3, cleared: [1, 2], paths: { 1: results[0].solution, 3: results[2].solution.slice(0, 5) } };
assert.equal(storage.save(fakeStorage, snapshot), true);
assert.deepEqual(storage.load(fakeStorage).data, { ...snapshot, version: 1 });
fakeStorage.setItem(storage.key, '{invalid');
assert.equal(storage.load(fakeStorage).data, null);
fakeStorage.setItem(storage.key, '{"version":99}');
assert.equal(storage.load(fakeStorage).data, null);
assert.equal(storage.save(undefined, snapshot), false);
assert.equal(storage.load(undefined).data, null);
fs.writeFileSync('tests/selected-results.json', JSON.stringify(results, null, 2) + '\n');
console.log('PASS: restoration, corrupted storage, storage unavailable; selected-results.json refreshed');
