// App.jsx
// Root component — renders Login or Dashboard based on auth state

import 'leaflet/dist/leaflet.css';
import { AuthProvider, useAuth } from './AuthContext';
import Login     from './Login';
import Dashboard from './Dashboard';

function AppInner() {
    const { isLoggedIn, loading } = useAuth();

    if (loading) return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
            fontFamily: 'sans-serif',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 14,
            gap: 10,
        }}>
            <span style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.2)',
                borderTopColor: '#38bdf8',
                display: 'inline-block',
                animation: 'spin 0.8s linear infinite'
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            Restoring session...
        </div>
    );

    // Key behaviour:
    // isLoggedIn = true  → Dashboard (after successful login() call in Login.jsx)
    // isLoggedIn = false → Login page
    return isLoggedIn ? <Dashboard /> : <Login />;
}

export default function App() {
    return (
        <AuthProvider>
            <AppInner />
        </AuthProvider>
    );
}
