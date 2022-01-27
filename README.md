njs-jsonrpc-2.0
===========

Client and Server communicating via [`JSON-RPC 2.0`](https://www.jsonrpc.org/specification) protocol.<br>
`javascript` implementation for [`node.js`](https://nodejs.org/).<br>
Simple and convenient to use.

##### _restrictions_

_`by-name`_ parameters ({ "p1": v1, "p2": v2}) are not yet supported by either server or client

## Installation

```sh
npm install njs-jsonrpc-2.0
```

## Usage

### Server

```js
'use strict';

const express = require('express');

const app = express();

app.use(express.json());

const rpcServer = require('njs-jsonrpc-2.0').server('/api/?', app);

rpcServer.add(sum, mul);
rpcServer.add(
	'div', (a, b) => a/b,
	['inv', a => 1/a]
);

function sum(a, b, c) {
	return a + b + c;
}

function mul(m1, m2) {
	return m1 * m2;
}

app.listen(80);
```

### Client

```js
'use strict';

const jsonrpc = require('njs-jsonrpc-2.0');

jsonrpc.client('http://localhost/api')
.then(async (rpcClient) => {
	let r;

	// API method call via client property
	try {
		r = await rpcClient.sum(2, 3, 4);
		console.log(r); // 9
	} catch(err) {
		console.error(err);
	}

	// calling an API method via the client's 'call' method
	try {
		r = await rpcClient.call('mul', 25, 4);
		console.log(r); // 100
	} catch(err) {
		console.error(err);
	}

	// notification (the result is not important and is not sent by the server)
	try {
		r = await rpcClient.notify('div', 12, 3);
		console.log(r); // undefined
	} catch(err) {
		// server may return an error if the request is invalid
		// and is not recognized by it as 'notification'.
		// client will throw appropriate exception
		console.error(err);
	}

	// batch
	try {
		r = await rpcClient.batch()
		.call('sum', 5, 7, 11)
		.notify('test_notify')
		.call('inv', 5)
		.do();
		console.log(r); // [23, 0.2]
	} catch(err) {
		console.error(err);
	}
});

```

## API


`const jsonrpc = require('njs-jsonrpc-2.0');` exports methods for creating client and server

* server - creates a server instance
* client - creates an instance of the client with receiving a description of the API methods from the service and creating methods of the same name on the client. The method is asynchronous.
* bareClient - instantiates the client without building the service API methods on the client. The method is synchronous.

### Server

#### jsonrpc.server()
#### jsonrpc.server(path, app)

Creates a server instance with `add`, `setEndpoints` and `apiDescription` methods.
The return value is also a `middleware` for `express` that adds a `jsonrpc` method to the `request` object (http.IncomingMessage) to process requests.

```js
const express = require('express');
const app = express();
app.use(express.json());

const server = require('njs-jsonrpc-2.0').server();

app.use(server);

app.get('/api/?', (req, res, next) => {
	res.json(server.apiDescription());
});

app.post('/api/?', (req, res, next) => {
	req.jsonrpc(res)
	.catch(err => {
		next(err);
	});
});

// the server is created, routing and middleware is configured
// it remains to add API methods:
//   server.add(...
// and the server is ready to handle calls
```

When calling the first form `jsonrpc.server()` _(no parameters)_ the server instance has access to
`setEndpoints` method ([see below](#serversetendpointspath-app)), which simplifies server creation a bit

```js
const express = require('express');
const app = express();
app.use(express.json());

const server = require('njs-jsonrpc-2.0').server();
server.setEndpoints('/api/?', app);

// the server is created, routing and middleware is configured
// it remains to add API methods:
//   server.add(...
// and the server is ready to handle calls
```

The second form (`jsonrpc.server(path, app)`) accepts parameters similar to `setEndpoints`, configures routing and middleware.
With this call, `setEndpoints` is not available on the server instance.

```js
const express = require('express');
const app = express();
app.use(express.json());

const server = require('njs-jsonrpc-2.0').server('/api/?', app);

// the server is created, routing and middleware is configured
// it remains to add API methods:
//   server.add(...
// and the server is ready to handle calls
```

#### methods

#### server.add(\<[name,] fn | tuple\>[, [name,] fn, ...])

 * `name` \<string\> - method name. If specified, this is the name of the API method. If the method implementation (the `fn` parameter) is an anonymous function, then this parameter is required.
 * `fn` \<Function\> - a function that implements the method. If the function is named and there is no corresponding `name` parameter, then the function name will be used as the API method.

 a pair \<name\>, \<function\> can be passed as one parameter as an array of two elements with indices 0 - name, 1 - function (elements with indices \>1 will be ignored)

Adds a service API method

#### server.setEndpoints(path, app)

 * path <string> - the path (relative to the application) where the API processed by this server will be available
 * app - `express` application instance

Returns: \<undefined\>

Sets routing to process requests to the jsonrpc2.0 server.
The `POST` request handler handles API method calls according to the `JSON-RPC 2.0` protocol.
A `GET` request returns a description of the API methods.

```js
const app = express();
app.use(express.json());
const rpcServer = jsonrpc.server();
rpcServer.setEndpoints('/api/?', app)
```

#### server.apiDescription()

Returns: \<Object\> object with information about API methods (names of methods and parameters).


### Client

#### const client = jsonrpc.bareClient(address, headers, opts)

 * `address` \<string\> - url where the API is available
 * `headers` \<Object\> - http(s) headers that will be set for requests.
      By default, only `Accept: application/json` and `Content-Type: application/json` are set
 * `opts` \<Object\> - http(s) request options (see http.request documentation).
      While `rejectUnauthorized` is taken into account.

The cocreate method instantiates the "base" client without building the service API methods and with three base methods.

#### methods

#### client.call(name, ...params)

 * name \<string\> - the name of the API method to call
 * params - parameters of the called method

Returns: \<Promise\>, resolved by the value returned by the called API method,
   may be rejected with various errors, including errors provided for
   protocol `JSON-RPC 2.0`


#### client.notify(name, ...params)

 * name \<string\> - the name of the API method to call
 * params - parameters of the called method

Returns: \<Promise\>, `undefined` is allowed. Can be rejected with various errors,
   for example, with network errors and with errors provided by the `JSON-RPC 2.0` protocol
   (if the server didn't recognize the request as a `notification`).


#### client.batch()

Returns: \<Object\>

Creates (returns) a wrapper for a batch call

##### batch.call(name, ...params)
##### batch.notify(name, ...params)

Returns: \<Object\>, wrapper created by `batch` method

These methods add a request of the appropriate type to the package.

##### batch.do()

Completes the formation of the request package and initiates the execution of the generated request.

Returns: \<Promise\>. If successful, an array of results is returned.
Array elements can be the results of API methods, or errors `JsonRpcClientError`, `JsonRpcServerError`.
The order of the results corresponds to the order of the queries.
Entries matching `notification` are skipped, but may appear as errors if
server-side, the request entry was not recognized as a `notification` (this situation can be
recognize by `id: null`).


#### client = jsonrpc.client(address, headers, opts)

A method similar to `bareClient`, but in addition it tries obtaining a description of API methods
from the service and creating methods of the same name on the client (if successful).
Returns: \<Promise\> which is resolved by the generated client. May be
rejected with invalid `address` parameter value.

_A wrapper created by the `batch` method does not have methods created._

_If the service API implements the `call`, `notify` and/or `batch` methods, then such
methods will not be created on the client and can only be accessed by the base
way (`client.call('batch', ...)`)._

### Errors

`njs-jsonrpc-2.0` defines error classes to represent `JSON-RPC 2.0` protocol errors.<br>
Errors contain the following information:

```js
{
  code: <string> // string like 'E_JSONRPC20_*'
  no: <number> // numeric error code like -3xxxx, according to the specification
  message: <string> // string describing the error
}
```

 * `JsonRpcError` base class of `JSON-RPC 2.0` protocol errors
   - 'E_JSONRPC20', -32100, 'Json RPC 2.0 protocol error' - generic protocol error
 * `JsonRpcServerError` server errors, as per spec
   - 'E_JSONRPC20_INVALID_REQUEST', -32600, 'Invalid Request' - The JSON sent is not a valid Request object.
   - 'E_JSONRPC20_METHOD_NOT_FOUND', -32601, 'Method not found' - The method does not exist / is not available.
   - 'E_JSONRPC20_INVALID_PARAMS', -32602, 'Invalid params' - Invalid method parameter(s).
   - 'E_JSONRPC20_INTERNAL_ERROR', -32603, 'Internal error' - Internal JSON-RPC error.
   - 'E_JSONRPC20_PARSE_ERROR', -32700, 'Parse error' - Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.
 * `JsonRpcClientError` (spec extension) errors occurring on the client side
   - 'E_JSONRPC20_INVALID_RESPONSE', -31600, 'Invalid response' - The JSON sent is not a valid Response object.
   - 'E_JSONRPC20_MISMATCHED_IDS', -31601, 'Mmismatched IDs' - Mismatched request and response IDs.
   - 'E_JSONRPC20_RESPONSE_PARSE_ERROR', -31700, 'Response parse error' - Invalid JSON was received by the client. An error occurred on the client while parsing the JSON text.