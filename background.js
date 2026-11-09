chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'play') return false
  fetch('http://127.0.0.1:8000/api/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fen: message.fen,
      depth: 10,
      sans: Array.isArray(message.sans) ? message.sans.slice(0, 512) : [],
    }),
  })
    .then(async (response) => {
      const body = await response.json().catch(() => ({}))
      sendResponse({ ok: response.ok, body })
    })
    .catch(() => {
      sendResponse({ ok: false, body: { detail: 'Start the analyzer API with run.bat. Cursor can stay closed.' } })
    })
  return true
})
