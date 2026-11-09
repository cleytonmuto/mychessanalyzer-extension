const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const START_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'

const state = {
  auto: true,
  busy: false,
  note: 'Waiting for a chess.com computer game.',
  tries: { key: '', count: 0 },
}

chrome.storage.local.get('comAuto', (stored) => {
  if (typeof stored.comAuto === 'boolean') state.auto = stored.comAuto
  render()
})

const panel = document.createElement('section')
panel.id = 'mychessanalyzer-com'
panel.innerHTML = `
  <strong>mychessanalyzer</strong>
  <p class="note"></p>
  <button type="button"></button>
`
const style = document.createElement('style')
style.textContent = `
  #mychessanalyzer-com {
    position: fixed;
    z-index: 2147483646;
    left: 16px;
    bottom: 16px;
    width: 260px;
    padding: 12px 14px;
    border-radius: 12px;
    background: #16262c;
    color: #e7f1f6;
    font: 600 14px Outfit, "Segoe UI", sans-serif;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  #mychessanalyzer-com strong { display: block; margin-bottom: 6px; }
  #mychessanalyzer-com .note { margin: 0 0 10px; font-weight: 500; line-height: 1.35; }
  #mychessanalyzer-com button {
    border: 0;
    border-radius: 8px;
    padding: 6px 10px;
    background: #c5d6e2;
    color: #142126;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
`
document.documentElement.appendChild(style)
document.body.appendChild(panel)

panel.querySelector('button').addEventListener('click', () => {
  state.auto = !state.auto
  state.tries = { key: '', count: 0 }
  chrome.storage.local.set({ comAuto: state.auto })
  state.note = state.auto ? 'Playing when it is your turn.' : 'Paused.'
  render()
  if (state.auto) void tick()
})

function render() {
  const note = panel.querySelector('.note')
  const button = panel.querySelector('button')
  if (!note || !button) return
  note.textContent = state.note
  button.textContent = state.auto ? 'Pause' : 'Play'
}

function onComputerPage() {
  return location.hostname === 'www.chess.com' && location.pathname.startsWith('/play/computer')
}

function boardEl() {
  return document.querySelector('wc-chess-board') || document.querySelector('chess-board')
}

function readSans() {
  const moves = []
  for (const row of document.querySelectorAll('wc-simple-move-list .main-line-row')) {
    for (const color of ['white-move', 'black-move']) {
      const text = row.querySelector(`.node.${color} .node-highlight-content`)?.textContent?.trim()
      if (text) moves.push(text)
    }
  }
  return moves
}

function playerColor() {
  const bottom = document.querySelector('.clock-bottom')
  if (bottom?.classList.contains('clock-white') || bottom?.querySelector('.clock-white')) return 'w'
  if (bottom?.classList.contains('clock-black') || bottom?.querySelector('.clock-black')) return 'b'
  const board = boardEl()
  if (!board) return null
  return board.classList.contains('flipped') ? 'b' : 'w'
}

function bottomHasTurn() {
  const bottom = document.querySelector('.clock-bottom')
  if (!bottom) return null
  return bottom.classList.contains('clock-player-turn') || Boolean(bottom.querySelector('.clock-player-turn'))
}

function fenFromPieces(turn) {
  const board = boardEl()
  const grid = Array.from({ length: 8 }, () => Array(8).fill('1'))
  if (board) {
    for (const piece of board.querySelectorAll('.piece')) {
      const type = [...piece.classList].find((name) => /^[wb][pnbrqk]$/.test(name))
      const square = [...piece.classList].find((name) => /^square-\d{2}$/.test(name))
      if (!type || !square) continue
      const file = Number(square[7]) - 1
      const rank = Number(square[8])
      if (file < 0 || file > 7 || rank < 1 || rank > 8) continue
      grid[8 - rank][file] = type[0] === 'w' ? type[1].toUpperCase() : type[1]
    }
  }
  const placement = grid.map((row) => row.join('').replace(/1+/g, (run) => String(run.length))).join('/')
  const has = (selector) => Boolean(board?.querySelector(selector))
  let castle = ''
  if (has('.piece.wk.square-51') && has('.piece.wr.square-81')) castle += 'K'
  if (has('.piece.wk.square-51') && has('.piece.wr.square-11')) castle += 'Q'
  if (has('.piece.bk.square-58') && has('.piece.br.square-88')) castle += 'k'
  if (has('.piece.bk.square-58') && has('.piece.br.square-18')) castle += 'q'
  return `${placement} ${turn} ${castle || '-'} - 0 1`
}

function pointFor(square) {
  const board = boardEl()
  if (!board) return null
  const box = board.getBoundingClientRect()
  if (box.width < 200) return null
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1])
  const flipped = board.classList.contains('flipped')
  const column = flipped ? 7 - file : file
  const row = flipped ? rank - 1 : 8 - rank
  return {
    x: box.left + (column + 0.5) * box.width / 8,
    y: box.top + (row + 0.5) * box.height / 8,
  }
}

