const routes = require('express').Router();

const auth = require('../controllers/auth');
const authenticate = require('../middleware/authenticate');

routes.post('/register', auth.register);
routes.post('/login', auth.login);
routes.get('/me', authenticate, auth.me);
routes.post('/logout', auth.logout);

module.exports = routes;