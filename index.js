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

	const reduceFields = (acc, field) => {
		acc[field.name] = field.type;
		return acc;
	};

	app.get('/', (req, res) => {
		H([builder.lookup(service)])
			.pluck('children')
			.flatMap(H)
			.reject(service => service.options.role === 'admin')
			.map(service => {
				const requestFields = builder
					.lookup(service.requestName)
					.children
					.map(f => ({ name: f.name, type: f.type.name }))
					.reduce(reduceFields, {});

				const responseFields = builder
					.lookup(service.responseName)
					.children
					.map(f => ({ name: f.name, type: f.type.name }))
					.reduce(reduceFields, {});

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

	const mapFields = (params) => (acc, field) => {
		const types = {
			string: '',
			int32: 0,
			bool: false
		};
		switch(field.type) {
			case 'string':
				acc[field.name] = params[field.name].toString() || types[field.type];
				break;
			case 'int32':
				acc[field.name] = parseInt(params[field.name]) || types[field.type];
				break;
			case 'bool':
				acc[field.name] = !!params[field.name] || types[field.type];
				break;
			default:
				acc[field.name] = params[field.name] || types[field.type];
				break;
		}
		return acc;
	};

	const addRoute = (service) => {
		const method = service.options.method.toLowerCase();
		const url = service.options.templatedUrl.split('{?')[0]; // remove query params
		const role = service.options.role;
		app[method](url, (req, res) => {
			log.debug(`${method}, ${url}, ${role}`);

			const params = Object.assign({}, req.params, req.body);

			const requestFields = builder
				.lookup(service.request)
				.children
				.map(f => ({ name: f.name, type: f.type.name }))
				.reduce(mapFields(params), {});

			req.params = requestFields;
			return handlers[service.name](req, res);
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
