'use strict';

const { setProperty } = require('njscu');

/**
 * Sets error codes and messages to the error object
 * @param {Object} errObj error object
 * @param {Object} errNoPool `errno` pool start value
 * @param {Object} defCode default `code`
 * @param {Array} errDecriptions array of error descriptions
 */
 function _defineError(errObj, errNoPool, defCode, errDecriptions) {
	const	defMessages = {};
	const defErrNo = new Map();
	for (let [errCode, errMsg, errNo] of errDecriptions) {
		errNo = errNo !== undefined ? errNo : errNoPool++;
		setProperty(errObj, errCode, errNo);
		setProperty(defMessages, errCode, errMsg);
		defErrNo.set(errNo, errCode);
	}
	setProperty(errObj, '_defMessages', defMessages);
	setProperty(errObj, '_defCode', defCode);
	setProperty(errObj, '_defErrNo', defErrNo);
}

/**
 * JsonRpcError
 * @inherits Error
 * @note errNo pool = [1000, 1099)
 */
 class JsonRpcError extends Error {
	/**
	 * constructor
	 * @param {Srting} [code] error code or error no
	 * @param {Number} [no] 
	 * @param {String} [msg] error message (default: depends on error code and class)
	 */
	constructor(code, msg, eo) {
		eo = eo || JsonRpcError;
		code = code || eo._defCode || JsonRpcError._defCode;
		let no;
		if (typeof code === 'number') {
			no = code;
			code = eo._defErrNo.get(no);
		}
		code = code || eo._defCode || JsonRpcError._defCode;
		if (no == null) {
			no = eo[code] || eo[eo._defCode];
		}
		const defMsg =
			eo._defMessages[code] || JsonRpcError._defMessages[code] ||
			eo._defMessages[eo._defCode] || JsonRpcError._defMessages[JsonRpcError._defCode];
		msg = !msg ? `${defMsg}`
			: msg.startsWith(defMsg) ? msg : `${defMsg}: ${msg}`;
		super(msg);

		setProperty(this, 'name', eo.name, 0b010);
		setProperty(this, 'code', code, 0b010);
		setProperty(this, 'no', no, 0b010);
	}
}

_defineError(JsonRpcError, -32000, 'E_JSONRPC20', [
	[ 'E_JSONRPC20', 'Json RPC 2.0 protocol error', -32000 ]
]);

/**
 * JsonRpcServerError
 * @inherits JsonRpcError
 * @note errNo pool = [1500, 1599)
 */
 class JsonRpcServerError extends JsonRpcError {
	/**
	 * constructor
	 * @param {*} [code] - error code defined for `ServiceManagerError` (default: 'E_JSONRPC20')
	 * @param {*} [msg] - error message (default: depends on error code)
	 * @param {*} [id] - request/response id 
	 * @param {*} [data] - additional error information
	 */
	constructor(code, msg, id = null, data) {
		super(code, msg, JsonRpcServerError);
		setProperty(this, 'id', id, 0b010);
		setProperty(this, 'data', data, 0b010);
	}

	toJSON() {
		return { jsonrpc: "2.0", error: { code: this.no, message: this.message, data: this.data }, id: this.id };
	}
}

_defineError(JsonRpcServerError, -32099, 'E_JSONRPC20', [
	// server-defined errors
	[ 'E_JSONRPC20_АPPLICATION_ERROR', 'Аpplication error' ], // Errors that occur in the application. Additional information about the error is passed in the 'data' field.
	// pre-defined errors
	[ 'E_JSONRPC20_INVALID_REQUEST', 'Invalid Request', -32600 ], // The JSON sent is not a valid Request object.
	[ 'E_JSONRPC20_METHOD_NOT_FOUND', 'Method not found', -32601 ], // The method does not exist / is not available.
	[ 'E_JSONRPC20_INVALID_PARAMS', 'Invalid params', -32602 ], // Invalid method parameter(s).
	[ 'E_JSONRPC20_INTERNAL_ERROR', 'Internal error', -32603 ], // Internal JSON-RPC error.
	[ 'E_JSONRPC20_PARSE_ERROR', 'Parse error', -32700 ], // Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.
	// [ '', '', ],
]);

/**
 * JsonRpcClientError
 * @inherits JsonRpcError
 * @note errNo pool = [1500, 1599)
 */
 class JsonRpcClientError extends JsonRpcError {
	/**
	 * constructor
	 * @param {*} [code] - error code defined for `ServiceManagerError` (default: 'ERR_SVCM')
	 * @param {*} [msg] - error message (default: depends on error code)
	 */
	constructor(code, msg) {
		super(code, msg, JsonRpcClientError);
	}
}

_defineError(JsonRpcClientError, -31000, 'E_JSONRPC20_CLIENT', [
	[ 'E_JSONRPC20_INVALID_RESPONSE', 'Invalid response', -31600], // The JSON sent is not a valid Response object.
	[ 'E_JSONRPC20_MISMATCHED_IDS', 'Mmismatched IDs', -31601], // Mismatched request and response IDs
	[ 'E_JSONRPC20_RESPONSE_PARSE_ERROR', 'Response parse error', -31700], // Invalid JSON was received by the client. An error occurred on the client while parsing the JSON text.
	// [ '', '', ],
]);


module.exports = exports = { JsonRpcError, JsonRpcServerError, JsonRpcClientError };
