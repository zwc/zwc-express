'use strict';
const levels = [ 'trace', 'debug', 'info', 'warning', 'error', 'fatal' ];
let log = {};
let current = process.env.LOG_LEVEL || 'info';

levels.map(level => {
	log[level] = (message) => {
		if(levels.indexOf(current) <= levels.indexOf(level)) {
			console.log(level, message);
		}
	};
});

module.exports = log;