require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
// Routes — uncommented as each feature is built
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orgs', require('./routes/orgs'));
app.use('/api/orgs/:orgId/projects', require('./routes/projects'));
app.use('/api/orgs/:orgId/projects/:projectId/reports', require('./routes/reports'));
app.use('/api/orgs/:orgId/projects/:projectId/reports/:reportId/comments', require('./routes/comments'));

app.get("/", (req, res) => {
    res.write("<h1>Hello <code>/</code><h1>");
})

app.listen(PORT, ()=>{
    console.log(`Server running on port: ${PORT}`);
})