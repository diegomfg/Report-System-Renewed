import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function OrgHubPage() {
    const { logout } = useAuth();

    return (
        <div className="onboarding-page">
            <button className="onboarding-signout btn-logout" onClick={logout}>Sign out</button>
            <div className="onboarding-header">
                <h1>Welcome to Report System</h1>
                <p>Pick up where you left off, switch organizations, or start something new.</p>
            </div>
            <YourOrgsPanel />
            <div className="onboarding-panels">
                <CreateOrgPanel />
                <BrowseOrgsPanel />
            </div>
        </div>
    );
}

function YourOrgsPanel() {
    const navigate = useNavigate();
    const [orgs, setOrgs] = useState(null);
    const [error, setError] = useState('');
    const lastOrgId = localStorage.getItem('lastOrgId');

    useEffect(() => {
        api.get('/orgs')
            .then(res => setOrgs(res.data.organizations))
            .catch(() => setError('Could not load your organizations.'));
    }, []);

    if (error) return <p className="form-error">{error}</p>;
    if (orgs === null) return <p className="panel-loading">Loading your organizations…</p>;
    if (orgs.length === 0) return null;

    const sorted = [...orgs].sort((a, b) => (a.id === lastOrgId ? -1 : b.id === lastOrgId ? 1 : 0));

    return (
        <div className="onboarding-panel your-orgs-panel">
            <h2>Your organizations</h2>
            <ul className="org-list">
                {sorted.map(org => {
                    const isLast = org.id === lastOrgId;
                    return (
                        <li key={org.id} className="org-list-item">
                            <div className="org-list-info">
                                <span className="org-list-name">{org.name}</span>
                                <span className="org-list-meta">
                                    {org._count.members} member{org._count.members !== 1 ? 's' : ''} · {org._count.projects} project{org._count.projects !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <button
                                className={isLast ? 'btn-primary' : 'btn-secondary'}
                                onClick={() => navigate(`/orgs/${org.id}`)}
                            >
                                {isLast ? 'Continue' : 'Open'}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function CreateOrgPanel() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: '', description: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    function handleChange(e) {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { data } = await api.post('/orgs', form);
            navigate(`/orgs/${data.organization.id}`);
        } catch (err) {
            setError(err.response?.data?.error ?? 'Something went wrong.');
            setLoading(false);
        }
    }

    return (
        <div className="onboarding-panel">
            <h2>Create an organization</h2>
            <p className="panel-subtitle">Start fresh — you'll become the admin.</p>
            <form onSubmit={handleSubmit}>
                {error && <p className="form-error">{error}</p>}
                <div className="form-group">
                    <label htmlFor="org-name">Name</label>
                    <input
                        id="org-name"
                        name="name"
                        type="text"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Acme Corp"
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="org-desc">Description <span className="optional">(optional)</span></label>
                    <input
                        id="org-desc"
                        name="description"
                        type="text"
                        value={form.description}
                        onChange={handleChange}
                        placeholder="What does your org do?"
                    />
                </div>
                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? 'Creating…' : 'Create organization'}
                </button>
            </form>
        </div>
    );
}

function BrowseOrgsPanel() {
    const [orgs, setOrgs] = useState([]);
    const [requested, setRequested] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get('/orgs/browse')
            .then(res => setOrgs(res.data.organizations))
            .catch(() => setError('Could not load organizations.'))
            .finally(() => setLoading(false));
    }, []);

    async function requestJoin(orgId) {
        try {
            await api.post(`/orgs/${orgId}/request`);
            setRequested(prev => new Set(prev).add(orgId));
        } catch (err) {
            alert(err.response?.data?.error ?? 'Request failed.');
        }
    }

    return (
        <div className="onboarding-panel">
            <h2>Join an organization</h2>
            <p className="panel-subtitle">Request access — an admin will approve you.</p>
            {loading && <p className="panel-loading">Loading…</p>}
            {error && <p className="form-error">{error}</p>}
            {!loading && !error && orgs.length === 0 && (
                <p className="empty-state">No organizations found.</p>
            )}
            <ul className="org-list">
                {orgs.map(org => (
                    <li key={org.id} className="org-list-item">
                        <div className="org-list-info">
                            <span className="org-list-name">{org.name}</span>
                            {org.description && (
                                <span className="org-list-desc">{org.description}</span>
                            )}
                            <span className="org-list-meta">
                                {org._count.members} member{org._count.members !== 1 ? 's' : ''} · {org._count.projects} project{org._count.projects !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <button
                            className="btn-secondary"
                            onClick={() => requestJoin(org.id)}
                            disabled={requested.has(org.id)}
                        >
                            {requested.has(org.id) ? 'Requested' : 'Request to join'}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
