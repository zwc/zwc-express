'use strict';
const H = require('highland');
const ProtoBuf = require('protobufjs');
const app = require('./app');
const log = require('./log');
const Cookies = require('cookies');
const token = process.env.TOKEN || {};

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

	app.get('/', (req, res) => {
		H([builder.lookup(service)])
			.pluck('children')
			.flatMap(H)
			.map(service => {
				return {
					name: service.name,
					href: service.options.templatedUrl,
					method: service.options.method
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
			const key = req.headers['wpa-key'];
			log.debug(`${method}, ${url}, ${role} [${key}]`);
			const cookies = new Cookies(req, res);
			const session = cookies.get('session') || req.query.session;
			const admin = key === token.key;
			if(role === 'session' && !session && !admin) {
				res.json({ success: false, err: 'not logged in' });
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