/* Shared by the static app, the solver checks, and browser tests. */
const KnightTour = (() => {
  const puzzles = Object.freeze([
    { id: 1, title: 'はじめの一歩', badge: 'ウォーミングアップ', rows: 3, columns: 4, blocked: [], start: 0, closed: false },
    { id: 2, title: '小さな寄り道', badge: 'ひと工夫', rows: 4, columns: 4, blocked: [0, 3], start: 5, closed: false },
    { id: 3, title: '先を見ながら', badge: '試行錯誤', rows: 5, columns: 4, blocked: [0, 3, 4, 7], start: 1, closed: false },
    { id: 4, title: '道をつなごう', badge: 'じっくり挑戦', rows: 5, columns: 4, blocked: [0, 3], start: 4, closed: false },
    { id: 5, title: 'はじまりのそばへ', badge: 'ラストチャレンジ', rows: 5, columns: 4, blocked: [0, 3], start: 4, closed: true }
  ].map(puzzle => Object.freeze({ ...puzzle, blocked: Object.freeze(puzzle.blocked),
    cells: Object.freeze(Array.from({ length: puzzle.rows * puzzle.columns }, (_, i) => i).filter(i => !puzzle.blocked.includes(i))),
    total: puzzle.rows * puzzle.columns - puzzle.blocked.length
  })));
  const getPuzzle = id => puzzles.find(puzzle => puzzle.id === id);
  function isKnightMove(from, to, puzzle = puzzles[0]) {
    if (![from, to].every(value => Number.isInteger(value) && puzzle.cells.includes(value))) return false;
    const dr = Math.abs(Math.floor(from / puzzle.columns) - Math.floor(to / puzzle.columns));
    const dc = Math.abs(from % puzzle.columns - to % puzzle.columns);
    return dr * dc === 2;
  }
  function legalMoves(path, puzzle = puzzles[0]) {
    return puzzle.cells.filter(i => !path.includes(i) && isKnightMove(path[path.length - 1], i, puzzle));
  }
  function createGame(id = 1, savedPath) {
    const puzzle = getPuzzle(id);
    if (!puzzle) throw new RangeError('Unknown puzzle');
    let path = [puzzle.start];
    // Restore only an entirely legal path; malformed storage cannot create a win.
    if (Array.isArray(savedPath) && savedPath.length > 0 && savedPath.length <= puzzle.total && savedPath[0] === puzzle.start) {
      const restored = [puzzle.start];
      for (const cell of savedPath.slice(1)) {
        if (!legalMoves(restored, puzzle).includes(cell)) break;
        restored.push(cell);
      }
      if (restored.length === savedPath.length) path = restored;
    }
    return {
      puzzle,
      get path() { return [...path]; },
      get moves() { return legalMoves(path, puzzle); },
      get allVisited() { return path.length === puzzle.total; },
      get complete() { return path.length === puzzle.total && (!puzzle.closed || isKnightMove(path[path.length - 1], puzzle.start, puzzle)); },
      move(to) { if (!legalMoves(path, puzzle).includes(to)) return false; path.push(to); return true; },
      undo() { if (path.length === 1) return false; path.pop(); return true; },
      restart() { path = [puzzle.start]; }
    };
  }
  return { puzzles, getPuzzle, isKnightMove, legalMoves, createGame };
})();
if (typeof module !== 'undefined') module.exports = KnightTour;
