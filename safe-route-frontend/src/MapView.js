import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import AddressSearch from './AddressSearch';
import {
    MapContainer, TileLayer,
    CircleMarker, Popup, Polyline, useMapEvents
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const API = 'http://localhost:5000';
const MEMBER_COLORS = ['#2980b9','#e74c3c','#27ae60','#f39c12','#8e44ad','#16a085','#c0392b','#2c3e50'];
const ALGO_INFO = {
    G_DirA: { color: '#185FA5', desc: 'Direct — commFreq=1, all pSS at once' },
    G_ItA:  { color: '#0F6E56', desc: 'Iterative — 43% less pSS, more rounds' },
    N_DirA: { color: '#854F0B', desc: 'Naive direct — baseline for comparison' },
    N_ItA:     { color: '#A32D2D', desc: 'Naive iterative — baseline for G_ItA' },
    'G_DirA+RDA': { color: '#6C3483', desc: 'Raindrop Algorithm 2025 — replaces binary search in Step 4' },
};

function getPSSColor(pss) {
    if (pss <= -8)   return '#d73027';
    if (pss <= -5)   return '#fc8d59';
    if (pss <= -2)   return '#fee090';
    if (pss <= -0.5) return '#91cf60';
    return '#1a9850';
}

// Auto-pan map to selected address
function FlyToLocation({ center }) {
    const map = useMapEvents({ load() {} });
    const prev = useRef(null);
    if (center && center !== prev.current) {
        prev.current = center;
        map.flyTo(center, 14, { animate: true, duration: 1.2 });
    }
    return null;
}

// Map click handler — still works alongside popup
function MapClickHandler({ queryMode, gsrPhase, gfsrPhase, start,
    setStart, setEnd, setSources, setDestinations, setGsrEnd, setGsrPhase, onCellRightClick }) {
    useMapEvents({
        contextmenu(e) {
            // Right-click → report incident on this cell
            const x = Math.floor(e.latlng.lat / 0.01);
            const y = Math.floor(e.latlng.lng / 0.01);
            if (onCellRightClick) onCellRightClick({ x, y, lat: e.latlng.lat, lng: e.latlng.lng });
        },
        click(e) {
            const x = Math.floor(e.latlng.lat / 0.01);
            const y = Math.floor(e.latlng.lng / 0.01);
            if (queryMode === 'SR') {
                setStart(p => { if (!p) return { x, y }; setEnd(e2 => e2 ? e2 : { x, y }); return p; });
            } else if (queryMode === 'FSR') {
                if (!start) setStart({ x, y }); else setDestinations(p => [...p, { x, y }]);
            } else if (queryMode === 'GSR') {
                if (gsrPhase === 'sources')   setSources(p => [...p, { x, y }]);
                else if (gsrPhase === 'dest') { setGsrEnd({ x, y }); setGsrPhase('done'); }
            } else if (queryMode === 'GFSR') {
                if (gfsrPhase === 'sources') setSources(p => [...p, { x, y }]);
                else                         setDestinations(p => [...p, { x, y }]);
            }
        }
    });
    return null;
}

// ── Find Route Popup ──────────────────────────────────────────────────────────
function FindRouteModal({ queryMode, onClose, onStartSelect, onEndSelect,
    startLabel, endLabel, onConfirm, loading }) {

    const modeInfo = {
        SR:   { title: 'Safest Route',               sub: 'Single person, one destination' },
        FSR:  { title: 'Flexible Safest Route',       sub: 'Single person, pick safest destination' },
        GSR:  { title: 'Group Safest Route',          sub: 'Group of people to one meeting point' },
        GFSR: { title: 'Group Flexible Safest Route', sub: 'Group + pick safest meeting point' },
    };
    const info = modeInfo[queryMode] || modeInfo.SR;

    return (
        // Backdrop
        <div style={{
            position: 'fixed', inset: 0, zIndex: 5000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

            {/* Modal card */}
            <div style={{
                background: 'white', borderRadius: 14,
                padding: '28px 32px', width: 420,
                boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
                fontFamily: 'sans-serif',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                        <div style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a' }}>
                            🗺️ {info.title}
                        </div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                            {info.sub}
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', fontSize: 18,
                        color: '#aaa', cursor: 'pointer', lineHeight: 1, padding: 4,
                    }}>×</button>
                </div>

                {/* SR: two address search boxes */}
                {queryMode === 'SR' && (
                    <div>
                        <div style={{ marginBottom: 16 }}>
                            <AddressSearch
                                label="Start location"
                                color="#2980b9"
                                placeholder="e.g. Oak Park, Chicago"
                                onSelect={onStartSelect}
                            />
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <AddressSearch
                                label="End location"
                                color="#9b59b6"
                                placeholder="e.g. The Loop, Chicago"
                                onSelect={onEndSelect}
                            />
                        </div>

                        {/* Show selected cells */}
                        {(startLabel || endLabel) && (
                            <div style={{
                                background: '#f5f9ff', borderRadius: 8,
                                padding: '10px 12px', marginBottom: 16,
                                border: '1px solid #dce8f8', fontSize: 12,
                            }}>
                                {startLabel && (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: endLabel ? 6 : 0 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2980b9', flexShrink: 0 }} />
                                        <span style={{ color: '#555' }}>Start:</span>
                                        <span style={{ color: '#185FA5', fontWeight: 500 }}>{startLabel}</span>
                                    </div>
                                )}
                                {endLabel && (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#9b59b6', flexShrink: 0 }} />
                                        <span style={{ color: '#555' }}>End:</span>
                                        <span style={{ color: '#7d3c98', fontWeight: 500 }}>{endLabel}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{
                            background: '#FFF8E1', border: '1px solid #FFE082',
                            borderRadius: 7, padding: '8px 12px', marginBottom: 14, fontSize: 11,
                        }}>
                            <b style={{ color:'#854F0B' }}>📍 Coverage area:</b>
                            <span style={{ color:'#633806' }}> Chicago city (downtown, south side, west side).
                            Suburbs have limited crime data — keep routes within the colored markers on the map.</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#bbb', marginBottom: 16 }}>
                            Tip: You can also close this and click directly on the map.
                        </div>

                        {/* Find Route button */}
                        <button
                            onClick={onConfirm}
                            disabled={!startLabel || !endLabel || loading}
                            style={{
                                width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 500,
                                background: (!startLabel || !endLabel || loading)
                                    ? '#ccc'
                                    : 'linear-gradient(90deg, #185FA5, #1a7a6e)',
                                color: 'white', border: 'none', borderRadius: 8,
                                cursor: (!startLabel || !endLabel || loading) ? 'not-allowed' : 'pointer',
                                boxShadow: (!startLabel || !endLabel) ? 'none' : '0 3px 12px rgba(24,95,165,0.3)',
                            }}>
                            {loading ? '⏳ Finding safest route...' : '🛡️ Find Safest Route'}
                        </button>
                    </div>
                )}

                {/* FSR / GSR / GFSR: instructions with steps */}
                {queryMode !== 'SR' && (
                    <div>
                        <div style={{
                            background: '#f8f9fa', borderRadius: 8,
                            padding: '14px 16px', marginBottom: 20,
                        }}>
                            {queryMode === 'FSR' && [
                                { step: '①', text: 'Click map once — set your START location' },
                                { step: '②', text: 'Click map again — add DESTINATION 1' },
                                { step: '③', text: 'Click map again — add DESTINATION 2 (min 2 needed)' },
                                { step: '✓',  text: 'System picks the safest destination automatically' },
                            ].map((s, i) => (
                                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 12 }}>
                                    <span style={{ color: '#185FA5', fontWeight: 600, width: 18 }}>{s.step}</span>
                                    <span style={{ color: '#555' }}>{s.text}</span>
                                </div>
                            ))}
                            {queryMode === 'GSR' && [
                                { step: '①', text: 'Click map — add GROUP MEMBER 1 location' },
                                { step: '②', text: 'Click map — add GROUP MEMBER 2+ locations' },
                                { step: '③', text: 'Press "Set Destination" button in the panel' },
                                { step: '④', text: 'Click map — set the MEETING POINT' },
                                { step: '✓',  text: 'Each member gets their own safest route' },
                            ].map((s, i) => (
                                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 12 }}>
                                    <span style={{ color: '#0F6E56', fontWeight: 600, width: 18 }}>{s.step}</span>
                                    <span style={{ color: '#555' }}>{s.text}</span>
                                </div>
                            ))}
                            {queryMode === 'GFSR' && [
                                { step: '①', text: 'Click map — add GROUP MEMBER locations (2+)' },
                                { step: '②', text: 'Press "Add Dests" button in panel' },
                                { step: '③', text: 'Click map — add candidate DESTINATIONS (2+)' },
                                { step: '④', text: 'Press "Find Safest Meeting Point" button' },
                                { step: '✓',  text: 'System picks destination safest for ALL members' },
                            ].map((s, i) => (
                                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 12 }}>
                                    <span style={{ color: '#854F0B', fontWeight: 600, width: 18 }}>{s.step}</span>
                                    <span style={{ color: '#555' }}>{s.text}</span>
                                </div>
                            ))}
                        </div>

                        <button onClick={onClose} style={{
                            width: '100%', padding: '11px 0', fontSize: 13, fontWeight: 500,
                            background: '#185FA5', color: 'white',
                            border: 'none', borderRadius: 8, cursor: 'pointer',
                        }}>
                            Got it — start clicking the map
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}


// ── Incident Report Modal ─────────────────────────────────────────────────────
const EVENT_TYPES = [
    { id: 'theft',      label: 'Theft / Pickpocketing', icon: '👜', color: '#e74c3c' },
    { id: 'robbery',    label: 'Robbery / Mugging',      icon: '🔪', color: '#c0392b' },
    { id: 'harassment', label: 'Harassment',             icon: '⚠️',  color: '#e67e22' },
    { id: 'accident',   label: 'Accident',               icon: '🚗', color: '#f39c12' },
    { id: 'suspicious', label: 'Suspicious activity',    icon: '👁️',  color: '#8e44ad' },
    { id: 'safe',       label: 'Safe visit (no issues)', icon: '✅', color: '#27ae60' },
];

function IncidentModal({ cell, onClose, onSubmit, loggedIn }) {
    const [selected, setSelected] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit() {
        if (!selected) return;
        setSubmitting(true);
        await onSubmit(cell, selected);
        setSubmitting(false);
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 5000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{
                background: 'white', borderRadius: 14,
                padding: '26px 28px', width: 380,
                boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
                fontFamily: 'sans-serif',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>
                            📍 Report Incident
                        </div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
                            Cell ({cell.x}, {cell.y}) · Right-clicked location
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', fontSize: 18,
                        color: '#aaa', cursor: 'pointer', padding: 4,
                    }}>×</button>
                </div>

                {!loggedIn ? (
                    <div style={{
                        background: '#FFF3CD', border: '1px solid #FFE082',
                        borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#856404',
                    }}>
                        ⚠️ You need to be logged in to report incidents. Your pSS data is always stored privately on your account.
                    </div>
                ) : (
                    <>
                        <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
                            What happened at this location? This updates your personal safety score (pSS) — event type is never shared with others.
                        </div>

                        {/* Event type grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                            {EVENT_TYPES.map(evt => (
                                <button key={evt.id}
                                    onClick={() => setSelected(evt.id)}
                                    style={{
                                        padding: '10px 10px', borderRadius: 8, cursor: 'pointer',
                                        border: selected === evt.id
                                            ? `2px solid ${evt.color}`
                                            : '1.5px solid #e8e8e8',
                                        background: selected === evt.id
                                            ? evt.color + '15'
                                            : 'white',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        textAlign: 'left',
                                        transition: 'all 0.12s',
                                    }}>
                                    <span style={{ fontSize: 18 }}>{evt.icon}</span>
                                    <span style={{
                                        fontSize: 11, fontWeight: selected === evt.id ? 500 : 400,
                                        color: selected === evt.id ? evt.color : '#444',
                                        lineHeight: 1.3,
                                    }}>{evt.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Privacy note */}
                        <div style={{
                            background: '#f0f9f4', borderRadius: 7,
                            padding: '8px 10px', marginBottom: 14, fontSize: 11, color: '#27ae60',
                        }}>
                            🔒 Only your pSS score updates — the event type is never revealed to other users or the server.
                        </div>

                        {/* Submit */}
                        <button
                            onClick={handleSubmit}
                            disabled={!selected || submitting}
                            style={{
                                width: '100%', padding: '11px 0', fontSize: 13, fontWeight: 500,
                                background: !selected || submitting
                                    ? '#ccc'
                                    : selected === 'safe'
                                        ? 'linear-gradient(90deg, #27ae60, #1a7a6e)'
                                        : 'linear-gradient(90deg, #e74c3c, #c0392b)',
                                color: 'white', border: 'none', borderRadius: 8,
                                cursor: !selected ? 'not-allowed' : 'pointer',
                                boxShadow: !selected ? 'none' : '0 3px 10px rgba(0,0,0,0.15)',
                            }}>
                            {submitting ? 'Updating...' : selected
                                ? `Report: ${EVENT_TYPES.find(e => e.id === selected)?.label}`
                                : 'Select an event type'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function MapView() {
    const { user } = useAuth();

    const [data,         setData]        = useState([]);
    const [queryMode,    setQueryMode]   = useState('SR');
    const [algorithm,    setAlgorithm]   = useState('G_DirA');
    const [deltaRatio,   setDeltaRatio]  = useState(1.2);
    const [users,        setUsers]       = useState([]);
    const [selectedUser, setSelectedUser]= useState('');
    const [loading,      setLoading]     = useState(false);
    const [error,        setError]       = useState('');

    // Route points
    const [start,        setStart]       = useState(null);
    const [end,          setEnd]         = useState(null);
    const [destinations, setDestinations]= useState([]);
    const [sources,      setSources]     = useState([]);
    const [gsrEnd,       setGsrEnd]      = useState(null);
    const [gsrPhase,     setGsrPhase]    = useState('sources');
    const [gfsrPhase,    setGfsrPhase]   = useState('sources');

    // Results
    const [routes,       setRoutes]      = useState([]);
    const [routeInfo,    setRouteInfo]   = useState(null);

    // Address search state
    const [mapCenter,    setMapCenter]   = useState(null);
    const [startLabel,   setStartLabel]  = useState('');
    const [endLabel,     setEndLabel]    = useState('');

    // Modal
    const [showModal,    setShowModal]   = useState(false);
    const [incident,     setIncident]    = useState(null);  // { x, y, lat, lng }
    const [incidentDone, setIncidentDone]= useState(false); // show success flash

    // Auto-select logged-in user
    useEffect(() => {
        if (user?.userId) setSelectedUser(user.userId);
    }, [user]);

    useEffect(() => {
        axios.get(API + '/api/safety/scores').then(r => setData(r.data)).catch(() => {});
        axios.get(API + '/api/users').then(r => setUsers(r.data)).catch(() => {});
    }, []);

    useEffect(() => { if (queryMode === 'SR' && start && end) fetchSR(); },
        [start, end, deltaRatio, algorithm, selectedUser]);
    useEffect(() => { if (queryMode === 'FSR' && start && destinations.length >= 2) fetchFSR(); },
        [destinations, start, deltaRatio, algorithm, selectedUser]);
    useEffect(() => { if (queryMode === 'GSR' && gsrPhase === 'done' && gsrEnd && sources.length >= 2) fetchGSR(); },
        [gsrEnd, gsrPhase]);

    async function fetchSR() {
        setLoading(true); setError(''); setRouteInfo(null); setRoutes([]);
        try {
            const r = await axios.get(API + '/api/route', { params: {
                startX: start.x, startY: start.y, endX: end.x, endY: end.y,
                deltaRatio, algorithm, userId: selectedUser || undefined, z: 50 } });
            setRoutes([r.data.path]); setRouteInfo(r.data);
        } catch(e) { setError(e.response?.data?.error || 'SR: route not found.'); }
        finally { setLoading(false); }
    }

    async function fetchFSR() {
        setLoading(true); setError(''); setRouteInfo(null); setRoutes([]);
        try {
            const r = await axios.get(API + '/api/route/fsr', { params: {
                startX: start.x, startY: start.y, dests: JSON.stringify(destinations),
                deltaRatio, algorithm, userId: selectedUser || undefined, z: 50 } });
            setRoutes([r.data.path]); setRouteInfo(r.data);
        } catch(e) { setError(e.response?.data?.error || 'FSR: no route found.'); }
        finally { setLoading(false); }
    }

    async function fetchGSR() {
        setLoading(true); setError(''); setRouteInfo(null); setRoutes([]);
        try {
            const r = await axios.get(API + '/api/route/gsr', { params: {
                srcX: sources.map(s => s.x).join(','), srcY: sources.map(s => s.y).join(','),
                endX: gsrEnd.x, endY: gsrEnd.y,
                deltaRatio, algorithm, userId: selectedUser || undefined, z: 50 } });
            setRoutes(r.data.memberRoutes?.map(m => m.path) || []); setRouteInfo(r.data);
        } catch(e) { setError(e.response?.data?.error || 'GSR: no routes found.'); }
        finally { setLoading(false); }
    }

    async function fetchGFSR() {
        if (sources.length < 2 || destinations.length < 2) { setError('GFSR: need 2+ members and 2+ destinations.'); return; }
        setLoading(true); setError(''); setRouteInfo(null); setRoutes([]);
        try {
            const r = await axios.get(API + '/api/route/gfsr', { params: {
                srcX:  sources.map(s => s.x).join(','), srcY:  sources.map(s => s.y).join(','),
                destX: destinations.map(d => d.x).join(','), destY: destinations.map(d => d.y).join(','),
                deltaRatio, algorithm, userId: selectedUser || undefined, z: 50 } });
            setRoutes(r.data.memberRoutes?.map(m => m.path) || []); setRouteInfo(r.data);
        } catch(e) { setError(e.response?.data?.error || 'GFSR: no routes found.'); }
        finally { setLoading(false); }
    }

    async function reportCheckin(cell, eventType) {
        if (!selectedUser) return;
        const isUnsafe = eventType !== 'safe';
        try {
            await axios.post(API + '/api/users/checkin', {
                userId:   selectedUser,
                gridX:    cell.x,
                gridY:    cell.y,
                isUnsafe: isUnsafe,
            });
            setIncidentDone(true);
            setTimeout(() => setIncidentDone(false), 3000);
            // Refresh safety scores so map updates
            axios.get(API + '/api/safety/scores').then(r => setData(r.data)).catch(() => {});
        } catch (e) {
            setError('Failed to report incident. Try again.');
        }
        setIncident(null);
    }

    const reset = () => {
        setStart(null); setEnd(null); setDestinations([]); setSources([]);
        setGsrEnd(null); setGsrPhase('sources'); setGfsrPhase('sources');
        setRoutes([]); setRouteInfo(null); setError('');
        setStartLabel(''); setEndLabel('');
    };
    const switchMode = m => { setQueryMode(m); reset(); };
    const isNaive    = algorithm === 'N_DirA' || algorithm === 'N_ItA';
    const isRDA      = algorithm === 'G_DirA+RDA';

    // Instruction text for map panel
    const instruction = () => {
        if (loading) return '⏳ Computing...';
        if (queryMode === 'SR') {
            if (!start) return '① Click map or use Find Route → START';
            if (!end)   return '② Click map or use Find Route → END';
            return routes.length ? '✅ Route found' : '⚠ No route';
        }
        if (queryMode === 'FSR') {
            if (!start)                    return '① Click map → START (or Find Route)';
            if (!destinations.length)      return '② Click map → DEST 1';
            if (destinations.length === 1) return '③ Click map → DEST 2';
            return routes.length ? `✅ Dest ${(routeInfo?.selectedDestIndex ?? 0) + 1} safest` : `${destinations.length} dests set`;
        }
        if (queryMode === 'GSR') {
            if (gsrPhase === 'sources') return `Click map → GROUP MEMBER (${sources.length} added)`;
            if (gsrPhase === 'dest')    return 'Click map → MEETING POINT';
            return routes.filter(r => r?.length > 0).length > 0 ? '✅ GSR routes found' : '⚠ Some unreachable';
        }
        if (queryMode === 'GFSR') {
            if (gfsrPhase === 'sources') return `Click map → GROUP MEMBER (${sources.length})`;
            return `Click map → DEST (${destinations.length} added)`;
        }
        return '';
    };

    return (
        <div style={{ position: 'relative', height: '100vh', fontFamily: 'sans-serif' }}>

            {/* ── Modal ──────────────────────────────────────────────────────── */}
            {showModal && (
                <FindRouteModal
                    queryMode={queryMode}
                    loading={loading}
                    startLabel={startLabel}
                    endLabel={endLabel}
                    onClose={() => setShowModal(false)}
                    onStartSelect={(cell, geo) => {
                        setStart(cell);
                        setStartLabel(geo.displayName);
                        setMapCenter([geo.lat, geo.lng]);
                    }}
                    onEndSelect={(cell, geo) => {
                        setEnd(cell);
                        setEndLabel(geo.displayName);
                        setMapCenter([geo.lat, geo.lng]);
                    }}
                    onConfirm={() => {
                        setShowModal(false);
                        // fetchSR triggers via useEffect when start+end set
                    }}
                />
            )}

            {/* ── Control Panel ──────────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 10, left: 10, zIndex: 1000,
                background: 'white', border: '1px solid #ddd', borderRadius: 10,
                padding: '12px 14px', width: 260,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#1a1a1a' }}>
                    Safe Route Finder
                </div>

                {/* ── FIND ROUTE BUTTON ───────────────────────────── */}
                {/* Right-click hint */}
                <div style={{ fontSize: 10, color: '#aaa', textAlign: 'center', marginBottom: 6 }}>
                    Right-click any map cell to report an incident
                </div>
                <button onClick={() => setShowModal(true)} style={{
                    width: '100%', padding: '10px 0', fontSize: 13, fontWeight: 500,
                    background: 'linear-gradient(90deg, #185FA5, #1a7a6e)',
                    color: 'white', border: 'none', borderRadius: 8,
                    cursor: 'pointer', marginBottom: 10,
                    boxShadow: '0 3px 10px rgba(24,95,165,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                    🔍 Find Route
                </button>

                {/* Selected route summary (SR) */}
                {queryMode === 'SR' && (startLabel || endLabel) && (
                    <div style={{
                        background: '#f5f9ff', borderRadius: 7,
                        padding: '8px 10px', marginBottom: 10,
                        border: '1px solid #dce8f8', fontSize: 11,
                    }}>
                        {startLabel && (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: endLabel ? 4 : 0 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2980b9', flexShrink: 0 }} />
                                <span style={{ color: '#555', flexShrink: 0 }}>From:</span>
                                <span style={{ color: '#185FA5', fontWeight: 500,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {startLabel}
                                </span>
                            </div>
                        )}
                        {endLabel && (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#9b59b6', flexShrink: 0 }} />
                                <span style={{ color: '#555', flexShrink: 0 }}>To:</span>
                                <span style={{ color: '#7d3c98', fontWeight: 500,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {endLabel}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Instruction */}
                <div style={{ fontSize: 11, color: '#666', marginBottom: 8, minHeight: 14 }}>
                    {instruction()}
                </div>

                {/* Query type */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        Query type
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        {[{id:'SR',sub:'1→1'},{id:'FSR',sub:'1→many'},{id:'GSR',sub:'many→1'},{id:'GFSR',sub:'many→many'}].map(q => (
                            <button key={q.id} onClick={() => switchMode(q.id)} style={{
                                padding: '5px 4px', fontSize: 11, cursor: 'pointer', borderRadius: 6,
                                border: queryMode === q.id ? '1.5px solid #185FA5' : '1px solid #e0e0e0',
                                background: queryMode === q.id ? '#185FA5' : 'white',
                                color:      queryMode === q.id ? 'white'   : '#555',
                                fontWeight: queryMode === q.id ? '500'     : '400',
                            }}>
                                {q.id}<div style={{ fontSize: 9, opacity: .8 }}>{q.sub}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* GSR phase controls */}
                {queryMode === 'GSR' && gsrPhase === 'sources' && sources.length >= 2 && (
                    <button onClick={() => setGsrPhase('dest')} style={{
                        width: '100%', padding: '7px', fontSize: 11, cursor: 'pointer',
                        borderRadius: 6, border: '1px solid #0F6E56', background: '#0F6E56',
                        color: 'white', marginBottom: 8 }}>
                        {sources.length} members → set DESTINATION
                    </button>
                )}
                {queryMode === 'GSR' && gsrPhase === 'dest' && (
                    <div style={{ fontSize: 11, color: '#0F6E56', padding: '6px 8px',
                        background: '#E1F5EE', borderRadius: 6, marginBottom: 8 }}>
                        Click map to set meeting point
                    </div>
                )}
                {queryMode === 'GFSR' && gfsrPhase === 'sources' && sources.length >= 2 && (
                    <button onClick={() => setGfsrPhase('dests')} style={{
                        width: '100%', padding: '7px', fontSize: 11, cursor: 'pointer',
                        borderRadius: 6, border: '1px solid #854F0B', background: '#854F0B',
                        color: 'white', marginBottom: 8 }}>
                        {sources.length} members → add DESTINATIONS
                    </button>
                )}
                {queryMode === 'GFSR' && gfsrPhase === 'dests' && destinations.length >= 2 && (
                    <button onClick={fetchGFSR} style={{
                        width: '100%', padding: '7px', fontSize: 11, cursor: 'pointer',
                        borderRadius: 6, border: '1px solid #185FA5', background: '#185FA5',
                        color: 'white', marginBottom: 8 }}>
                        Find Safest Meeting Point
                    </button>
                )}

                {/* Algorithm */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        Algorithm
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        {Object.entries(ALGO_INFO).map(([a, info]) => (
                            <button key={a} onClick={() => { setAlgorithm(a); setRoutes([]); setRouteInfo(null); }} style={{
                                padding: '5px 4px', fontSize: 11, cursor: 'pointer', borderRadius: 6,
                                border: algorithm === a ? `1.5px solid ${info.color}` : '1px solid #e0e0e0',
                                background: algorithm === a ? info.color : 'white',
                                color:      algorithm === a ? 'white'   : '#555',
                            }}>{a}</button>
                        ))}
                    </div>
                    <div style={{ fontSize: 10, color: ALGO_INFO[algorithm]?.color, marginTop: 4 }}>
                        {ALGO_INFO[algorithm]?.desc}
                    </div>
                    {isNaive && (
                        <div style={{ fontSize: 10, color: '#854F0B', marginTop: 3,
                            background: '#FAEEDA', padding: '3px 6px', borderRadius: 4 }}>
                            Baseline only. G_DirA is 4-12x faster.
                        </div>
                    )}
                </div>

                {/* Crowd user */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        Crowd user
                    </div>
                    <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
                        style={{ width: '100%', fontSize: 11, padding: '5px 6px', borderRadius: 6,
                            border: '1px solid #e0e0e0', background: '#fafafa' }}>
                        <option value=''>Global scores</option>
                        {users.map(u => (
                            <option key={u.user_id} value={u.user_id}>{u.username} ({u.cells_known})</option>
                        ))}
                    </select>
                </div>

                {/* Delta */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        Distance δ: <b style={{ color: '#333' }}>{deltaRatio.toFixed(1)}×</b>
                    </div>
                    <input type="range" min="1.1" max="2.0" step="0.1" value={deltaRatio}
                        onChange={e => { setDeltaRatio(parseFloat(e.target.value)); setRoutes([]); setRouteInfo(null); }}
                        style={{ width: '100%' }} />
                    <div style={{ fontSize: 9, color: '#bbb' }}>Paper default: 1.2×</div>
                </div>

                <button onClick={reset} style={{
                    width: '100%', padding: '7px 0', background: '#fff',
                    color: '#e74c3c', border: '1px solid #e74c3c',
                    borderRadius: 6, cursor: 'pointer', fontSize: 12,
                }}>
                    Reset
                </button>
            </div>

            {/* ── Route Analysis Panel ───────────────────────────────────────── */}
            {routeInfo && (
                <div style={{
                    position: 'absolute', top: 10, right: 10, zIndex: 1000,
                    background: 'white', border: '1px solid #ddd', borderRadius: 10,
                    padding: '10px 14px', width: 220,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontSize: 12,
                    maxHeight: '80vh', overflowY: 'auto',
                }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 12,
                        color: ALGO_INFO[routeInfo.algorithm]?.color || '#333' }}>
                        {routeInfo.queryType} — {routeInfo.algorithm}
                        {isNaive && <span style={{ fontSize: 10, fontWeight: 400,
                            color: '#854F0B', marginLeft: 4 }}>(naive)</span>}
                    </div>

                    {/* FSR/GFSR selected dest */}
                    {(routeInfo.queryType === 'FSR' || routeInfo.queryType === 'GFSR') && routeInfo.selectedDest && (
                        <div style={{ marginBottom:8, padding:'5px 8px', background:'#EEEDFE', borderRadius:6, fontSize:11 }}>
                            Safest dest #{(routeInfo.selectedDestIndex??0)+1}
                        </div>
                    )}

                    {/* GSR/GFSR routeSetMinSS */}
                    {(routeInfo.queryType === 'GSR' || routeInfo.queryType === 'GFSR') && (
                        <div style={{ marginBottom:8, padding:'5px 8px', background:'#E6F1FB', borderRadius:6, fontSize:11 }}>
                            Route-set minSS: {((routeInfo.routeSetMinSS??0)*100).toFixed(1)}%
                        </div>
                    )}

                    {/* Member routes */}
                    {routeInfo.memberRoutes && routeInfo.memberRoutes.map((m,i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between',
                            fontSize:11, padding:'2px 0', color:MEMBER_COLORS[i%MEMBER_COLORS.length] }}>
                            <span>Member {i+1}</span>
                            <span>{m.reachable ? `${m.totalSteps}s ${(m.minSafetyScore*100).toFixed(0)}%` : 'unreachable'}</span>
                        </div>
                    ))}

                    {/* SR/FSR metrics */}
                    {(routeInfo.queryType === 'SR' || routeInfo.queryType === 'FSR') && [
                        ['Min safety', `${((routeInfo.minSafetyScore??0)*100).toFixed(1)}%`,
                            (routeInfo.minSafetyScore??0)>=0.5?'#27ae60':'#e74c3c'],
                        ['pSS', (((routeInfo.minSafetyScore??0)*20)-10).toFixed(2), '#333'],
                        ['Confidence', `${((routeInfo.confidenceLevel??0)*100).toFixed(1)}%`, '#333'],
                        ['Steps', routeInfo.totalSteps, '#333'],
                    ].map(([l,v,c]) => (
                        <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:11 }}>
                            <span style={{ color:'#666' }}>{l}:</span>
                            <span style={{ fontWeight:'bold', color:c }}>{v}</span>
                        </div>
                    ))}

                    {/* Privacy */}
                    {routeInfo.privacyStats && (
                        <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #f0f0f0' }}>
                            <div style={{ fontSize:10, color:'#aaa', marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>
                                Privacy metrics
                            </div>
                            {[
                                ['Comm freq', routeInfo.privacyStats.commFreq],
                                ['pSS revealed', routeInfo.privacyStats.pssRevealed],
                            ].map(([l,v]) => (
                                <div key={l} style={{ marginBottom:5 }}>
                                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:3 }}>
                                        <span style={{ color:'#666' }}>{l}:</span>
                                        <span style={{ fontWeight:'bold' }}>{v}</span>
                                    </div>
                                    <div style={{ background:'#f0f0f0', borderRadius:3, height:4 }}>
                                        <div style={{
                                            width: Math.min((v/250)*100,100)+'%',
                                            background: ALGO_INFO[routeInfo.algorithm]?.color || '#185FA5',
                                            borderRadius:3, height:4 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Crowd stats */}
                    {routeInfo.crowdStats && (
                        <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #f0f0f0', fontSize:11, color:'#666' }}>
                            Group: <b>{routeInfo.crowdStats.groupSize}</b> · Cells: <b>{routeInfo.crowdStats.cellsCovered}</b>
                        </div>
                    )}

                    {/* RDA stats — shown when G_DirA+RDA selected */}
                    {routeInfo.algorithm === 'G_DirA+RDA' && routeInfo.rdaStats && (
                        <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #f0f0f0' }}>
                            <div style={{ fontSize:10, color:'#aaa', marginBottom:5,
                                textTransform:'uppercase', letterSpacing:'.04em' }}>
                                RDA (Oct 2025)
                            </div>
                            {[
                                ['Best threshold T', routeInfo.rdaStats.bestThreshold?.toFixed(4)],
                                ['Iterations', routeInfo.rdaStats.iterations],
                            ].map(([l,v]) => (
                                <div key={l} style={{ display:'flex', justifyContent:'space-between',
                                    fontSize:11, marginBottom:4 }}>
                                    <span style={{ color:'#666' }}>{l}:</span>
                                    <span style={{ fontWeight:'bold', color:'#6C3483' }}>{v}</span>
                                </div>
                            ))}
                            <div style={{ fontSize:10, color:'#aaa', marginTop:4, lineHeight:1.5 }}>
                                Replaces binary search (Step 4 G_DirA).
                                Chen et al. Sci Reports 2025.
                            </div>
                        </div>
                    )}

                    {isNaive && (
                        <div style={{ marginTop:8, fontSize:10, color:'#854F0B',
                            background:'#FAEEDA', padding:'5px 7px', borderRadius:5 }}>
                            Naive baseline. G_DirA is 4-12x faster.
                        </div>
                    )}
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{
                    position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)',
                    zIndex:1000, background:'#e74c3c', color:'white',
                    padding:'8px 20px', borderRadius:6, fontSize:13,
                }}>{error}</div>
            )}

            {/* Legend */}
            <div style={{
                position:'absolute', bottom:10, left:10, zIndex:1000,
                background:'white', border:'1px solid #ddd', borderRadius:8,
                padding:'10px 13px', fontSize:11, boxShadow:'0 2px 8px rgba(0,0,0,0.12)',
            }}>
                <div style={{ fontWeight:600, marginBottom:5, fontSize:11 }}>pSS Safety</div>
                {[['#d73027','≤−8 very dangerous'],['#fc8d59','−8 to −5 dangerous'],
                  ['#fee090','−5 to −2 moderate'],['#91cf60','−2 to −0.5 safe'],
                  ['#1a9850','> −0.5 very safe']].map(([c,l]) => (
                    <div key={l} style={{ display:'flex', alignItems:'center', marginBottom:3 }}>
                        <div style={{ width:10, height:10, borderRadius:'50%', background:c, marginRight:5 }} />
                        {l}
                    </div>
                ))}
                <div style={{ marginTop:6, paddingTop:6, borderTop:'1px solid #eee' }}>
                    <div style={{ fontWeight:600, marginBottom:4, fontSize:11 }}>Algorithms</div>
                    {Object.entries(ALGO_INFO).map(([a,info]) => (
                        <div key={a} style={{ display:'flex', alignItems:'center', marginBottom:2 }}>
                            <div style={{ width:10, height:3, borderRadius:2, background:info.color, marginRight:5 }} />
                            <span style={{ fontSize:10, color: a===algorithm ? info.color : '#777',
                                fontWeight: a===algorithm ? 'bold' : 'normal' }}>{a}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Map */}
            <MapContainer center={[41.8500,-87.6500]} zoom={13} style={{ height:'100vh', width:'100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="© OpenStreetMap contributors" />
                {mapCenter && <FlyToLocation center={mapCenter} />}
                <MapClickHandler
                    queryMode={queryMode} gsrPhase={gsrPhase} gfsrPhase={gfsrPhase}
                    start={start} setStart={setStart} setEnd={setEnd}
                    setSources={setSources} setDestinations={setDestinations}
                    setGsrEnd={setGsrEnd} setGsrPhase={setGsrPhase}
                    onCellRightClick={(cell) => setIncident(cell)} />

                {/* Safety markers */}
                {data.map((item,i) => (
                    <CircleMarker key={i}
                        center={[(item.grid_x+0.5)*0.01,(item.grid_y+0.5)*0.01]} radius={5}
                        pathOptions={{ fillColor:getPSSColor(item.pss??0), fillOpacity:0.7, color:'transparent', weight:0 }}>
                        <Popup>
                            <div style={{ fontSize:12, lineHeight:1.7 }}>
                                <b>pSS:</b> {(item.pss??0).toFixed(4)}<br/>
                                <b>Safety:</b> {item.safety_score?.toFixed(4)}<br/>
                                <b>Crimes:</b> {item.crime_count}
                            </div>
                        </Popup>
                    </CircleMarker>
                ))}

                {/* SR markers */}
                {(queryMode==='SR'||queryMode==='FSR') && start && (
                    <CircleMarker center={[(start.x+0.5)*0.01,(start.y+0.5)*0.01]} radius={11}
                        pathOptions={{ color:'#1a6fa8', fillColor:'#3498db', fillOpacity:1, weight:2 }}>
                        <Popup><b>Start</b>{startLabel && <><br/>{startLabel}</>}</Popup>
                    </CircleMarker>
                )}
                {queryMode==='SR' && end && (
                    <CircleMarker center={[(end.x+0.5)*0.01,(end.y+0.5)*0.01]} radius={11}
                        pathOptions={{ color:'#6c3483', fillColor:'#9b59b6', fillOpacity:1, weight:2 }}>
                        <Popup><b>End</b>{endLabel && <><br/>{endLabel}</>}</Popup>
                    </CircleMarker>
                )}

                {/* FSR destinations */}
                {queryMode==='FSR' && destinations.map((d,i) => {
                    const best = routeInfo?.selectedDestIndex===i;
                    return (
                        <CircleMarker key={i} center={[(d.x+0.5)*0.01,(d.y+0.5)*0.01]}
                            radius={best?12:8}
                            pathOptions={{ color:best?'#27ae60':'#7d3c98', fillColor:best?'#2ecc71':'#9b59b6', fillOpacity:1, weight:best?3:2 }}>
                            <Popup><b>Dest {i+1}</b> {best?'★ SAFEST':''}</Popup>
                        </CircleMarker>
                    );
                })}

                {/* GSR/GFSR members */}
                {(queryMode==='GSR'||queryMode==='GFSR') && sources.map((s,i) => (
                    <CircleMarker key={i} center={[(s.x+0.5)*0.01,(s.y+0.5)*0.01]} radius={9}
                        pathOptions={{ color:MEMBER_COLORS[i%MEMBER_COLORS.length], fillColor:MEMBER_COLORS[i%MEMBER_COLORS.length], fillOpacity:1, weight:2 }}>
                        <Popup><b>Member {i+1}</b></Popup>
                    </CircleMarker>
                ))}

                {/* GSR meeting point */}
                {queryMode==='GSR' && gsrEnd && (
                    <CircleMarker center={[(gsrEnd.x+0.5)*0.01,(gsrEnd.y+0.5)*0.01]} radius={13}
                        pathOptions={{ color:'#1e8449', fillColor:'#2ecc71', fillOpacity:1, weight:3 }}>
                        <Popup><b>Meeting Point</b></Popup>
                    </CircleMarker>
                )}

                {/* GFSR destinations */}
                {queryMode==='GFSR' && destinations.map((d,i) => {
                    const best = routeInfo?.selectedDestIndex===i;
                    return (
                        <CircleMarker key={i} center={[(d.x+0.5)*0.01,(d.y+0.5)*0.01]}
                            radius={best?13:8}
                            pathOptions={{ color:best?'#1e8449':'#854F0B', fillColor:best?'#2ecc71':'#e67e22', fillOpacity:1, weight:best?3:2 }}>
                            <Popup><b>Dest {i+1}</b> {best?'★ SAFEST MEETING':''}</Popup>
                        </CircleMarker>
                    );
                })}

                {/* Routes */}
                {routes.map((path,i) => path?.length>0 && (
                    <Polyline key={i}
                        positions={path.map(p => [(p.x+0.5)*0.01,(p.y+0.5)*0.01])}
                        pathOptions={{
                            color: (queryMode==='GSR'||queryMode==='GFSR')
                                ? MEMBER_COLORS[i%MEMBER_COLORS.length]
                                : (ALGO_INFO[algorithm]?.color || '#185FA5'),
                            weight:5, opacity:0.85,
                        }} />
                ))}
            </MapContainer>
        </div>
    );
}
