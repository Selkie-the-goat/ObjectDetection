import React, { useState, useEffect, useRef } from 'react';
import { askForDirections, MapResult } from '../services/mapService';
import { Navigation as NavIcon, MapPin, Loader2, ArrowRight, Accessibility, Crosshair, Info, X } from 'lucide-react';
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
    <div className="flex flex-col md:flex-row h-full bg-slate-900 text-white relative">
      {/* Map Section: Top on mobile, Right on desktop */}
      <div className="h-[45%] md:h-full w-full md:w-[60%] relative border-b-4 md:border-b-0 md:border-l-4 border-yellow-500 order-1 md:order-2">
        <div ref={mapContainerRef} className="w-full h-full bg-slate-800 z-0" />
        
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 z-[400] bg-slate-900/90 p-2 px-3 rounded-lg font-bold border border-slate-700 hover:bg-red-900/80 transition-colors shadow-lg flex items-center gap-2"
        >
            <span className="hidden md:inline">Close</span>
            <X size={20} />
        </button>

        <button 
            onClick={centerOnUser}
            className="absolute bottom-4 right-4 z-[400] bg-yellow-500 text-slate-900 p-3 rounded-full shadow-xl hover:bg-yellow-400 transition-transform hover:scale-110"
        >
            <Crosshair size={24} />
        </button>
      </div>

      {/* Controls Section: Bottom on mobile, Left on desktop */}
      <div className="flex-1 md:h-full md:w-[40%] flex flex-col p-4 md:p-6 overflow-hidden order-2 md:order-1 bg-slate-900 z-10">
        <div className="flex items-center justify-between mb-4 md:mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-yellow-400 flex items-center gap-2">
                <NavIcon size={28} className="md:w-8 md:h-8" /> 
                <span>Planner</span>
            </h2>
            <button
                onClick={() => setIsAccessible(!isAccessible)}
                className={`flex items-center gap-2 px-3 py-1.5 md:py-2 md:px-4 rounded-full text-xs md:text-sm font-bold border transition-all ${
                    isAccessible 
                    ? 'bg-blue-600 border-blue-400 text-white' 
                    : 'bg-slate-800 border-slate-600 text-slate-400'
                }`}
            >
                <Accessibility size={16} />
                {isAccessible ? 'Accessible' : 'General'}
            </button>
        </div>

        <div className="flex gap-2 mb-6">
            <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isAccessible ? "Accessible entrance..." : "Search..."}
                className="flex-1 bg-slate-800 border-2 border-slate-600 rounded-xl p-3 text-base md:text-lg focus:border-yellow-400 focus:outline-none transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button 
                onClick={handleSearch}
                disabled={loading}
                className="bg-yellow-500 text-slate-900 p-3 rounded-xl font-bold hover:bg-yellow-400 disabled:opacity-50 min-w-[3.5rem] flex items-center justify-center transition-colors"
            >
                {loading ? <Loader2 className="animate-spin" /> : <ArrowRight size={24} />}
            </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 md:pr-2 custom-scrollbar">
            {result ? (
                <div className="animate-fade-in space-y-4">
                    {/* Gemini Summary */}
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                         {/* Filter out the MARKER lines from the display text for cleaner UI */}
                        <p className="text-base md:text-lg leading-relaxed whitespace-pre-wrap text-slate-200">
                            {result.text.split('MARKER:')[0]}
                        </p>
                    </div>

                    {/* Interactive List that pans map */}
                    {result.places.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Destinations</h3>
                            {result.places.map((place, idx) => (
                                <button 
                                    key={idx} 
                                    onClick={() => {
                                        mapRef.current?.flyTo([place.lat, place.lng], 17);
                                        placeMarkersRef.current[idx]?.openPopup();
                                    }}
                                    className="w-full text-left flex items-center gap-4 bg-slate-800 p-3 rounded-xl border border-slate-700 hover:border-yellow-400 hover:bg-slate-750 transition-colors group"
                                >
                                    <div className="bg-yellow-500/20 p-2.5 rounded-full text-yellow-500 shrink-0 group-hover:bg-yellow-500/30 transition-colors">
                                        <MapPin size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold truncate text-base md:text-lg text-slate-100">{place.title}</div>
                                        <div className="text-slate-400 text-sm truncate group-hover:text-slate-300">{place.description}</div>
                                    </div>
                                    <Info size={18} className="text-slate-500 group-hover:text-yellow-500 transition-colors" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center text-slate-500 mt-8 flex flex-col items-center">
                    <MapPin size={48} className="text-slate-700 mb-4 opacity-50" />
                    <p className="max-w-xs mx-auto">Enter a destination to plan your safe and accessible route.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};