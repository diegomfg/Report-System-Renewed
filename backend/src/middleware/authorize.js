module.exports = (roles) => {
    if(!roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    next();
};