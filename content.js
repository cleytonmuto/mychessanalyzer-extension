const INSET = 64 / 648

const state = {
  fen: null,
  playerColor: null,
  finished: false,
  auto: true,
  busy: false,
  note: 'Waiting for the Duolingo match.',
}

const script = document.createElement('script')
script.src = chrome.runtime.getURL('page-hook.js')
script.async = false
script.onload = () => script.remove()
document.documentElement.appendChild(script)

chrome.storage.local.get('duoAuto', (stored) => {
  if (typeof stored.duoAuto === 'boolean') state.auto = stored.duoAuto
  render()
})

const panel = document.createElement('section')
panel.id = 'mychessanalyzer-duo'
panel.innerHTML = `
  <strong>mychessanalyzer</strong>
  <p class="note"></p>
  <button type="button"></button>
`
const style = document.createElement('style')
style.textContent = `
  #mychessanalyzer-duo {
    position: fixed;
    z-index: 2147483646;
    left: 16px;
    bottom: 16px;
    width: 240px;
    padding: 12px 14px;
    border-radius: 12px;
    background: #16262c;
    color: #e7f1f6;
    font: 600 14px Outfit, "Segoe UI", sans-serif;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  #mychessanalyzer-duo strong { display: block; margin-bottom: 6px; }
  #mychessanalyzer-duo .note { margin: 0 0 10px; font-weight: 500; line-height: 1.35; }
  #mychessanalyzer-duo button {
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
const mount = () => document.body.appendChild(panel)
if (document.body) mount()
else document.addEventListener('DOMContentLoaded', mount)

panel.querySelector('button').addEventListener('click', () => {
  state.auto = !state.auto
  chrome.storage.local.set({ duoAuto: state.auto })
  state.note = state.auto ? 'Playing when it is your turn.' : 'Paused.'
  render()
  if (state.auto) void consider()
})

function render() {
  const note = panel.querySelector('.note')
  const button = panel.querySelector('button')
  if (!note || !button) return
  note.textContent = state.note
  button.textContent = state.auto ? 'Pause' : 'Play'
}

function sideToMove(fen) {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white'
}

function ourTurn() {
  if (!state.fen || !state.playerColor || state.finished) return false
  const color = state.playerColor.toLowerCase()
  const playingBlack = color === 'black' || color === 'b'
  const playingWhite = color === 'white' || color === 'w'
  const turn = sideToMove(state.fen)
  return (playingBlack && turn === 'black') || (playingWhite && turn === 'white')
}

function playingBlack() {
  const color = (state.playerColor || '').toLowerCase()
  return color === 'black' || color === 'b'
}

function findCanvas() {
  return [...document.querySelectorAll('canvas')]
    .filter((canvas) => {
      const box = canvas.getBoundingClientRect()
      if (box.width < 200 || box.height < 200) return false
      if (Math.abs(box.width / box.height - 1) > 0.2) return false
      return getComputedStyle(canvas).pointerEvents !== 'none'
    })
    .sort((left, right) => {
      const a = left.getBoundingClientRect()
      const b = right.getBoundingClientRect()
      return b.width * b.height - a.width * a.height
    })[0] ?? null
}

function pointFor(canvas, square) {
  const box = canvas.getBoundingClientRect()
  const insetX = box.width * INSET
  const insetY = box.height * INSET
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1])
  const flipped = playingBlack()
  const column = flipped ? 7 - file : file
  const row = flipped ? rank - 1 : 8 - rank
  const width = box.width - insetX * 2
  const height = box.height - insetY * 2
  return {
    x: box.left + insetX + (column + 0.5) * width / 8,
    y: box.top + insetY + (row + 0.5) * height / 8,
  }
}

function press(canvas, point) {
  const base = { bubbles: true, cancelable: true, composed: true, clientX: point.x, clientY: point.y, button: 0, view: window }
  canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }))
  canvas.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }))
  canvas.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }))
  canvas.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }))
  canvas.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }))
}

function promotionHeading() {
  return [...document.querySelectorAll('div, p, span, h2, h3')].find((element) => {
    const text = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('')
    return /promo/i.test(text)
  }) ?? null
}

function rowOfFour(row) {
  const choices = [...row.children].filter((element) => {
    const box = element.getBoundingClientRect()
    return box.width >= 24 && box.height >= 24 && box.width <= 160
  })
  if (choices.length !== 4) return null
  const tops = choices.map((element) => element.getBoundingClientRect().top)
  if (Math.max(...tops) - Math.min(...tops) > 24) return null
  return choices.sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left)
}

function promotionChoices() {
  let container = promotionHeading()?.parentElement ?? null
  for (let depth = 0; depth < 6 && container; depth += 1, container = container.parentElement) {
    const direct = rowOfFour(container)
    if (direct) return direct
    for (const row of container.querySelectorAll('div, ul')) {
      const choices = rowOfFour(row)
      if (choices) return choices
    }
  }
  return null
}

async function choosePromotion(letter) {
  const index = { q: 0, r: 1, b: 2, n: 3 }[letter] ?? 0
  const deadline = Date.now() + 2500
  while (Date.now() < deadline) {
    const choices = promotionChoices()
    const choice = choices?.[index]
    if (choice) {
      const box = choice.getBoundingClientRect()
      const point = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      press(choice, point)
      choice.click()
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('The promotion piece could not be chosen.')
}

async function clickMove(uci) {
  const canvas = findCanvas()
  if (!canvas) throw new Error('The Duolingo board is not on the screen.')
  press(canvas, pointFor(canvas, uci.slice(0, 2)))
  await new Promise((resolve) => setTimeout(resolve, 180))
  press(canvas, pointFor(canvas, uci.slice(2, 4)))
  if (uci.length > 4) await choosePromotion(uci[4])
}

async function consider() {
  if (!state.auto || state.busy || !ourTurn()) return
  const fen = state.fen
  state.busy = true
  state.note = 'Stockfish is choosing the move.'
  render()
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'play', fen })
    if (!reply?.ok) {
      const detail = reply?.body?.detail
      throw new Error(typeof detail === 'string' ? detail : 'The analyzer API did not return a move.')
    }
    const move = reply.body
    if (state.fen !== fen) return
    state.note = `Playing ${move.san}.`
    render()
    await clickMove(move.uci)
  } catch (caught) {
    state.note = caught instanceof Error ? caught.message : 'The move could not be played.'
    if (state.note.includes('Failed to fetch') || state.note.includes('run.bat')) {
      state.note = 'Start the analyzer API with run.bat. Cursor can stay closed.'
    }
  } finally {
    state.busy = false
    render()
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== 'mychessanalyzer') return
  const previous = state.fen
  state.fen = event.data.fen
  state.playerColor = event.data.playerColor
  state.finished = Boolean(event.data.finished)
  if (state.finished) {
    state.note = 'The match is over.'
    render()
    return
  }
  if (!state.playerColor) {
    state.note = 'Waiting to learn which color you play.'
    render()
    return
  }
  if (!ourTurn()) {
    state.note = 'Waiting for Duolingo.'
    render()
    return
  }
  if (previous === state.fen && state.busy) return
  state.note = 'Your turn.'
  render()
  void consider()
})
