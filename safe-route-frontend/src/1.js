// Dashboard.js
// Main hub after login. Sidebar navigation + content area.
// Pages: Home | Find Route (opens Map) | Report Incident | Profile | Analytics

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import MapView from './MapView';
import PerformanceAnalysis from './PerformanceAnalysis';

const API = 'http://localhost:5000';

// ── Sidebar nav items ─────────────────────────────────────────────────────────
const NAV = [
    { id: 'home',      icon: '🏠', label: 'Home'            },
    { id: 'map',       icon: '🗺️',  label: 'Find Route'      },
    { id: 'incident',  icon: '📍', label: 'Report Incident'  },
    { id: 'profile',   icon: '👤', label: 'My Profile'       },
    { id: 'analytics', icon: '📊', label: 'Analytics'        },  // ← add this
];

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }) {
    return (
        <div style={{
            background: 'white', borderRadius: 12, padding: '18px 20px',
            boxShadow: '0 1px 8px rgba(0,0,0,0.07)',
            border: '1px solid #f0f0f0', flex: 1, minWidth: 140,
        }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: color || '#1a1a1a' }}>{value}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#333', marginTop: 2 }}>{label}</div>
            {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

// ── Quick action card ──────────────────────────────────────────────────────────
function ActionCard({ icon, title, desc, btnLabel, btnColor, onClick }) {
    return (
        <div style={{
            background: 'white', borderRadius: 12, padding: '22px 24px',
            boxShadow: '0 1px 8px rgba(0,0,0,0.07)',
            border: '1px solid #f0f0f0',
            display: 'flex', flexDirection: 'column', gap: 10,
        }}>
            <div style={{ fontSize: 28 }}>{icon}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{title}</div>
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6, flex: 1 }}>{desc}</div>
            <button onClick={onClick} style={{
                padding: '10px 0', fontSize: 13, fontWeight: 500,
                background: btnColor || '#185FA5', color: 'white',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                boxShadow: `0 3px 10px ${(btnColor || '#185FA5')}40`,
            }}>
                {btnLabel}
            </button>
        </div>
    );
}

// ── EVENT TYPES (same as MapView) ────────────────────────────────────────────
const EVENT_TYPES = [
    { id: 'theft',      label: 'Theft / Pickpocketing', icon: '👜', color: '#e74c3c' },
    { id: 'robbery',    label: 'Robbery / Mugging',      icon: '🔪', color: '#c0392b' },
    { id: 'harassment', label: 'Harassment',             icon: '⚠️',  color: '#e67e22' },
    { id: 'accident',   label: 'Accident',               icon: '🚗', color: '#f39c12' },
    { id: 'suspicious', label: 'Suspicious activity',    icon: '👁️',  color: '#8e44ad' },
    { id: 'safe',       label: 'Safe visit (no issues)', icon: '✅', color: '#27ae60' },
];

