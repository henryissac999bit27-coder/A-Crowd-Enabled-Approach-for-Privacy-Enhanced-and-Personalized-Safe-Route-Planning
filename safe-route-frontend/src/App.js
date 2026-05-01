import 'leaflet/dist/leaflet.css';
import { AuthProvider, useAuth } from './AuthContext';
import Login     from './Login';
import Dashboard from './Dashboard';

function AppInner() {
    const { isLoggedIn, loading } = useAuth();

    if (loading) return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontFamily: 'sans-serif', color: '#888', fontSize: 14,
        }}>Loading...</div>
    );

    return isLoggedIn ? <Dashboard /> : <Login />;
}

export default function App() {
    return (
        <AuthProvider>
            <AppInner />
        </AuthProvider>
    );
}
