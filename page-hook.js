(() => {
  let playerColor = null

  function publish(data) {
    const match = data && data.match && data.match.boardFen ? data.match : data && data.boardFen ? data : null
    if (!match || typeof match.boardFen !== 'string') return
    if (typeof match.playerColor === 'string') playerColor = match.playerColor
    window.postMessage(
      {
        source: 'mychessanalyzer',
        fen: match.boardFen,
        playerColor,
        finished: Boolean(match.endCondition) || match.status === 'finished',
      },
      '*',
    )
  }

  function watch(url, read) {
    if (typeof url !== 'string' || !/chess/i.test(url)) return
    read()
      .then((data) => publish(data))
      .catch(() => {})
  }

  const originalFetch = window.fetch
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args)
    const target = args[0]
    const url = typeof target === 'string' ? target : target?.url || response.url || ''
    watch(url, () => response.clone().json())
    return response
  }

  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__analyzerUrl = String(url ?? '')
    return originalOpen.call(this, method, url, ...rest)
  }
  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__analyzerUrl
    if (typeof url === 'string' && /chess/i.test(url)) {
      this.addEventListener('load', () => {
        try {
          const data = this.responseType === 'json' ? this.response : JSON.parse(this.responseText)
          publish(data)
        } catch {
          // The chess response was not JSON.
        }
      })
    }
    return originalSend.apply(this, args)
  }
})()
