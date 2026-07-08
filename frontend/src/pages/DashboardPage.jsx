import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useOrg } from '../context/OrgContext';

export default function DashboardPage() {
    const { orgId, role } = useOrg();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        api.get(`/orgs/${orgId}/projects`)
            .then(res => setProjects(res.data.projects))
            .catch(() => setError('Could not load projects.'))
            .finally(() => setLoading(false));
    }, [orgId]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="page-loading">Loading projects…</div>;
    if (error) return <div className="page-error">{error}</div>;

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <h1>Projects</h1>
                {role === 'admin' && projects.length > 0 && (
                    <button className="btn-create" onClick={() => setShowCreate(true)}>
                        New Project
                    </button>
                )}
            </div>

            {projects.length === 0 ? (
                <div className="empty-state">
                    <p className="empty-state-title">This organization has no projects yet.</p>
                    {role === 'admin' && (
                        <button className="btn-create" onClick={() => setShowCreate(true)}>
                            Create new project
                        </button>
                    )}
                </div>
            ) : (
                <div className="project-grid">
                    {projects.map(project => (
                        <ProjectCard key={project.id} project={project} orgId={orgId} role={role} />
                    ))}
                </div>
            )}

            {showCreate && (
                <CreateProjectModal
                    orgId={orgId}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); load(); }}
                />
            )}
        </div>
    );
}

function ProjectCard({ project, orgId, role }) {
    const navigate = useNavigate();
    const [status, setStatus] = useState(project.yourStatus);

    const statusLabel = { in_project: 'Member', pending: 'Pending' }[status] ?? null;

    const requestJoin = async (e) => {
        e.stopPropagation();
        try {
            await api.post(`/orgs/${orgId}/projects/${project.id}/request`);
            setStatus('pending');
        } catch (err) {
            alert(err.response?.data?.error || 'Request failed.');
        }
    };

    return (
        <div className="project-card" onClick={() => navigate(`/orgs/${orgId}/projects/${project.id}`)}>
            <div className="project-card-header">
                <h2>{project.name}</h2>
                {statusLabel && (
                    <span className={`badge badge-${status}`}>{statusLabel}</span>
                )}
            </div>
            {project.description && (
                <p className="project-card-desc">{project.description}</p>
            )}
            <div className="project-card-meta">
                <span>{formatDate(project.createdAt)}</span>
                <span>{project._count.members} member{project._count.members !== 1 ? 's' : ''}</span>
                <span>{project._count.reports} report{project._count.reports !== 1 ? 's' : ''}</span>
            </div>
            {role === 'member' && status === null && (
                <button className="btn-request-join" onClick={requestJoin}>
                    Request to join
                </button>
            )}
        </div>
    );
}

function CreateProjectModal({ orgId, onClose, onCreated }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await api.post(`/orgs/${orgId}/projects`, { name, description });
            onCreated();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create project');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2>New Project</h2>
                <form onSubmit={submit}>
                    <div className="form-group">
                        <label>Name</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Project name"
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label>Description <span className="optional">(optional)</span></label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="What is this project about?"
                            rows={3}
                        />
                    </div>
                    {error && <div className="form-error">{error}</div>}
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-create" disabled={loading || !name.trim()}>
                            {loading ? 'Creating…' : 'Create Project'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
