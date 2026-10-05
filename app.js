(() => {
  let storage;
  try { storage = window.localStorage; } catch { /* Play remains available without storage. */ }
  const saved = KnightProgress.load(storage).data;
  const games = new Map(KnightTour.puzzles.map(puzzle => [puzzle.id, KnightTour.createGame(puzzle.id, saved?.paths?.[puzzle.id])]));
  const cleared = new Set(Array.isArray(saved?.cleared) ? saved.cleared.filter(id => KnightTour.getPuzzle(id)) : []);
  for (const [id, game] of games) if (game.complete) cleared.add(id);
  let currentId = KnightTour.getPuzzle(saved?.currentId) ? saved.currentId : 1;
  let game = games.get(currentId);
  const board = document.querySelector('#board');
  const status = document.querySelector('#status');
  const undo = document.querySelector('#undo');
  const restart = document.querySelector('#restart');
  const next = document.querySelector('#next');
  const previous = document.querySelector('#previous');
  const selection = document.querySelector('#puzzle-selection');
  let cells = [];
  const choices = KnightTour.puzzles.map(puzzle => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'puzzle-choice';
    button.dataset.puzzle = puzzle.id;
    button.addEventListener('click', () => selectPuzzle(puzzle.id));
    selection.append(button);
    return button;
  });
  function save() {
    const success = KnightProgress.save(storage, {
      currentId, cleared: [...cleared], paths: Object.fromEntries([...games].map(([id, state]) => [id, state.path]))
    });
    document.querySelector('#save-note').textContent = success
      ? '進み具合は、このブラウザーに自動保存されます。'
      : 'このブラウザーでは保存できません。画面を閉じると進み具合が失われます。';
  }
  function buildBoard() {
    const puzzle = game.puzzle;
    board.replaceChildren();
    board.style.gridTemplateColumns = `repeat(${puzzle.columns}, minmax(0, 1fr))`;
    board.setAttribute('aria-label', `${puzzle.rows}行${puzzle.columns}列、${puzzle.total}マスのパズル盤面`);
    cells = [];
    for (let index = 0; index < puzzle.rows * puzzle.columns; index++) {
      if (puzzle.blocked.includes(index)) {
        const gap = document.createElement('div');
        gap.className = 'board-gap';
        gap.setAttribute('aria-hidden', 'true');
        board.append(gap);
        continue;
      }
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.dataset.cell = index;
      cell.addEventListener('click', () => {
        if (game.move(index)) render();
      });
      board.append(cell);
      cells.push({ cell, index });
    }
    document.querySelector('#puzzle-number').textContent = `PUZZLE ${String(puzzle.id).padStart(2, '0')}`;
    document.querySelector('#puzzle-title').textContent = puzzle.title;
    document.querySelector('#puzzle-badge').textContent = puzzle.badge;
    document.querySelector('#total').textContent = ` / ${puzzle.total}`;
    const closedRule = document.querySelector('#closed-rule');
    closedRule.hidden = !puzzle.closed;
    document.querySelector('#shape-note').hidden = !puzzle.blocked.length;
    render();
  }
  function selectPuzzle(id) {
    if (!games.has(id)) return;
    currentId = id;
    game = games.get(id);
    buildBoard();
    document.querySelector('#puzzle-title').focus({ preventScroll: true });
    document.querySelector('.puzzle').scrollIntoView({ block: 'start' });
  }
  function render() {
    const puzzle = game.puzzle;
    const path = game.path;
    const current = path[path.length - 1];
    const moves = game.moves;
    cells.forEach(({ cell, index }) => {
      const order = path.indexOf(index) + 1;
      const active = index === current;
      const available = moves.includes(index);
      const markStart = puzzle.closed && index === puzzle.start;
      cell.className = 'cell' + (order ? ' visited' : '') + (active ? ' current' : '') + (available ? ' available' : '') + (markStart ? ' start-cell' : '');
      // aria-disabled preserves focus after a tap; the game rejects illegal moves.
      cell.setAttribute('aria-disabled', String(!available));
      cell.setAttribute('aria-label', `${Math.floor(index / puzzle.columns) + 1}行${index % puzzle.columns + 1}列、${markStart ? 'スタート地点、' : ''}${active ? `現在地、${order}番目` : order ? `通過済み、${order}番目` : available ? '移動できます' : '未訪問、今は移動できません'}`);
      cell.innerHTML = (active ? `<span class="visit-number">${order}</span><span class="knight" aria-hidden="true">♞</span>` : order ? `<span>${order}</span>` : available ? '<span class="move-dot" aria-hidden="true"></span>' : '')
        + (markStart ? '<span class="start-label" aria-hidden="true">START</span>' : '');
    });
    document.querySelector('#count').textContent = path.length;
    const progress = document.querySelector('#progress');
    progress.max = puzzle.total;
    progress.value = path.length;
    progress.textContent = `${path.length} / ${puzzle.total}`;
    undo.disabled = path.length === 1;
    restart.disabled = path.length === 1;
    status.className = 'status' + (game.complete ? ' success' : !moves.length ? ' stuck' : '');
    status.innerHTML = game.complete
      ? `<strong>✦ クリア！ おみごと。</strong><span>${puzzle.total}マスすべてをめぐりました。${puzzle.closed ? '<br>スタートへも、あと1手で戻れます！' : ''}</span>`
      : game.allVisited && puzzle.closed
        ? '<strong>全マス到達！ あとひと工夫。</strong><span>ここからはスタートへ1手で戻れません。<br>「1手戻る」で、終わる位置を変えてみよう。</span>'
        : !moves.length
          ? '<strong>ここで、ひと休み。</strong><span>「1手戻る」で、別の道を探してみよう。</span>'
          : `<strong>緑のマスへ、ジャンプ。</strong><span>あと${puzzle.total - path.length}マス。${moves.length}か所に移動できます。</span>`;
    if (game.complete) cleared.add(currentId);
    next.hidden = !game.complete || currentId === KnightTour.puzzles.length;
    previous.disabled = currentId === 1;
    choices.forEach((button, index) => {
      const id = index + 1;
      const done = cleared.has(id);
      button.classList.toggle('cleared', done);
      if (id === currentId) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      button.setAttribute('aria-label', `第${id}問 ${KnightTour.getPuzzle(id).title}${done ? '、クリア済み' : ''}${id === currentId ? '、選択中' : ''}`);
      button.innerHTML = `<span>${String(id).padStart(2, '0')}</span><small>${done ? '✓ クリア' : '未クリア'}</small>`;
    });
    document.querySelector('#clear-count').textContent = `${cleared.size} / 5 クリア`;
    document.querySelector('#all-clear').hidden = cleared.size !== 5;
    save();
  }
  undo.addEventListener('click', () => { game.undo(); render(); });
  restart.addEventListener('click', () => { game.restart(); render(); });
  next.addEventListener('click', () => { if (game.complete) selectPuzzle(currentId + 1); });
  previous.addEventListener('click', () => selectPuzzle(currentId - 1));
  buildBoard();
})();
