'use strict';

module.exports = exports = Object.assign({
	server: (...args) => require('./server')(...args),
	bareClient: (...args) => require('./client').bareClient(...args),
	client: (...args) => require('./client').client(...args)
}, require('./errors'));
