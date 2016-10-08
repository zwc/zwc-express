'use strict';
const H = require('highland');
const ProtoBuf = require('protobufjs');
const app = require('./app');
const log = require('./log');

let handlers = {};

const start = (port) => {
	app.listen(port, function () {
		log.info(`app started at port ${port}`);
	});
};

module.exports = (service, proto) => {
	const builder = ProtoBuf.loadProtoFile(proto);

	app.get('/healthcheck', (req, res) => {
		res.json({ name: service });
	});

	const reduceFields = (response, field) => {
		response[field.name] = field.type;
		return response;
	};

	app.get('/', (req, res) => {
		H([builder.lookup(service)])
			.pluck('children')
			.flatMap(H)
			.reject(service => service.options.role === 'admin')
			.map(service => {
				const requestFields = builder.lookup(service.requestName).children.map(f => ({ name: f.name, type: f.type.name })).reduce(reduceFields, {});
				const responseFields = builder.lookup(service.responseName).children.map(f => ({ name: f.name, type: f.type.name })).reduce(reduceFields, {});
				return {
					name: service.name,
					href: service.options.templatedUrl,
					method: service.options.method,
					request: requestFields,
					response: responseFields,
				};
			})
			.collect()
			.apply((data) => {
				res.json(data);
			});
	});

	const defaultRoute = (service) => {
		handlers[service.name] = (req, res) => {
			res.send(`No handler called: ${service.name}`);
		};
	};

	const addRoute = (service) => {
		const method = service.options.method.toLowerCase();
		const url = service.options.templatedUrl.split('{?')[0]; // remove query params
		const role = service.options.role;
		app[method](url, (req, res) => {
			log.debug(`${method}, ${url}, ${role}`);
			const session = req.headers.session; // Should be named token instead!
			if(role === 'session' && !session) {
				res.json({ error: 'Not logged in' });
			} else {
				req.session = session;
				return handlers[service.name](req, res);
			}
		});
	};

	H([builder.lookup(service)])
		.pluck('children')
		.flatMap(H)
		.map(service => ({
			name: service.name,
			request: service.requestName,
			response: service.responseName,
			options: service.options
		}))
		.tap(defaultRoute)
		.tap(addRoute)
		.done(() => {});

	return {
		app,
		handlers,
		start
	};
};