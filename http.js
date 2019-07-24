const http = require('http')

function makeHTTPRequest (opts, data) {
  return new Promise((resolve, reject) => {
    const req = new http.ClientRequest(opts)
    req.on('error', reject)
    req.on('timeout', () => {
      req.abort()
      reject(new Error('Timeout error'))
    })
    req.on('response', (resp) => {
      if (resp.statusCode !== 200) {
        let msg = `"${resp.statusMessage}" is not OK.`
        switch (resp.statusCode) {
          case 401: msg = 'Unauthorized'; break
          case 404: msg = 'Not found'; break
          case 500: msg = 'Internal server error'; break
        }

        return reject(new Error(msg))
      }

      const chunks = []
      resp.on('data', (chunk) => chunks.push(chunk))
      resp.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8')
          resolve(body)
        } catch (err) {
          reject(err)
        }
      })
    })

    req.end(data)
  })
}

module.exports = {
  makeHTTPRequest
}