// ── HOME PAGE ─────────────────────────────────────────────────────────────────
function HomePage({ user, flStatus, onNavigate }) {
    const globalBeta = flStatus?.globalModel?.w0;

    return (
        <div style={{ padding: '28px 32px', maxWidth: 900 }}>
            {/* Welcome */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
                    Welcome back, {user?.username} 👋
                </div>
                <div style={{ fontSize: 13, color: '#888' }}>
                    Chicago Safe Route Finder · IEEE TKDE 2023 · Crowd-powered navigation
                </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
                <StatCard icon="📍" label="Cells Known" value={user?.cellsKnown || 0}
                    sub="areas you've visited" color="#185FA5" />
                <StatCard icon="🤖" label="Your Beta"
                    value={user?.personalBeta ? parseFloat(user.personalBeta).toFixed(2) : '-2.00'}
                    sub={`global avg: ${globalBeta ? globalBeta.toFixed(2) : '-6.88'}`}
                    color="#0F6E56" />
                <StatCard icon="🛡️" label="FL Rounds"
                    value={flStatus?.globalModel?.round || 9}
                    sub="model converged" color="#534AB7" />
                <StatCard icon="👥" label="Crowd Users"
                    value={flStatus?.userModels?.length || 10}
                    sub="active members" color="#854F0B" />
            </div>

            {/* Quick actions */}
            <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 14 }}>
                Quick Actions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
                <ActionCard
                    icon="🗺️"
                    title="Find Safest Route"
                    desc="Plan a route from any address in Chicago using crowd safety scores and our minimax algorithm."
                    btnLabel="Open Map →"
                    btnColor="linear-gradient(90deg,#185FA5,#1a7a6e)"
                    onClick={() => onNavigate('map')}
                />
                <ActionCard
                    icon="📍"
                    title="Report Incident"
                    desc="Report a safety event at your location. Updates your personal pSS — event type stays private."
                    btnLabel="Report Now →"
                    btnColor="#e74c3c"
                    onClick={() => onNavigate('incident')}
                />
                <ActionCard
                    icon="👤"
                    title="My Safety Profile"
                    desc="View your personal safety scores, cells you know, and how your FL beta compares to others."
                    btnLabel="View Profile →"
                    btnColor="#534AB7"
                    onClick={() => onNavigate('profile')}
                />
            </div>

            {/* RDA Novelty banner */}
            <div style={{
                background: 'linear-gradient(135deg,#4A235A,#6C3483)',
                borderRadius: 12, padding: '18px 22px', marginBottom: 24,
                color: 'white',
            }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
                    <div>
                        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>
                            🌧️ Novelty 2 — Raindrop Algorithm (RDA, Oct 2025)
                        </div>
                        <div style={{ fontSize:11, opacity:.85, lineHeight:1.7, maxWidth:460 }}>
                            We replace G_DirA's binary search (Step 4) with the Raindrop Algorithm
                            published in Scientific Reports Oct 2025. Raindrops naturally flow to
                            lowest elevation — directly mapping to safety score maximisation on a grid.
                            RDA finds higher minSS thresholds for FSR/GSR/GFSR where binary search
                            assumes monotone connectivity (which does not hold for multiple sources/destinations).
                        </div>
                        <div style={{ fontSize:10, opacity:.65, marginTop:6 }}>
                            Chen, Yang, Cui et al. — Scientific Reports Vol.15, Article 34211, October 2025
                        </div>
                    </div>
                    <div style={{ textAlign:'center', flexShrink:0 }}>
                        <div style={{ fontSize:28, fontWeight:600 }}>2025</div>
                        <div style={{ fontSize:10, opacity:.75 }}>Published</div>
                    </div>
                </div>
                <div style={{ display:'flex', gap:16, marginTop:14, flexWrap:'wrap' }}>
                    {[
                        ['Exploration','Splash + Diversion + Evaporation phases'],
                        ['Exploitation','Convergence + Overflow phases'],
                        ['Replaces','Binary search in G_DirA Step 4'],
                        ['Benefit','Higher minSS in FSR/GSR/GFSR queries'],
                    ].map(([k,v]) => (
                        <div key={k} style={{ background:'rgba(255,255,255,0.12)', borderRadius:7, padding:'8px 12px', fontSize:11 }}>
                            <div style={{ fontWeight:600, marginBottom:2 }}>{k}</div>
                            <div style={{ opacity:.8 }}>{v}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* How it works */}
            <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 14 }}>
                How It Works
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {[
                    { step:'1', title:'You travel', desc:'Your app records safe and unsafe events as personalized safety scores (pSS)', color:'#185FA5' },
                    { step:'2', title:'Crowd shares', desc:'When you query a route, nearby crowd members share their pSS for your query area', color:'#0F6E56' },
                    { step:'3', title:'FL learns', desc:'Federated Learning personalizes your β impact weight — your data never leaves your device', color:'#534AB7' },
                    { step:'4', title:'Safe route', desc:'G_DirA / G_ItA algorithms find the route with the highest minimum safety score', color:'#854F0B' },
                ].map(s => (
                    <div key={s.step} style={{
                        background: 'white', borderRadius: 10, padding: '14px 16px',
                        border: `1.5px solid ${s.color}20`,
                        boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
                    }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: s.color, color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 600, marginBottom: 10,
                        }}>{s.step}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>{s.title}</div>
                        <div style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>{s.desc}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── REPORT INCIDENT PAGE ──────────────────────────────────────────────────────
function ReportPage({ user }) {
    const [gridX,      setGridX]      = useState('');
    const [gridY,      setGridY]      = useState('');
    const [selected,   setSelected]   = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [success,    setSuccess]    = useState('');
    const [error,      setError]      = useState('');
    const [history,    setHistory]    = useState([]);

    useEffect(() => {
        const saved = JSON.parse(localStorage.getItem('incident_history') || '[]');
        setHistory(saved);
    }, []);

    async function handleSubmit() {
        if (!selected || !gridX || !gridY) {
            setError('Please fill in all fields.'); return;
        }
        if (!user?.userId) { setError('Please login first.'); return; }

        setSubmitting(true); setError('');
        try {
            const isUnsafe = selected !== 'safe';
            await axios.post(API + '/api/users/checkin', {
                userId:   user.userId,
                gridX:    parseInt(gridX),
                gridY:    parseInt(gridY),
                isUnsafe: isUnsafe,
            });

            const entry = {
                type:    selected,
                label:   EVENT_TYPES.find(e => e.id === selected)?.label,
                gridX, gridY,
                time:    new Date().toLocaleString(),
            };
            const newHistory = [entry, ...history].slice(0, 10);
            setHistory(newHistory);
            localStorage.setItem('incident_history', JSON.stringify(newHistory));

            setSuccess(`Incident reported successfully. Your pSS for cell (${gridX}, ${gridY}) has been updated.`);
            setSelected(null); setGridX(''); setGridY('');
            setTimeout(() => setSuccess(''), 5000);
        } catch (e) {
            setError(e.response?.data?.error || 'Failed to report. Try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div style={{ padding: '28px 32px', maxWidth: 720 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
                📍 Report Incident
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
                Report a safety event to update your personal safety score (pSS).
                The event type is never shared — only your score changes.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* Form */}
                <div style={{
                    background: 'white', borderRadius: 12, padding: '22px 24px',
                    boxShadow: '0 1px 8px rgba(0,0,0,0.07)', border: '1px solid #f0f0f0',
                }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#1a1a1a' }}>
                        Incident Details
                    </div>

                    {/* Grid coordinates */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                        {[['Grid X', gridX, setGridX, 'e.g. 4181'],
                          ['Grid Y', gridY, setGridY, 'e.g. -8765']].map(([lbl, val, set, ph]) => (
                            <div key={lbl}>
                                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>
                                    {lbl}
                                </label>
                                <input type="number" value={val}
                                    onChange={e => set(e.target.value)}
                                    placeholder={ph}
                                    style={{
                                        width: '100%', padding: '8px 10px', fontSize: 12,
                                        border: '1.5px solid #e8e8e8', borderRadius: 7,
                                        outline: 'none', boxSizing: 'border-box',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#185FA5'}
                                    onBlur={e  => e.target.style.borderColor = '#e8e8e8'}
                                />
                            </div>
                        ))}
                    </div>
                    <div style={{ fontSize: 10, color: '#bbb', marginBottom: 16 }}>
                        Tip: Grid X = floor(lat / 0.01), Grid Y = floor(lng / 0.01).
                        You can also right-click any cell on the map to auto-fill these.
                    </div>

                    {/* Event types */}
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 10 }}>
                        What happened?
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 18 }}>
                        {EVENT_TYPES.map(evt => (
                            <button key={evt.id} onClick={() => setSelected(evt.id)} style={{
                                padding: '9px 8px', borderRadius: 8, cursor: 'pointer',
                                border: selected === evt.id ? `2px solid ${evt.color}` : '1.5px solid #e8e8e8',
                                background: selected === evt.id ? evt.color + '12' : 'white',
                                display: 'flex', alignItems: 'center', gap: 7, textAlign: 'left',
                            }}>
                                <span style={{ fontSize: 16 }}>{evt.icon}</span>
                                <span style={{
                                    fontSize: 11, lineHeight: 1.3,
                                    fontWeight: selected === evt.id ? 500 : 400,
                                    color: selected === evt.id ? evt.color : '#444',
                                }}>{evt.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Privacy note */}
                    <div style={{
                        background: '#f0f9f4', borderRadius: 7, padding: '8px 12px',
                        fontSize: 11, color: '#27ae60', marginBottom: 14,
                    }}>
                        🔒 Only your pSS score updates — event type never shared with others.
                    </div>

                    {error && <div style={{ fontSize: 12, color: '#e74c3c', marginBottom: 10 }}>{error}</div>}
                    {success && (
                        <div style={{
                            fontSize: 12, color: '#27ae60', marginBottom: 10,
                            background: '#f0f9f4', padding: '8px 12px', borderRadius: 7,
                        }}>{success}</div>
                    )}

                    <button onClick={handleSubmit} disabled={!selected || !gridX || !gridY || submitting}
                        style={{
                            width: '100%', padding: '11px 0', fontSize: 13, fontWeight: 500,
                            background: !selected || !gridX || !gridY ? '#ccc'
                                : selected === 'safe'
                                    ? 'linear-gradient(90deg,#27ae60,#1a7a6e)'
                                    : 'linear-gradient(90deg,#e74c3c,#c0392b)',
                            color: 'white', border: 'none', borderRadius: 8,
                            cursor: !selected ? 'not-allowed' : 'pointer',
                        }}>
                        {submitting ? 'Submitting...' : 'Submit Report'}
                    </button>
                </div>

                {/* Recent incidents */}
                <div>
                    <div style={{
                        background: 'white', borderRadius: 12, padding: '22px 24px',
                        boxShadow: '0 1px 8px rgba(0,0,0,0.07)', border: '1px solid #f0f0f0',
                    }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: '#1a1a1a' }}>
                            Recent Reports
                        </div>
                        {history.length === 0 ? (
                            <div style={{ fontSize: 12, color: '#bbb', textAlign: 'center', padding: '20px 0' }}>
                                No incidents reported yet
                            </div>
                        ) : history.map((h, i) => {
                            const evt = EVENT_TYPES.find(e => e.id === h.type);
                            return (
                                <div key={i} style={{
                                    display: 'flex', gap: 10, alignItems: 'flex-start',
                                    padding: '10px 0',
                                    borderBottom: i < history.length - 1 ? '1px solid #f5f5f5' : 'none',
                                }}>
                                    <span style={{ fontSize: 18 }}>{evt?.icon || '📍'}</span>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 500, color: evt?.color || '#333' }}>
                                            {h.label}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                                            Cell ({h.gridX}, {h.gridY}) · {h.time}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Info box */}
                    <div style={{
                        background: '#f5f9ff', borderRadius: 10, padding: '14px 16px',
                        border: '1px solid #dce8f8', marginTop: 14, fontSize: 12,
                    }}>
                        <div style={{ fontWeight: 600, color: '#185FA5', marginBottom: 6 }}>
                            💡 Faster way to report
                        </div>
                        <div style={{ color: '#555', lineHeight: 1.7 }}>
                            Go to <b>Find Route</b> page and <b>right-click</b> any grid cell on the map.
                            The incident popup will auto-fill the coordinates for you.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── PROFILE PAGE ──────────────────────────────────────────────────────────────
function ProfilePage({ user, flStatus }) {
    const globalBeta = flStatus?.globalModel?.w0 || -6.88;
    const myBeta     = user?.personalBeta || -2;
    const diff       = ((Math.abs(myBeta) / Math.abs(globalBeta)) * 100 - 100).toFixed(1);
    const moreFearful = Math.abs(myBeta) > Math.abs(globalBeta);

    return (
        <div style={{ padding: '28px 32px', maxWidth: 720 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
                👤 My Safety Profile
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
                Your personal crowd membership, safety scores, and FL model.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Identity card */}
                <div style={{
                    background: 'linear-gradient(135deg,#185FA5,#1a7a6e)',
                    borderRadius: 14, padding: '22px 24px', color: 'white',
                    gridColumn: '1 / -1',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 52, height: 52, borderRadius: '50%',
                            background: 'rgba(255,255,255,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, fontWeight: 600,
                        }}>
                            {user?.username?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div style={{ fontSize: 18, fontWeight: 600 }}>{user?.username}</div>
                            <div style={{ fontSize: 12, opacity: .75, marginTop: 2 }}>
                                Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'today'}
                            </div>
                        </div>
                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                            <div style={{ fontSize: 22, fontWeight: 600 }}>{user?.cellsKnown || 0}</div>
                            <div style={{ fontSize: 11, opacity: .75 }}>cells known</div>
                        </div>
                    </div>
                </div>

                {/* FL Beta card */}
                <div style={{
                    background: 'white', borderRadius: 12, padding: '20px 22px',
                    boxShadow: '0 1px 8px rgba(0,0,0,0.07)', border: '1px solid #f0f0f0',
                }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 14 }}>
                        🤖 Your FL Beta
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 4 }}>
                            <span>Your beta</span>
                            <span style={{ fontWeight: 600, color: '#185FA5' }}>{parseFloat(myBeta).toFixed(4)}</span>
                        </div>
                        <div style={{ background: '#f0f0f0', borderRadius: 4, height: 8 }}>
                            <div style={{ width: `${Math.min((Math.abs(myBeta)/10)*100,100)}%`, background: '#185FA5', borderRadius: 4, height: 8 }} />
                        </div>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 4 }}>
                            <span>Global average</span>
                            <span style={{ fontWeight: 600, color: '#0F6E56' }}>{parseFloat(globalBeta).toFixed(4)}</span>
                        </div>
                        <div style={{ background: '#f0f0f0', borderRadius: 4, height: 8 }}>
                            <div style={{ width: `${Math.min((Math.abs(globalBeta)/10)*100,100)}%`, background: '#0F6E56', borderRadius: 4, height: 8 }} />
                        </div>
                    </div>
                    <div style={{
                        background: moreFearful ? '#fff0f0' : '#f0f9f4',
                        borderRadius: 7, padding: '8px 10px', fontSize: 11,
                        color: moreFearful ? '#c0392b' : '#27ae60',
                    }}>
                        {moreFearful
                            ? `You perceive danger ${Math.abs(diff)}% more strongly than average`
                            : `You perceive danger ${Math.abs(diff)}% less strongly than average`}
                    </div>
                </div>

                {/* Paper ref */}
                <div style={{
                    background: 'white', borderRadius: 12, padding: '20px 22px',
                    boxShadow: '0 1px 8px rgba(0,0,0,0.07)', border: '1px solid #f0f0f0',
                }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 14 }}>
                        📚 System Info
                    </div>
                    {[
                        ['Paper',     'Islam et al. IEEE TKDE 2023'],
                        ['Algorithm', 'FedAvg (McMahan et al. 2017)'],
                        ['Model',     'β = w0 + w1×severity + ...'],
                        ['Converged', 'Round 9 | loss = 3.58'],
                        ['Default β', '-2 (paper) → -6.88 (FL learned)'],
                        ['Dataset',   'Chicago crime data (481 cells)'],
                    ].map(([k,v]) => (
                        <div key={k} style={{ display:'flex', justifyContent:'space-between',
                            fontSize: 11, marginBottom: 6 }}>
                            <span style={{ color:'#888' }}>{k}:</span>
                            <span style={{ color:'#333', fontWeight:500, textAlign:'right', maxWidth:'60%' }}>{v}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD ROOT
// ══════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
    const { user, logout } = useAuth();
    const [page,     setPage]     = useState('home');
    const [flStatus, setFlStatus] = useState(null);

    useEffect(() => {
        axios.get(API + '/api/fl/status').then(r => setFlStatus(r.data)).catch(() => {});
    }, []);

    return (
        <div style={{
            display: 'flex', height: '100vh', fontFamily: "'Segoe UI', sans-serif",
            background: '#f5f6fa',
        }}>

            {/* ── Sidebar ──────────────────────────────────────────────────── */}
            <div style={{
                width: 220, background: 'white', borderRight: '1px solid #eee',
                display: 'flex', flexDirection: 'column',
                boxShadow: '1px 0 8px rgba(0,0,0,0.04)',
                flexShrink: 0,
            }}>
                {/* Logo */}
                <div style={{
                    padding: '20px 20px 16px', borderBottom: '1px solid #f0f0f0',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: 9,
                            background: 'linear-gradient(135deg,#185FA5,#1a7a6e)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18,
                        }}>🛡️</div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>SafeRoute</div>
                            <div style={{ fontSize: 10, color: '#aaa' }}>Chicago · IEEE TKDE</div>
                        </div>
                    </div>
                </div>

                {/* Nav items */}
                <nav style={{ flex: 1, padding: '12px 10px' }}>
                    {NAV.map(item => (
                        <button key={item.id} onClick={() => setPage(item.id)} style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: page === item.id ? '#185FA510' : 'transparent',
                            color:      page === item.id ? '#185FA5'   : '#555',
                            fontWeight: page === item.id ? '500'        : '400',
                            fontSize: 13, marginBottom: 2, textAlign: 'left',
                            borderLeft: page === item.id ? '3px solid #185FA5' : '3px solid transparent',
                        }}>
                            <span style={{ fontSize: 16 }}>{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </nav>

                {/* User info + logout */}
                <div style={{ padding: '14px 14px', borderTop: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'linear-gradient(135deg,#185FA5,#1a7a6e)',
                            color: 'white', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0,
                        }}>
                            {user?.username?.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#1a1a1a',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {user?.username}
                            </div>
                            <div style={{ fontSize: 10, color: '#aaa' }}>
                                {user?.cellsKnown || 0} cells known
                            </div>
                        </div>
                    </div>
                    <button onClick={logout} style={{
                        width: '100%', padding: '7px 0', fontSize: 12,
                        background: 'white', color: '#e74c3c',
                        border: '1px solid #fcd0d0', borderRadius: 7, cursor: 'pointer',
                    }}>
                        Logout
                    </button>
                </div>
            </div>

            {/* ── Main content ────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

                {/* Top bar */}
                <div style={{
                    background: 'white', borderBottom: '1px solid #eee',
                    padding: '0 28px', height: 52,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexShrink: 0,
                }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>
                        {NAV.find(n => n.id === page)?.icon}{' '}
                        {NAV.find(n => n.id === page)?.label || 'Dashboard'}
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>
                        Crowd-powered · Privacy-enhanced · IEEE TKDE 2023
                    </div>
                </div>

                {/* Page content */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {page === 'home'     && <HomePage     user={user} flStatus={flStatus} onNavigate={setPage} />}
                    {page === 'map'      && (
                        <div style={{ height: '100%' }}>
                            <MapView />
                        </div>
                    )}
                    {page === 'incident' && <ReportPage   user={user} />}
                    {page === 'profile'  && <ProfilePage  user={user} flStatus={flStatus} />}
                    {page === 'analytics'  && <PerformanceAnalysis />}
                </div>
            </div>
        </div>
    );
}
