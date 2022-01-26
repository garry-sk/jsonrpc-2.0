'use strict';

const { JsonRpcServerError } = require('./errors');

/// Server

const AllParamsRE = /^\s*function\s*(?:[^\(\s])*\s*\(([^\)]*)\)\s*{|^\s*\(([^\)]*)\)\s*=>|^\s*([^,\(\)\s]+)\s*=>/;
const ParamsRE = 	/[^\s,]+/g;

async function _parseReqBody(req) {
	return new Promise((resolve, reject) => {
		const buf = [];
		req.on('data', chunk => buf.push(chunk));
		req.on('end', () => {
			const body = Buffer.concat(buf).toString('utf-8');
			try {
				req.body = JSON.parse(body);
				resolve();
			} catch(err) {
				reject(err);
			}
			
		});
		req.on('error', err => {
			reject(err);
		});
	});
}

class JsonRpcResult {
	constructor (result, id) {
		this.result = result;
		this.id = id;
	}

	toJSON() {
		return { jsonrpc: "2.0", result: this.result, id: this.id };
	}
}

const SymADS = Symbol.for("rpc:api.description");

module.exports = exports = function (url, app) {

	const methods = {};
	let adsCashe;

	async function reqHandler(res) {
		const req = this;
		let errMsg;

		if (req.body == null) {
			try {
				await _parseReqBody(req);
			} catch(err) {
				errMsg = err.message || err;
			}
		}

		if (!req.body) {
			res.json(new JsonRpcServerError('E_JSONRPC20_PARSE_ERROR'), errMsg);
			return;
		}

		const isBatch = Array.isArray(req.body);
		const body = isBatch ? req.body : [req.body];

		let result = [];
		const calls = [];

		function calMethod(item, idx) {
			let notification = false;
			return new Promise((resolve, reject) => {
				let methodName = item.method;
				if (item.jsonrpc !== '2.0' ||
				    typeof methodName !== 'string' ||
				    !(Array.isArray(item.params) || Object.getPrototypeOf(item.params) === Object.prototype)
				) {
					reject(new JsonRpcServerError('E_JSONRPC20_INVALID_REQUEST'));
					return;
				}
				const id = item.id;
				notification = id === undefined;
				if (!methods[methodName]) {
					if (Symbol.keyFor(SymADS) == methodName) {
						methodName = SymADS;
					} else {
						reject(new JsonRpcServerError('E_JSONRPC20_METHOD_NOT_FOUND', methodName, id));
						return;
					}
				}

				const params = item.params || [];

				try {
					const c = methods[methodName](...params);
					if (c instanceof Promise) {
						c.then(r => resolve([id, r]));
					} else {
						resolve([id, c]);
					}
				} catch(err) {
					const errMsg = err.message || err;
					reject(new  JsonRpcServerError('E_JSONRPC20_INTERNAL_ERROR', errMsg, id));
				}
			})
			.then(([id, res]) => {
				if (notification) {
					return;
				}

				result[idx] = new JsonRpcResult(res, id);
			})
			.catch(err => {
				if (notification) {
					return;
				}

				result[idx] = err;
			});
		}

		for (const idx in body) {
			calls.push(calMethod(body[idx], idx));
		}

		return Promise.all(calls)
		.then(() => {
			if (result.length == 0) {
				res.statusCode = 200;
				res.end();
				return; // Nothing is returned for all notification batches
			}
			if (!isBatch) {
				result = result[0];
			} else if (body.length == 0) {
				result = new JsonRpcServerError('E_JSONRPC20_INVALID_REQUEST');
			} else {
				result = result.filter(item => item !== undefined);
			}
			res.json(result);
		});
	}

	function jsonrpc20(req, res, next) {
		if (!req.jsonrpc)
			req.jsonrpc = reqHandler.bind(req);
		next();
	}
	
	/**
	 * add([name,] fn)
	 * @param {String} name имя метода. Если не указано, используется имя функции (`fn`)
	 * @param {Function} fn функция. Если функция анонимная и не указан `name` - ошибка
	 * 
	 * add(func)
	 * add('f', func)
	 * add('af', a => a)
	 * add(func1, func2, ['cnfunc', func3], ['afunc', a => a], ...)
	 * add('f1', func1, func2, 'f3', func3)
	 */
	jsonrpc20.add = (...args) => {
		let fn, name;
		const meths = {};

		while (args.length) {
			if (typeof args[0] == 'string' || args[0] == SymADS) {
				name = args[0];
				fn = args[1];
				args.shift();
				args.shift();
			} else if (typeof args[0] == 'function') {
				fn = args[0];
				name = fn.name;
				args.shift();
			} else if (Array.isArray(args[0])) {
				name = args[0][0];
				fn = args[0][1];
				args.shift();
			}

			if (typeof fn === 'function' && !!name) {
				meths[name] = fn;
				continue;
			}

			let errMsg;
			if (typeof fn != 'function') {
				errMsg = `expected a 'function' but received '${typeof fn}'`;
				if (name)
					errMsg += ` for method '${name}'`
			} else { // !name
				errMsg = `'name' must be specified for anonimous function '${fn}'`;
			}
			throw new TypeError(`Invalid argument: ${errMsg}`);
		}

		if (meths.length > 0)
			adsCashe = undefined;
		Object.assign(methods, meths);
	};

	/**
	 * API description structure
	 */
	 jsonrpc20.apiDescription = () => {
		if (adsCashe)
			return adsCashe;
		adsCashe = [];
		for (const name in methods) {
			const fn = `${methods[name]}`;
			const params = [];
			let allFnParams = fn.match(AllParamsRE);
			allFnParams = allFnParams && (allFnParams[1] || allFnParams[2] || allFnParams[3] || '').trim();
			if (allFnParams) {
				const paramsArray = allFnParams.match(ParamsRE);
				if (paramsArray) {
					for (const p of paramsArray) {
						params.push(p);
					}
				}
			}
			adsCashe.push({name, params});
		}
		return adsCashe;
	}

	jsonrpc20.add(SymADS, jsonrpc20.apiDescription);
	
	const setEndpoints = (url, app) => {
		app.get(url, (req, res, next) => {
			res.json(jsonrpc20.apiDescription());
		});
		app.use(jsonrpc20);
		app.post(url, (req, res, next) => {
			req.jsonrpc(res)
			.catch(err => {
				next(err);
			});
		});
	}

	if (!url || !app) {
		jsonrpc20.setEndpoints = setEndpoints;
	} else {
		setEndpoints(url, app);
	}

	return jsonrpc20;
}
