// Inspired by https://github.com/dcousens/qup
module.exports = function (fn, concurrency, batchSize) {
  let running = 0
  const queue = []

  // method `getblock` always executed in own batch
  function getBatchSize () {
    let size = 1
    for (const maxSize = Math.min(queue.length, batchSize); size < maxSize; ++size) {
      if (queue[size - 1].method === 'getblock') break
    }
    if (size > 1 && queue[size - 1].method === 'getblock') size -= 1
    return size
  }

  async function pulse () {
    if (running >= concurrency || queue.length === 0) return

    try {
      running += 1

      const batch = queue.splice(0, getBatchSize())
      await fn(batch).catch((err) => {
        for (const { reject } of batch) {
          try { reject(err) } catch (err) {}
        }
      })
    } finally {
      running -= 1
      process.nextTick(pulse) // prevent Maximum call stack size
    }
  }

  return async function (method, ...params) {
    return new Promise((resolve, reject) => {
      queue.push({ method, params, resolve, reject })
      pulse()
    })
  }
}
