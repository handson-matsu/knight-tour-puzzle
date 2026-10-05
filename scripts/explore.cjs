// Reproducible exhaustive search. No application dependency or random sampling.
const fs = require('node:fs');
function analyze({name, rows, columns, blocked = [], start = 0, closed = false}, limit = 3000000) {
  const cells = Array.from({length: rows * columns}, (_, i) => i).filter(i => !blocked.includes(i));
  const neighbors = Array.from({length: rows * columns}, (_, a) => cells.filter(b => {
    const r = Math.abs(Math.floor(a / columns) - Math.floor(b / columns));
    const c = Math.abs(a % columns - b % columns);
    return (r === 1 && c === 2) || (r === 2 && c === 1);
  }));
  let nodes = 0, solutions = 0, fullPaths = 0, deadEnds = 0, branches = 0, maxChoices = 0;
  let successProbability = 0, deadDepth = 0, solution = null, nonClosingPath = null, deadPath = null;
  const used = new Set([start]), path = [start];
  let truncated = false;
  function search(probability) {
    if (++nodes > limit) { truncated = true; return; }
    if (path.length === cells.length) {
      fullPaths++;
      if (!closed || neighbors[path.at(-1)].includes(start)) {
        solutions++; successProbability += probability; solution ??= [...path];
      } else { nonClosingPath ??= [...path]; deadEnds++; deadDepth += path.length; }
      return;
    }
    const moves = neighbors[path.at(-1)].filter(n => !used.has(n));
    if (!moves.length) { deadEnds++; deadDepth += path.length; deadPath ??= [...path]; }
    if (moves.length > 1) branches++;
    maxChoices = Math.max(maxChoices, moves.length);
    for (const next of moves) {
      if (truncated) break;
      used.add(next); path.push(next); search(probability / moves.length); path.pop(); used.delete(next);
    }
  }
  search(1);
  // Probability under a simple look-ahead: choose the exit with the fewest
  // remaining onward moves, excluding immediate dead ends where possible.
  function carefulWalk(route, visited) {
    if (route.length === cells.length) return !closed || neighbors[route.at(-1)].includes(start) ? 1 : 0;
    const choices = neighbors[route.at(-1)].filter(n => !visited.has(n));
    if (!choices.length) return 0;
    const degree = n => neighbors[n].filter(v => !visited.has(v)).length;
    const viable = route.length === cells.length - 1 ? choices : choices.filter(n => degree(n) > 0);
    if (!viable.length) return 0;
    const minimum = Math.min(...viable.map(degree));
    const preferred = viable.filter(n => degree(n) === minimum);
    return preferred.reduce((sum, next) => sum + carefulWalk([...route, next], new Set([...visited, next])), 0) / preferred.length;
  }
  const carefulSuccessPercent = +(carefulWalk([start], new Set([start])) * 100).toFixed(5);
  return {name, rows, columns, blocked, start, closed, cells: cells.length, nodes, exhaustive: !truncated,
    solutions, fullPaths, deadEnds, branches, maxChoices,
    carefulSuccessPercent, successPercent: +(successProbability * 100).toFixed(5), meanDeadDepth: +(deadDepth / (deadEnds || 1)).toFixed(2),
    solution, nonClosingPath, deadPath};
}
const candidates = [
  {name:'3x4',rows:3,columns:4,starts:[0,1,4]},
  {name:'3x5',rows:3,columns:5,starts:[0,2,6]},
  {name:'4x4 minus top corners',rows:4,columns:4,blocked:[0,3],starts:[1,4,5]},
  {name:'4x4 minus opposite corners',rows:4,columns:4,blocked:[0,15],starts:[1,3,5]},
  {name:'4x4 minus all corners',rows:4,columns:4,blocked:[0,3,12,15],starts:[1,5]},
  {name:'5x4 minus all corners',rows:5,columns:4,blocked:[0,3,16,19],starts:[1,4,5,8]},
  {name:'5x4 narrow top',rows:5,columns:4,blocked:[0,3,4,7],starts:[1,5,8]},
  {name:'5x4',rows:5,columns:4,starts:[0,1,5,8]},
  {name:'5x4 minus top corners',rows:5,columns:4,blocked:[0,3],starts:[1,4,5]},
  {name:'5x4 minus opposite corners',rows:5,columns:4,blocked:[0,19],starts:[1,4,5]},
  {name:'5x5',rows:5,columns:5,starts:[0,2,6,12]},
  {name:'5x5 minus center',rows:5,columns:5,blocked:[12],starts:[0,1,6],closed:true},
  {name:'5x4 minus top corners closed',rows:5,columns:4,blocked:[0,3],starts:[1,4],closed:true},
  {name:'6x5 closed',rows:6,columns:5,starts:[0,6],closed:true},
];
if (require.main === module) {
 const results = candidates.flatMap(({starts,...candidate}) => starts.map(start => analyze({...candidate,start})));
 fs.writeFileSync('tests/candidate-results.json', JSON.stringify(results,null,2)+'\n');
 console.table(results.map(({name,start,cells,exhaustive,solutions,fullPaths,deadEnds,branches,maxChoices,successPercent,carefulSuccessPercent,meanDeadDepth})=>({name,start,cells,exhaustive,solutions,fullPaths,deadEnds,branches,maxChoices,successPercent,carefulSuccessPercent,meanDeadDepth})));
}
module.exports = {analyze};
