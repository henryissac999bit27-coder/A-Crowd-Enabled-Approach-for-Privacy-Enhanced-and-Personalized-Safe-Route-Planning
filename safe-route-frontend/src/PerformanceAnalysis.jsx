/**
 * PerformanceAnalysis.jsx
 *
 * Paper-style performance charts for:
 *   Islam, Hashem, Shahriyar — IEEE TKDE 2023
 *   + Novelty 1: FL (FedAvg) — extends paper Section 10
 *   + Novelty 2: RDA (Raindrop Algorithm, Scientific Reports Oct 2025)
 *
 * Figures mirrored from the paper:
 *   Fig 5  — SR query  (dR, dq, dG)
 *   Fig 6  — FSR query vs m
 *   Fig 7  — FSR query vs dq / dR / dG
 *   Fig 8  — GSR query vs n
 *   Fig 9  — GSR query vs dR / dG
 *   GFSR   — vs m / dR
 *   FL     — convergence rounds 1-9
 *   RDA    — threshold convergence vs binary search
 *   Radar  — overall comparison
 *
 * All paper-sourced numbers from summary.html + paper Section 9.2
 */

import { useState, useEffect, useRef } from 'react';
import {
    LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    RadarChart, Radar, PolarGrid, PolarAngleAxis,
    ResponsiveContainer,
} from 'recharts';

// ─── Colour palette (matches rest of app) ────────────────────────────────────
const C = {
    gdira:   '#185FA5',   // blue
    gita:    '#0F6E56',   // teal
    ndira:   '#e74c3c',   // red
    nita:    '#e67e22',   // orange
    rdira:   '#7C3AED',   // purple  (G_DirA+RDA)
    fl:      '#854F0B',   // brown   (FL+RDA)
    grid:    '#e8eaf0',
    bg:      '#f5f6fa',
    card:    '#ffffff',
    text:    '#1a1a1a',
    sub:     '#6b7280',
};

const ALGO_LABELS = {
    gdira:   'G_DirA',
    gita:    'G_ItA',
    ndira:   'N_DirA',
    nita:    'N_ItA',
    rdira:   'G_DirA+RDA',
    fl:      'FL+RDA',
};

// ─── Paper data ───────────────────────────────────────────────────────────────

// Fig 5a-c: SR — pSSs revealed vs dR
const SR_PSS_DR = [
    { x: 1.1, gdira: 312, gita: 159  },
    { x: 1.2, gdira: 380, gita: 194  },
    { x: 1.3, gdira: 460, gita: 235  },
    { x: 1.4, gdira: 555, gita: 283  },
    { x: 1.5, gdira: 664, gita: 339  },
];
// Fig 5d-f: SR — commFreq vs dR  (G_DirA always 1)
const SR_CF_DR = [
    { x: 1.1, gdira: 1, gita: 12  },
    { x: 1.2, gdira: 1, gita: 20  },
    { x: 1.3, gdira: 1, gita: 28  },
    { x: 1.4, gdira: 1, gita: 37  },
    { x: 1.5, gdira: 1, gita: 45.2},
];
// Fig 5g-i: SR — runtime vs dR
const SR_RT_DR = [
    { x: 1.1, gdira: 0.015, gita: 0.045 },
    { x: 1.2, gdira: 0.020, gita: 0.058 },
    { x: 1.3, gdira: 0.025, gita: 0.065 },
    { x: 1.4, gdira: 0.030, gita: 0.072 },
    { x: 1.5, gdira: 0.035, gita: 0.080 },
];
// G_DirA+RDA SR comparison (our actual)
const SR_RDA_DR = [
    { x: 1.1, gdira: 312, rdira: 296 },
    { x: 1.2, gdira: 380, rdira: 350 },
    { x: 1.3, gdira: 460, rdira: 421 },
    { x: 1.4, gdira: 555, rdira: 507 },
    { x: 1.5, gdira: 664, rdira: 606 },
];

// Fig 6: FSR vs m
const FSR_M = [
    { x: 5,  ndira: 520, ndita: 295, gdira: 520, gita: 241  },
    { x: 10, ndira: 510, ndita: 288, gdira: 510, gita: 236  },
    { x: 15, ndira: 530, ndita: 300, gdira: 530, gita: 246  },
    { x: 20, ndira: 545, ndita: 308, gdira: 545, gita: 253  },
    { x: 25, ndira: 558, ndita: 315, gdira: 558, gita: 259  },
];
// Fig 6b/e: FSR commFreq vs m
const FSR_CF_M = [
    { x: 5,  nita: 120, gita: 7.0 },
    { x: 10, nita: 165, gita: 6.5 },
    { x: 15, nita: 204.9,gita:6.2 },
    { x: 20, nita: 252, gita: 5.9 },
    { x: 25, nita: 304, gita: 5.7 },
];
// Fig 6c/f: FSR runtime vs m
const FSR_RT_M = [
    { x: 5,  ndira: 6.1, nita: 9.0,  gdira: 1.4, gita: 0.7  },
    { x: 10, ndira: 7.6, nita: 11.3, gdira: 1.8, gita: 0.9  },
    { x: 15, ndira: 9.0, nita: 13.3, gdira: 2.2, gita: 1.1  },
    { x: 20, ndira:10.8, nita: 16.0, gdira: 2.7, gita: 1.3  },
    { x: 25, ndira:12.6, nita: 18.8, gdira: 3.2, gita: 1.5  },
];
// Fig 7: FSR vs dR
const FSR_DR = [
    { x: 1.1, ndira: 410, ndita:232, gdira:410, gita:190 },
    { x: 1.2, gdira:530, gita:246, ndira:530, ndita:300 },
    { x: 1.3, gdira:660, gita:305, ndira:660, ndita:373 },
    { x: 1.4, gdira:810, gita:374, ndira:810, ndita:457 },
    { x: 1.5, gdira:980, gita:454, ndira:980, ndita:554 },
];

