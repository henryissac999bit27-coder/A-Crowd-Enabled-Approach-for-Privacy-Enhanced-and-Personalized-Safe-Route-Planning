// AuthContext.js
// Global auth state — wraps the whole app
// Provides: user, token, login(), logout(), loading

import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API = 'https://safe-route-backend-byec.onrender.com';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user,    setUser]    = useState(null);   // { userId, username, cellsKnown, personalBeta }
    const [token,   setToken]   = useState(null);
    const [loading, setLoading] = useState(true);   // checking localStorage on mount

    // On app load — restore session from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('sr_token');
        if (saved) {
            setToken(saved);
            axios.defaults.headers.common['Authorization'] = 'Bearer ' + saved;
            axios.get(API + '/api/auth/me')
                .then((r) => { setUser(r.data); })
                .catch(()  => {
                    localStorage.removeItem('sr_token');
                    setToken(null);
                })
                .finally(() => { setLoading(false); });
        } else {
            setLoading(false);
        }
    }, []);

    // Login — called from Login.jsx after successful POST /api/auth/login
    // Setting token triggers isLoggedIn = true → App re-renders → Dashboard shown
    function login(tokenStr, userData) {
        localStorage.setItem('sr_token', tokenStr);
        axios.defaults.headers.common['Authorization'] = 'Bearer ' + tokenStr;
        setUser(userData);
        setToken(tokenStr); // ← triggers re-render last so all state is ready
    }

    // Logout
    function logout() {
        localStorage.removeItem('sr_token');
        delete axios.defaults.headers.common['Authorization'];
        setToken(null);
        setUser(null);
    }

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading, isLoggedIn: !!token }}>
            {children}
        </AuthContext.Provider>
    );
}

// Hook to use auth anywhere
export function useAuth() {
    return useContext(AuthContext);
}
