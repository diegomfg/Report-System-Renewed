import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import PersonPicker from '../components/PersonPicker';

export default function ProjectPage() {
    const { projectId } = useParams();
    const { user } = useAuth();
    const { orgId, role } = useOrg();
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [members, setMembers] = useState([]);
    const [reports, setReports] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [removeTarget, setRemoveTarget] = useState(null);

    const load = useCallback(async () => {
        try {
            const [projRes, reportsRes, requestsRes] = await Promise.all([
                api.get(`/orgs/${orgId}/projects/${projectId}`),
                api.get(`/orgs/${orgId}/projects/${projectId}/reports`),
                role === 'admin'
                    ? api.get(`/orgs/${orgId}/projects/${projectId}/requests`)
                    : Promise.resolve({ data: { requests: [] } }),
            ]);
            setProject(projRes.data.project);
            setMembers(projRes.data.members);
            setReports(reportsRes.data.reports);
            setRequests(requestsRes.data.requests);
        } catch {
            setError('Could not load project.');
        } finally {
            setLoading(false);
        }
    }, [orgId, projectId, role]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="page-loading">Loading project…</div>;
    if (error || !project) return <div className="page-error">{error || 'Project not found.'}</div>;

    const projectMemberCount = members.filter(m => m.projectStatus === 'in_project').length;
    const isProjectMember = members.some(m => m.id === user.id && m.projectStatus === 'in_project');
    const canCreateReport = role === 'admin' || isProjectMember;

    const openCount = reports.filter(r => r.status === 'open').length;
    const inProgressCount = reports.filter(r => r.status === 'in_progress').length;
    const resolvedCount = reports.filter(r => r.status === 'resolved').length;

    const statusSummary = [
        openCount > 0 && `${openCount} open`,
        inProgressCount > 0 && `${inProgressCount} in progress`,
        resolvedCount > 0 && `${resolvedCount} resolved`,
    ].filter(Boolean).join(' · ') || 'No reports yet';

    const resolveRequest = async (requestId, action) => {
        try {
            await api.patch(`/orgs/${orgId}/projects/${projectId}/requests/${requestId}`, { action });
            load();
        } catch (err) {
            alert(err.response?.data?.error || 'Action failed.');
        }
    };

    const projectMembers = members.filter(m => m.projectStatus === 'in_project');
    const addableMembers = members.filter(m => m.projectStatus === null);

    const addMember = async (userId) => {
        try {
            await api.post(`/orgs/${orgId}/projects/${projectId}/members`, { userId });
            load();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to add member');
        }
    };


    return (
        <div className="project-detail">
            <Link to={`/orgs/${orgId}`} className="back-link">← Projects</Link>

            <div className="project-detail-header">
                <h1>{project.name}</h1>
                {project.description && (
                    <p className="project-detail-desc">{project.description}</p>
                )}
                <div className="project-detail-meta">
                    <span>Created {formatDate(project.createdAt)}</span>
                    <span className="meta-sep">·</span>
                    <span>{projectMemberCount} member{projectMemberCount !== 1 ? 's' : ''}</span>
                    <span className="meta-sep">·</span>
                    <span>{statusSummary}</span>
                </div>
            </div>

            <div className="people-section members-management">
                <div className="section-header">
                    <h2>Members <span className="members-count">({projectMembers.length})</span></h2>
                </div>
                {projectMembers.length === 0 ? (
                    <p className="people-empty">No members yet.</p>
                ) : (
                    <ul className="person-list">
                        {projectMembers.map(m => (
                            <li key={m.id} className="person-chip">
                                <span>{m.name}</span>
                                {role === 'admin' && (
                                    <button
                                        className="chip-remove"
                                        aria-label={`Remove ${m.name}`}
                                        onClick={() => setRemoveTarget(m)}
                                    >
                                        ×
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {role === 'admin' && addableMembers.length > 0 && (
                    <PersonPicker
                        candidates={addableMembers}
                        placeholder="Add member…"
                        onAdd={addMember}
                    />
                )}
            </div>

            {role === 'admin' && (
                <div className="requests-section">
                    <div className="section-header">
                        <h2>
                            Join Requests
                            {requests.length > 0 && (
                                <span className="requests-badge">{requests.length}</span>
                            )}
                        </h2>
                    </div>
                    {requests.length === 0 ? (
                        <p className="requests-empty">No pending join requests.</p>
                    ) : (
                        <ul className="request-list">
                            {requests.map(req => (
                                <li key={req.id} className="request-item">
                                    <div className="request-info">
                                        <span className="request-name">{req.user.name}</span>
                                        <span className="request-email">{req.user.email}</span>
                                    </div>
                                    <div className="request-actions">
                                        <button className="btn-approve" onClick={() => resolveRequest(req.id, 'approve')}>
                                            Approve
                                        </button>
                                        <button className="btn-secondary" onClick={() => resolveRequest(req.id, 'reject')}>
                                            Deny
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <div className="reports-section">
                <div className="section-header">
                    <h2>Reports</h2>
                    {canCreateReport && reports.length > 0 && (
                        <button className="btn-create" onClick={() => setShowCreate(true)}>
                            New Report
                        </button>
                    )}
                </div>

                {reports.length === 0 ? (
                    <div className="empty-state">
                        <p className="empty-state-title">No reports yet.</p>
                        {canCreateReport && (
                            <button className="btn-create" onClick={() => setShowCreate(true)}>
                                Create new report
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="project-grid">
                        {reports.map(report => (
                            <ReportCard
                                key={report.id}
                                report={report}
                                onClick={() => navigate(`/orgs/${orgId}/projects/${projectId}/reports/${report.id}`)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {role === 'admin' && (
                <div className="danger-zone">
                    <div className="danger-zone-header">
                        <h2>Danger Zone</h2>
                    </div>
                    <div className="danger-zone-item">
                        <div className="danger-zone-info">
                            <span className="danger-zone-label">Delete this project</span>
                            <span className="danger-zone-desc">
                                Once deleted, all reports and data will be permanently removed.
                            </span>
                        </div>
                        <button className="btn-danger" onClick={() => setShowDelete(true)}>
                            Delete Project
                        </button>
                    </div>
                </div>
            )}

            {showCreate && (
                <CreateReportModal
                    orgId={orgId}
                    projectId={projectId}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); load(); }}
                />
            )}

            {showDelete && (
                <DeleteProjectModal
                    project={project}
                    orgId={orgId}
                    onClose={() => setShowDelete(false)}
                    onDeleted={() => navigate(`/orgs/${orgId}`)}
                />
            )}

            {removeTarget && (
                <RemoveMemberModal
                    member={removeTarget}
                    orgId={orgId}
                    projectId={projectId}
                    onClose={() => setRemoveTarget(null)}
                    onRemoved={() => { setRemoveTarget(null); load(); }}
                />
            )}
        </div>
    );
}

function ReportCard({ report, onClick }) {
    return (
        <div className="project-card" onClick={onClick}>
            {(report.assignedToMe || report.isReviewer) && (
                <div className="card-tags">
                    {report.assignedToMe && <span className="card-tag">Assigned to you</span>}
                    {report.isReviewer && <span className="card-tag card-tag-reviewer">Reviewing</span>}
                </div>
            )}
            <div className="project-card-header">
                <h2>{report.title}</h2>
            </div>
            <div className="report-card-badges">
                <span className={`badge badge-severity-${report.severity}`}>{report.severity}</span>
                <span className={`badge badge-status-${report.status}`}>{report.status.replace('_', ' ')}</span>
            </div>
            {report.description && (
                <p className="project-card-desc">{report.description}</p>
            )}
            <div className="project-card-meta">
                <span>{formatDate(report.createdAt)}</span>
                <span>by {report.createdBy.name}</span>
            </div>
        </div>
    );
}

function CreateReportModal({ orgId, projectId, onClose, onCreated }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState('medium');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await api.post(`/orgs/${orgId}/projects/${projectId}/reports`, { title, description, severity });
            onCreated();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create report');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2>New Report</h2>
                <form onSubmit={submit}>
                    <div className="form-group">
                        <label>Title</label>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Report title"
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Describe the issue…"
                            rows={4}
                        />
                    </div>
                    <div className="form-group">
                        <label>Severity</label>
                        <select value={severity} onChange={e => setSeverity(e.target.value)}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>
                    {error && <div className="form-error">{error}</div>}
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-create" disabled={loading || !title.trim() || !description.trim()}>
                            {loading ? 'Creating…' : 'Create Report'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function RemoveMemberModal({ member, orgId, projectId, onClose, onRemoved }) {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        setLoading(true);
        setError('');
        try {
            await api.delete(`/orgs/${orgId}/projects/${projectId}/members/${member.id}`);
            onRemoved();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to remove member');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2>Remove member</h2>
                <p className="delete-warning">
                    Are you sure you want to remove <strong>{member.name}</strong> from this project?
                </p>
                {error && <div className="form-error">{error}</div>}
                <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn-danger" onClick={submit} disabled={loading}>
                        {loading ? 'Removing…' : 'Remove'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function DeleteProjectModal({ project, orgId, onClose, onDeleted }) {
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await api.delete(`/orgs/${orgId}/projects/${project.id}`);
            onDeleted();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to delete project');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2>Delete project</h2>
                <p className="delete-warning">
                    This action <strong>cannot be undone</strong>. This will permanently delete the{' '}
                    <strong>{project.name}</strong> project, along with all its reports and comments.
                </p>
                <form onSubmit={submit}>
                    <div className="form-group">
                        <label>Type <strong>{project.name}</strong> to confirm</label>
                        <input
                            value={confirm}
                            onChange={e => setConfirm(e.target.value)}
                            placeholder={project.name}
                            autoFocus
                            autoComplete="off"
                        />
                    </div>
                    {error && <div className="form-error">{error}</div>}
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button
                            type="submit"
                            className="btn-danger"
                            disabled={loading || confirm !== project.name}
                        >
                            {loading ? 'Deleting…' : 'Delete this project'}
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