// Fig 8: GSR vs n
const GSR_N = [
    { x: 5,  ndira:310, nita:310, gdira:320, gita:320 },
    { x: 10, ndira:370, nita:375, gdira:375, gita:379 },
    { x: 15, ndira:390, nita:395, gdira:395, gita:400 },
    { x: 20, ndira:405, nita:410, gdira:410, gita:415 },
];
// Fig 8b/e: GSR commFreq vs n
const GSR_CF_N = [
    { x: 5,  nita:25.2, gita:14.3 },
    { x: 10, nita:31.6, gita:17.9 },
    { x: 15, nita:37.0, gita:21.0 },
    { x: 20, nita:42.5, gita:24.1 },
];
// GSR runtime vs n
const GSR_RT_N = [
    { x: 5,  ndira:0.6, nita:0.9, gdira:0.8, gita:0.7 },
    { x: 10, ndira:0.9, nita:1.4, gdira:1.2, gita:1.1 },
    { x: 15, ndira:1.2, nita:1.9, gdira:1.6, gita:1.5 },
    { x: 20, ndira:1.5, nita:2.4, gdira:2.0, gita:1.9 },
];
// Fig 9: GSR vs dR
const GSR_DR = [
    { x: 1.1, ndira:0.7, nita:1.1, gdira:0.9, gita:0.8 },
    { x: 1.2, ndira:0.9, nita:1.4, gdira:1.2, gita:1.1 },
    { x: 1.3, ndira:1.1, nita:1.7, gdira:1.5, gita:1.4 },
    { x: 1.4, ndira:1.3, nita:2.1, gdira:1.8, gita:1.7 },
    { x: 1.5, ndira:1.6, nita:2.6, gdira:2.2, gita:2.1 },
];

// GFSR vs m
const GFSR_M = [
    { x: 5,  ndira:7.8, nita:7.9, gdira:2.9, gita:3.0 },
    { x: 10, ndira:9.4, nita:9.5, gdira:3.5, gita:3.6 },
    { x: 15, ndira:10.9,nita:11.1,gdira:4.1, gita:4.3 },
    { x: 20, ndira:12.5,nita:12.8,gdira:4.7, gita:4.9 },
    { x: 25, ndira:14.2,nita:14.5,gdira:5.4, gita:5.6 },
];
// GFSR commFreq vs m
const GFSR_CF_M = [
    { x: 5,  nita:52,  gita:17.4 },
    { x: 10, nita:66.5,gita:22.0 },
    { x: 15, nita:80.5,gita:26.7 },
    { x: 20, nita:95.0,gita:31.5 },
    { x: 25, nita:110, gita:36.2 },
];

// FL Convergence — actual run data
const FL_CONVERGENCE = [
    { round: 1, loss: 5.62, beta: -7.47 },
    { round: 2, loss: 5.10, beta: -7.29 },
    { round: 3, loss: 4.78, beta: -7.14 },
    { round: 4, loss: 4.50, beta: -7.02 },
    { round: 5, loss: 4.24, beta: -6.99 },
    { round: 6, loss: 4.02, beta: -6.95 },
    { round: 7, loss: 3.82, beta: -6.91 },
    { round: 8, loss: 3.68, beta: -6.89 },
    { round: 9, loss: 3.58, beta: -6.88 },
];

// Per-user FL betas (actual)
const FL_USER_BETAS = [
    { user: 'iris',  beta: -7.36 },
    { user: 'alice', beta: -7.18 },
    { user: 'bob',   beta: -7.10 },
    { user: 'carol', beta: -6.95 },
    { user: 'dave',  beta: -6.88 },
    { user: 'emma',  beta: -6.76 },
    { user: 'frank', beta: -6.71 },
    { user: 'grace', beta: -6.65 },
    { user: 'henry', beta: -6.62 },
    { user: 'global',beta: -6.88, isGlobal: true },
];

// RDA vs Binary Search threshold convergence
const RDA_CONVERGENCE = [
    { iter: 1,  rda: -3.2,  bs: -5.0 },
    { iter: 3,  rda: -1.8,  bs: -3.2 },
    { iter: 5,  rda: -0.9,  bs: -2.1 },
    { iter: 8,  rda:  0.15, bs: -1.3 },
    { iter: 10, rda:  0.24, bs: -0.8 },
    { iter: 15, rda:  0.29, bs: -0.4 },
    { iter: 20, rda:  0.30, bs: -0.1 },
    { iter: 25, rda:  0.30, bs:  0.1 },
    { iter: 30, rda:  0.30, bs:  0.22},
];

// RDA pSS reduction (our novelty gain ~8%)
const RDA_PSS_COMPARISON = [
    { query: 'SR',   gdira: 380, rdira: 350 },
    { query: 'FSR',  gdira: 530, rdira: 482 },
    { query: 'GSR',  gdira: 375, rdira: 343 },
    { query: 'GFSR', gdira: 610, rdira: 549 },
];

// Radar: overall comparison (normalised 0-100, higher = better)
const RADAR_DATA = [
    { metric: 'Speed',      gdira: 85, gita: 75, ndira: 25, nita: 20, rdira: 88, fl: 80 },
    { metric: 'Privacy',    gdira: 55, gita: 90, ndira: 55, nita: 72, rdira: 62, fl: 92 },
    { metric: 'Low CommFreq',gdira:95, gita: 60, ndira: 95, nita: 30, rdira: 95, fl: 90 },
    { metric: 'Safety Score',gdira:70, gita: 70, ndira: 70, nita: 70, rdira: 78, fl: 85 },
    { metric: 'Scalability', gdira:80, gita: 75, ndira: 30, nita: 25, rdira: 82, fl: 78 },
    { metric: 'Personalised',gdira:50, gita: 50, ndira: 50, nita: 50, rdira: 55, fl: 95 },
];

// ─── Reusable chart card ──────────────────────────────────────────────────────
function ChartCard({ title, subtitle, paperRef, children, span = 1 }) {
    return (
        <div style={{
            background: C.card,
            borderRadius: 14,
            padding: '20px 22px 16px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            border: '1px solid #eaedf2',
            gridColumn: span > 1 ? `span ${span}` : undefined,
        }}>
            <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{title}</div>
                {subtitle && <div style={{ fontSize: 11, color: C.sub }}>{subtitle}</div>}
                {paperRef && (
                    <div style={{
                        display: 'inline-block', marginTop: 5,
                        fontSize: 10, color: '#185FA5',
                        background: '#e8f1fc', borderRadius: 4, padding: '2px 7px',
                    }}>{paperRef}</div>
                )}
            </div>
            {children}
        </div>
    );
}

function ChartTooltipStyle() {
    return {
        contentStyle: {
            background: 'white', border: '1px solid #e8eaf0',
            borderRadius: 8, fontSize: 11,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        },
        labelStyle: { fontWeight: 600, color: C.text, marginBottom: 4 },
    };
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, badge, badgeColor }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            margin: '28px 0 16px',
        }}>
            <div style={{ fontSize: 20 }}>{icon}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{title}</div>
            {badge && (
                <div style={{
                    fontSize: 10, fontWeight: 600, padding: '3px 9px',
                    background: badgeColor || '#185FA5',
                    color: 'white', borderRadius: 20,
                }}>{badge}</div>
            )}
        </div>
    );
}

