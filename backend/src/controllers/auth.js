const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

async function getMembership(userId) {
    const m = await prisma.organizationMember.findFirst({ where: { userId } });
    return { organizationId: m?.organizationId ?? null, role: m?.role ?? null };
}

exports.register = async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(409).json({ error: 'Email already in use' });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({ data: { name, email, passwordHash } });

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, COOKIE_OPTIONS);

        // New users have no org membership yet
        res.status(201).json({ id: user.id, name: user.name, email: user.email, role: null, organizationId: null });
    } catch (error) {
        res.status(500).json({ error: 'Registration Failed. Server Error.', details: error.message });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) return res.status(401).json({ error: 'Invalid Credentials' });

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, COOKIE_OPTIONS);

        const { organizationId, role } = await getMembership(user.id);
        res.json({ id: user.id, name: user.name, email: user.email, role, organizationId });
    } catch (error) {
        res.status(500).json({ error: 'Login Failed. Server Error.' });
    }
};

exports.me = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, email: true },
        });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const { organizationId, role } = await getMembership(req.user.id);
        res.json({ ...user, organizationId, role });
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.logout = (req, res) => {
    res.clearCookie('token', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ message: 'Logged out' });
};
