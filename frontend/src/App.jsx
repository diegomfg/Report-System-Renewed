import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import OrgLayout from './layouts/OrgLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OrgHubPage from './pages/OrgHubPage';
import DashboardPage from './pages/DashboardPage';
import ProjectPage from './pages/ProjectPage';
import ReportPage from './pages/ReportPage';
import MembersPage from './pages/MembersPage';

function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading) return null;
    return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <OrgHubPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/orgs/:orgId"
                element={
                    <ProtectedRoute>
                        <OrgLayout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<DashboardPage />} />
                <Route path="projects/:projectId" element={<ProjectPage />} />
                <Route path="projects/:projectId/reports/:reportId" element={<ReportPage />} />
                <Route path="members" element={<MembersPage />} />
            </Route>
        </Routes>
    );
}
