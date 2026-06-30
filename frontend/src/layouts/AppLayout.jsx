import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import OnboardingPage from '../pages/OnboardingPage';
import api from '../api/axios';

export default function AppLayout() {
    const { user } = useAuth();

    if (!user.organizationId) return <OnboardingPage />;

    return (
        <div className="app-shell">
            <Sidebar />
            <main className="app-main">
                <Outlet />
            </main>
        </div>
    );
}

function Sidebar() {
    const { user, logout } = useAuth();
    const [orgName, setOrgName] = useState('');

    useEffect(() => {
        api.get(`/orgs/${user.organizationId}`)
            .then(res => setOrgName(res.data.organization.name))
            .catch(() => setOrgName('Organization'));
    }, [user.organizationId]);

    return (
        <aside className="sidebar">
            <div className="sidebar-top">
                <div className="sidebar-org">
                    <span className="sidebar-app-name">Report System</span>
                    <span className="sidebar-org-name">{orgName || '…'}</span>
                </div>
                <nav className="sidebar-nav">
                    <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Projects
                    </NavLink>
                </nav>
            </div>
            <div className="sidebar-bottom">
                <div className="sidebar-user">
                    <span className="sidebar-user-name">{user.name}</span>
                    <span className={`badge badge-role badge-${user.role}`}>{user.role}</span>
                </div>
                <button className="btn-logout" onClick={logout}>Sign out</button>
            </div>
        </aside>
    );
}
