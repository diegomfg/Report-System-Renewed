import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function OnboardingPage() {
    return (
        <div className="onboarding-page">
            <div className="onboarding-header">
                <h1>Welcome to Report System</h1>
                <p>You're not part of an organization yet. Create one or request to join an existing one.</p>
            </div>
            <div className="onboarding-panels">
                <CreateOrgPanel />
                <BrowseOrgsPanel />
            </div>
        </div>
    );
}

function CreateOrgPanel() {
    const { refreshUser } = useAuth();
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
            await api.post('/orgs', form);
            await refreshUser();
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
