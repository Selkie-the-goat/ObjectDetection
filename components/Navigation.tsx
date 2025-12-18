import React, { useState, useEffect, useRef } from 'react';
import { askForDirections, MapResult } from '../services/mapService';
import { Navigation as NavIcon, MapPin, Loader2, ArrowRight, Accessibility, Crosshair, Info } from 'lucide-react';
import L from 'leaflet';

export const Navigation: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<MapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAccessible, setIsAccessible] = useState(true);
  
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const placeMarkersRef = useRef<L.Marker[]>([]);

  // Initialize Map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
        mapRef.current = L.map(mapContainerRef.current).setView([0, 0], 2);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            className: 'map-tiles'
        }).addTo(mapRef.current);

        // Fix Leaflet icons
        const defaultIcon = L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
        L.Marker.prototype.options.icon = defaultIcon;
    }

    // Initial Geolocation
    if (navigator.geolocation && mapRef.current) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                if (mapRef.current) {
                    mapRef.current.setView([latitude, longitude], 15);
                    updateUserLocation(latitude, longitude);
                }
            },
            (err) => console.error("Locate error:", err),
            { enableHighAccuracy: true }
        );
    }

    return () => {
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }
    };
  }, []);

  // Update Map Markers when result changes
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear old markers
    placeMarkersRef.current.forEach(marker => marker.remove());
    placeMarkersRef.current = [];

    if (result && result.places.length > 0) {
        const bounds = L.latLngBounds([]);
        
        // Add user position to bounds if it exists
        if (userMarkerRef.current) {
            bounds.extend(userMarkerRef.current.getLatLng());
        }

        result.places.forEach((place) => {
            const marker = L.marker([place.lat, place.lng])
                .addTo(mapRef.current!)
                .bindPopup(`
                    <div class="p-1">
                        <strong class="text-sm font-bold block mb-1">${place.title}</strong>
                        <span class="text-xs text-slate-600">${place.description}</span>
                    </div>
                `);
            
            placeMarkersRef.current.push(marker);
            bounds.extend([place.lat, place.lng]);
        });

        // Fit map to show all markers
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [result]);

  const updateUserLocation = (lat: number, lng: number) => {
      if (!mapRef.current) return;
      
      if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([lat, lng]);
      } else {
          // Create a custom dot for the user
          const userIcon = L.divIcon({
              className: 'custom-user-icon',
              html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
          });

          userMarkerRef.current = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 })
            .addTo(mapRef.current)
            .bindPopup("You are here");
      }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);

    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        updateUserLocation(latitude, longitude);
        
        const data = await askForDirections(query, latitude, longitude, isAccessible);
        setResult(data);
        setLoading(false);
    }, (err) => {
        console.error(err);
        alert("Unable to retrieve location. Please enable GPS.");
        setLoading(false);
    });
  };

  const centerOnUser = () => {
      navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          mapRef.current?.setView([latitude, longitude], 16);
          updateUserLocation(latitude, longitude);
      });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white relative">
      {/* Top Half: Live Map */}
      <div className="h-[45%] w-full relative border-b-4 border-yellow-500">
        <div ref={mapContainerRef} className="w-full h-full bg-slate-800 z-0" />
        
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 z-[400] bg-slate-900/90 p-2 px-4 rounded-lg font-bold border border-slate-700 hover:bg-red-900/80 transition-colors shadow-lg"
        >
            Close
        </button>

        <button 
            onClick={centerOnUser}
            className="absolute bottom-4 right-4 z-[400] bg-yellow-500 text-slate-900 p-3 rounded-full shadow-xl hover:bg-yellow-400 transition-transform hover:scale-110"
        >
            <Crosshair size={24} />
        </button>
      </div>

      {/* Bottom Half: Controls & Results */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-yellow-400 flex items-center gap-2">
                <NavIcon size={28} /> Route Planner
            </h2>
            <button
                onClick={() => setIsAccessible(!isAccessible)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold border transition-all ${
                    isAccessible 
                    ? 'bg-blue-600 border-blue-400 text-white' 
                    : 'bg-slate-800 border-slate-600 text-slate-400'
                }`}
            >
                <Accessibility size={18} />
                {isAccessible ? 'Wheelchair Accessible' : 'General Access'}
            </button>
        </div>

        <div className="flex gap-2 mb-6">
            <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isAccessible ? "Find accessible entrance, ramps..." : "Search destination..."}
                className="flex-1 bg-slate-800 border-2 border-slate-600 rounded-xl p-3 text-lg focus:border-yellow-400 focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button 
                onClick={handleSearch}
                disabled={loading}
                className="bg-yellow-500 text-slate-900 p-3 rounded-xl font-bold hover:bg-yellow-400 disabled:opacity-50 min-w-[3.5rem] flex items-center justify-center"
            >
                {loading ? <Loader2 className="animate-spin" /> : <ArrowRight size={24} />}
            </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {result ? (
                <div className="animate-fade-in space-y-4">
                    {/* Gemini Summary */}
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                         {/* Filter out the MARKER lines from the display text for cleaner UI */}
                        <p className="text-lg leading-relaxed whitespace-pre-wrap">
                            {result.text.split('MARKER:')[0]}
                        </p>
                    </div>

                    {/* Interactive List that pans map */}
                    {result.places.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Destinations on Map</h3>
                            {result.places.map((place, idx) => (
                                <button 
                                    key={idx} 
                                    onClick={() => {
                                        mapRef.current?.flyTo([place.lat, place.lng], 17);
                                        placeMarkersRef.current[idx]?.openPopup();
                                    }}
                                    className="w-full text-left flex items-center gap-4 bg-slate-800 p-3 rounded-xl border border-slate-700 hover:border-yellow-400 hover:bg-slate-750 transition-colors"
                                >
                                    <div className="bg-yellow-500/20 p-2.5 rounded-full text-yellow-500 shrink-0">
                                        <MapPin size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold truncate text-lg">{place.title}</div>
                                        <div className="text-slate-400 text-sm truncate">{place.description}</div>
                                    </div>
                                    <Info size={18} className="text-slate-500" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center text-slate-500 mt-8">
                    <p>Enter a destination above. Markers will appear on the live map.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};