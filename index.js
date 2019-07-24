const BitcoinRPC = require('./rpc')
const bitcore = require('bitcore-lib-cash')

const endpoint = 'http://bitcoinrpc:password@localhost:8332'
const rpc = new BitcoinRPC(endpoint)

const fee = 1e4
const num = 3
const script = '76a914579b0fd9454feb21824ebd4d2450fc8925ffb77d88ac'

const addOutputs = (tx, addr, amount) => {
	const outputAmount = Math.floor(amount / num - fee / num)
	for (let i = 0; i < num; i++) {
		tx.to(addr, outputAmount)
	}
}

const createTxs = async (txid, privateKey, amount, outs = num) => {
	const addr = privateKey.toAddress()
	const txids = []
	for (let i = 0; i < outs; i++) {
		const utxo = {
			txid,
			outputIndex: i,
			script,
			satoshis: amount
		}
		const tx = new bitcore.Transaction().from(utxo)

		addOutputs(tx, addr, amount)

		tx.sign(privateKey)
		const newTxid = await rpc.sendRawTx(tx.serialize())
		txids.push(newTxid)
	}
	return txids
}

const run = async () => {

	const result = await rpc.call('getwalletinfo')
	console.log('CHAIN INFO', result)
	await rpc.call('importprivkey', 'cVujGAG1azxv3otuezS2gafGR6YwXv4iujA25NMBZJWeYcSdusaZ')
	console.log('Imported')
	await rpc.generate(1000)
	console.log('Generated')
	await rpc.call('sendtoaddress', 'bchreg:qptekr7eg487kgvzf6756fzsljyjtlah05a6gsq93l', 14350)
	console.log('Sent')
	await rpc.call('sendtoaddress', 'bchreg:qptekr7eg487kgvzf6756fzsljyjtlah05a6gsq93l', 14350)
	console.log('Sent')
	const first = await rpc.call('sendtoaddress', 'bchreg:qptekr7eg487kgvzf6756fzsljyjtlah05a6gsq93l', 14350)
	console.log('Sent again', first)
	await rpc.generate(1)
	console.log('Generated')

	const privateKey = new bitcore.PrivateKey('cVujGAG1azxv3otuezS2gafGR6YwXv4iujA25NMBZJWeYcSdusaZ')
	let amount = 14350e8

	let txids = [first]
	for (let i = 0; i < 500; i++) {
		const currTxids = [...txids]
		txids = []
		const nextAmount = amount 
		for (txid of currTxids) {
			if (i === 0) {
				const newTxids = await createTxs(txid, privateKey, amount, 1)
				txids = txids.concat(newTxids)
			} else {
				const newTxids = await createTxs(txid, privateKey, amount)
				txids = txids.concat(newTxids)
			}
		}
		amount = Math.floor(amount / num - fee / num)
		console.log("AMOUNT", amount)
		console.log("SENT", txids.length)
		if (i % 5 === 0) {
			const [ blockHash ] = await rpc.generate(1)
			const block = await rpc.getBlock(blockHash)
			console.log("BLOCK SIZE", block.size)
		}
	}
}

run()
