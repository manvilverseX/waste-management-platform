'use client';

import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Image from 'next/image';

interface HotspotItem {
  id: string;
  uniqueReporters: number;
  totalReports: number;
  latitude: number;
  longitude: number;
  latestReportAt: string;
  representativeImage: string;
  latestDescription: string;
  communityId: string;
  communityName: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  priorityPercentage: number;
  reviewStatus: 'open' | 'confirmed' | 'rejected';
}

interface HotspotMapProps {
  hotspots: HotspotItem[];
}

export const HotspotMap: React.FC<HotspotMapProps> = ({ hotspots }) => {
  // Center map around the average location of hotspots or default to Bangalore coords
  const center: [number, number] = hotspots.length > 0
    ? [
        hotspots.reduce((sum, h) => sum + h.latitude, 0) / hotspots.length,
        hotspots.reduce((sum, h) => sum + h.longitude, 0) / hotspots.length
      ]
    : [12.9716, 77.5946];

  const getMarkerIcon = (priority: string) => {
    const color = priority === 'critical' ? '#E11D48' : priority === 'high' ? '#FB923C' : '#E8A33D';
    return L.divIcon({
      html: `
        <div class="relative flex items-center justify-center w-8 h-8">
          <span class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style="background-color: ${color}"></span>
          <div class="relative w-6 h-6 rounded-full flex items-center justify-center text-white border border-white font-bold text-xs" style="background-color: ${color}">
            🔥
          </div>
        </div>
      `,
      className: 'custom-hotspot-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -10],
    });
  };

  return (
    <div className="w-full h-[500px] rounded-3xl overflow-hidden border border-white/[0.08] relative z-10 sc-card">
      <MapContainer
        center={center}
        zoom={13}
        style={{ width: '100%', height: '100%', background: '#14171A' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {hotspots.map((h) => (
          <Marker
            key={h.id}
            position={[h.latitude, h.longitude]}
            icon={getMarkerIcon(h.priority)}
          >
            <Popup className="custom-leaflet-popup">
              <div className="p-2 space-y-2 text-slate-200" style={{ maxWidth: '240px' }}>
                <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-1">
                  <span className="font-extrabold text-xs text-white leading-none">{h.communityName}</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-extrabold leading-none border border-rose-500/20">{h.priority}</span>
                </div>
                
                {h.representativeImage && (
                  <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black border border-white/[0.05]">
                    <Image
                      src={h.representativeImage}
                      alt="Hotspot representation"
                      fill
                      sizes="200px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}
                
                <p className="text-3xs text-slate-400 italic">&ldquo;{h.latestDescription || 'No details provided.'}&rdquo;</p>
                
                <div className="flex justify-between items-center text-[9px] text-slate-500 pt-1 border-t border-white/[0.04]">
                  <span>Reports: {h.totalReports}</span>
                  <span>Reporters: {h.uniqueReporters}</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default HotspotMap;
