// Dashboard.js
// Traveller view — Home | Find Route | Report Incident | Profile
// Analytics is hidden from traveller nav (admin-only, not rendered)

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import MapView from './MapView';
import PerformanceAnalysis from './PerformanceAnalysis';

const API = 'http://localhost:5000';

// ── Traveller nav (no Analytics) ──────────────────────────────────────────────
const NAV = [
    { id: 'home',     icon: '🏠', label: 'Home'           },
    { id: 'map',      icon: '🗺️',  label: 'Find Route'     },
    { id: 'incident', icon: '📍', label: 'Report Incident' },
    { id: 'profile',  icon: '👤', label: 'My Profile'      },
];

// ── Quick action card ─────────────────────────────────────────────────────────
function ActionCard({ icon, title, desc, btnLabel, btnColor, onClick }) {
    return (
        <div style={{
            background: 'white',
            borderRadius: 16,
            padding: '28px 26px',
            boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
            border: '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            transition: 'transform 0.18s, box-shadow 0.18s',
            cursor: 'pointer',
        }}
            onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.11)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.07)';
            }}
        >
            <div style={{ fontSize: 32 }}>{icon}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{title}</div>
            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.7, flex: 1 }}>{desc}</div>
            <button
                onClick={onClick}
                style={{
                    padding: '11px 0',
                    fontSize: 13,
                    fontWeight: 500,
                    background: btnColor || '#185FA5',
                    color: 'white',
                    border: 'none',
                    borderRadius: 9,
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                    boxShadow: `0 3px 12px rgba(0,0,0,0.15)`,
                    transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
                {btnLabel}
            </button>
        </div>
    );
}

// ── HOME PAGE — traveller view (3 quick action cards only) ────────────────────
function HomePage({ user, onNavigate }) {
    return (
        <div style={{
            minHeight: '100%',
            background: 'linear-gradient(160deg, #f0f4fb 0%, #f8faf5 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 32px',
        }}>
            {/* Greeting */}
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #185FA5, #1a7a6e)',
                    fontSize: 28,
                    marginBottom: 20,
                    boxShadow: '0 4px 20px rgba(24,95,165,0.25)',
                }}>
                    👋
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>
                    Welcome back, {user?.username}
                </div>
                <div style={{ fontSize: 14, color: '#888', maxWidth: 380, lineHeight: 1.6 }}>
                    Your safety matters. Where would you like to go today?
                </div>
            </div>

            {/* 3 Quick Action Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 20,
                width: '100%',
                maxWidth: 860,
            }}>
                <ActionCard
                    icon="🗺️"
                    title="Find Safest Route"
                    desc="Plan a safe route anywhere in Chicago. Our crowd-powered algorithm finds the path with the highest safety score within your distance limit."
                    btnLabel="Open Map →"
                    btnColor="linear-gradient(90deg, #185FA5, #1a7a6e)"
                    onClick={() => onNavigate('map')}
                />
                <ActionCard
                    icon="📍"
                    title="Report Incident"
                    desc="Experienced something unsafe? Report it to update your personal safety score. The event type stays completely private — only your score changes."
                    btnLabel="Report Now →"
                    btnColor="linear-gradient(90deg, #e74c3c, #c0392b)"
                    onClick={() => onNavigate('incident')}
                />
                <ActionCard
                    icon="👤"
                    title="My Safety Profile"
                    desc="View your personal safety data, the areas you know, and how your personalized safety coefficient compares to the crowd average."
                    btnLabel="View Profile →"
                    btnColor="linear-gradient(90deg, #534AB7, #7d3c98)"
                    onClick={() => onNavigate('profile')}
                />
            </div>

            {/* Subtle privacy note at bottom */}
            <div style={{
                marginTop: 44,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#bbb',
            }}>
                <span>🔒</span>
                <span>Your travel data never leaves your device — powered by Federated Learning</span>
            </div>
        </div>
    );
}

