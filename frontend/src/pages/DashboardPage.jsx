import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
    const { user } = useAuth();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get(`/orgs/${user.organizationId}/projects`)
            .then(res => setProjects(res.data.projects))
            .catch(() => setError('Could not load projects.'))
            .finally(() => setLoading(false));
    }, [user.organizationId]);

    if (loading) return <div className="page-loading">Loading projects…</div>;
    if (error) return <div className="page-error">{error}</div>;

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <h1>Projects</h1>
            </div>

            {projects.length === 0 ? (
                <div className="empty-state">
                    <p>
                        {user.role === 'admin'
                            ? 'No projects yet. Create one to get started.'
                            : 'No projects found in this organization.'}
                    </p>
                </div>
            ) : (
                <div className="project-grid">
                    {projects.map(project => (
                        <ProjectCard key={project.id} project={project} />
                    ))}
                </div>
            )}
        </div>
    );
}

function ProjectCard({ project }) {
    const statusLabel = {
        in_project: 'Member',
        pending: 'Pending',
        null: null,
    }[project.yourStatus] ?? null;

    return (
        <div className="project-card">
            <div className="project-card-header">
                <h2>{project.name}</h2>
                {statusLabel && (
                    <span className={`badge badge-${project.yourStatus}`}>{statusLabel}</span>
                )}
            </div>
            {project.description && (
                <p className="project-card-desc">{project.description}</p>
            )}
            <div className="project-card-meta">
                <span>{project._count.members} member{project._count.members !== 1 ? 's' : ''}</span>
                <span>{project._count.reports} report{project._count.reports !== 1 ? 's' : ''}</span>
            </div>
        </div>
    );
}