function press(target, point) {
  const base = { bubbles: true, cancelable: true, composed: true, clientX: point.x, clientY: point.y, button: 0, view: window }
  target.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }))
  target.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }))
  target.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }))
  target.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }))
  target.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }))
}

async function clickMove(uci) {
  const board = boardEl()
  if (!board) throw new Error('The chess.com board is not on the screen.')
  const from = pointFor(uci.slice(0, 2))
  const to = pointFor(uci.slice(2, 4))
  if (!from || !to) throw new Error('The chess.com board is not on the screen.')
  press(board, from)
  await new Promise((resolve) => setTimeout(resolve, 180))
  press(board, to)
  if (uci.length <= 4) return
  await new Promise((resolve) => setTimeout(resolve, 400))
  const names = { q: ['queen', 'wq', 'bq'], r: ['rook', 'wr', 'br'], b: ['bishop', 'wb', 'bb'], n: ['knight', 'wn', 'bn'] }
  const wanted = names[uci[4]] ?? names.q
  const choice = [...document.querySelectorAll('.promotion-piece')].find((element) => {
    const label = [...element.classList, element.getAttribute('aria-label') || ''].join(' ').toLowerCase()
    return wanted.some((name) => label.includes(name))
  })
  if (!choice) return
  const box = choice.getBoundingClientRect()
  press(choice, { x: box.left + box.width / 2, y: box.top + box.height / 2 })
}

function waitForMoves(previous) {
  return new Promise((resolve) => {
    const started = Date.now()
    const timer = window.setInterval(() => {
      const changed = readSan().join(' ') !== previous
      if (changed || Date.now() - started > 2000) {
        window.clearInterval(timer)
        resolve(changed)
      }
    }, 200)
  })
}

async function play(key, sans, turn, fromPieces) {
  state.busy = true
  state.note = 'Stockfish is choosing the move.'
  render()
  const attempt = state.tries.key === key ? state.tries.count : 0
  try {
    const side = fromPieces ? playerColor() || turn : turn
    const placement = fenFromPieces(side).split(' ')[0]
    const custom = fromPieces || (sans.length === 0 && placement !== START_PLACEMENT)
    let reply = await chrome.runtime.sendMessage({
      type: 'play',
      fen: custom ? fenFromPieces(side) : START_FEN,
      sans: custom ? [] : sans,
    })
    if (!reply?.ok && sans.length && !fromPieces) {
      reply = await chrome.runtime.sendMessage({ type: 'play', fen: fenFromPieces(side), sans: [] })
    }
    if (!reply?.ok) {
      const detail = reply?.body?.detail
      throw new Error(typeof detail === 'string' ? detail : 'The analyzer API did not return a move.')
    }
    if (readSan().join(' ') !== key) return
    const move = reply.body
    state.note = `Playing ${move.san}.`
    render()
    await clickMove(move.uci)
    const landed = await waitForMoves(key)
    state.tries = landed ? { key: '', count: 0 } : { key, count: attempt + 1 }
    if (!landed) state.note = 'Chess.com did not register the click.'
  } catch (caught) {
    state.note = caught instanceof Error ? caught.message : 'The move could not be played.'
    if (state.note.includes('run.bat')) {
      state.note = 'Start the analyzer API with run.bat. Cursor can stay closed.'
    }
    state.tries = { key, count: attempt + 1 }
  } finally {
    state.busy = false
    render()
  }
}

async function tick() {
  if (!onComputerPage()) {
    state.note = 'Open a game at chess.com/play/computer.'
    render()
    return
  }
  if (document.querySelector('.game-over-modal-header-component')) {
    state.note = 'The game is over.'
    render()
    return
  }
  if (!boardEl() || !document.querySelector('.clock-bottom')) {
    state.note = 'Start a game against a computer.'
    render()
    return
  }
  const sans = readSan()
  const turn = sans.length % 2 === 0 ? 'w' : 'b'
  const color = playerColor()
  const clockTurn = bottomHasTurn()
  const ours = turn === color
  if (!state.auto) {
    state.note = 'Paused.'
    render()
    return
  }
  const listBehind = clockTurn === true && !ours
  if (listBehind && !state.staleSince) state.staleSince = Date.now()
  if (!listBehind) state.staleSince = 0
  if (clockTurn === false || (clockTurn === null && !ours) || (listBehind && Date.now() - state.staleSince < 1200)) {
    state.note = listBehind ? 'Waiting for the board to update.' : 'Waiting for the computer.'
    render()
    return
  }
  const key = sans.join(' ')
  if (state.busy || (state.tries.key === key && state.tries.count >= 2)) {
    if (!state.busy && state.tries.count >= 2) state.note = 'Chess.com did not register the click.'
    render()
    return
  }
  state.note = 'Your turn.'
  render()
  await play(key, sans, turn, listBehind)
}

window.setInterval(() => {
  if (!state.busy) void tick()
}, 800)
render()