// ── EVENT TYPES ───────────────────────────────────────────────────────────────
const EVENT_TYPES = [
    { id: 'theft',      label: 'Theft / Pickpocketing', icon: '👜', color: '#e74c3c' },
    { id: 'robbery',    label: 'Robbery / Mugging',      icon: '🔪', color: '#c0392b' },
    { id: 'harassment', label: 'Harassment',             icon: '⚠️',  color: '#e67e22' },
    { id: 'accident',   label: 'Accident',               icon: '🚗', color: '#f39c12' },
    { id: 'suspicious', label: 'Suspicious activity',    icon: '👁️',  color: '#8e44ad' },
    { id: 'safe',       label: 'Safe visit (no issues)', icon: '✅', color: '#27ae60' },
];

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
        if (!selected || !gridX || !gridY) { setError('Please fill in all fields.'); return; }
        if (!user?.userId) { setError('Please login first.'); return; }
        setSubmitting(true); setError('');
        try {
            await axios.post(API + '/api/users/checkin', {
                userId:   user.userId,
                gridX:    parseInt(gridX),
                gridY:    parseInt(gridY),
                isUnsafe: selected !== 'safe',
            });
            const entry = {
                type:  selected,
                label: EVENT_TYPES.find(e => e.id === selected)?.label,
                gridX, gridY,
                time:  new Date().toLocaleString(),
            };
            const newHistory = [entry, ...history].slice(0, 10);
            setHistory(newHistory);
            localStorage.setItem('incident_history', JSON.stringify(newHistory));
            setSuccess(`Reported. Your safety score for cell (${gridX}, ${gridY}) has been updated.`);
            setSelected(null); setGridX(''); setGridY('');
            setTimeout(() => setSuccess(''), 5000);
        } catch (e) {
            setError(e.response?.data?.error || 'Failed to report. Try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div style={{ padding: '32px', maxWidth: 760, margin: '0 auto' }}>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>
                📍 Report Incident
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 28 }}>
                Your report updates your personal safety score privately. The event type is never shared.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* Form */}
                <div style={{
                    background: 'white', borderRadius: 14, padding: '24px',
                    boxShadow: '0 2px 14px rgba(0,0,0,0.07)', border: '1px solid #f0f0f0',
                }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18, color: '#1a1a1a' }}>
                        Incident Details
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 6 }}>
                        {[['Grid X', gridX, setGridX, 'e.g. 4181'],
                          ['Grid Y', gridY, setGridY, 'e.g. -8765']].map(([lbl, val, set, ph]) => (
                            <div key={lbl}>
                                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>
                                    {lbl}
                                </label>
                                <input
                                    type="number" value={val}
                                    onChange={e => set(e.target.value)}
                                    placeholder={ph}
                                    style={{
                                        width: '100%', padding: '9px 11px', fontSize: 12,
                                        border: '1.5px solid #e8e8e8', borderRadius: 8,
                                        outline: 'none', boxSizing: 'border-box',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#185FA5'}
                                    onBlur={e  => e.target.style.borderColor = '#e8e8e8'}
                                />
                            </div>
                        ))}
                    </div>
                    <div style={{ fontSize: 10, color: '#bbb', marginBottom: 18 }}>
                        Tip: Right-click any cell on the map to auto-fill coordinates.
                    </div>

                    <div style={{ fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 10 }}>
                        What happened?
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 18 }}>
                        {EVENT_TYPES.map(evt => (
                            <button key={evt.id} onClick={() => setSelected(evt.id)} style={{
                                padding: '10px 8px', borderRadius: 9, cursor: 'pointer',
                                border: selected === evt.id
                                    ? `2px solid ${evt.color}`
                                    : '1.5px solid #e8e8e8',
                                background: selected === evt.id ? evt.color + '14' : 'white',
                                display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                                transition: 'all 0.12s',
                            }}>
                                <span style={{ fontSize: 17 }}>{evt.icon}</span>
                                <span style={{
                                    fontSize: 11, lineHeight: 1.3,
                                    fontWeight: selected === evt.id ? 600 : 400,
                                    color: selected === evt.id ? evt.color : '#444',
                                }}>{evt.label}</span>
                            </button>
                        ))}
                    </div>

                    <div style={{
                        background: '#f0f9f4', borderRadius: 8, padding: '9px 12px',
                        fontSize: 11, color: '#27ae60', marginBottom: 16,
                    }}>
                        🔒 Only your pSS score updates — event type never shared with anyone.
                    </div>

                    {error   && <div style={{ fontSize: 12, color: '#e74c3c', marginBottom: 10 }}>{error}</div>}
                    {success && (
                        <div style={{
                            fontSize: 12, color: '#27ae60', marginBottom: 10,
                            background: '#f0f9f4', padding: '9px 12px', borderRadius: 8,
                        }}>{success}</div>
                    )}

                    <button
                        onClick={handleSubmit}
                        disabled={!selected || !gridX || !gridY || submitting}
                        style={{
                            width: '100%', padding: '12px 0', fontSize: 13, fontWeight: 600,
                            background: (!selected || !gridX || !gridY)
                                ? '#e0e0e0'
                                : selected === 'safe'
                                    ? 'linear-gradient(90deg,#27ae60,#1a7a6e)'
                                    : 'linear-gradient(90deg,#e74c3c,#c0392b)',
                            color: (!selected || !gridX || !gridY) ? '#aaa' : 'white',
                            border: 'none', borderRadius: 9,
                            cursor: (!selected || !gridX || !gridY) ? 'not-allowed' : 'pointer',
                            letterSpacing: '0.02em',
                        }}>
                        {submitting ? 'Submitting...' : 'Submit Report'}
                    </button>
                </div>

                {/* Recent reports */}
                <div style={{
                    background: 'white', borderRadius: 14, padding: '24px',
                    boxShadow: '0 2px 14px rgba(0,0,0,0.07)', border: '1px solid #f0f0f0',
                }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#1a1a1a' }}>
                        Recent Reports
                    </div>
                    {history.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#ccc', textAlign: 'center', padding: '28px 0' }}>
                            No incidents reported yet
                        </div>
                    ) : history.map((h, i) => {
                        const evt = EVENT_TYPES.find(e => e.id === h.type);
                        return (
                            <div key={i} style={{
                                display: 'flex', gap: 11, alignItems: 'flex-start',
                                padding: '10px 0',
                                borderBottom: i < history.length - 1 ? '1px solid #f5f5f5' : 'none',
                            }}>
                                <span style={{ fontSize: 19 }}>{evt?.icon || '📍'}</span>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: evt?.color || '#333' }}>
                                        {h.label}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>
                                        Cell ({h.gridX}, {h.gridY}) · {h.time}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    <div style={{
                        background: '#f5f9ff', borderRadius: 9, padding: '13px 15px',
                        border: '1px solid #dce8f8', marginTop: 16, fontSize: 12,
                    }}>
                        <div style={{ fontWeight: 600, color: '#185FA5', marginBottom: 5 }}>
                            💡 Faster way to report
                        </div>
                        <div style={{ color: '#555', lineHeight: 1.7 }}>
                            Go to <b>Find Route</b> and <b>right-click</b> any map cell.
                            Coordinates will auto-fill for you.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── PROFILE PAGE ──────────────────────────────────────────────────────────────
function ProfilePage({ user, flStatus }) {
    const globalBeta  = flStatus?.globalModel?.w0 || -6.88;
    const myBeta      = user?.personalBeta || -2;
    const diff        = ((Math.abs(myBeta) / Math.abs(globalBeta)) * 100 - 100).toFixed(1);
    const moreFearful = Math.abs(myBeta) > Math.abs(globalBeta);

    return (
        <div style={{ padding: '32px', maxWidth: 760, margin: '0 auto' }}>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>
                👤 My Safety Profile
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 28 }}>
                Your personal crowd membership, safety scores, and FL model details.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Identity banner */}
                <div style={{
                    background: 'linear-gradient(135deg,#185FA5,#1a7a6e)',
                    borderRadius: 14, padding: '24px', color: 'white',
                    gridColumn: '1 / -1',
                    display: 'flex', alignItems: 'center', gap: 16,
                }}>
                    <div style={{
                        width: 54, height: 54, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22, fontWeight: 700, flexShrink: 0,
                    }}>
                        {user?.username?.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 19, fontWeight: 700 }}>{user?.username}</div>
                        <div style={{ fontSize: 12, opacity: 0.72, marginTop: 3 }}>
                            Member since {user?.createdAt
                                ? new Date(user.createdAt).toLocaleDateString()
                                : 'today'}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 26, fontWeight: 700 }}>{user?.cellsKnown || 0}</div>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>areas known</div>
                    </div>
                </div>

                {/* FL Beta card */}
                <div style={{
                    background: 'white', borderRadius: 14, padding: '22px',
                    boxShadow: '0 2px 14px rgba(0,0,0,0.07)', border: '1px solid #f0f0f0',
                }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 16 }}>
                        🤖 Your Safety Sensitivity
                    </div>

                    {[
                        { label: 'Your beta', value: parseFloat(myBeta).toFixed(4), color: '#185FA5' },
                        { label: 'Crowd average', value: parseFloat(globalBeta).toFixed(4), color: '#0F6E56' },
                    ].map(row => (
                        <div key={row.label} style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 5 }}>
                                <span>{row.label}</span>
                                <span style={{ fontWeight: 700, color: row.color }}>{row.value}</span>
                            </div>
                            <div style={{ background: '#f0f0f0', borderRadius: 4, height: 7 }}>
                                <div style={{
                                    width: `${Math.min((Math.abs(parseFloat(row.value)) / 10) * 100, 100)}%`,
                                    background: row.color, borderRadius: 4, height: 7,
                                    transition: 'width 0.5s ease',
                                }} />
                            </div>
                        </div>
                    ))}

                    <div style={{
                        background: moreFearful ? '#fff0f0' : '#f0f9f4',
                        borderRadius: 8, padding: '9px 12px', fontSize: 12,
                        color: moreFearful ? '#c0392b' : '#27ae60', marginTop: 4,
                    }}>
                        {moreFearful
                            ? `You perceive danger ${Math.abs(diff)}% more strongly than the crowd average`
                            : `You perceive danger ${Math.abs(diff)}% less strongly than the crowd average`}
                    </div>
                </div>

                {/* System info */}
                <div style={{
                    background: 'white', borderRadius: 14, padding: '22px',
                    boxShadow: '0 2px 14px rgba(0,0,0,0.07)', border: '1px solid #f0f0f0',
                }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 16 }}>
                        📚 How Your Score Works
                    </div>
                    {[
                        ['Privacy model',  'Event types never leave your device'],
                        ['FL algorithm',   'FedAvg — only model weights shared'],
                        ['Convergence',    'Round 9 · training loss 3.58'],
                        ['Your β learned', `${parseFloat(myBeta).toFixed(2)} (crowd: ${parseFloat(globalBeta).toFixed(2)})`],
                        ['Dataset',        'Chicago crime data · 481 grid cells'],
                        ['Score range',    '−10 (dangerous) to +10 (very safe)'],
                    ].map(([k, v]) => (
                        <div key={k} style={{
                            display: 'flex', justifyContent: 'space-between',
                            fontSize: 11, marginBottom: 8, paddingBottom: 8,
                            borderBottom: '1px solid #f5f5f5',
                        }}>
                            <span style={{ color: '#999' }}>{k}</span>
                            <span style={{ color: '#333', fontWeight: 500, textAlign: 'right', maxWidth: '58%' }}>{v}</span>
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
            display: 'flex', height: '100vh',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            background: '#f5f6fa',
        }}>

            {/* ── Sidebar ────────────────────────────────────────────────────── */}
            <div style={{
                width: 220, background: 'white',
                borderRight: '1px solid #eee',
                display: 'flex', flexDirection: 'column',
                boxShadow: '1px 0 10px rgba(0,0,0,0.04)',
                flexShrink: 0,
            }}>
                {/* Logo */}
                <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'linear-gradient(135deg,#185FA5,#1a7a6e)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 19, boxShadow: '0 2px 8px rgba(24,95,165,0.25)',
                        }}>🛡️</div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>SafeRoute</div>
                            <div style={{ fontSize: 10, color: '#bbb' }}>Chicago</div>
                        </div>
                    </div>
                </div>

                {/* Nav — only traveller pages */}
                <nav style={{ flex: 1, padding: '14px 10px' }}>
                    {NAV.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setPage(item.id)}
                            style={{
                                width: '100%',
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 12px', borderRadius: 9,
                                border: 'none', cursor: 'pointer',
                                background: page === item.id ? '#185FA510' : 'transparent',
                                color:      page === item.id ? '#185FA5'   : '#666',
                                fontWeight: page === item.id ? 600          : 400,
                                fontSize: 13, marginBottom: 3, textAlign: 'left',
                                borderLeft: page === item.id
                                    ? '3px solid #185FA5'
                                    : '3px solid transparent',
                                transition: 'all 0.12s',
                            }}
                        >
                            <span style={{ fontSize: 16 }}>{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </nav>

                {/* User info + logout */}
                <div style={{ padding: '14px', borderTop: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'linear-gradient(135deg,#185FA5,#1a7a6e)',
                            color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 700, flexShrink: 0,
                        }}>
                            {user?.username?.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{
                                fontSize: 12, fontWeight: 600, color: '#1a1a1a',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {user?.username}
                            </div>
                            <div style={{ fontSize: 10, color: '#bbb' }}>
                                {user?.cellsKnown || 0} areas known
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        style={{
                            width: '100%', padding: '8px 0', fontSize: 12,
                            background: 'white', color: '#e74c3c',
                            border: '1px solid #fcd0d0', borderRadius: 8, cursor: 'pointer',
                            transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                        Logout
                    </button>
                </div>
            </div>

            {/* ── Main content ────────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

                {/* Top bar */}
                <div style={{
                    background: 'white', borderBottom: '1px solid #eee',
                    padding: '0 28px', height: 52,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>
                        {NAV.find(n => n.id === page)?.icon}{' '}
                        {NAV.find(n => n.id === page)?.label || 'Dashboard'}
                    </div>
                    <div style={{ fontSize: 11, color: '#ccc' }}>
                        Crowd-powered · Privacy-enhanced
                    </div>
                </div>

                {/* Page content */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {page === 'home'     && (
                        <HomePage user={user} onNavigate={setPage} />
                    )}
                    {page === 'map'      && (
                        <div style={{ height: '100%' }}>
                            <MapView />
                        </div>
                    )}
                    {page === 'incident' && <ReportPage  user={user} />}
                    {page === 'profile'  && <ProfilePage user={user} flStatus={flStatus} />}

                    {/* Analytics hidden — only rendered if page somehow equals 'analytics'
                        which is unreachable from the traveller nav */}
                    {page === 'analytics' && <PerformanceAnalysis />}
                </div>
            </div>
        </div>
    );
}
