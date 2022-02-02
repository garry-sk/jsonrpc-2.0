'use strict';

const chai = require('chai');
chai.use(require("chai-as-promised"));
const { expect } = chai;
chai.should();

const http = require('http');
const express = require('express');
const jsonrpc = require('../');
const { JsonRpcError, JsonRpcServerError, JsonRpcClientError } = jsonrpc;

describe('njs-jsonrpc-2.0', function() {
	let app, srv, rpcServer, rpcClient, apiUrl;

	before(function() {
		app = express();
		app.use(express.json());
		rpcServer = jsonrpc.server('/api/?', app);
  });

	describe('errors', () => {
		it('JsonRpcError', done => {
			expect(() => { throw new JsonRpcError() }).to.throw(JsonRpcError, 'Json RPC 2.0 protocol error');
			expect(() => { throw new JsonRpcError(null, null, { _defMessages: {} }) }).to.throw(JsonRpcError, 'Json RPC 2.0 protocol error');
			expect(() => { throw new JsonRpcError('uc', null, { _defMessages: {} }) }).to.throw(JsonRpcError, 'Json RPC 2.0 protocol error');
			expect(() => { throw new JsonRpcError(1, null, { _defMessages: {}, _defErrNo: new Map() }) }).to.throw(JsonRpcError, 'Json RPC 2.0 protocol error');
			done();
		});
		it('JsonRpcClientError', done => {
			expect(() => { throw new JsonRpcClientError() }).to.throw(JsonRpcClientError, 'Json RPC 2.0 protocol error');
			expect(() => { throw new JsonRpcClientError('E_JSONRPC20_INVALID_RESPONSE') }).to.throw(JsonRpcClientError, 'Invalid response');
			done();
		});
	});

	describe('incorrect call server.add()', () => {
		it('no function', () => { expect(() => {
			rpcServer.add('_');
		}).to.throw(TypeError, "Invalid argument: expected a 'function' but received 'undefined' for method '_'"); });

		it('not function', () => {
			expect(() => {
				rpcServer.add('_', /.*/);
			}).to.throw(TypeError, "Invalid argument: expected a 'function' but received 'object' for method '_'");
		});

		it('unnamed anonymous', () => {
			expect(() => {
				rpcServer.add(function () {});
			}).to.throw(TypeError, "Invalid argument: 'name' must be specified for anonimous function 'function () {}'");
		});

		it('unnamed anonymous arrow', () => {
			expect(() => {
				rpcServer.add(() => {});
			}).to.throw(TypeError, "Invalid argument: 'name' must be specified for anonimous function '() => {}'");
		});
		it('many with incorrect', () => {
			expect(() => {
				rpcServer.add('miss_func_1', a => a, ['miss_func_2', a => 1/a], a => a);
			}).to.throw(TypeError, "Invalid argument: 'name' must be specified for anonimous function 'a => a'");
		});
	});

	describe('add methods to API', () => {
		it('empty', () => { expect(() => { rpcServer.add() }).to.not.throw(); });
		it('named', () => {
			expect(() => {
				rpcServer.add(function ping() {
					if (!(this instanceof http.IncomingMessage))
						return 'po...';
					return 'pong';
				});
			}).to.not.throw();
		});
		it('named arrow', () => {
			expect(() => {
				rpcServer.add('mirror', p => p);
			}).to.not.throw();
		});
		it('named with custom name', () => {
			expect(() => {
				rpcServer.add('sum', function _sum_(a, b) { return a + b; });
			}).to.not.throw();
		});
		it('many', () => {
			expect(() => {
				rpcServer.add(
					'call', () => "API метод 'call'",
					'notify', (unp1, unp2) => `API метод 'notify'. Параметры: '${unp1}', '${unp2}'`,
					'batch', unp => { return `API метод 'batch'. Параметры: '${unp}'` },
					['inv', a => 1/a, /.*/], // 3rd item will be ignored
					'restParams', (f, s, ...args) => [f, s, args[0], args[args.length - 1]]
				);
			}).to.not.throw();
		});
		it('result as promise', () => {
			expect(() => {
				rpcServer.add(function promise_string() { return Promise.resolve("promise string") });
				rpcServer.add(function promise_number() { return Promise.resolve(-123) });
				rpcServer.add(function promise_object() { return Promise.resolve({ prop: 'val'}) });
			}).to.not.throw();
		});
		it('exceptions as result', () => {
			expect(() => {
				rpcServer.add(function exception_error() { throw new Error("throw Error") });
				rpcServer.add(function exception_string() { throw "throw string" });
				rpcServer.add(function exception_number() { throw 1 });
				rpcServer.add(function exception_NaN() { throw NaN });
				rpcServer.add(function exception_error_promise() { return Promise.reject(new Error("reject Error")) });
			}).to.not.throw();
		});
	});

	describe('client-server', () => {
		it('create client (fail)', done => {
			expect(() => jsonrpc.bareClient('someurl', { rejectUnauthorized: false })).to.throw(TypeError, 'Invalid URL: someurl');
			expect(() => jsonrpc.bareClient(new URL('https://someurl'), { rejectUnauthorized: false })).to.not.throw();
			expect(() => jsonrpc.bareClient({ rejectUnauthorized: false })).to.throw(Error, 'Protocol "undefined" not supported. Expected "http" or "https:"');
			done();
		});
		it('start server', done => {
			srv = http.createServer(app).listen()
			.on('listening', (...args) => {
				apiUrl = `http://localhost:${srv.address().port}/api`;
				done();
			});
		});
		it('create client', async () => {
			rpcClient = await jsonrpc.client(apiUrl, { rejectUnauthorized: false });
			expect(rpcClient).to.haveOwnProperty('ping');
			expect(rpcClient).to.haveOwnProperty('mirror');
			expect(rpcClient).to.haveOwnProperty('sum');
			expect(rpcClient).to.haveOwnProperty('inv');
			expect(rpcClient).to.haveOwnProperty('promise_string');
			expect(rpcClient).to.haveOwnProperty('promise_number');
			expect(rpcClient).to.haveOwnProperty('promise_object');
			expect(rpcClient).to.haveOwnProperty('exception_error');
			expect(rpcClient).to.haveOwnProperty('exception_string');
			expect(rpcClient).to.haveOwnProperty('exception_number');
			expect(rpcClient).to.haveOwnProperty('exception_NaN');
			expect(rpcClient).to.haveOwnProperty('exception_error_promise');
			expect(rpcClient).to.not.haveOwnProperty('miss_func_1');
			expect(rpcClient).to.not.haveOwnProperty('miss_func_2');
			expect(rpcClient).to.not.haveOwnProperty('rpc:api.description');
		});
	});

	describe('test API', () => {
		it('retrieve api description', () => {
			return expect(rpcClient.call('rpc:api.description')).to.eventually.deep.equal([
				{ "name": "ping", "params": [] },
				{ "name": "mirror", "params": [ "p" ] },
				{ "name": "sum", "params": [ "a", "b" ] },
				{ "name": "call", "params": [] },
				{ "name": "notify", "params": [ "unp1", "unp2" ] },
				{ "name": "batch", "params": [ "unp" ] },
				{ "name": "inv", "params": [ "a" ] },
				{ "name": "restParams", "params": [ "f", "s", "...args" ] },
				{ "name": "promise_string", "params": [] },
				{ "name": "promise_number", "params": [] },
				{ "name": "promise_object", "params": [] },
				{ "name": "exception_error", "params": [] },
				{ "name": "exception_string", "params": [] },
				{ "name": "exception_number", "params": [] },
				{ "name": "exception_NaN", "params": [] },
				{ "name": "exception_error_promise", "params": [] },
			]);
		});
		it('call request', () => {
			return Promise.all([
				expect(rpcClient.call('miss_func_1')).to.eventually.be.rejectedWith(JsonRpcServerError, "Method not found: miss_func_1"),
				expect(rpcClient.call('miss_func_2')).to.eventually.be.rejectedWith(JsonRpcServerError, "Method not found: miss_func_2"),
				expect(rpcClient.call('ping')).to.eventually.equal('pong'),
				expect(rpcClient.call('mirror', { num: 1, str: 'str', obj: { bool: true } }))
				.to.eventually.deep.equal({ num: 1, str: 'str', obj: { bool: true } }),
				expect(rpcClient.call('sum', 2, 3)).to.eventually.equal(5),
				expect(rpcClient.call('inv', 2)).to.eventually.equal(0.5),
				expect(rpcClient.call('inv', 0)).to.eventually.be.null,
				expect(rpcClient.call('call')).to.eventually.equal("API метод 'call'"),
				expect(rpcClient.call('notify', {}, "2")).to.eventually.equal("API метод 'notify'. Параметры: '[object Object]', '2'"),
				expect(rpcClient.call('batch', true)).to.eventually.equal("API метод 'batch'. Параметры: 'true'"),
				expect(rpcClient.restParams('first', 'second', "rest_0", {must: 'be'}, "skipped", {"rest": "last"}))
				.to.eventually.include.deep.ordered.members(['first', 'second', "rest_0", {"rest": "last"}]),
			]);
		});
		it('call request through methods bound to the client', () => {
			return Promise.all([
				expect(rpcClient.ping()).to.eventually.equal('pong'),
				expect(rpcClient.mirror({ num: 1, str: 'str', obj: { bool: true } }))
				.to.eventually.deep.equal({ num: 1, str: 'str', obj: { bool: true } }),
				expect(rpcClient.sum(2, -3)).to.eventually.equal(-1),
				expect(rpcClient.inv(-2)).to.eventually.equal(-0.5),
				expect(rpcClient.inv(NaN)).to.eventually.be.null,
				expect(rpcClient.promise_string()).to.eventually.equal('promise string'),
				expect(rpcClient.promise_number()).to.eventually.equal(-123),
				expect(rpcClient.promise_object()).to.eventually.deep.equal({ prop: 'val' }),
			]);
		});
		it('call requests with error as result', () => {
			return Promise.all([
				expect(rpcClient.exception_error()).to.eventually.be
				.rejectedWith(JsonRpcServerError, "Аpplication error")
				.and.deep.have.property(
					'data', { name: 'Error', message: 'throw Error' }
				),
				expect(rpcClient.exception_string()).to.eventually.be
				.rejectedWith(JsonRpcServerError, "Аpplication error")
				.and.deep.have.property(
					'data', "throw string"
				),
				expect(rpcClient.exception_number()).to.eventually.be
				.rejectedWith(JsonRpcServerError, "Аpplication error")
				.and.deep.have.property(
					'data', 1
				),
				expect(rpcClient.exception_NaN()).to.eventually.be
				.rejectedWith(JsonRpcServerError, "Аpplication error")
				.and.deep.have.property(
					'data', null
				),
				expect(rpcClient.exception_error_promise()).to.eventually.be
				.rejectedWith(JsonRpcServerError, "Аpplication error")
				.and.deep.have.property(
					'data', { name: 'Error', message: 'reject Error' }
				),
			]);
		}),
		it('notify request', () => {
			return Promise.all([
				expect(rpcClient.notify('miss_func_1')).to.eventually.be.fulfilled.with.undefined,
				expect(rpcClient.notify('ping')).to.eventually.be.fulfilled.with.undefined,
				expect(rpcClient.notify('call')).to.eventually.be.fulfilled.with.undefined,
				expect(rpcClient.notify('notify', {}, "2")).to.eventually.be.fulfilled.with.undefined,
				expect(rpcClient.notify('batch', true)).to.eventually.be.fulfilled.with.undefined,
				expect(rpcClient.notify('exception_error')).to.eventually.be.fulfilled.with.undefined,
				expect(rpcClient.notify('exception_string')).to.eventually.be.fulfilled.with.undefined,
				expect(rpcClient.notify('exception_number')).to.eventually.be.fulfilled.with.undefined,
				expect(rpcClient.notify('exception_NaN')).to.eventually.be.fulfilled.with.undefined,
			]);
		});
		it('batch request', () => {
			return expect(rpcClient.batch()
				.call('miss_func_1')
				.call('ping')
				.notify('mirror')
				.call('sum', -2, 3)
				.notify('inv', 0)
				.notify('notify', {}, "2")
				.notify('miss_func_2')
				.call('batch', false)
				.do()
				.then(r => {
					r[0] = r[0].toString();
					return r;
				})
			).to.eventually.ordered.members([
				(new JsonRpcServerError('E_JSONRPC20_METHOD_NOT_FOUND', 'miss_func_1')).toString(),
				'pong',
				1,
				"API метод 'batch'. Параметры: 'false'"
			]);
		});
		it('batch request (all notify)', () => {
			return expect(rpcClient.batch()
				.notify('miss_func_1')
				.notify('ping')
				.notify('sum', -2, 3)
				.notify('batch', false)
				.do()
			).to.eventually.be.undefined;
		});
	});

	after(function() {
		srv.close();
  });
});
