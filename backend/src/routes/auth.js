const routes = require('express').Router();

const auth = require('../controllers/auth');

routes.post('/register', auth.register);
routes.post('/login', auth.login);

module.exports = routes;