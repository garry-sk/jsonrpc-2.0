njs-jsonrpc-2.0
===========

Клиент и Сервер, взаимодействующие по протоколу [`JSON-RPC 2.0`](https://www.jsonrpc.org/specification).<br>
Реализация на `javascript` для [`node.js`](https://nodejs.org/).<br>
Простой и удобный в использовании.

##### _ограничения_

_`by-name`_ параметры ({ "p1": v1, "p2": v2}) пока не поддерживаются ни сервером, ни клиентом

## Установка

```sh
npm install njs-jsonrpc-2.0
```

## Использование

### Сервер

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

### Клиент

```js
'use strict';

const jsonrpc = require('njs-jsonrpc-2.0');

jsonrpc.client('http://localhost/api')
.then(async (rpcClient) => {
	let r;

	// вызов метода API через св-во клиента
	try {
		r = await rpcClient.sum(2, 3, 4);
		console.log(r); // 9
	} catch(err) {
		console.error(err);
	}

	// вызов метода API через метод 'call' клиента
	try {
		r = await rpcClient.call('mul', 25, 4);
		console.log(r); // 100
	} catch(err) {
		console.error(err);
	}

	// notification (результат не важен и сервером не отправляется)
	try {
		r = await rpcClient.notify('div', 12, 3);
		console.log(r); // undefined
	} catch(err) {
		// сервер может вернуть ошибку, если запрос некорректный
		// и не распознан им как 'notification'.
		// клиент выбросит соответствующее исключение
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

API
---

`const jsonrpc = require('njs-jsonrpc-2.0');` экспортирует методы для создания клиента и сервера

* server - создаёт экземпляр сервера
* client - создаёт экземпляр клиента с получением описания методоов API от сервиса и созданием одноименных методов на клиенте. Метод асинхронный.
* bareClient - создаёт экземпляр клиента без построения методов API сервиса на клиенте. Метод синхронный.

### Сервер

#### jsonrpc.server()
#### jsonrpc.server(path, app)

Создаёт экземпляр сервера с методами `add`, `setEndpoints` и `apiDescription`.
Возвращаемое значение является также `middleware` для `express`, которое добавляет к объекту `request` (http.IncomingMessage) метод `jsonrpc` для обработки запросов.

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

// сервер создан, routing и middleware настроены
// осталось добавить методы API:
//   server.add(...
// и сервер готов обрабатывать вызовы
```

При вызове первой формы `jsonrpc.server()` _(без параметров)_ у экземпляра сервера доступен
метод `setEndpoints` (см. ниже), который немного упрощает создание сервера:

```js
const express = require('express');
const app = express();
app.use(express.json());

const server = require('njs-jsonrpc-2.0').server();
server.setEndpoints('/api/?', app);

// сервер создан, routing и middleware настроены
// осталось добавить методы API:
//   server.add(...
// и сервер готов обрабатывать вызовы
```

Вторая форма (`jsonrpc.server(path, app)`) принимает параметры, аналогичные `setEndpoints`, настраивает routing и middleware.
При таком вызове `setEndpoints` у экземпляра сервера недоступна.

```js
const express = require('express');
const app = express();
app.use(express.json());

const server = require('njs-jsonrpc-2.0').server('/api/?', app);

// сервер создан, routing и middleware настроены
// осталось добавить методы API:
//   server.add(...
// и сервер готов обрабатывать вызовы
```

#### методы

#### server.add(\<[name,] fn | tuple\>[, [name,] fn, ...])

 * `name` \<string \> - имя метода. Если указано, то именно это имя будет у метода API. Если реализация метода (параметр `fn`) является анонимной функцией, то этот параметр обязательный.
 * `fn` \<Function \> - функция, реализующая метод. Если функция именованная и соответствующий параметр `name` отсутствует, то имя функции будет испльзовано в качестве метода API.

 пара \<имя>, \<функция> может быть передана как один параметр в виде массива из двух элементов с идексами 0 - имя, 1 - функция (элементы с индексами >1 будут проигнорированы)

Добавляет метод API сервиса<br>
Методы API, добавленные в сервис, будут вызываться на объекте запроса, т.е. для этих методов `this` является экземпляром `http.IncomingMessage`.


#### server.setEndpoints(path, app)

 * path <string> - путь (относительно приложения) по которому будет доступно API, обрабатываемое этим сервером
 * app - экземпляр приложения `express`

Returns: \<undefined\>

Устанавливает routing для обработки запросов к jsonrpc2.0 серверу.
Обработчик `POST` запросов обрабатывает вызов методов API в соответствии с протоколом `JSON-RPC 2.0`.
`GET`-запрос возвращает описание методов API.

```js
const app = express();
app.use(express.json());
const rpcServer = jsonrpc.server();
rpcServer.setEndpoints('/api/?', app)
```

#### server.apiDescription()

Returns: \<Object\> объект с информацией о методах API (имена методов и параметров).

### Клиент

#### const client = jsonrpc.bareClient(address, options)

 * `address` \<string\> - url, по которому доступен API
 * `options` \<Object\> - опции http(s) запроса (см. документацию по http.request).

Returns: \<Object\>

Метод создаёт экземпляр «базового» клиента с тремя базовыми методами, без методов API сервиса.

Если параметр `address` является строкой (или URL), то для подключения к серверу используется простой клиент по умолчанию, основанный на модулях nodejs http/https. Этот простой клиент устанавливает заголовки Accept: application/json и Content-Type: application/json по умолчанию.

Пользовательский клиент может использоваться для подключения к серверу (например, на основе `'request'` или `'got'`).

Если параметр `address` является объектом, он должен реализовать метод `request(data, options)`, который возвращает Promise<string|null|undefined>. Если возвращаемое значение не является пустой строкой, оно должно быть в формате JSON. Параметр `data`, если он не <null|undefined>, должен быть JSON-сериализуемым объектом. Это данные для отправки на сервер. Параметр `options` - это опции для запроса. На данный момент это объект со свойством `метод` ({метод: <"GET"|"POST">}).

Пример:

```js
const request = require("request-promise");

// transport protocol client
class TPClient {
	constructor(options) {
		this.client = request.defaults(options);
	}
	async request(data, options = {}) {
		if (data)
			options.body = JSON.stringify(data);
		const res = await this.client(options);
		return res;
	}
}

const rpcClient = await jsonrpc.client(new TPClient({
		uri: <apiUrl>,
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json'
		},
		agentOptions: { rejectUnauthorized: false }
	}));
```


#### методы

#### client.call(name, ...params)

 * name \<string\> - имя вызываемого метода API
 * params - параметры вызываемого метода

Returns: \<Promise\>, разрешается зачением которе возвращает вызываемый метод API,
  может быть отклонён с различными ошибками, в том чиле с ошибками, предусмотренными
  протоколом `JSON-RPC 2.0`


#### client.notify(name, ...params)

 * name \<string\> - имя вызываемого метода API
 * params - параметры вызываемого метода

Returns: \<Promise\>, разрешается `undefined`. Может быть отклонён с различными ошибками,
  например, с сетевыми ошибками и с ошибками, предусмотренными протоколом `JSON-RPC 2.0`
  (если сервер не распознал запрос как `notification`).


#### client.batch()

Returns: \<Object\>

Создаёт (возвращает) обёртку для пакетного вызова 

##### batch.call(name, ...params)
##### batch.notify(name, ...params)

Returns: \<Object\>, обёртка, созданная методом `batch`

Эти методы добавляют запрос соответствующего типа в пакет.

##### batch.do()

Завершает формирование пакета запроса и инициирует исполнение сформированного запроса. 

Returns: \<Promise\>. В случае успеха возвращается массив результатов.
Элементы массива могут быть результатами исполения методов API, либо ошибками
`JsonRpcClientError`, `JsonRpcServerError`. Проядок результатов соответствует порядку запросов.
Записи, соответствующие `notification` пропускаются, но мгут появиться в виде ошибок если на
стороне сервера запись запроса не была распознана как `notification` (ткую ситуацию можно
распознать по `id: null`).


#### client = jsonrpc.client(address, headers, opts)

Метод, аналогичный `bareClient`, но, в дополнение, производится попытка
получения описания методоов API от сервиса и созданием одноименных методов
на клиенте (в случае успеха). 

Returns: \<Promise\>, который разрешается созданным клиентом. Может быть
отклонён при некорректном значении параметра `address`.


_У обёртки, созданной методом `batch` методы не создаются._

_Если API сервиса реализует методы `call`, `notify` и/или `batch`, то такие
методы не будут созданы на клиенте и обратиться к ним можно только базовым
способом (`client.call('batch', ...)`)._

### Ошибки

В `njs-jsonrpc-2.0` определены классы ошибок для представления ошибок `JSON-RPC 2.0` протокола.<br>
Ошибки содержат следующую информацию:

```js
{
  code: <string> // строка вида 'E_JSONRPC20_*'
  no: <number> // числовой код ошибки вида -3xxxx, в соответствии со спецификацией
  message: <string> // строка с описанием ошибки
}
```

 * `JsonRpcError` базовый класс ошибок `JSON-RPC 2.0` протокола
   - 'E_JSONRPC20', -32100, 'Json RPC 2.0 protocol error' - обобщённая ошибка протокола 
 * `JsonRpcServerError` ошибки сервера, в соответствии со спецификацией
  - 'E_JSONRPC20_АPPLICATION_ERROR', -32099, 'Аpplication error' - Ошибки, возникающие в приложении. Дополнительная информация об ошибке передаётся в поле 'data'.
   - 'E_JSONRPC20_INVALID_REQUEST', -32600, 'Invalid Request' - The JSON sent is not a valid Request object.
   - 'E_JSONRPC20_METHOD_NOT_FOUND', -32601, 'Method not found' - The method does not exist / is not available.
   - 'E_JSONRPC20_INVALID_PARAMS', -32602, 'Invalid params' - Invalid method parameter(s).
   - 'E_JSONRPC20_INTERNAL_ERROR', -32603, 'Internal error' - Internal JSON-RPC error.
   - 'E_JSONRPC20_PARSE_ERROR', -32700, 'Parse error' - Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.

 * `JsonRpcClientError` (расширение спецификации) ошибки, возникающие на клиентской стороне
   - 'E_JSONRPC20_INVALID_RESPONSE', -31600, 'Invalid response' - The JSON sent is not a valid Response object.
   - 'E_JSONRPC20_MISMATCHED_IDS', -31601, 'Mmismatched IDs' - Mismatched request and response IDs.
   - 'E_JSONRPC20_RESPONSE_PARSE_ERROR', -31700, 'Response parse error' - Invalid JSON was received by the client. An error occurred on the client while parsing the JSON text.
