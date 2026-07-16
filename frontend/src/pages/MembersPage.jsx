import { useCallback, useEffect, useState } from 'react';
import api from '../api/axios';
import { useOrg } from '../context/OrgContext';
import { useAuth } from '../context/AuthContext';

export default function MembersPage() {
    const { orgId, role, refreshBadges } = useOrg();
    const { user } = useAuth();

    const [members, setMembers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [removeTarget, setRemoveTarget] = useState(null);

    const [showActivity, setShowActivity] = useState(false);
    const [activity, setActivity] = useState([]);
    const [activityLoading, setActivityLoading] = useState(false);

    const load = useCallback(async () => {
        try {
            const [orgRes, requestsRes] = await Promise.all([
                api.get(`/orgs/${orgId}`),
                role === 'admin'
                    ? api.get(`/orgs/${orgId}/requests`)
                    : Promise.resolve({ data: { requests: [] } }),
            ]);
            setMembers(orgRes.data.organization.members);
            setRequests(requestsRes.data.requests);
        } catch {
            setError('Could not load members.');
        } finally {
            setLoading(false);
        }
    }, [orgId, role]);

    useEffect(() => { load(); }, [load]);

    const resolveRequest = async (requestId, action) => {
        try {
            await api.patch(`/orgs/${orgId}/requests/${requestId}`, { action });
            load();
            refreshBadges();
        } catch (err) {
            alert(err.response?.data?.error || 'Action failed.');
        }
    };

    const toggleActivity = async () => {
        if (showActivity) {
            setShowActivity(false);
            return;
        }
        setShowActivity(true);
        if (activity.length === 0) {
            setActivityLoading(true);
            try {
                const res = await api.get(`/orgs/${orgId}/activity`);
                setActivity(res.data.log);
            } catch {
                setActivity([]);
            } finally {
                setActivityLoading(false);
            }
        }
    };

    const describeEvent = (entry) => {
        const when = new Date(entry.createdAt).toLocaleString();
        if (entry.action === 'joined') {
            return entry.actor
                ? `${entry.user.name} joined the organization — approved by ${entry.actor.name} — ${when}`
                : `${entry.user.name} joined the organization — ${when}`;
        }
        if (entry.action === 'left') {
            return `${entry.user.name} left the organization — ${when}`;
        }
        return entry.actor
            ? `${entry.user.name} was removed by ${entry.actor.name} — ${when}`
            : `${entry.user.name} was removed — ${when}`;
    };

    if (loading) return <div className="page-loading">Loading members…</div>;
    if (error) return <div className="page-error">{error}</div>;

    return (
        <div className="members-page">
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

            <div className="members-section">
                <div className="section-header">
                    <h2>Members <span className="members-count">({members.length})</span></h2>
                </div>
                <ul className="member-list">
                    {members.map(m => (
                        <li key={m.userId} className="member-item">
                            <div className="member-info">
                                <span className="member-name">{m.user.name}</span>
                                <span className="member-email">{m.user.email}</span>
                            </div>
                            <div className="member-item-actions">
                                <span className={`badge badge-role badge-${m.role}`}>{m.role}</span>
                                {role === 'admin' && m.userId !== user.id && (
                                    <button
                                        className="chip-remove"
                                        aria-label={`Remove ${m.user.name}`}
                                        onClick={() => setRemoveTarget(m)}
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            {role === 'admin' && (
                <div className="activity-section">
                    <div className="section-header">
                        <h2>Activity</h2>
                        <button className="btn-link" onClick={toggleActivity}>
                            {showActivity ? 'Hide' : 'Show'}
                        </button>
                    </div>
                    {showActivity && (
                        activityLoading ? (
                            <p className="requests-empty">Loading activity…</p>
                        ) : activity.length === 0 ? (
                            <p className="requests-empty">No membership activity yet.</p>
                        ) : (
                            <ul className="activity-list">
                                {activity.map(entry => (
                                    <li key={entry.id} className="activity-item">
                                        {describeEvent(entry)}
                                    </li>
                                ))}
                            </ul>
                        )
                    )}
                </div>
            )}

            {removeTarget && (
                <RemoveOrgMemberModal
                    member={removeTarget}
                    orgId={orgId}
                    onClose={() => setRemoveTarget(null)}
                    onRemoved={() => {
                        setRemoveTarget(null);
                        load();
                        refreshBadges();
                        setActivity([]);
                    }}
                />
            )}
        </div>
    );
}

function RemoveOrgMemberModal({ member, orgId, onClose, onRemoved }) {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        setLoading(true);
        setError('');
        try {
            await api.delete(`/orgs/${orgId}/members/${member.userId}`);
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
                    Are you sure you want to remove <strong>{member.user.name}</strong> from this organization?
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