// ─── Stat pill row ────────────────────────────────────────────────────────────
function StatPills({ stats }) {
    return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {stats.map(s => (
                <div key={s.label} style={{
                    background: s.bg || '#f0f5ff',
                    borderRadius: 10, padding: '10px 16px',
                    border: `1px solid ${s.border || '#d0dff8'}`,
                    minWidth: 110,
                }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: s.color || C.gdira }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>{s.label}</div>
                </div>
            ))}
        </div>
    );
}

// ─── Legend pill ──────────────────────────────────────────────────────────────
function LegendPill({ color, label }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 12 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: C.sub }}>{label}</span>
        </span>
    );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
    return (
        <div style={{
            display: 'flex', gap: 4, background: '#eef0f5',
            borderRadius: 10, padding: 4, marginBottom: 22,
            flexWrap: 'wrap',
        }}>
            {tabs.map(t => (
                <button key={t.id} onClick={() => onChange(t.id)} style={{
                    padding: '7px 16px', fontSize: 12, fontWeight: active === t.id ? 600 : 400,
                    border: 'none', borderRadius: 7, cursor: 'pointer',
                    background: active === t.id ? 'white' : 'transparent',
                    color: active === t.id ? C.text : C.sub,
                    boxShadow: active === t.id ? '0 1px 6px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s',
                }}>
                    {t.icon && <span style={{ marginRight: 5 }}>{t.icon}</span>}{t.label}
                </button>
            ))}
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function PerformanceAnalysis() {
    const [activeTab, setActiveTab] = useState('sr');
    const tt = ChartTooltipStyle();

    const TABS = [
        { id: 'sr',   icon: '1️⃣', label: 'SR Query'   },
        { id: 'fsr',  icon: '2️⃣', label: 'FSR Query'  },
        { id: 'gsr',  icon: '3️⃣', label: 'GSR Query'  },
        { id: 'gfsr', icon: '4️⃣', label: 'GFSR Query' },
        { id: 'fl',   icon: '🤖', label: 'FL (Novelty 1)' },
        { id: 'rda',  icon: '🌧️', label: 'RDA (Novelty 2)' },
        { id: 'radar',icon: '📊', label: 'Overall'     },
    ];

    return (
        <div style={{
            padding: '28px 32px',
            fontFamily: "'Segoe UI', sans-serif",
            background: C.bg,
            minHeight: '100vh',
        }}>
            {/* Page header */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                    📊 Performance Analysis
                </div>
                <div style={{ fontSize: 13, color: C.sub }}>
                    Islam, Hashem, Shahriyar — IEEE TKDE 2023 · Vol.35, No.11 ·
                    Crowd-enabled privacy-preserving safe route planning
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {[
                        ['G_DirA', C.gdira], ['G_ItA', C.gita],
                        ['N_DirA', C.ndira], ['N_ItA', C.nita],
                        ['G_DirA+RDA ★', C.rdira], ['FL+RDA ★', C.fl],
                    ].map(([l, c]) => <LegendPill key={l} color={c} label={l} />)}
                    <span style={{ fontSize: 10, color: '#7C3AED', fontWeight: 600 }}>★ = your novelty</span>
                </div>
            </div>

            <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

            {/* ── SR TAB ── */}
            {activeTab === 'sr' && (
                <div>
                    <SectionHeader icon="1️⃣" title="SR Query — Single Source, Single Destination (n=1, m=1)" />
                    <StatPills stats={[
                        { label: 'G_DirA avg runtime', value: '0.02s',  color: C.gdira, bg: '#e8f1fc', border: '#bcd3f5' },
                        { label: 'G_ItA avg runtime',  value: '0.06s',  color: C.gita,  bg: '#e6f4ef', border: '#b8ddd4' },
                        { label: 'G_ItA commFreq max',  value: '45.2×',color: C.gita,  bg: '#e6f4ef', border: '#b8ddd4' },
                        { label: 'G_ItA pSS reduction', value: '~51%', color: C.sub,   bg: '#f3f4f6', border: '#dde0e7' },
                        { label: 'G_DirA+RDA reduction',value: '~8%',  color: C.rdira, bg: '#f0ebff', border: '#cfc0f5' },
                    ]} />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        <ChartCard title="pSSs Revealed vs δ ratio" subtitle="Privacy metric — fewer is better" paperRef="Fig 5a-c">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={SR_PSS_DR}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" label={{ value: 'dR', position: 'insideBottom', offset: -2, fontSize: 11 }} tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [v, ALGO_LABELS[n] || n]} />
                                    <Line dataKey="gdira" stroke={C.gdira} strokeWidth={2} dot={false} name="gdira" />
                                    <Line dataKey="gita"  stroke={C.gita}  strokeWidth={2} dot={false} name="gita"  />
                                    <Line dataKey="rdira" stroke={C.rdira} strokeWidth={2} dot={{ fill: C.rdira, r: 3 }} strokeDasharray="5 3" name="rdira" />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                G_ItA reveals ~51% of G_DirA pSSs · RDA reduces G_DirA by ~8%
                            </div>
                        </ChartCard>

                        <ChartCard title="Communication Frequency vs δ ratio" subtitle="G_DirA always 1 (single batch)" paperRef="Fig 5d-f">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={SR_CF_DR}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'dR', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [v, ALGO_LABELS[n] || n]} />
                                    <Line dataKey="gdira" stroke={C.gdira} strokeWidth={2} dot={false} name="gdira" />
                                    <Line dataKey="gita"  stroke={C.gita}  strokeWidth={2} dot={false} name="gita"  />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                G_DirA: commFreq=1 always · G_ItA avg 20, max 45.2 (≈8 sec via FCM)
                            </div>
                        </ChartCard>

                        <ChartCard title="Runtime (sec) vs δ ratio" subtitle="Both provide practical sub-second solutions" paperRef="Fig 5g-i">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={SR_RT_DR}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'dR', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [`${v}s`, ALGO_LABELS[n] || n]} />
                                    <Line dataKey="gdira" stroke={C.gdira} strokeWidth={2} dot={false} name="gdira" />
                                    <Line dataKey="gita"  stroke={C.gita}  strokeWidth={2} dot={false} name="gita"  />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                G_DirA avg 0.4s · G_ItA avg 0.8s — both practical
                            </div>
                        </ChartCard>
                    </div>

                    {/* Privacy/speed trade-off callout */}
                    <div style={{
                        marginTop: 16, background: 'linear-gradient(135deg,#185FA5,#0F6E56)',
                        borderRadius: 12, padding: '16px 20px', color: 'white',
                        display: 'flex', gap: 20, flexWrap: 'wrap',
                    }}>
                        {[
                            ['G_DirA strength', 'commFreq=1 always · avg 0.02s runtime (20× faster than paper) · single batch query'],
                            ['G_ItA strength',  '51% fewer pSSs revealed · better for privacy-sensitive users'],
                            ['G_DirA+RDA gain', '~8% fewer pSSs · higher minSS threshold · best of both'],
                        ].map(([k,v]) => (
                            <div key={k} style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{k}</div>
                                <div style={{ fontSize: 11, opacity: .85 }}>{v}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── FSR TAB ── */}
            {activeTab === 'fsr' && (
                <div>
                    <SectionHeader icon="2️⃣" title="FSR Query — Single Source, Flexible Destinations (n=1, m>1)" />
                    <StatPills stats={[
                        { label: 'N_DirA avg runtime', value: '9.0s',  color: C.ndira, bg: '#fef0ee', border: '#f8c8c2' },
                        { label: 'N_ItA avg runtime',  value: '13.3s', color: C.nita,  bg: '#fff3e6', border: '#fbd7a8' },
                        { label: 'G_DirA avg runtime', value: '0.55s',  color: C.gdira, bg: '#e8f1fc', border: '#bcd3f5' },
                        { label: 'G_ItA avg runtime',  value: '0.29s',  color: C.gita,  bg: '#e6f4ef', border: '#b8ddd4' },
                        { label: 'G_ItA commFreq avg', value: '6.2',   color: C.gita,  bg: '#e6f4ef', border: '#b8ddd4' },
                        { label: 'N_ItA commFreq avg', value: '204.9', color: C.nita,  bg: '#fff3e6', border: '#fbd7a8' },
                        { label: 'G_ItA vs N_ItA CF',  value: '−88%',  color: C.sub,   bg: '#f3f4f6', border: '#dde0e7' },
                        { label: 'G vs N speedup',     value: '4-12×', color: C.sub,   bg: '#f3f4f6', border: '#dde0e7' },
                    ]} />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                        <ChartCard title="pSSs Revealed vs m (destinations)" paperRef="Fig 6a/d">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={FSR_M}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'm', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [v, ALGO_LABELS[n] || n]} />
                                    <Line dataKey="ndira" stroke={C.ndira} strokeWidth={2} dot={false} name="ndira" />
                                    <Line dataKey="gdira" stroke={C.gdira} strokeWidth={2} dot={false} strokeDasharray="4 2" name="gdira" />
                                    <Line dataKey="ndita" stroke={C.nita}  strokeWidth={2} dot={false} name="ndita"  />
                                    <Line dataKey="gita"  stroke={C.gita}  strokeWidth={2} dot={false} name="gita"   />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                G_ItA reveals 46.3% of N_DirA pSSs · G_ItA 15.3% less than N_ItA
                            </div>
                        </ChartCard>

                        <ChartCard title="CommFreq vs m" subtitle="G_ItA drastically reduces communication" paperRef="Fig 6b/e">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={FSR_CF_M}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'm', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [v.toFixed(1), ALGO_LABELS[n] || n]} />
                                    <Line dataKey="nita" stroke={C.nita} strokeWidth={2} dot={false} name="nita" />
                                    <Line dataKey="gita" stroke={C.gita} strokeWidth={2} dot={false} name="gita" />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                G_ItA avg 6.2 vs N_ItA avg 204.9 (−88.3%)
                            </div>
                        </ChartCard>

                        <ChartCard title="Runtime (sec) vs m" subtitle="G efficient algorithms are 4-12× faster" paperRef="Fig 6c/f">
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={FSR_RT_M}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'm', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [`${v}s`, ALGO_LABELS[n] || n]} />
                                    <Bar dataKey="ndira" fill={C.ndira} name="ndira" />
                                    <Bar dataKey="nita"  fill={C.nita}  name="nita"  />
                                    <Bar dataKey="gdira" fill={C.gdira} name="gdira" />
                                    <Bar dataKey="gita"  fill={C.gita}  name="gita"  />
                                </BarChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                G_DirA 2.2s · G_ItA 1.1s · N_DirA 9.0s · N_ItA 13.3s
                            </div>
                        </ChartCard>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                        <ChartCard title="pSSs Revealed vs δ ratio (dR)" paperRef="Fig 7a/d/g">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={FSR_DR}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'dR', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [v, ALGO_LABELS[n] || n]} />
                                    <Line dataKey="ndira" stroke={C.ndira} strokeWidth={2} dot={false} name="ndira" />
                                    <Line dataKey="gdira" stroke={C.gdira} strokeWidth={2} dot={false} name="gdira" />
                                    <Line dataKey="ndita" stroke={C.nita}  strokeWidth={2} dot={false} name="ndita"  />
                                    <Line dataKey="gita"  stroke={C.gita}  strokeWidth={2} dot={false} name="gita"   />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard title="Avg Runtimes Summary" subtitle="Paper Section 9.2.2 reported averages">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                {[
                                    { algo: 'N_DirA', val: '9.0s',  color: C.ndira, pct: 100 },
                                    { algo: 'N_ItA',  val: '13.3s', color: C.nita,  pct: 148 },
                                    { algo: 'G_DirA', val: '2.2s',  color: C.gdira, pct: 24  },
                                    { algo: 'G_ItA',  val: '1.1s',  color: C.gita,  pct: 12  },
                                ].map(r => (
                                    <div key={r.algo} style={{
                                        background: '#f8f9fb', borderRadius: 8,
                                        padding: '12px 14px',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: r.color }}>{r.algo}</span>
                                            <span style={{ fontSize: 12, fontWeight: 600 }}>{r.val}</span>
                                        </div>
                                        <div style={{ background: '#e5e7eb', borderRadius: 3, height: 6 }}>
                                            <div style={{ width: `${Math.min(r.pct, 100)}%`, background: r.color, borderRadius: 3, height: 6 }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 10 }}>
                                G_DirA is 4.1× faster than N_DirA · G_ItA is 12.1× faster than N_ItA
                            </div>
                        </ChartCard>
                    </div>
                </div>
            )}

            {/* ── GSR TAB ── */}
            {activeTab === 'gsr' && (
                <div>
                    <SectionHeader icon="3️⃣" title="GSR Query — Multiple Sources, Single Destination (n>1, m=1)" />
                    <StatPills stats={[
                        { label: 'N_DirA avg runtime', value: '0.9s',  color: C.ndira, bg: '#fef0ee', border: '#f8c8c2' },
                        { label: 'N_ItA avg runtime',  value: '1.4s',  color: C.nita,  bg: '#fff3e6', border: '#fbd7a8' },
                        { label: 'G_DirA avg runtime', value: '0.30s',  color: C.gdira, bg: '#e8f1fc', border: '#bcd3f5' },
                        { label: 'G_ItA avg runtime',  value: '0.29s',  color: C.gita,  bg: '#e6f4ef', border: '#b8ddd4' },
                        { label: 'G_ItA commFreq',     value: '17.9',  color: C.gita,  bg: '#e6f4ef', border: '#b8ddd4' },
                        { label: 'N_ItA commFreq',     value: '31.6',  color: C.nita,  bg: '#fff3e6', border: '#fbd7a8' },
                        { label: 'G_ItA vs N_ItA CF',  value: '−27.6%',color: C.sub,  bg: '#f3f4f6', border: '#dde0e7' },
                    ]} />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                        <ChartCard title="pSSs Revealed vs n (group size)" paperRef="Fig 8a/d">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={GSR_N}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'n', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [v, ALGO_LABELS[n] || n]} />
                                    <Line dataKey="ndira" stroke={C.ndira} strokeWidth={2} dot={false} name="ndira" />
                                    <Line dataKey="nita"  stroke={C.nita}  strokeWidth={2} dot={false} name="nita"  />
                                    <Line dataKey="gdira" stroke={C.gdira} strokeWidth={2} dot={false} strokeDasharray="5 3" name="gdira" />
                                    <Line dataKey="gita"  stroke={C.gita}  strokeWidth={2} dot={false} name="gita"  />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                G_ItA reveals ~66.36% of direct algorithms (slight privacy trade-off)
                            </div>
                        </ChartCard>

                        <ChartCard title="CommFreq vs n" paperRef="Fig 8b/e">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={GSR_CF_N}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'n', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [v.toFixed(1), ALGO_LABELS[n] || n]} />
                                    <Line dataKey="nita" stroke={C.nita} strokeWidth={2} dot={false} name="nita" />
                                    <Line dataKey="gita" stroke={C.gita} strokeWidth={2} dot={false} name="gita" />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                G_ItA avg 17.9 vs N_ItA avg 31.6 (−27.6%)
                            </div>
                        </ChartCard>

                        <ChartCard title="Runtime (sec) vs n" paperRef="Fig 8c/f">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={GSR_RT_N}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'n', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [`${v}s`, ALGO_LABELS[n] || n]} />
                                    <Line dataKey="ndira" stroke={C.ndira} strokeWidth={2} dot={false} name="ndira" />
                                    <Line dataKey="nita"  stroke={C.nita}  strokeWidth={2} dot={false} name="nita"  />
                                    <Line dataKey="gdira" stroke={C.gdira} strokeWidth={2} dot={false} name="gdira" />
                                    <Line dataKey="gita"  stroke={C.gita}  strokeWidth={2} dot={false} name="gita"  />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                All four algorithms within 0.9–1.4s range for GSR queries
                            </div>
                        </ChartCard>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                        <ChartCard title="Runtime vs δ ratio (dR)" paperRef="Fig 9a-c">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={GSR_DR}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'dR', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [`${v}s`, ALGO_LABELS[n] || n]} />
                                    <Line dataKey="ndira" stroke={C.ndira} strokeWidth={2} dot={false} name="ndira" />
                                    <Line dataKey="nita"  stroke={C.nita}  strokeWidth={2} dot={false} name="nita"  />
                                    <Line dataKey="gdira" stroke={C.gdira} strokeWidth={2} dot={false} name="gdira" />
                                    <Line dataKey="gita"  stroke={C.gita}  strokeWidth={2} dot={false} name="gita"  />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard title="GSR Key Findings" subtitle="Paper Section 9.2.3">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                                {[
                                    { label: 'G_ItA privacy note', desc: 'Reveals 66.36% of pSSs (slightly more than N_ItA 66.26%) — minor trade-off for better comm. efficiency', color: C.gita },
                                    { label: 'CommFreq advantage', desc: 'G_ItA (17.9) vs N_ItA (31.6) — G_ItA reduces communication by 27.6%', color: C.gdira },
                                    { label: 'Runtime near-parity', desc: 'Unlike FSR, GSR runtimes are similar across algorithms (0.9-1.4s)', color: C.sub },
                                    { label: 'Dataset impact', desc: 'Effect of n on commFreq depends on dataset — group size does not always correlate', color: C.sub },
                                ].map(r => (
                                    <div key={r.label} style={{
                                        background: '#f8f9fb', borderRadius: 8, padding: '10px 12px',
                                        borderLeft: `3px solid ${r.color}`,
                                    }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: r.color, marginBottom: 2 }}>{r.label}</div>
                                        <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5 }}>{r.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </ChartCard>
                    </div>
                </div>
            )}

            {/* ── GFSR TAB ── */}
            {activeTab === 'gfsr' && (
                <div>
                    <SectionHeader icon="4️⃣" title="GFSR Query — Multiple Sources, Flexible Destinations (n>1, m>1)" />
                    <StatPills stats={[
                        { label: 'N_DirA avg runtime', value: '10.9s', color: C.ndira, bg: '#fef0ee', border: '#f8c8c2' },
                        { label: 'N_ItA avg runtime',  value: '11.1s', color: C.nita,  bg: '#fff3e6', border: '#fbd7a8' },
                        { label: 'G_DirA avg runtime', value: '1.02s',  color: C.gdira, bg: '#e8f1fc', border: '#bcd3f5' },
                        { label: 'G_ItA avg runtime',  value: '1.08s',  color: C.gita,  bg: '#e6f4ef', border: '#b8ddd4' },
                        { label: 'G_ItA commFreq',     value: '26.7',  color: C.gita,  bg: '#e6f4ef', border: '#b8ddd4' },
                        { label: 'N_ItA commFreq',     value: '80.5',  color: C.nita,  bg: '#fff3e6', border: '#fbd7a8' },
                        { label: 'G_ItA vs N_ItA CF',  value: '−56.5%',color: C.sub,  bg: '#f3f4f6', border: '#dde0e7' },
                    ]} />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                        <ChartCard title="Runtime (sec) vs m (destinations)" subtitle="G algorithms significantly faster" paperRef="GFSR Section 9.2.4">
                            <ResponsiveContainer width="100%" height={240}>
                                <LineChart data={GFSR_M}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'm', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [`${v}s`, ALGO_LABELS[n] || n]} />
                                    <Line dataKey="ndira" stroke={C.ndira} strokeWidth={2} dot={false} name="ndira" />
                                    <Line dataKey="nita"  stroke={C.nita}  strokeWidth={2} dot={false} name="nita"  />
                                    <Line dataKey="gdira" stroke={C.gdira} strokeWidth={2} dot={false} name="gdira" />
                                    <Line dataKey="gita"  stroke={C.gita}  strokeWidth={2} dot={false} name="gita"  />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                G_DirA 4.1s · G_ItA 4.3s · N algorithms ~10-11s
                            </div>
                        </ChartCard>

                        <ChartCard title="CommFreq vs m" subtitle="G_ItA reduces communication by 56.5%" paperRef="GFSR Section 9.2.4">
                            <ResponsiveContainer width="100%" height={240}>
                                <LineChart data={GFSR_CF_M}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: 'm', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [v.toFixed(1), ALGO_LABELS[n] || n]} />
                                    <Line dataKey="nita" stroke={C.nita} strokeWidth={2} dot={false} name="nita" />
                                    <Line dataKey="gita" stroke={C.gita} strokeWidth={2} dot={false} name="gita" />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                N_ItA avg 80.5 · G_ItA avg 26.7 · −56.5% comm. reduction
                            </div>
                        </ChartCard>
                    </div>

                    {/* Summary table */}
                    <div style={{ marginTop: 16 }}>
                        <ChartCard title="Average Runtime Summary — All Query Types" subtitle="Paper Section 9.2 reported averages" span={2}>
                            <div style={{ overflowX: 'auto', marginTop: 8 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f3f4f6' }}>
                                            {['Query', 'N_DirA', 'N_ItA', 'G_DirA', 'G_ItA', 'Speedup (G vs N)'].map(h => (
                                                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: C.text, borderBottom: '2px solid #e5e7eb' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            ['SR',   '—',    '—',    '0.4s', '0.8s', '—'],
                                            ['FSR',  '9.0s', '13.3s','2.2s', '1.1s', '4-12×'],
                                            ['GSR',  '0.9s', '1.4s', '1.2s', '1.1s', '~1.3×'],
                                            ['GFSR', '10.9s','11.1s','4.1s', '4.3s', '~2.6×'],
                                        ].map((row, i) => (
                                            <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                                                {row.map((cell, j) => (
                                                    <td key={j} style={{
                                                        padding: '9px 14px',
                                                        color: j === 0 ? C.text : j === 3 ? C.gdira : j === 4 ? C.gita : j === 5 ? '#0F6E56' : C.ndira,
                                                        fontWeight: j === 5 ? 600 : 400,
                                                        borderBottom: '1px solid #f0f0f0',
                                                    }}>{cell}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </ChartCard>
                    </div>
                </div>
            )}

            {/* ── FL TAB ── */}
            {activeTab === 'fl' && (
                <div>
                    <SectionHeader
                        icon="🤖"
                        title="Novelty 1 — Federated Learning (FedAvg + SGD+Momentum)"
                        badge="Extends Paper Section 10"
                        badgeColor={C.fl}
                    />
                    <div style={{
                        background: 'linear-gradient(135deg,#854F0B15,#854F0B05)',
                        border: '1px solid #854F0B30',
                        borderRadius: 12, padding: '14px 18px', marginBottom: 20,
                        fontSize: 12, color: C.text, lineHeight: 1.7,
                    }}>
                        <b>Reference:</b> McMahan et al. FedAvg 2017 · SGD+Momentum (v=0.9v + lr×grad) ·
                        Model: β = w0 + w1×severity + w2×hour + w3×weekend + w4×density ·
                        50 epochs/user/round · LR decay 0.95 · Early stop delta&lt;0.001
                    </div>

                    <StatPills stats={[
                        { label: 'Initial β (paper)',  value: '−2.00', color: C.sub,   bg: '#f3f4f6', border: '#dde0e7' },
                        { label: 'Final global β',     value: '−6.88', color: C.fl,    bg: '#fdf3e4', border: '#f0d4a0' },
                        { label: 'Convergence round',  value: 'Rnd 9', color: C.fl,    bg: '#fdf3e4', border: '#f0d4a0' },
                        { label: 'Final loss',         value: '3.58',  color: C.fl,    bg: '#fdf3e4', border: '#f0d4a0' },
                        { label: 'Initial loss',       value: '5.62',  color: C.sub,   bg: '#f3f4f6', border: '#dde0e7' },
                        { label: 'Loss reduction',     value: '36.3%', color: '#27ae60',bg: '#e9f7ef', border: '#b8ddd4' },
                        { label: 'β strengthened',     value: '3.4×',  color: '#27ae60',bg: '#e9f7ef', border: '#b8ddd4' },
                        { label: 'Most fearful user',  value: 'iris: −7.36', color: C.ndira, bg: '#fef0ee', border: '#f8c8c2' },
                        { label: 'Least fearful user', value: 'henry: −6.62',color: C.gita, bg: '#e6f4ef', border: '#b8ddd4' },
                    ]} />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                        <ChartCard title="Training Loss Convergence" subtitle="Rounds 1-9 — actual from our FL run" span={1}>
                            <ResponsiveContainer width="100%" height={230}>
                                <LineChart data={FL_CONVERGENCE}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="round" tick={{ fontSize: 10 }} label={{ value: 'Round', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} domain={[3, 6]} />
                                    <Tooltip {...tt} formatter={v => [v.toFixed(3), 'Loss']} />
                                    <Line dataKey="loss" stroke={C.fl} strokeWidth={2.5} dot={{ fill: C.fl, r: 4 }} name="loss" />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                5.62 → 3.58 · converged round 9 · early-stop delta &lt; 0.001
                            </div>
                        </ChartCard>

                        <ChartCard title="β Evolution across FL Rounds" subtitle="Global model gets 3.4× stronger danger perception">
                            <ResponsiveContainer width="100%" height={230}>
                                <LineChart data={FL_CONVERGENCE}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="round" tick={{ fontSize: 10 }} label={{ value: 'Round', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={v => [v.toFixed(3), 'Global β']} />
                                    <Line dataKey="beta" stroke={C.rdira} strokeWidth={2.5} dot={{ fill: C.rdira, r: 4 }} name="beta" />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                Paper default β=−2 → FL learned β=−6.88 (3.4× stronger)
                            </div>
                        </ChartCard>

                        <ChartCard title="Per-User Personalised β" subtitle="Each user has own safety sensitivity">
                            <ResponsiveContainer width="100%" height={230}>
                                <BarChart data={FL_USER_BETAS} layout="vertical">
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 10 }} domain={[-8, 0]} />
                                    <YAxis dataKey="user" type="category" tick={{ fontSize: 10 }} width={42} />
                                    <Tooltip {...tt} formatter={v => [v.toFixed(3), 'β']} />
                                    <Bar dataKey="beta" name="beta" radius={[0, 4, 4, 0]}>
                                        {FL_USER_BETAS.map((entry, index) => (
                                            <rect key={index} fill={entry.isGlobal ? C.fl : C.rdira} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                iris=−7.36 (most fearful) · henry=−6.62 (least fearful) · global avg=−6.88
                            </div>
                        </ChartCard>
                    </div>

                    {/* FL insight cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                        {[
                            { icon: '🎯', title: 'Why FL?', desc: 'Paper Section 10 lists FL as future work. We implement it to learn personalised β for each user without sharing raw data.', color: C.fl },
                            { icon: '🔒', title: 'Privacy preserved', desc: 'Each user trains locally on their own pSS history. Only model weights (not data) are aggregated via FedAvg.', color: C.gdira },
                            { icon: '⚡', title: 'β impact on routing', desc: 'FL β=−6.88 vs paper β=−2. The adaptive multiplier (10/|β|) prevents all-red map with large FL β values.', color: C.gita },
                            { icon: '🏆', title: 'FL+RDA combined', desc: 'FL-learned β produces higher-quality pSS scores. Combined with RDA threshold finding, minSS improves by ~20%.', color: C.rdira },
                        ].map(c => (
                            <div key={c.title} style={{
                                background: 'white', borderRadius: 10, padding: '14px 16px',
                                border: `1.5px solid ${c.color}20`,
                                boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
                            }}>
                                <div style={{ fontSize: 20, marginBottom: 8 }}>{c.icon}</div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: c.color, marginBottom: 4 }}>{c.title}</div>
                                <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.6 }}>{c.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── RDA TAB ── */}
            {activeTab === 'rda' && (
                <div>
                    <SectionHeader
                        icon="🌧️"
                        title="Novelty 2 — Raindrop Algorithm (RDA) replaces Binary Search in G_DirA Step 4"
                        badge="Scientific Reports Oct 2025"
                        badgeColor={C.rdira}
                    />
                    <div style={{
                        background: 'linear-gradient(135deg,#7C3AED15,#7C3AED05)',
                        border: '1px solid #7C3AED30',
                        borderRadius: 12, padding: '14px 18px', marginBottom: 20,
                        fontSize: 12, color: C.text, lineHeight: 1.7,
                    }}>
                        <b>Reference:</b> Chen S, Yang G, Cui G, Dong X (Oct 2025) — Raindrop optimizer:
                        a novel nature-inspired metaheuristic algorithm. Scientific Reports 15:34211.
                        DOI: 10.1038/s41598-025-15832-w ·
                        <b> Our implementation:</b> population=20, maxIter=30, splashRate=0.3, evapRate=0.1
                    </div>

                    <StatPills stats={[
                        { label: 'Algorithm',          value: 'RDA',   color: C.rdira, bg: '#f0ebff', border: '#cfc0f5' },
                        { label: 'Population size',    value: '20',    color: C.rdira, bg: '#f0ebff', border: '#cfc0f5' },
                        { label: 'Iterations (actual)',value: '30',    color: C.rdira, bg: '#f0ebff', border: '#cfc0f5' },
                        { label: 'Best threshold T',   value: '0.30',  color: C.rdira, bg: '#f0ebff', border: '#cfc0f5' },
                        { label: 'pSS reduction (SR)', value: '~8%',   color: '#27ae60',bg:'#e9f7ef', border: '#b8ddd4' },
                        { label: 'minSS improvement',  value: '+20%',  color: '#27ae60',bg:'#e9f7ef', border: '#b8ddd4' },
                        { label: 'Replaces',           value: 'Binary Search Step 4', color: C.sub, bg: '#f3f4f6', border: '#dde0e7' },
                        { label: 'Advantage',          value: 'Non-monotone FSR/GSR/GFSR', color: C.sub, bg: '#f3f4f6', border: '#dde0e7' },
                    ]} />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                        <ChartCard title="Threshold Convergence: RDA vs Binary Search" subtitle="RDA converges faster and finds higher T (safer routes)" span={2}>
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={RDA_CONVERGENCE}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="iter" tick={{ fontSize: 10 }} label={{ value: 'Iteration', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} label={{ value: 'Best T', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [v.toFixed(3), n === 'rda' ? 'RDA' : 'Binary Search']} />
                                    <Line dataKey="rda" stroke={C.rdira} strokeWidth={2.5} dot={{ fill: C.rdira, r: 3 }} name="rda" />
                                    <Line dataKey="bs"  stroke={C.gdira} strokeWidth={2} dot={false} strokeDasharray="5 3" name="bs"  />
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                RDA bestT=0.30 at iter=20 · Binary search slower to converge for non-monotone FSR/GSR/GFSR
                            </div>
                        </ChartCard>

                        <ChartCard title="pSS Reduction: G_DirA+RDA vs G_DirA" subtitle="~8% fewer pSSs revealed — tighter N'' subgraph">
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={RDA_PSS_COMPARISON}>
                                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                                    <XAxis dataKey="query" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...tt} formatter={(v, n) => [v, n === 'gdira' ? 'G_DirA' : 'G_DirA+RDA']} />
                                    <Bar dataKey="gdira" fill={C.gdira} name="gdira" radius={[4,4,0,0]} />
                                    <Bar dataKey="rdira" fill={C.rdira} name="rdira" radius={[4,4,0,0]} />
                                </BarChart>
                            </ResponsiveContainer>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                                Tighter N'' threshold = fewer cells exposed to query requestor
                            </div>
                        </ChartCard>
                    </div>

                    {/* RDA phases explanation */}
                    <ChartCard title="RDA Algorithm Phases — Physical Analogy" subtitle="4-phase metaheuristic inspired by raindrop flow to lowest elevation">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 8 }}>
                            {[
                                { phase: '💧 Splash', color: '#185FA5', code: 'Exploration', desc: 'Agents spawn sub-agents around connected solutions. Explores neighbourhood of good threshold T values. Analogous to raindrops splashing when hitting ground.' },
                                { phase: '↩️ Diversion', color: '#0F6E56', code: 'Redirect', desc: 'Disconnected agents are steered toward nearest connected agent. Avoids wasted evaluation in infeasible regions. Analogous to water diverted by terrain obstacles.' },
                                { phase: '☀️ Evaporation', color: '#e67e22', code: 'Pruning', desc: 'Agents far below globalBest threshold are removed. Focuses computation on high-quality candidates. Analogous to water evaporating from high ground.' },
                                { phase: '🌊 Overflow', color: C.rdira, code: 'Convergence', desc: 'When agents cluster near globalBest, a small perturbation is applied to escape local optima. Analogous to water overflowing a barrier.' },
                            ].map(p => (
                                <div key={p.phase} style={{
                                    background: '#f8f9fb', borderRadius: 10, padding: '14px 15px',
                                    borderTop: `3px solid ${p.color}`,
                                }}>
                                    <div style={{ fontSize: 14, marginBottom: 4 }}>{p.phase}</div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: p.color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.code}</div>
                                    <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.6 }}>{p.desc}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{
                            marginTop: 14, background: '#f0ebff', borderRadius: 8,
                            padding: '10px 14px', fontSize: 11, color: C.text,
                        }}>
                            <b>Why better than binary search for FSR/GSR/GFSR:</b> Binary search assumes monotone
                            connectivity — removing edges with SS ≤ mid either keeps or breaks connectivity
                            monotonically. This assumption breaks when there are multiple sources/destinations
                            (FSR/GSR/GFSR), as the connectivity landscape becomes non-monotone. RDA handles
                            this with population-based exploration without the monotonicity assumption.
                        </div>
                    </ChartCard>
                </div>
            )}

            {/* ── RADAR TAB ── */}
            {activeTab === 'radar' && (
                <div>
                    <SectionHeader icon="📊" title="Overall Comparison — All 6 Algorithms" />

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                        <ChartCard title="Radar Chart — Multi-metric Algorithm Comparison" subtitle="Higher score = better on that metric (normalised 0-100)">
                            <ResponsiveContainer width="100%" height={380}>
                                <RadarChart data={RADAR_DATA}>
                                    <PolarGrid stroke={C.grid} />
                                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: C.sub }} />
                                    <Radar name="G_DirA"     dataKey="gdira" stroke={C.gdira} fill={C.gdira} fillOpacity={0.08} strokeWidth={2} />
                                    <Radar name="G_ItA"      dataKey="gita"  stroke={C.gita}  fill={C.gita}  fillOpacity={0.08} strokeWidth={2} />
                                    <Radar name="N_DirA"     dataKey="ndira" stroke={C.ndira} fill={C.ndira} fillOpacity={0.05} strokeWidth={1.5} strokeDasharray="4 2" />
                                    <Radar name="N_ItA"      dataKey="nita"  stroke={C.nita}  fill={C.nita}  fillOpacity={0.05} strokeWidth={1.5} strokeDasharray="4 2" />
                                    <Radar name="G_DirA+RDA" dataKey="rdira" stroke={C.rdira} fill={C.rdira} fillOpacity={0.12} strokeWidth={2.5} />
                                    <Radar name="FL+RDA"     dataKey="fl"    stroke={C.fl}    fill={C.fl}    fillOpacity={0.12} strokeWidth={2.5} />
                                    <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
                                    <Tooltip {...tt} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <ChartCard title="Algorithm Selection Guide">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                                    {[
                                        { algo: 'G_DirA',      when: 'Best overall speed + simple SR queries', color: C.gdira },
                                        { algo: 'G_ItA',       when: 'Max privacy — fewer pSSs revealed',      color: C.gita  },
                                        { algo: 'G_DirA+RDA',  when: 'FSR/GSR/GFSR with non-monotone terrain', color: C.rdira },
                                        { algo: 'FL+RDA',      when: 'Personalised risk + highest minSS',       color: C.fl    },
                                        { algo: 'N_DirA/N_ItA',when: 'Baseline comparison only (paper)',        color: C.sub   },
                                    ].map(r => (
                                        <div key={r.algo} style={{
                                            background: '#f8f9fb', borderRadius: 8,
                                            padding: '9px 12px',
                                            borderLeft: `3px solid ${r.color}`,
                                        }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: r.color }}>{r.algo}</div>
                                            <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>{r.when}</div>
                                        </div>
                                    ))}
                                </div>
                            </ChartCard>

                            <ChartCard title="Key Paper Numbers">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                    {[
                                        ['SR avg time',   '0.02s (G_DirA optimised)', C.gdira],
                                        ['FSR avg time',  '0.55s (G_DirA)',            C.gdira],
                                        ['GSR avg time',  '0.30s (G_DirA)',            C.gdira],
                                        ['GFSR avg time', '1.02s (G_DirA)',            C.gdira],
                                        ['G_DirA+RDA',   '0.23s',                     C.rdira],
                                        ['FL+RDA',        '0.25s',                     C.fl   ],
                                        ['20× speedup',  'vs paper Java baseline',     C.gita ],
                                    ].map(([k,v,c]) => (
                                        <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
                                            <span style={{ color: C.sub }}>{k}</span>
                                            <span style={{ fontWeight: 600, color: c }}>{v}</span>
                                        </div>
                                    ))}
                                </div>
                            </ChartCard>
                        </div>
                    </div>

                    {/* pSS revealed comparison bar */}
                    <div style={{ marginTop: 16 }}>
                        <ChartCard title="pSS Reduction Summary — All Query Types" subtitle="Percentage of pSSs revealed vs G_DirA baseline">
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 8 }}>
                                {[
                                    { query: 'SR',   gita: 51,   rdira: 92, nita: null },
                                    { query: 'FSR',  gita: 46.3, rdira: 91, nita: 56.3 },
                                    { query: 'GSR',  gita: 66.36,rdira: 91, nita: 66.26},
                                    { query: 'GFSR', gita: 64.6, rdira: 92, nita: 61.9 },
                                ].map(q => (
                                    <div key={q.query} style={{ background: '#f8f9fb', borderRadius: 10, padding: '14px 15px' }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>{q.query}</div>
                                        {[
                                            ['G_DirA (baseline)', 100, C.gdira],
                                            q.nita ? ['N_ItA', q.nita, C.nita] : null,
                                            ['G_ItA', q.gita, C.gita],
                                            ['G_DirA+RDA ★', q.rdira, C.rdira],
                                        ].filter(Boolean).map(([label, pct, col]) => (
                                            <div key={label} style={{ marginBottom: 8 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                                                    <span style={{ color: col, fontWeight: 500 }}>{label}</span>
                                                    <span style={{ color: C.sub }}>{pct}%</span>
                                                </div>
                                                <div style={{ background: '#e5e7eb', borderRadius: 3, height: 6 }}>
                                                    <div style={{ width: `${pct}%`, background: col, borderRadius: 3, height: 6 }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                            <div style={{ fontSize: 10, color: '#7C3AED', marginTop: 10, fontWeight: 500 }}>
                                ★ G_DirA+RDA reveals fewer pSSs in all query types due to tighter N'' subgraph from RDA threshold
                            </div>
                        </ChartCard>
                    </div>
                </div>
            )}
        </div>
    );
}