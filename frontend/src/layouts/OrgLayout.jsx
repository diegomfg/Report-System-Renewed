import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { OrgProvider } from '../context/OrgContext';
import api from '../api/axios';

export default function OrgLayout() {
    const { orgId } = useParams();
    const [org, setOrg] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [pendingOrgRequests, setPendingOrgRequests] = useState(0);
    const [pendingProjectRequests, setPendingProjectRequests] = useState(0);

    useEffect(() => {
        setLoading(true);
        setError('');
        api.get(`/orgs/${orgId}`)
            .then(res => {
                setOrg({ id: res.data.organization.id, name: res.data.organization.name, role: res.data.yourRole });
                localStorage.setItem('lastOrgId', orgId);
            })
            .catch(() => setError('You do not have access to this organization.'))
            .finally(() => setLoading(false));
    }, [orgId]);

    useEffect(() => { setMobileNavOpen(false); }, [orgId]);

    const refreshBadges = useCallback(() => {
        if (!org || org.role !== 'admin') return Promise.resolve();
        return Promise.all([
            api.get(`/orgs/${org.id}/requests`),
            api.get(`/orgs/${org.id}/projects`),
        ]).then(([orgRes, projRes]) => {
            setPendingOrgRequests(orgRes.data.requests.length);
            const total = projRes.data.projects.reduce((sum, p) => sum + (p.pendingRequestsCount || 0), 0);
            setPendingProjectRequests(total);
        }).catch(() => {});
    }, [org]);

    useEffect(() => { refreshBadges(); }, [refreshBadges]);

    if (loading) return <div className="page-loading">Loading organization…</div>;
    if (error || !org) {
        return (
            <div className="page-error">
                <p>{error || 'Organization not found.'}</p>
                <Link to="/">← Back to your organizations</Link>
            </div>
        );
    }

    return (
        <OrgProvider orgId={org.id} orgName={org.name} role={org.role} refreshBadges={refreshBadges}>
            <div className="app-shell">
                {!mobileNavOpen && (
                    <button
                        className="mobile-nav-toggle"
                        aria-label="Open menu"
                        onClick={() => setMobileNavOpen(true)}
                    >
                        ☰
                    </button>
                )}
                {mobileNavOpen && (
                    <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />
                )}
                <Sidebar
                    orgId={org.id}
                    orgName={org.name}
                    role={org.role}
                    pendingOrgRequests={pendingOrgRequests}
                    pendingProjectRequests={pendingProjectRequests}
                    mobileOpen={mobileNavOpen}
                    onNavigate={() => setMobileNavOpen(false)}
                />
                <main className="app-main">
                    <Outlet />
                </main>
            </div>
        </OrgProvider>
    );
}

function Sidebar({ orgId, orgName, role, pendingOrgRequests, pendingProjectRequests, mobileOpen, onNavigate }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [orgs, setOrgs] = useState(null);
    const [showLeave, setShowLeave] = useState(false);

    const openSwitcher = useCallback(() => {
        setSwitcherOpen(prev => {
            const next = !prev;
            if (next && orgs === null) {
                api.get('/orgs')
                    .then(res => setOrgs(res.data.organizations))
                    .catch(() => setOrgs([]));
            }
            return next;
        });
    }, [orgs]);

    function switchTo(id) {
        setSwitcherOpen(false);
        onNavigate();
        navigate(`/orgs/${id}`);
    }

    return (
        <aside className={mobileOpen ? 'sidebar sidebar-mobile-open' : 'sidebar'}>
            <div className="sidebar-top">
                <div className="sidebar-org">
                    <span className="sidebar-app-name">Report System</span>
                    <button className="sidebar-org-switcher" onClick={openSwitcher}>
                        <span className="sidebar-org-name">{orgName}</span>
                        <span className="sidebar-org-switcher-caret">▾</span>
                    </button>
                    {switcherOpen && (
                        <div className="org-switcher-dropdown">
                            {orgs === null ? (
                                <p className="org-switcher-loading">Loading…</p>
                            ) : (
                                <ul className="org-switcher-list">
                                    {orgs.map(o => (
                                        <li key={o.id}>
                                            <button
                                                className={o.id === orgId ? 'org-switcher-item active' : 'org-switcher-item'}
                                                onClick={() => switchTo(o.id)}
                                            >
                                                {o.name}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <Link to="/" className="org-switcher-all" onClick={() => { setSwitcherOpen(false); onNavigate(); }}>
                                See all organizations
                            </Link>
                        </div>
                    )}
                </div>
                <nav className="sidebar-nav">
                    <NavLink to={`/orgs/${orgId}`} end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={onNavigate}>
                        Projects
                        {pendingProjectRequests > 0 && (
                            <span className="nav-badge">{pendingProjectRequests}</span>
                        )}
                    </NavLink>
                    <NavLink to={`/orgs/${orgId}/members`} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={onNavigate}>
                        Members
                        {pendingOrgRequests > 0 && (
                            <span className="nav-badge">{pendingOrgRequests}</span>
                        )}
                    </NavLink>
                </nav>
            </div>
            <div className="sidebar-bottom">
                <div className="sidebar-user">
                    <span className="sidebar-user-name">{user.name}</span>
                    <span className={`badge badge-role badge-${role}`}>{role}</span>
                </div>
                <button className="btn-logout" onClick={() => setShowLeave(true)}>Leave organization</button>
                <button className="btn-logout" onClick={logout}>Sign out</button>
            </div>

            {showLeave && (
                <LeaveOrgModal
                    orgId={orgId}
                    orgName={orgName}
                    onClose={() => setShowLeave(false)}
                    onLeft={() => {
                        if (localStorage.getItem('lastOrgId') === orgId) {
                            localStorage.removeItem('lastOrgId');
                        }
                        navigate('/');
                    }}
                />
            )}
        </aside>
    );
}

function LeaveOrgModal({ orgId, orgName, onClose, onLeft }) {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const confirmLeave = async () => {
        setLoading(true);
        setError('');
        try {
            await api.delete(`/orgs/${orgId}/leave`);
            onLeft();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to leave organization');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2>Leave organization</h2>
                <p className="delete-warning">
                    Are you sure you want to leave <strong>{orgName}</strong>? You'll lose access to its projects and reports, and any of your assignee/reviewer assignments on its reports will be removed. You can request to rejoin later.
                </p>
                {error && <div className="form-error">{error}</div>}
                <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn-danger" onClick={confirmLeave} disabled={loading}>
                        {loading ? 'Leaving…' : 'Leave organization'}
                    </button>
                </div>
            </div>
        </div>
    );
}
