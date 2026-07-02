import { useCallback, useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function MembersPage() {
    const { user } = useAuth();
    const orgId = user.organizationId;

    const [members, setMembers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const [orgRes, requestsRes] = await Promise.all([
                api.get(`/orgs/${orgId}`),
                user.role === 'admin'
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
    }, [orgId, user.role]);

    useEffect(() => { load(); }, [load]);

    const resolveRequest = async (requestId, action) => {
        try {
            await api.patch(`/orgs/${orgId}/requests/${requestId}`, { action });
            load();
        } catch (err) {
            alert(err.response?.data?.error || 'Action failed.');
        }
    };

    if (loading) return <div className="page-loading">Loading members…</div>;
    if (error) return <div className="page-error">{error}</div>;

    return (
        <div className="members-page">
            {user.role === 'admin' && (
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
                            <span className={`badge badge-role badge-${m.role}`}>{m.role}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
