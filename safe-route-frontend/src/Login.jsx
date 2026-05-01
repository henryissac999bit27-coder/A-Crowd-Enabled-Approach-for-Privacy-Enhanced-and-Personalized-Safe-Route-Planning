// Login.jsx — Upgraded Professional Safe Route Planner UI
import { useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const API = 'https://safe-route-backend-byec.onrender.com';

function BackgroundElements() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'radial-gradient(rgba(37, 99, 235, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse at center, black, transparent 80%)'
      }} />
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-10%',
        width: '50vw',
        height: '50vw',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        animation: 'pulse 15s infinite alternate'
      }} />
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1) translate(0, 0); }
          100% { transform: scale(1.2) translate(-5%, 5%); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Feature({ icon, title, desc }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: '20px',
        borderRadius: '20px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(12px)',
        marginBottom: 16,
        transition: 'transform 0.3s ease'
      }}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(10px)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0px)'}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
      }}>{icon}</div>
      <div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{title}</div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  );
}

function Stat({ num, label }) {
  return (
    <div style={{
      flex: 1,
      textAlign: 'center',
      padding: '16px 10px',
      borderRadius: 16,
      background: 'rgba(0,0,0,0.2)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ color: '#5eead4', fontSize: 22, fontWeight: 800, marginBottom: 2 }}>{num}</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Step 1: Login or Register
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload  = mode === 'login'
        ? { username, password }
        : { username, password, email };

      const r = await axios.post(API + endpoint, payload);
      const token = r.data.token;

      if (!token) {
        setError('No token received from server.');
        setLoading(false);
        return;
      }

      // Step 2: Set auth header before calling /me
      axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;

      // Step 3: Fetch user profile
      const me = await axios.get(API + '/api/auth/me');

      // Step 4: Call login() → sets token + user in context → App re-renders → Dashboard shown
      login(token, me.data);

    } catch (err) {
      // Detailed error to help debug
      if (err.response) {
        setError(err.response.data?.error || `Server error: ${err.response.status}`);
      } else if (err.request) {
        setError('Cannot reach server. Is the backend running on port 5000?');
      } else {
        setError('Unexpected error: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#0f172a',
      fontFamily: "'Inter', sans-serif",
      position: 'relative'
    }}>
      <BackgroundElements />

      {/* LEFT: HERO & PROJECT RECAP */}
      <div style={{
        width: '50%',
        padding: '60px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        zIndex: 1,
        color: 'white',
        borderRight: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div style={{ animation: 'slideUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px',
            borderRadius: '100px', background: 'rgba(94, 234, 212, 0.1)', color: '#5eead4',
            fontSize: 12, fontWeight: 700, marginBottom: 24, border: '1px solid rgba(94, 234, 212, 0.2)'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5eead4' }}></span>
            CROWD-POWERED NAVIGATOR
          </div>

          <h1 style={{ fontSize: '48px', fontWeight: 900, marginBottom: 16, letterSpacing: '-1.5px', lineHeight: 1.1 }}>
            Safest path, <br/>
            <span style={{ color: '#38bdf8' }}>Privacy first.</span>
          </h1>

          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 40, maxWidth: '480px' }}>
            A decentralized framework for secure urban travel. We use Federated Learning
            to personalize your safety weights without ever reading your raw data.
          </p>

          <div style={{ maxWidth: '500px' }}>
            <Feature icon="🛡️" title="Federated Personalization" desc="Each user trains a local β coefficient; only model weights are shared for aggregation." />
            <Feature icon="💧" title="Raindrop Optimization" desc="Our RDA algorithm finds higher safety thresholds than standard binary search." />
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 40, maxWidth: '500px' }}>
            <Stat num="481" label="Grid Cells" />
            <Stat num="30k+" label="Crime Data" />
            <Stat num="9" label="FL Rounds" />
          </div>
        </div>
      </div>

      {/* RIGHT: INTERACTIVE LOGIN CARD */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', zIndex: 1 }}>
        <div style={{
          width: '100%',
          maxWidth: '440px',
          background: 'rgba(30, 41, 59, 0.7)',
          backdropFilter: 'blur(40px)',
          borderRadius: '32px',
          padding: '48px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          animation: 'slideUp 1s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: 0 }}>
              {mode === 'login' ? 'Welcome back' : 'Get Started'}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 8 }}>
              {mode === 'login' ? 'Sign in to access your safety dashboard.' : 'Contribute to the crowd and stay secure.'}
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div style={{
              marginBottom: 20,
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: 13,
              lineHeight: 1.5
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="raja_sri_22BIT"
                required
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(15, 23, 42, 0.5)', color: '#fff',
                  outline: 'none', fontSize: 15, boxSizing: 'border-box'
                }}
              />
            </div>

            {mode === 'register' && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(15, 23, 42, 0.5)', color: '#fff',
                    outline: 'none', fontSize: 15, boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: 32 }}>
              <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(15, 23, 42, 0.5)', color: '#fff',
                  outline: 'none', fontSize: 15, boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
                background: loading
                  ? 'rgba(59,130,246,0.4)'
                  : 'linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%)',
                color: '#fff', fontSize: 16, fontWeight: 800,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 10px 20px -5px rgba(59, 130, 246, 0.5)',
                transition: 'all 0.2s ease'
              }}
              onMouseDown={(e) => { if (!loading) e.currentTarget.style.transform = 'scale(0.98)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {loading ? 'Processing...' : (mode === 'login' ? 'Sign In →' : 'Create Account →')}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <span
              style={{ color: '#38bdf8', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            >
              {mode === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
