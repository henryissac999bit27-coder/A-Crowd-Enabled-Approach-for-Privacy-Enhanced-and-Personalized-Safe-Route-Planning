// AddressSearch.jsx
// Converts a typed address into a grid cell { x, y }
// Uses Nominatim (OpenStreetMap free geocoding — no API key needed)
// Bounded to Chicago area for accuracy

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// Chicago bounding box — restricts results to Chicago area
const CHICAGO_VIEWBOX = '-87.95,41.64,-87.52,42.02';

// Convert lat/lng to grid cell (same formula as map click)
function latLngToGrid(lat, lng) {
    return {
        x: Math.floor(lat / 0.01),
        y: Math.floor(lng / 0.01),
    };
}

export default function AddressSearch({ label, color, onSelect, placeholder }) {
    const [query,       setQuery]       = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loading,     setLoading]     = useState(false);
    const [showDrop,    setShowDrop]    = useState(false);
    const debounceRef   = useRef(null);
    const wrapRef       = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClick(e) {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setShowDrop(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Debounced geocode
    function handleChange(e) {
        const val = e.target.value;
        setQuery(val);
        setSuggestions([]);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (val.trim().length < 3) { setShowDrop(false); return; }

        debounceRef.current = setTimeout(() => geocode(val), 400);
    }

    async function geocode(text) {
        setLoading(true);
        try {
            // Append ", Chicago" if not already mentioned for better results
            const searchText = text.toLowerCase().includes('chicago')
                ? text
                : text + ', Chicago, IL';

            const r = await axios.get(NOMINATIM, {
                params: {
                    q:              searchText,
                    format:         'json',
                    limit:          5,
                    viewbox:        CHICAGO_VIEWBOX,
                    bounded:        1,
                    'accept-language': 'en',
                },
                headers: { 'User-Agent': 'SafeRouteFinder/1.0' },
            });

            if (r.data && r.data.length > 0) {
                setSuggestions(r.data);
                setShowDrop(true);
            } else {
                setSuggestions([{ display_name: 'No results found in Chicago area', noResult: true }]);
                setShowDrop(true);
            }
        } catch (err) {
            setSuggestions([{ display_name: 'Geocoding error. Try again.', noResult: true }]);
            setShowDrop(true);
        } finally {
            setLoading(false);
        }
    }

    function selectSuggestion(item) {
        if (item.noResult) { setShowDrop(false); return; }
        const lat  = parseFloat(item.lat);
        const lng  = parseFloat(item.lon);
        const cell = latLngToGrid(lat, lng);

        // Shorten display name — take first 2 parts
        const shortName = item.display_name.split(',').slice(0, 2).join(',').trim();
        setQuery(shortName);
        setShowDrop(false);
        setSuggestions([]);
        onSelect(cell, { lat, lng, displayName: shortName });
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (query.trim().length >= 3) geocode(query);
        }
        if (e.key === 'Escape') setShowDrop(false);
    }

    return (
        <div ref={wrapRef} style={{ position: 'relative', marginBottom: 8 }}>
            {/* Label */}
            <div style={{ fontSize: 11, color: '#555', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {label}
            </div>

            {/* Input */}
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    value={query}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => suggestions.length > 0 && setShowDrop(true)}
                    placeholder={placeholder || 'Type an address...'}
                    style={{
                        width: '100%', padding: '8px 32px 8px 10px',
                        fontSize: 12, border: '1px solid #ddd',
                        borderRadius: 6, outline: 'none', boxSizing: 'border-box',
                        background: '#fafafa',
                    }}
                    onFocus={e  => e.target.style.borderColor = color}
                    onBlur={e   => e.target.style.borderColor = '#ddd'}
                />
                {/* Loading spinner / clear button */}
                <div style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 12, color: '#aaa', cursor: query ? 'pointer' : 'default',
                }} onClick={() => { setQuery(''); setSuggestions([]); setShowDrop(false); }}>
                    {loading ? '⟳' : query ? '×' : '🔍'}
                </div>
            </div>

            {/* Dropdown */}
            {showDrop && suggestions.length > 0 && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                    background: 'white', border: '1px solid #ddd',
                    borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    maxHeight: 200, overflowY: 'auto', marginTop: 2,
                }}>
                    {suggestions.map((item, i) => (
                        <div key={i}
                            onClick={() => selectSuggestion(item)}
                            style={{
                                padding: '8px 10px', fontSize: 11,
                                cursor: item.noResult ? 'default' : 'pointer',
                                color: item.noResult ? '#aaa' : '#333',
                                borderBottom: i < suggestions.length - 1 ? '1px solid #f0f0f0' : 'none',
                                lineHeight: 1.5,
                            }}
                            onMouseEnter={e => { if (!item.noResult) e.currentTarget.style.background = '#f5f9ff'; }}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            {item.noResult ? item.display_name : (
                                <>
                                    <div style={{ fontWeight: 500, marginBottom: 1 }}>
                                        {item.display_name.split(',')[0]}
                                    </div>
                                    <div style={{ color: '#888', fontSize: 10 }}>
                                        {item.display_name.split(',').slice(1, 3).join(',').trim()}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
