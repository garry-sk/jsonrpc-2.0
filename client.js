'use strict';

const { JsonRpcServerError, JsonRpcClientError } = require('./errors');

/// Client

const { URL } = require('url');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

function doRequest(body, requestParams) {
	let proto;
	switch (requestParams.protocol) {
		case 'http:': proto = http; break;
		case 'https:': proto = https; break;
		default: throw new TypeError(`Protocol "${protocol}" not supported. Expected "http" or "https:"`); // 'ERR_INVALID_PROTOCOL'
	}
	return new Promise((resolve, reject) => {
		const req = proto.request(requestParams, res => {
			const buf = [];
			if (400 <= res.statusCode) {
				res.destroy();
				reject(`${res.statusCode} - ${res.statusMessage}`);
				return;
			}
			res.on('data', chunk => buf.push(chunk))
			.on('end', () => {
				resolve(buf.join(''));
			})
			.on('error', err => reject(err));
		})
		if (requestParams.method == 'POST') {
			req.write(body, 'utf-8');
		}
		req.end();
		req.on('error', err => reject(err));
	});
}

function createDefaultTPClient(url, opts = {}) {
	if (typeof url == 'string' || url instanceof URL) {
		url = new URL(url);

		Object.assign(opts, {
			protocol: url.protocol,
			host: url.hostname, port: url.port,
			path: url.pathname + url.search
		});
	} else {
		opts = url;
	}

	let client;
	switch (opts.protocol) {
		case 'http:': client = http; break;
		case 'https:': client = https; break;
		default: throw new TypeError(`Protocol "${protocol}" not supported. Expected "http" or "https:"`); // 'ERR_INVALID_PROTOCOL'
	}

	return {
		request: async (body, requestParams) => {
			requestParams = Object.assign({}, opts, requestParams);
			if (!requestParams.method)
				requestParams.method = !body ? 'GET' : 'POST';
			return new Promise((resolve, reject) => {
				const req = client.request(requestParams, res => {
					const buf = [];
					if (400 <= res.statusCode) {
						res.destroy();
						reject(`${res.statusCode} - ${res.statusMessage}`);
						return;
					}
					res.on('data', chunk => buf.push(chunk))
					.on('end', () => {
						resolve(buf.join(''));
					})
					.on('error', err => reject(err));
				})
				if (body && !["GET", "HEAD", "CONNECT", "OPTIONS", "TRACE"].includes(requestParams.method)) {
					req.write(JSON.stringify(body), 'utf-8');
				}
				req.end();
				req.on('error', err => reject(err));
			});
		}
	}
}

module.exports = exports = {
	bareClient: (url, opts) => {
		let tpClient; // transport protocol client
		if (url && typeof url.request == "function") {
			tpClient = url;
		} else {
			opts.headers = Object.assign({
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			}, opts.headers);

			opts.rejectUnauthorized = !(opts.rejectUnauthorized === false)

			tpClient = createDefaultTPClient(url, opts);
		}

		if (tpClient == null) {
			throw new TypeError(`Parameter 'url' is invalid`);
		}

		const idPrefix = crypto.randomFillSync(Buffer.alloc(10)).toString('hex');
		let idCounter = 1;

		const createId = () => `${idPrefix}-${idCounter++}`;

		return {
			call: async (method, ...params) => {
				const id = createId();
				const reqObj = { "jsonrpc": "2.0", method, params, id };
				const body = await tpClient.request(reqObj, { method: "POST" });
				if (!body)
					throw new JsonRpcClientError('E_JSONRPC20_INVALID_RESPONSE');

				let res;
				try {
					res = typeof body == 'string' || Buffer.isBuffer(body) ? JSON.parse(body) : body;
				} catch (err) {
					throw new JsonRpcClientError('E_JSONRPC20_RESPONSE_PARSE_ERROR', err.message);
				}

				if (res.error) {
					throw new JsonRpcServerError(res.error.code, res.error.message);
				} else if (res.result !== undefined) {
					if (id != res.id) {
						throw new JsonRpcClientError('E_JSONRPC20_MISMATCHED_IDS');
					}
					return res.result;
				}

				throw new JsonRpcClientError('E_JSONRPC20_INVALID_RESPONSE');
			},

			notify: async (method, ...params) => {
				const reqObj = { "jsonrpc": "2.0", method, params };
				const body = await tpClient.request(reqObj, { method: "POST" });
				if (!body)
					return;

				let res;
				try {
					res = typeof body == 'string' || Buffer.isBuffer(body) ? JSON.parse(body) : body;
				} catch (err) {
					throw new JsonRpcClientError('E_JSONRPC20_RESPONSE_PARSE_ERROR', err.message);
				}

				if (res.error) {
					throw new JsonRpcServerError(res.error.code, res.error.message);
				}

				throw new JsonRpcClientError('E_JSONRPC20_INVALID_RESPONSE');
			},

			batch: () => {
				const batchArray = [];
				const _batch = {
					call: (method, ...params) => {
						const id = createId();
						const reqObj = { "jsonrpc": "2.0", method, params, id };
						batchArray.push(reqObj);
						return _batch;
					},

					notify: (method, ...params) => {
						const reqObj = { "jsonrpc": "2.0", method, params };
						batchArray.push(reqObj);
						return _batch;
					},

					do: async () => {
						const body = await tpClient.request(batchArray, { method: "POST" });
						if (!body)
							return;

						const result = [];
						let res;
						try {
							res = typeof body == 'string' || Buffer.isBuffer(body) ? JSON.parse(body) : body;
						} catch (err) {
							throw new JsonRpcClientError('E_JSONRPC20_RESPONSE_PARSE_ERROR', err.message);
						}

						if (Array.isArray(res)) {
							for (const r of res) {
								if (r.jsonrpc !== '2.0' || (!r.error && !r.result)) {
									result.push(new JsonRpcClientError('E_JSONRPC20_INVALID_RESPONSE'))
									continue;
								}
								if (r.error) {
									result.push(new JsonRpcServerError(r.error.code, r.error.message, r.id))
									continue;
								}
								result.push(r.result);
							}
						} else if (res.error) {
							throw new JsonRpcServerError(res.error.code, res.error.message);
						} else {
							throw new JsonRpcClientError('E_JSONRPC20_INVALID_RESPONSE');
						}

						return result;
					}
				};

				return _batch;
			}
		};
	},

	client: async (url, opts = {}) => {
		let tpClient; // transport protocol client

		if (url && typeof url.request == "function") {
			tpClient = url;
		} else {
			opts.headers = Object.assign({
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			}, opts.headers);

			opts.rejectUnauthorized = !(opts.rejectUnauthorized === false)

			tpClient = createDefaultTPClient(url, opts);
		}

		const client = exports.bareClient(tpClient);
		try {

			const headers = Object.assign({
				'Accept': 'application/json'
			}, opts.headers);
	
			const body = await tpClient.request(null, { method: "GET", headers });

			const ads = typeof body == 'string' || Buffer.isBuffer(body) ? JSON.parse(body) : body;
			for (const item of ads) {
				if (['call', 'notify', 'batch'].includes(item.name))
					continue;
				const method = item.name;
				// const fn = Function(...item.params, `return this.call('${method}', ${item.params.join(',')})`);
				// client[method] = fn.bind(client);
				client[method] = (...args) => client.call(method, ...args);
			}
		} catch(err) {}
		return client;
	}
}
