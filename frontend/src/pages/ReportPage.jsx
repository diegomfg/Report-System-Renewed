import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import PersonPicker from '../components/PersonPicker';

export default function ReportPage() {
    const { projectId, reportId } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const orgId = user.organizationId;

    const [report, setReport] = useState(null);
    const [comments, setComments] = useState([]);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showEdit, setShowEdit] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [replyingTo, setReplyingTo] = useState(null);

    const load = useCallback(async () => {
        try {
            const [reportRes, commentsRes, projectRes] = await Promise.all([
                api.get(`/orgs/${orgId}/projects/${projectId}/reports/${reportId}`),
                api.get(`/orgs/${orgId}/projects/${projectId}/reports/${reportId}/comments`),
                api.get(`/orgs/${orgId}/projects/${projectId}`),
            ]);
            setReport(reportRes.data.report);
            setComments(commentsRes.data.comments);
            setMembers(projectRes.data.members);
        } catch {
            setError('Could not load report.');
        } finally {
            setLoading(false);
        }
    }, [orgId, projectId, reportId]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="page-loading">Loading report…</div>;
    if (error || !report) return <div className="page-error">{error || 'Report not found.'}</div>;

    const isAdmin = user.role === 'admin';
    const isCreator = report.createdBy.id === user.id;
    const isAssignee = report.assignees.some(a => a.user.id === user.id);
    const isReviewer = report.reviewers.some(r => r.user.id === user.id);
    const isProjectMember = members.some(m => m.id === user.id && m.projectStatus === 'in_project');

    const canManage = isAdmin || isCreator;
    const canEdit = isProjectMember;
    const canComment = isAdmin || isCreator || isAssignee || isReviewer;

    const assigneeIds = new Set(report.assignees.map(a => a.user.id));
    const reviewerIds = new Set(report.reviewers.map(r => r.user.id));
    const assigneeCandidates = members.filter(m => m.projectStatus === 'in_project' && !assigneeIds.has(m.id));
    const reviewerCandidates = members.filter(m => !reviewerIds.has(m.id));

    const commentCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);

    const addAssignee = async (userId) => {
        try {
            await api.post(`/orgs/${orgId}/projects/${projectId}/reports/${reportId}/assignees`, { userId });
            load();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to add assignee');
        }
    };

    const removeAssignee = async (userId) => {
        try {
            await api.delete(`/orgs/${orgId}/projects/${projectId}/reports/${reportId}/assignees/${userId}`);
            load();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to remove assignee');
        }
    };

    const addReviewer = async (userId) => {
        try {
            await api.post(`/orgs/${orgId}/projects/${projectId}/reports/${reportId}/reviewers`, { userId });
            load();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to add reviewer');
        }
    };

    const removeReviewer = async (userId) => {
        try {
            await api.delete(`/orgs/${orgId}/projects/${projectId}/reports/${reportId}/reviewers/${userId}`);
            load();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to remove reviewer');
        }
    };

    const postComment = async (parentId, body) => {
        try {
            await api.post(`/orgs/${orgId}/projects/${projectId}/reports/${reportId}/comments`, { body, parentId });
            setReplyingTo(null);
            load();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to post comment');
            throw err;
        }
    };

    const editComment = async (commentId, body) => {
        try {
            await api.patch(`/orgs/${orgId}/projects/${projectId}/reports/${reportId}/comments/${commentId}`, { body });
            load();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to edit comment');
            throw err;
        }
    };

    const deleteComment = async (commentId) => {
        if (!confirm('Delete this comment?')) return;
        try {
            await api.delete(`/orgs/${orgId}/projects/${projectId}/reports/${reportId}/comments/${commentId}`);
            load();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete comment');
        }
    };

    return (
        <div className="report-detail">
            <Link to={`/projects/${projectId}`} className="back-link">← Project</Link>

            <div className="report-detail-header">
                <div className="report-detail-title-row">
                    <h1>{report.title}</h1>
                    {canEdit && (
                        <button className="btn-secondary" onClick={() => setShowEdit(true)}>Edit</button>
                    )}
                </div>
                <div className="report-card-badges">
                    <span className={`badge badge-severity-${report.severity}`}>{report.severity}</span>
                    <span className={`badge badge-status-${report.status}`}>{report.status.replace('_', ' ')}</span>
                </div>
                <p className="project-detail-desc">{report.description}</p>
                <div className="project-detail-meta">
                    <span>Created {formatDate(report.createdAt)}</span>
                    <span className="meta-sep">·</span>
                    <span>by {report.createdBy.name}</span>
                </div>
            </div>

            <div className="people-section">
                <div className="section-header"><h2>Assignees</h2></div>
                {report.assignees.length === 0 ? (
                    <p className="people-empty">No assignees yet.</p>
                ) : (
                    <ul className="person-list">
                        {report.assignees.map(a => (
                            <li key={a.user.id} className="person-chip">
                                <span>{a.user.name}</span>
                                {canManage && (
                                    <button
                                        className="chip-remove"
                                        aria-label={`Remove ${a.user.name}`}
                                        onClick={() => removeAssignee(a.user.id)}
                                    >
                                        ×
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {canManage && assigneeCandidates.length > 0 && (
                    <PersonPicker
                        candidates={assigneeCandidates}
                        placeholder="Add assignee…"
                        onAdd={addAssignee}
                    />
                )}
            </div>

            <div className="people-section">
                <div className="section-header"><h2>Reviewers</h2></div>
                {report.reviewers.length === 0 ? (
                    <p className="people-empty">No reviewers yet.</p>
                ) : (
                    <ul className="person-list">
                        {report.reviewers.map(r => (
                            <li key={r.user.id} className="person-chip">
                                <span>{r.user.name}</span>
                                {canManage && (
                                    <button
                                        className="chip-remove"
                                        aria-label={`Remove ${r.user.name}`}
                                        onClick={() => removeReviewer(r.user.id)}
                                    >
                                        ×
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {canManage && reviewerCandidates.length > 0 && (
                    <PersonPicker
                        candidates={reviewerCandidates}
                        placeholder="Add reviewer…"
                        onAdd={addReviewer}
                    />
                )}
            </div>

            <div className="comments-section">
                <div className="section-header">
                    <h2>Comments{commentCount > 0 && ` (${commentCount})`}</h2>
                </div>

                {comments.length === 0 ? (
                    <p className="comments-empty">No comments yet.</p>
                ) : (
                    <ul className="comment-list">
                        {comments.map(comment => (
                            <CommentItem
                                key={comment.id}
                                comment={comment}
                                currentUser={user}
                                canComment={canComment}
                                replyingTo={replyingTo}
                                setReplyingTo={setReplyingTo}
                                onReply={postComment}
                                onEdit={editComment}
                                onDelete={deleteComment}
                            />
                        ))}
                    </ul>
                )}

                {canComment && (
                    <CommentComposer
                        placeholder="Write a comment…"
                        onSubmit={body => postComment(null, body)}
                    />
                )}
            </div>

            {canManage && (
                <div className="danger-zone">
                    <div className="danger-zone-header">
                        <h2>Danger Zone</h2>
                    </div>
                    <div className="danger-zone-item">
                        <div className="danger-zone-info">
                            <span className="danger-zone-label">Delete this report</span>
                            <span className="danger-zone-desc">
                                Once deleted, this report and all of its comments will be permanently removed.
                            </span>
                        </div>
                        <button className="btn-danger" onClick={() => setShowDelete(true)}>
                            Delete Report
                        </button>
                    </div>
                </div>
            )}

            {showEdit && (
                <EditReportModal
                    report={report}
                    orgId={orgId}
                    projectId={projectId}
                    onClose={() => setShowEdit(false)}
                    onSaved={() => { setShowEdit(false); load(); }}
                />
            )}

            {showDelete && (
                <DeleteReportModal
                    report={report}
                    orgId={orgId}
                    projectId={projectId}
                    onClose={() => setShowDelete(false)}
                    onDeleted={() => navigate(`/projects/${projectId}`)}
                />
            )}
        </div>
    );
}

function CommentComposer({ placeholder, onSubmit, onCancel, autoFocus }) {
    const [body, setBody] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setLoading(true);
        try {
            await onSubmit(body.trim());
            setBody('');
        } catch {
            // error already surfaced by the handler
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={submit} className="comment-composer">
            <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={placeholder}
                rows={3}
                autoFocus={autoFocus}
            />
            <div className="comment-composer-actions">
                {onCancel && (
                    <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
                )}
                <button type="submit" className="btn-create" disabled={loading || !body.trim()}>
                    {loading ? 'Posting…' : 'Post'}
                </button>
            </div>
        </form>
    );
}

function CommentItem({ comment, currentUser, canComment, replyingTo, setReplyingTo, onReply, onEdit, onDelete }) {
    const [editing, setEditing] = useState(false);
    const [editBody, setEditBody] = useState(comment.body);

    const isDeleted = !!comment.deletedAt;
    const isAuthor = !isDeleted && comment.author?.id === currentUser.id;
    const canDelete = !isDeleted && (isAuthor || currentUser.role === 'admin');
    const isTopLevel = !comment.parentId;

    const submitEdit = async (e) => {
        e.preventDefault();
        if (!editBody.trim()) return;
        try {
            await onEdit(comment.id, editBody.trim());
            setEditing(false);
        } catch {
            // error already surfaced by the handler
        }
    };

    return (
        <li className="comment-item">
            <div className="comment-header">
                <span className="comment-author">{isDeleted ? 'Deleted' : comment.author.name}</span>
                <span className="comment-date">{formatDateTime(comment.createdAt)}</span>
            </div>

            {editing ? (
                <form onSubmit={submitEdit} className="comment-edit-form">
                    <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={3} autoFocus />
                    <div className="comment-edit-actions">
                        <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                        <button type="submit" className="btn-create" disabled={!editBody.trim()}>Save</button>
                    </div>
                </form>
            ) : (
                <p className={isDeleted ? 'comment-body comment-deleted' : 'comment-body'}>{comment.body}</p>
            )}

            {!isDeleted && !editing && (
                <div className="comment-actions">
                    {canComment && isTopLevel && (
                        <button
                            className="btn-link"
                            onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                        >
                            Reply
                        </button>
                    )}
                    {isAuthor && (
                        <button className="btn-link" onClick={() => setEditing(true)}>Edit</button>
                    )}
                    {canDelete && (
                        <button className="btn-link btn-link-danger" onClick={() => onDelete(comment.id)}>Delete</button>
                    )}
                </div>
            )}

            {replyingTo === comment.id && (
                <CommentComposer
                    placeholder="Write a reply…"
                    autoFocus
                    onCancel={() => setReplyingTo(null)}
                    onSubmit={body => onReply(comment.id, body)}
                />
            )}

            {comment.replies?.length > 0 && (
                <ul className="comment-replies">
                    {comment.replies.map(reply => (
                        <CommentItem
                            key={reply.id}
                            comment={reply}
                            currentUser={currentUser}
                            canComment={canComment}
                            replyingTo={replyingTo}
                            setReplyingTo={setReplyingTo}
                            onReply={onReply}
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

function EditReportModal({ report, orgId, projectId, onClose, onSaved }) {
    const [title, setTitle] = useState(report.title);
    const [description, setDescription] = useState(report.description);
    const [severity, setSeverity] = useState(report.severity);
    const [status, setStatus] = useState(report.status);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await api.patch(`/orgs/${orgId}/projects/${projectId}/reports/${report.id}`, {
                title, description, severity, status
            });
            onSaved();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update report');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2>Edit Report</h2>
                <form onSubmit={submit}>
                    <div className="form-group">
                        <label>Title</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} autoFocus />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} />
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
                    <div className="form-group">
                        <label>Status</label>
                        <select value={status} onChange={e => setStatus(e.target.value)}>
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                        </select>
                    </div>
                    {error && <div className="form-error">{error}</div>}
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-create" disabled={loading || !title.trim() || !description.trim()}>
                            {loading ? 'Saving…' : 'Save changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function DeleteReportModal({ report, orgId, projectId, onClose, onDeleted }) {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const confirmDelete = async () => {
        setLoading(true);
        setError('');
        try {
            await api.delete(`/orgs/${orgId}/projects/${projectId}/reports/${report.id}`);
            onDeleted();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to delete report');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2>Delete report</h2>
                <p className="delete-warning">
                    This action <strong>cannot be undone</strong>. This will permanently delete{' '}
                    <strong>{report.title}</strong> and all of its comments.
                </p>
                {error && <div className="form-error">{error}</div>}
                <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn-danger" onClick={confirmDelete} disabled={loading}>
                        {loading ? 'Deleting…' : 'Delete this report'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso) {
    return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
}
