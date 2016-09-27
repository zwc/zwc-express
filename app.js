'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const compress = require('compression');
const app = express();

app.use(compress());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

module.exports = app;