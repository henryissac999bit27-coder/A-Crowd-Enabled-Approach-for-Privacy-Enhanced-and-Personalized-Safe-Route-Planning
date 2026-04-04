import { useEffect, useState } from 'react';
import axios from 'axios';
import {
    MapContainer, TileLayer,
    CircleMarker, Popup, Polyline, useMapEvents
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const API = 'http://localhost:5000';

// Member colors for GSR/GFSR — each group member gets a unique route color
const MEMBER_COLORS = ['#2980b9','#e74c3c','#27ae60','#f39c12','#8e44ad','#16a085','#c0392b','#2c3e50'];

function getPSSColor(pss) {
    if (pss <= -8)   return '#d73027';
    if (pss <= -5)   return '#fc8d59';
    if (pss <= -2)   return '#fee090';
    if (pss <= -0.5) return '#91cf60';
    return '#1a9850';
}

// ── Map click handler ─────────────────────────────────────────────────────────
function MapClickHandler({ queryMode, clickState, handlers }) {
    useMapEvents({
        click(e) {
            const gx = Math.floor(e.latlng.lat / 0.01);
            const gy = Math.floor(e.latlng.lng / 0.01);
            const cell = { x: gx, y: gy };

            if (queryMode === 'SR') {
                if (!clickState.start)     handlers.setStart(cell);
                else if (!clickState.end)  handlers.setEnd(cell);

            } else if (queryMode === 'FSR') {
                if (!clickState.start)  handlers.setStart(cell);
                else                    handlers.setDestinations(p => [...p, cell]);

            } else if (queryMode === 'GSR') {
                // First clicks = group members (sources), last click = destination
                if (!clickState.end)
                    handlers.setSources(p => [...p, cell]);   // add member
                // User presses "Set Destination" button to fix the end point

            } else if (queryMode === 'GFSR') {
                // Phase 1: add sources. Phase 2: add destinations.
                if (clickState.phase === 'sources')
                    handlers.setSources(p => [...p, cell]);
                else
                    handlers.setDestinations(p => [...p, cell]);
            }
        }
    });
    return null;
}

// ══════════════════════════════════════════════════════════════════════════════
function MapView() {
    const [data,         setData]         = useState([]);
    const [queryMode,    setQueryMode]     = useState('SR');
    const [algorithm,    setAlgorithm]     = useState('G_DirA');
    const [deltaRatio,   setDeltaRatio]    = useState(1.2);
    const [users,        setUsers]         = useState([]);
    const [selectedUser, setSelectedUser]  = useState('');
    const [loading,      setLoading]       = useState(false);
    const [error,        setError]         = useState('');

    // SR state
    const [start,  setStart]  = useState(null);
    const [end,    setEnd]    = useState(null);

    // FSR / GFSR destinations
    const [destinations, setDestinations] = useState([]);

    // GSR / GFSR sources
    const [sources,    setSources]    = useState([]);
    const [gsrEnd,     setGsrEnd]     = useState(null);   // GSR fixed destination
    const [gsrPhase,   setGsrPhase]   = useState('sources'); // 'sources' | 'dest'
    const [gfsrPhase,  setGfsrPhase]  = useState('sources'); // 'sources' | 'dests'

    // Route results
    const [routes,    setRoutes]    = useState([]);   // array of paths (GSR/GFSR have multiple)
    const [routeInfo, setRouteInfo] = useState(null);

    useEffect(() => {
        axios.get(`${API}/api/safety/scores`).then(r => setData(r.data)).catch(() => {});
        axios.get(`${API}/api/users`).then(r => setUsers(r.data)).catch(() => {});
    }, []);

    // Auto-fetch SR
    useEffect(() => {
        if (queryMode === 'SR' && start && end) fetchSR();
    }, [start, end, deltaRatio, algorithm, selectedUser]);

    // Auto-fetch FSR when ≥2 destinations
    useEffect(() => {
        if (queryMode === 'FSR' && start && destinations.length >= 2) fetchFSR();
    }, [destinations, start, deltaRatio, algorithm, selectedUser]);

    // ── Fetch functions ───────────────────────────────────────────────────────
    async function fetchSR() {
        setLoading(true); setError(''); setRouteInfo(null); setRoutes([]);
        try {
            const r = await axios.get(`${API}/api/route`, {
                params: { startX: start.x, startY: start.y, endX: end.x, endY: end.y,
                          deltaRatio, algorithm, userId: selectedUser || undefined, z: 50 }
            });
            setRoutes([r.data.path]);
            setRouteInfo(r.data);
        } catch (e) { setError(e.response?.data?.error || 'SR: route not found.'); }
        finally { setLoading(false); }
    }

    async function fetchFSR() {
        setLoading(true); setError(''); setRouteInfo(null); setRoutes([]);
        try {
            const r = await axios.get(`${API}/api/route/fsr`, {
                params: {
                    startX: start.x, startY: start.y,
                    dests:  JSON.stringify(destinations),
                    deltaRatio, algorithm,
                    userId: selectedUser || undefined, z: 50,
                }
            });
            setRoutes([r.data.path]);
            setRouteInfo(r.data);
        } catch (e) { setError(e.response?.data?.error || 'FSR: no route found.'); }
        finally { setLoading(false); }
    }

    async function fetchGSR() {
        if (sources.length < 2 || !gsrEnd) {
            setError('GSR: need ≥2 sources and 1 destination.');
            return;
        }
        setLoading(true); setError(''); setRouteInfo(null); setRoutes([]);
        try {
            const r = await axios.get(`${API}/api/route/gsr`, {
                params: {
                    srcX:  sources.map(s => s.x).join(','),
                    srcY:  sources.map(s => s.y).join(','),
                    endX:  gsrEnd.x, endY: gsrEnd.y,
                    deltaRatio, algorithm,
                    userId: selectedUser || undefined, z: 50,
                }
            });
            setRoutes(r.data.memberRoutes?.map(m => m.path) || []);
            setRouteInfo(r.data);
        } catch (e) { setError(e.response?.data?.error || 'GSR: no routes found.'); }
        finally { setLoading(false); }
    }

    async function fetchGFSR() {
        if (sources.length < 2 || destinations.length < 2) {
            setError('GFSR: need ≥2 sources and ≥2 destinations.');
            return;
        }
        setLoading(true); setError(''); setRouteInfo(null); setRoutes([]);
        try {
            const r = await axios.get(`${API}/api/route/gfsr`, {
                params: {
                    srcX:  sources.map(s => s.x).join(','),
                    srcY:  sources.map(s => s.y).join(','),
                    destX: destinations.map(d => d.x).join(','),
                    destY: destinations.map(d => d.y).join(','),
                    deltaRatio, algorithm,
                    userId: selectedUser || undefined, z: 50,
                }
            });
            setRoutes(r.data.memberRoutes?.map(m => m.path) || []);
            setRouteInfo(r.data);
        } catch (e) { setError(e.response?.data?.error || 'GFSR: no routes found.'); }
        finally { setLoading(false); }
    }

    const reset = () => {
        setStart(null); setEnd(null); setDestinations([]); setSources([]);
        setGsrEnd(null); setGsrPhase('sources'); setGfsrPhase('sources');
        setRoutes([]); setRouteInfo(null); setError('');
    };

    const switchMode = mode => { setQueryMode(mode); reset(); };

    // ── Instruction text ──────────────────────────────────────────────────────
    const instruction = () => {
        if (loading) return '⏳ Computing...';
        if (queryMode === 'SR') {
            if (!start) return '① Click map → START';
            if (!end)   return '② Click map → END';
            return routes.length ? '✅ SR route found' : '⚠ No route';
        }
        if (queryMode === 'FSR') {
            if (!start)                    return '① Click map → START';
            if (destinations.length === 0) return '② Click map → DEST 1';
            if (destinations.length === 1) return '③ Click map → DEST 2 (min 2)';
            return routes.length ? `✅ FSR: dest ${(routeInfo?.selectedDestIndex??0)+1} is safest` : `${destinations.length} dests pinned`;
        }
        if (queryMode === 'GSR') {
            if (gsrPhase === 'sources') return `Click map → add GROUP MEMBER (${sources.length} added, need ≥2)`;
            if (!gsrEnd) return 'Click map → set DESTINATION';
            return routes.length ? '✅ GSR: all member routes found' : '⚠ No routes';
        }
        if (queryMode === 'GFSR') {
            if (gfsrPhase === 'sources') return `Click map → add GROUP MEMBER (${sources.length} added, need ≥2)`;
            return `Click map → add DESTINATION (${destinations.length} added, need ≥2)`;
        }
        return '';
    };

    // Click state for handler
    const clickState = {
        start, end, destinations, sources, phase: queryMode === 'GSR' ? gsrPhase : gfsrPhase
    };
    const handlers = {
        setStart, setEnd, setDestinations, setSources,
    };

    // GSR special click override — after phase switch, next click = destination
    const handleGSRDestClick = () => {
        setGsrPhase('dest');
        // Next map click handled differently — we use a one-time listener via flag
        const onceHandler = (e) => {
            const gx = Math.floor(e.latlng?.lat / 0.01);
            const gy = Math.floor(e.latlng?.lng / 0.01);
            setGsrEnd({ x: gx, y: gy });
        };
        // Store handler in window temporarily — MapClickHandler will use gsrPhase='dest'
    };

    return (
        <div style={{ position: 'relative', height: '100vh', fontFamily: 'sans-serif' }}>

            {/* ── Control Panel ───────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 10, left: 10, zIndex: 1000,
                background: 'white', border: '1px solid #ccc', borderRadius: 8,
                padding: '12px 16px', minWidth: 258,
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 14 }}>Safe Route Finder</div>

                {/* Query mode */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Query type (paper Definition 5):</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        {[
                            { id:'SR',   label:'SR',   sub:'1→1' },
                            { id:'FSR',  label:'FSR',  sub:'1→many' },
                            { id:'GSR',  label:'GSR',  sub:'many→1' },
                            { id:'GFSR', label:'GFSR', sub:'many→many' },
                        ].map(q => (
                            <button key={q.id} onClick={() => switchMode(q.id)} style={{
                                padding: '5px 4px', fontSize: 12, cursor: 'pointer',
                                borderRadius: 4, border: '1px solid #ccc',
                                background: queryMode === q.id ? '#185FA5' : 'white',
                                color:      queryMode === q.id ? 'white'    : '#333',
                                fontWeight: queryMode === q.id ? '500'      : '400',
                            }}>
                                {q.label}
                                <div style={{ fontSize: 10, opacity: .8 }}>{q.sub}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Instruction */}
                <div style={{ fontSize: 12, color: '#555', marginBottom: 8, minHeight: 16 }}>
                    {instruction()}
                </div>

                {/* GSR phase controls */}
                {queryMode === 'GSR' && (
                    <div style={{ marginBottom: 8, display: 'flex', gap: 6 }}>
                        <button
                            disabled={sources.length < 2 || gsrPhase === 'dest'}
                            onClick={() => setGsrPhase('dest')}
                            style={{ flex: 1, padding: '5px', fontSize: 11, cursor: 'pointer',
                                borderRadius: 4, border: '1px solid #0F6E56',
                                background: gsrPhase === 'dest' ? '#0F6E56' : 'white',
                                color: gsrPhase === 'dest' ? 'white' : '#0F6E56' }}>
                            {gsrPhase === 'dest' ? '→ Now click DEST' : `Set Destination (${sources.length} members)`}
                        </button>
                        {gsrEnd && (
                            <button onClick={fetchGSR}
                                style={{ flex: 1, padding: '5px', fontSize: 11, cursor: 'pointer',
                                    borderRadius: 4, border: '1px solid #185FA5',
                                    background: '#185FA5', color: 'white' }}>
                                Find Routes ↗
                            </button>
                        )}
                    </div>
                )}

                {/* GFSR phase controls */}
                {queryMode === 'GFSR' && (
                    <div style={{ marginBottom: 8, display: 'flex', gap: 6 }}>
                        <button
                            disabled={sources.length < 2 || gfsrPhase === 'dests'}
                            onClick={() => setGfsrPhase('dests')}
                            style={{ flex: 1, padding: '5px', fontSize: 11, cursor: 'pointer',
                                borderRadius: 4, border: '1px solid #854F0B',
                                background: gfsrPhase === 'dests' ? '#854F0B' : 'white',
                                color: gfsrPhase === 'dests' ? 'white' : '#854F0B' }}>
                            {gfsrPhase === 'dests' ? `→ Pin dests (${destinations.length})` : `Add Dests (${sources.length} members)`}
                        </button>
                        {destinations.length >= 2 && (
                            <button onClick={fetchGFSR}
                                style={{ flex: 1, padding: '5px', fontSize: 11, cursor: 'pointer',
                                    borderRadius: 4, border: '1px solid #185FA5',
                                    background: '#185FA5', color: 'white' }}>
                                Find Routes ↗
                            </button>
                        )}
                    </div>
                )}

                {/* Algorithm */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Algorithm:</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {['G_DirA','G_ItA'].map(a => (
                            <button key={a} onClick={() => setAlgorithm(a)} style={{
                                flex: 1, padding: '5px', fontSize: 12, cursor: 'pointer',
                                borderRadius: 4, border: '1px solid #ccc',
                                background: algorithm === a ? '#185FA5' : 'white',
                                color:      algorithm === a ? 'white'    : '#333',
                            }}>{a}</button>
                        ))}
                    </div>
                </div>

                {/* Crowd user */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Crowd user:</div>
                    <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
                        style={{ width:'100%', fontSize:12, padding:'4px 6px', borderRadius:4, border:'1px solid #ccc' }}>
                        <option value=''>Global scores</option>
                        {users.map(u => (
                            <option key={u.user_id} value={u.user_id}>{u.username} ({u.cells_known})</option>
                        ))}
                    </select>
                </div>

                {/* Delta */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                        δ constraint: <b>{deltaRatio.toFixed(1)}×</b>
                    </div>
                    <input type="range" min="1.1" max="2.0" step="0.1" value={deltaRatio}
                        onChange={e => { setDeltaRatio(parseFloat(e.target.value)); setRoutes([]); setRouteInfo(null); }}
                        style={{ width:'100%' }}/>
                </div>

                <button onClick={reset} style={{
                    width:'100%', padding:'6px 0', background:'#e74c3c',
                    color:'white', border:'none', borderRadius:4, cursor:'pointer', fontSize:13,
                }}>Reset</button>
            </div>

            {/* ── Route Info Panel ────────────────────────────────────────── */}
            {routeInfo && (
                <div style={{
                    position:'absolute', top:10, right:10, zIndex:1000,
                    background:'white', border:'1px solid #ccc', borderRadius:8,
                    padding:'12px 16px', minWidth:240,
                    boxShadow:'0 2px 8px rgba(0,0,0,0.18)', fontSize:13,
                    maxHeight: '80vh', overflowY: 'auto',
                }}>
                    <div style={{ fontWeight:'bold', marginBottom:8 }}>
                        Route Analysis — {routeInfo.queryType} ({routeInfo.algorithm})
                    </div>

                    {/* FSR / GFSR selected destination */}
                    {(routeInfo.queryType === 'FSR' || routeInfo.queryType === 'GFSR') && routeInfo.selectedDest && (
                        <div style={{ marginBottom:8, padding:'6px 8px', background:'#EEEDFE', borderRadius:6, fontSize:12 }}>
                            <span style={{ color:'#534AB7', fontWeight:'500' }}>Safest dest: </span>
                            <span style={{ color:'#3C3489' }}>#{(routeInfo.selectedDestIndex??0)+1} ({routeInfo.selectedDest.x},{routeInfo.selectedDest.y})</span>
                        </div>
                    )}

                    {/* GSR/GFSR routeSetMinSS */}
                    {(routeInfo.queryType === 'GSR' || routeInfo.queryType === 'GFSR') && (
                        <div style={{ marginBottom:8, padding:'6px 8px', background:'#E6F1FB', borderRadius:6, fontSize:12 }}>
                            <span style={{ color:'#0C447C', fontWeight:'500' }}>Route-set minSS: </span>
                            <span style={{ color:'#185FA5' }}>{((routeInfo.routeSetMinSS??0)*100).toFixed(1)}%</span>
                            <div style={{ fontSize:10, color:'#888', marginTop:2 }}>Worst member's route safety — paper's group ranking metric</div>
                        </div>
                    )}

                    {/* Per-member summary for GSR/GFSR */}
                    {routeInfo.memberRoutes && (
                        <div style={{ marginBottom:8 }}>
                            <div style={{ fontSize:11, color:'#888', marginBottom:4 }}>Member routes:</div>
                            {routeInfo.memberRoutes.map((m, i) => (
                                <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'2px 0',
                                    color: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                                    <span>Member {i+1} ({m.source?.x},{m.source?.y})</span>
                                    <span>{m.reachable ? `${m.totalSteps} steps, minSS=${(m.minSafetyScore*100).toFixed(0)}%` : 'unreachable'}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* FSR all destinations comparison */}
                    {routeInfo.allDestResults && routeInfo.queryType === 'FSR' && (
                        <div style={{ marginBottom:8 }}>
                            <div style={{ fontSize:11, color:'#888', marginBottom:4 }}>All destinations:</div>
                            {routeInfo.allDestResults.map((d,i) => (
                                <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'2px 0',
                                    color: i===routeInfo.selectedDestIndex ? '#534AB7' : '#555',
                                    fontWeight: i===routeInfo.selectedDestIndex ? '500' : '400' }}>
                                    <span>Dest {i+1}</span>
                                    <span>{d.reachable ? `minSS=${d.minSS?.toFixed(2)}` : 'unreachable'}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* GFSR all destinations */}
                    {routeInfo.allDestResults && routeInfo.queryType === 'GFSR' && (
                        <div style={{ marginBottom:8 }}>
                            <div style={{ fontSize:11, color:'#888', marginBottom:4 }}>All destinations (group minSS):</div>
                            {routeInfo.allDestResults.map((d,i) => (
                                <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'2px 0',
                                    color: i===routeInfo.selectedDestIndex ? '#854F0B' : '#555',
                                    fontWeight: i===routeInfo.selectedDestIndex ? '500' : '400' }}>
                                    <span>Dest {i+1} ({d.destination?.x},{d.destination?.y})</span>
                                    <span>{d.reachable ? `${(d.routeSetMinSS*100).toFixed(0)}%` : 'unreachable'}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* SR/FSR standard metrics */}
                    {(routeInfo.queryType === 'SR' || routeInfo.queryType === 'FSR') && [
                        ['Min safety score', `${((routeInfo.minSafetyScore??0)*100).toFixed(1)}%`,
                            (routeInfo.minSafetyScore??0)>=0.5?'#27ae60':(routeInfo.minSafetyScore??0)>=0.3?'#e67e22':'#e74c3c'],
                        ['pSS (paper −10 to 0)', (((routeInfo.minSafetyScore??0)*20)-10).toFixed(2), '#333'],
                        ['Confidence level', `${((routeInfo.confidenceLevel??0)*100).toFixed(1)}%`,
                            (routeInfo.confidenceLevel??0)>=0.7?'#27ae60':'#e67e22'],
                        ['Route steps', routeInfo.totalSteps, '#333'],
                    ].map(([l,v,c]) => (
                        <div key={l} style={{ marginBottom:5, overflow:'hidden' }}>
                            <span style={{ color:'#555' }}>{l}:</span>
                            <span style={{ float:'right', fontWeight:'bold', color:c }}>{v}</span>
                        </div>
                    ))}

                    {/* Privacy metrics */}
                    {routeInfo.privacyStats && (
                        <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #eee' }}>
                            <div style={{ fontSize:11, color:'#888', marginBottom:4 }}>Privacy metrics</div>
                            <div style={{ overflow:'hidden', fontSize:12, marginBottom:4 }}>
                                <span style={{ color:'#555' }}>Comm. freq:</span>
                                <span style={{ float:'right', fontWeight:'bold' }}>{routeInfo.privacyStats.commFreq}</span>
                            </div>
                            <div style={{ overflow:'hidden', fontSize:12 }}>
                                <span style={{ color:'#555' }}>pSS revealed:</span>
                                <span style={{ float:'right', fontWeight:'bold' }}>{routeInfo.privacyStats.pssRevealed}</span>
                            </div>
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
                position:'absolute', bottom:20, left:10, zIndex:1000,
                background:'white', border:'1px solid #ccc', borderRadius:8,
                padding:'10px 14px', fontSize:12, boxShadow:'0 2px 8px rgba(0,0,0,0.15)',
            }}>
                <div style={{ fontWeight:'bold', marginBottom:6 }}>pSS Safety Legend</div>
                {[['#d73027','≤−8 very dangerous'],['#fc8d59','−8 to −5 dangerous'],
                  ['#fee090','−5 to −2 moderate'],['#91cf60','−2 to −0.5 safe'],
                  ['#1a9850','> −0.5 very safe']].map(([c,l]) => (
                    <div key={l} style={{ display:'flex', alignItems:'center', marginBottom:3 }}>
                        <div style={{ width:12, height:12, borderRadius:'50%', background:c, marginRight:6, flexShrink:0 }}/>
                        {l}
                    </div>
                ))}
            </div>

            {/* ── Map ─────────────────────────────────────────────────────── */}
            <MapContainer center={[41.8781,-87.6298]} zoom={11} style={{ height:'100vh', width:'100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors"/>

                <MapClickHandler queryMode={queryMode} clickState={clickState} handlers={{
                    setStart, setEnd, setDestinations, setSources,
                    // GSR dest click
                    ...(queryMode === 'GSR' && gsrPhase === 'dest' ? {
                        setEnd: (cell) => setGsrEnd(cell),
                    } : {}),
                }}/>

                {/* Safety markers */}
                {data.map((item,i) => (
                    <CircleMarker key={i}
                        center={[(item.grid_x+0.5)*0.01,(item.grid_y+0.5)*0.01]}
                        radius={5}
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

                {/* SR start */}
                {(queryMode === 'SR' || queryMode === 'FSR') && start && (
                    <CircleMarker center={[(start.x+0.5)*0.01,(start.y+0.5)*0.01]} radius={10}
                        pathOptions={{ color:'#2980b9', fillColor:'#3498db', fillOpacity:1, weight:2 }}>
                        <Popup><b>Start</b></Popup>
                    </CircleMarker>
                )}

                {/* SR end */}
                {queryMode === 'SR' && end && (
                    <CircleMarker center={[(end.x+0.5)*0.01,(end.y+0.5)*0.01]} radius={10}
                        pathOptions={{ color:'#7d3c98', fillColor:'#9b59b6', fillOpacity:1, weight:2 }}>
                        <Popup><b>End</b></Popup>
                    </CircleMarker>
                )}

                {/* FSR destinations */}
                {queryMode === 'FSR' && destinations.map((d,i) => {
                    const isBest = routeInfo?.selectedDestIndex === i;
                    return (
                        <CircleMarker key={i}
                            center={[(d.x+0.5)*0.01,(d.y+0.5)*0.01]}
                            radius={isBest ? 12 : 8}
                            pathOptions={{ color:isBest?'#27ae60':'#7d3c98', fillColor:isBest?'#2ecc71':'#9b59b6', fillOpacity:1, weight:isBest?3:2 }}>
                            <Popup><b>Dest {i+1}</b> {isBest?'★ SAFEST':''}</Popup>
                        </CircleMarker>
                    );
                })}

                {/* GSR/GFSR group member sources */}
                {(queryMode === 'GSR' || queryMode === 'GFSR') && sources.map((s,i) => (
                    <CircleMarker key={i}
                        center={[(s.x+0.5)*0.01,(s.y+0.5)*0.01]} radius={9}
                        pathOptions={{ color:MEMBER_COLORS[i%MEMBER_COLORS.length], fillColor:MEMBER_COLORS[i%MEMBER_COLORS.length], fillOpacity:1, weight:2 }}>
                        <Popup><b>Member {i+1}</b><br/>({s.x},{s.y})</Popup>
                    </CircleMarker>
                ))}

                {/* GSR fixed destination */}
                {queryMode === 'GSR' && gsrEnd && (
                    <CircleMarker center={[(gsrEnd.x+0.5)*0.01,(gsrEnd.y+0.5)*0.01]} radius={12}
                        pathOptions={{ color:'#27ae60', fillColor:'#2ecc71', fillOpacity:1, weight:3 }}>
                        <Popup><b>Meeting Point</b></Popup>
                    </CircleMarker>
                )}

                {/* GFSR destinations */}
                {queryMode === 'GFSR' && destinations.map((d,i) => {
                    const isBest = routeInfo?.selectedDestIndex === i;
                    return (
                        <CircleMarker key={i}
                            center={[(d.x+0.5)*0.01,(d.y+0.5)*0.01]}
                            radius={isBest?13:8}
                            pathOptions={{ color:isBest?'#27ae60':'#854F0B', fillColor:isBest?'#2ecc71':'#e67e22', fillOpacity:1, weight:isBest?3:2 }}>
                            <Popup><b>Dest {i+1}</b> {isBest?'★ SAFEST MEETING POINT':''}</Popup>
                        </CircleMarker>
                    );
                })}

                {/* Routes — one per member for GSR/GFSR, one for SR/FSR */}
                {routes.map((path, i) => path && path.length > 0 && (
                    <Polyline key={i}
                        positions={path.map(p => [(p.x+0.5)*0.01,(p.y+0.5)*0.01])}
                        pathOptions={{
                            color:   (queryMode==='GSR'||queryMode==='GFSR') ? MEMBER_COLORS[i%MEMBER_COLORS.length] : '#2980b9',
                            weight:  4,
                            opacity: 0.85,
                        }}
                    />
                ))}
            </MapContainer>
        </div>
    );
}

export default MapView;
