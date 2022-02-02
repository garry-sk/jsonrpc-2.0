'use strict';

const chai = require('chai');
chai.use(require("chai-as-promised"));
const { expect } = chai;
chai.should();

const http = require('http');
const express = require('express');
const jsonrpc = require('../');
const { JsonRpcError, JsonRpcServerError, JsonRpcClientError } = jsonrpc;

class FakeTPClient {
	constructor(options) {}
	async request(data, options = {}) {
		switch (data.method) {
			case 'body_null':
				return null;
				case 'body_empty':
					return '';
			case 'body_buffer': 
				return Buffer.from('buffer');
			case 'mismatched_ids':
				return { result: 0, id: 0 };
			case 'invalid_response':
				return { id: 0 };
		}

		if (Array.isArray(data)) {
			return Buffer.from(JSON.stringify([
				0,
				{ jsonrpc: "2.0", result: 1, id: 0 },
				{ jsonrpc: "2.0", result: 2, id: 0 },
			]));
		}

		return;
	}
}

describe('njs-jsonrpc-2.0', function() {
	let app, srv, rpcServer, rpcClient, apiUrl;

	before(function() {
		app = express();
		app.use(express.json());
		rpcServer = jsonrpc.server('/api/?', app);
  });

	describe('client-server', () => {
		it('create async client (fail)', async () => {
			rpcClient = await jsonrpc.client(new URL('https://127.0.0.0'), { rejectUnauthorized: false });
		});
		it('call request', () => {
			return Promise.all([
				expect(rpcClient.call('miss_func_1')).to.eventually.be.rejectedWith(Error, "connect ETIMEDOUT 127.0.0.0:443"),
			]);
		});
		it('create client (fail)', done => {
			rpcClient = jsonrpc.bareClient(new FakeTPClient());
			done();
		});
		it('call requests', () => {
			return Promise.all([
				expect(rpcClient.call('')).to.eventually.be.rejectedWith(JsonRpcClientError, "Invalid response"),
				expect(rpcClient.call('body_null')).to.eventually.be.rejectedWith(JsonRpcClientError, "Invalid response"),
				expect(rpcClient.call('body_empty')).to.eventually.be.rejectedWith(JsonRpcClientError, "Invalid response"),
				expect(rpcClient.call('body_buffer')).to.eventually.be.rejectedWith(JsonRpcClientError, "Response parse error: Unexpected token b in JSON at position 0"),
				expect(rpcClient.call('mismatched_ids')).to.eventually.be.rejectedWith(JsonRpcClientError, "Mmismatched IDs:"),
				expect(rpcClient.call('invalid_response')).to.eventually.be.rejectedWith(JsonRpcClientError, "Invalid response"),
			]);
		});
		it('notify requests', () => {
			return Promise.all([
				expect(rpcClient.notify('')).to.eventually.be.fulfilled.with.undefined,
				expect(rpcClient.notify('body_null')).to.eventually.be.fulfilled.with.undefined,
				expect(rpcClient.notify('body_empty')).to.eventually.be.fulfilled.with.undefined,
				expect(rpcClient.notify('body_buffer')).to.eventually.be.rejectedWith(JsonRpcClientError, "Response parse error: Unexpected token b in JSON at position 0"),
				expect(rpcClient.notify('mismatched_ids')).to.eventually.be.rejectedWith(JsonRpcClientError, "Invalid response"),
				expect(rpcClient.notify('invalid_response')).to.eventually.be.rejectedWith(JsonRpcClientError, "Invalid response"),
			]);
		});
		it('batch request', () => {
			return expect(rpcClient.batch()
				.call('').notify('')
				.call('body_null').notify('body_null')
				.call('body_empty').notify('body_empty')
				.call('body_buffer').notify('body_buffer')
				.call('mismatched_ids').notify('mismatched_ids')
				.call('invalid_response').notify('invalid_response')
				.do()
				.then(r => {
					r[0] = r[0].toString();
					return r;
				})
			).to.eventually.ordered.members([
				"JsonRpcClientError: Invalid response",
				1,
				2,
			]);
		});
	});

	after(function() {
		// srv.close();
  });
});
