const assert = require('assert').strict
const url = require('url')
const http = require('http')
const https = require('https')
const lodash = require('lodash')
const ms = require('ms')
const { makeHTTPRequest } = require('./http')
const qup = require('./qup')

class BitcoindRPC {
  constructor (endpoint, concurrency = 1, batchSize = 64) {
    this.concurrency = concurrency
    this.batchSize = batchSize
    this.getNextRequestId = 0
    this.opts = this.urlToOptions(endpoint)
    this.call = qup((items) => this.batch(items), concurrency, batchSize)
  }

  urlToOptions (urlRPC) {
    const urlOpts = url.parse(urlRPC)

    const options = {
      protocol: urlOpts.protocol,
      hostname: urlOpts.hostname,
      port: urlOpts.port !== '' && parseInt(urlOpts.port, 10),
      method: 'POST',
      path: urlOpts.pathname,
      headers: { 'Content-Type': 'application/json' },
      agent: { http, https }[urlOpts.protocol.slice(0, -1)].globalAgent
    }
    options.hostport = `${options.hostname}:${options.port}`

    let auth = urlOpts.auth
    if (!auth && (urlOpts.username || urlOpts.password)) auth = `${urlOpts.username}:${urlOpts.password}`
    if (auth) options.headers.Authorization = 'Basic ' + Buffer.from(auth).toString('base64')

    return options
  }

  // designed for working special with qup
  async batch (items) {
    try {
      for (const item of items) item.id = this.getNextRequestId++

      const data = await makeHTTPRequest(this.opts, JSON.stringify(items))
      const batch = JSON.parse(data)
      if (!Array.isArray(batch)) throw new Error(JSON.stringify(batch))

      const itemsById = lodash.keyBy(items, 'id')
      for (const { result, error, id } of batch) {
        const { resolve, reject } = itemsById[id]
        if (error) reject(Object.assign(new Error(error.message || error.code), { code: error.code }))
        else if (result === undefined) reject(new TypeError('Missing RPC result'))
        else resolve(result)
      }
    } catch (e) {
      if (e.message === 'Internal server error') {
        return this.batch(items)
      }
      throw e
    }
  }

  async getChainInfo () {
    const args = { method: 'getblockchaininfo', params: [], id: 0 }
    const reqOpts = { ...this.opts, timeout: ms('1s') }
    await makeHTTPRequest(reqOpts, JSON.stringify(args))
  }

  getNetworkInfo () {
    return this.call('getnetworkinfo')
  }

  async getBlockHash (number) {
    try {
      return await this.call('getblockhash', number)
    } catch (err) {
      if (err.code === -8) return null
      throw err
    }
  }

  async getBlock (hash) {
    return await this.call('getblock', hash, true)
  }

  async getBlockByHash1 (hash, coin, chain) {
    const block = await this.call('getblock', hash, true)

    // For some reason bitcoinsv won't respond with the genesis block coinbase tx
    // It shows it in the rest json block, but responds with not found when getting the tx hash
    if (coin === 'bitcoinsv') {
      block.tx = block.tx.filter((txid) => txid !== '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b')
    }

    block.tx = await Promise.all(block.tx.map(async (txid) => {
      const tx = await this.getTransaction(txid)
      assert(tx, `tx ${txid} for block ${hash} not found`)
      return tx
    }))

    let txids = block.tx.filter(({ blockhash }) => blockhash !== hash).map(({ txid }) => txid)

    // See issue: https://github.com/ExodusMovement/magnifier/issues/13
    if (coin === 'bitcoinsv' && chain === 'main') {
      txids = txids.filter((txid) => {
        return txid !== 'd5d27987d2a3dfc724e359870c6644b40e497bdc0589a033220fe15429d88599' && txid !== 'e3bf3d07d4b0375638d5f1db5255fe07ba2c4cb067cd81b84ee974b6585fb468'
      })
    }

    if (txids.length === 0) return block

    throw Error(`block hash mismatch between txs: ${txids.join(',')} and for block ${hash}`)
  }

  async getBlockByHash2 (hash) {
    return this.call('getblock', hash, 2)
  }

  async getTransaction (txid) {
    try {
      return await this.call('getrawtransaction', txid, 1)
    } catch (err) {
      if (err.code === -5) return null
      throw err
    }
  }

  async sendRawTx (hex) {
    return this.call('sendrawtransaction', hex, true)
  }

  async getStatus () {
    const [
      blockchainInfo,
      mempoolInfo,
      miningInfo,
      networkInfo
    ] = await Promise.all([
      this.call('getblockchaininfo'),
      this.call('getmempoolinfo'),
      this.call('getmininginfo'),
      this.call('getnetworkinfo')
    ])
    return { blockchainInfo, mempoolInfo, miningInfo, networkInfo }
  }

  getMempool () {
    return this.call('getrawmempool', true)
  }

  generate (number) {
    return this.call('generate', number)
  }
}

module.exports = BitcoindRPC
