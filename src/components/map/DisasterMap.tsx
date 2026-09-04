import React, { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  Marker,
  Popup,
  CircleMarker,
  GeoJSON,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import {
  Layers,
  Maximize2,
  Minimize2,
  Compass,
  AlertOctagon,
  Shield,
  Navigation,
  Sparkles,
  Info,
  CheckCircle2,
  Users,
  AlertTriangle,
  Building2,
  Route,
  Activity,
  Eye,
  EyeOff,
  Filter,
  Check,
  ChevronDown,
  ChevronUp,
  Satellite,
} from 'lucide-react';
import { useDisaster } from '../../context/DisasterContext';
import { useSatellite } from '../../context/SatelliteContext';
import { RiskZone, ReliefCentre, EvacuationRoute, BlockedRoad, RoadSegment, MapLayerState } from '../../types';
import { Badge } from '../common/Badge';

// Helper to re-center and stabilize Leaflet map programmatically
const MapController: React.FC<{ center: [number, number]; zoom: number }> = ({
  center,
  zoom,
}) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
    // Invalidate size to guarantee no gray or blank tiles when opening pages
    const timer1 = setTimeout(() => map.invalidateSize(), 100);
    const timer2 = setTimeout(() => map.invalidateSize(), 400);
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', handleResize);
    };
  }, [center, zoom, map]);
  return null;
};

// 1. Risk Zone Center Icon
const createRiskZoneIcon = (zone: RiskZone, isSelected: boolean) => {
  const colors = {
    CRITICAL: '#C62828',
    HIGH: '#D97706',
    MODERATE: '#D97706',
    SAFE: '#15803D',
  };
  const color = colors[zone.riskLevel];

  const html = `
    <div class="relative flex items-center justify-center cursor-pointer group">
      ${
        zone.riskLevel === 'CRITICAL'
          ? `<div class="absolute -inset-2 rounded-full opacity-60 radar-ping" style="background-color: ${color}"></div>`
          : ''
      }
      <div class="relative flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold text-ink shadow-lg border ${
        isSelected ? 'ring-2 ring-white scale-110' : ''
      }" style="background-color: ${color}; border-color: rgba(255,255,255,0.4)">
        <span>${zone.name.split(' ')[0]}</span>
        <span class="bg-black/30 px-1 rounded text-[9px]">${zone.riskScore}</span>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-risk-icon',
    iconSize: [80, 24],
    iconAnchor: [40, 12],
  });
};

// 2. Population Cluster Icon
const createPopulationClusterIcon = (zone: RiskZone) => {
  const isHighDensity = zone.population > 2500;
  const html = `
    <div class="relative flex items-center justify-center cursor-pointer">
      <div class="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-300 shadow-lg flex items-center gap-1 font-mono text-[9px] font-semibold backdrop-blur-sm ${
        isHighDensity ? 'ring-1 ring-sky-400' : ''
      }">
        <svg class="w-2.5 h-2.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
        </svg>
        <span>${(zone.population / 1000).toFixed(1)}k pop</span>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-pop-icon',
    iconSize: [68, 20],
    iconAnchor: [34, -10],
  });
};

// 3. Vulnerability Indicator Icon
const createVulnerabilityIcon = (zone: RiskZone) => {
  const isSevere = zone.vulnerablePopulation > 600;
  const html = `
    <div class="relative flex items-center justify-center cursor-pointer">
      <div class="px-2 py-0.5 rounded bg-warn-soft text-warn border border-warn/30 shadow-lg flex items-center gap-1 font-mono text-[9px] font-bold backdrop-blur-sm ${
        isSevere ? 'animate-pulse ring-1 ring-warn' : ''
      }">
        <span class="text-warn">⚠️</span>
        <span>${zone.vulnerablePopulation} vuln</span>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-vuln-icon',
    iconSize: [68, 20],
    iconAnchor: [34, 30],
  });
};

// 4. Shelter Icon
const createShelterIcon = (shelter: ReliefCentre, isSelected: boolean) => {
  const isAvailable = shelter.status === 'AVAILABLE';
  const isFull = shelter.status === 'FULL';
  const borderColor = isAvailable ? '#15803D' : isFull ? '#C62828' : '#D97706';

  const html = `
    <div class="relative flex items-center justify-center cursor-pointer group">
      <div class="relative px-2 py-1 rounded bg-surface text-ink border shadow-xl flex items-center gap-1.5 ${
        isSelected ? 'ring-2 ring-safe scale-110' : ''
      }" style="border-color: ${borderColor}">
        <div class="w-2 h-2 rounded-full" style="background-color: ${borderColor}"></div>
        <div class="text-[10px] font-mono font-bold leading-none">${shelter.code}</div>
        <div class="text-[9px] font-mono text-ink-soft leading-none">${shelter.available} free</div>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-shelter-icon',
    iconSize: [90, 26],
    iconAnchor: [45, 13],
  });
};

// 5. Blockage Icon
const createBlockageIcon = (road: BlockedRoad) => {
  const html = `
    <div class="relative flex items-center justify-center">
      <div class="p-1 rounded bg-critical text-white shadow-lg border border-critical/30 animate-bounce">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-blockage-icon',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

interface DisasterMapProps {
  heightClass?: string;
  showAllControls?: boolean;
}

export const DisasterMap: React.FC<DisasterMapProps> = ({
  heightClass = 'h-[480px] lg:h-[620px]',
  showAllControls = true,
}) => {
  const {
    riskZones = [],
    reliefCentres = [],
    routes = [],
    blockedRoads = [],
    roadNetworks = [],
    selectedZone,
    setSelectedZone,
    selectedShelter,
    setSelectedShelter,
    selectedRoute,
    setSelectedRoute,
    mapLayers,
    toggleMapLayer,
    setAllMapLayers,
    setMapLayerPreset,
    setSelectedDetailDrawerZone,
    triggerRelocationWorkflow,
    printOrder,
  } = useDisaster();

  const { hazard, roadImpacts, getRoadImpact, getRouteEvaluation } = useSatellite();

  const defaultCenter: [number, number] =
    riskZones.length > 0
      ? [
          riskZones.reduce((sum, z) => sum + z.coordinates.lat, 0) / riskZones.length,
          riskZones.reduce((sum, z) => sum + z.coordinates.lng, 0) / riskZones.length,
        ]
      : [20.5937, 78.9629];

  const [mapCenter, setMapCenter] = useState<[number, number]>(defaultCenter);
  const [zoomLevel, setZoomLevel] = useState<number>(13);
  const [isLayerControlOpen, setIsLayerControlOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [mapTileType, setMapTileType] = useState<'dark' | 'osm' | 'satellite'>('osm');

  // When selected zone changes, smooth pan
  useEffect(() => {
    if (selectedZone) {
      setMapCenter([selectedZone.coordinates.lat, selectedZone.coordinates.lng]);
    }
  }, [selectedZone]);

  // Re-center when the scenario's zone set changes (e.g. scenario switch)
  useEffect(() => {
    if (!selectedZone && riskZones.length > 0) {
      setMapCenter([riskZones[0].coordinates.lat, riskZones[0].coordinates.lng]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskZones]);

  const handleZoneClick = (zone: RiskZone) => {
    setSelectedZone(zone);
    setSelectedDetailDrawerZone(zone);
  };

  const resetView = () => {
    setMapCenter(selectedZone ? [selectedZone.coordinates.lat, selectedZone.coordinates.lng] : defaultCenter);
    setZoomLevel(13);
  };

  const getZonePolygonStyle = (zone: RiskZone) => {
    const isSelected = selectedZone?.id === zone.id;
    const styles = {
      CRITICAL: { color: '#C62828', fillColor: '#C62828', fillOpacity: isSelected ? 0.45 : 0.25 },
      HIGH: { color: '#D97706', fillColor: '#D97706', fillOpacity: isSelected ? 0.4 : 0.2 },
      MODERATE: { color: '#D97706', fillColor: '#D97706', fillOpacity: isSelected ? 0.35 : 0.15 },
      SAFE: { color: '#15803D', fillColor: '#15803D', fillOpacity: isSelected ? 0.3 : 0.12 },
    };
    return {
      ...styles[zone.riskLevel],
      weight: isSelected ? 3 : 1.5,
      dashArray: isSelected ? undefined : '4, 4',
    };
  };

  // Calculate active layers count
  const activeLayersCount = [
    mapLayers.hazardZones,
    mapLayers.populationClusters ?? mapLayers.populationHeatmap,
    mapLayers.vulnerabilityIndicators ?? mapLayers.vulnerabilityOverlay,
    mapLayers.reliefCentres,
    mapLayers.roadNetwork,
    mapLayers.blockedRoads,
    mapLayers.evacuationRoutes,
    mapLayers.satelliteFloodExtent,
  ].filter(Boolean).length;

  return (
    <div
      id="gis-map-container"
      className={`relative w-full rounded-lg border border-hairline overflow-hidden bg-paper shadow-2xl transition-all ${
        isFullscreen ? 'fixed inset-4 z-50 h-[calc(100vh-2rem)]' : heightClass
      }`}
    >
      <MapContainer
        center={mapCenter}
        zoom={zoomLevel}
        scrollWheelZoom={true}
        className="w-full h-full tactical-map-tiles"
        zoomControl={false}
      >
        <MapController center={mapCenter} zoom={zoomLevel} />

        {/* Dynamic Leaflet TileLayer based on selected Basemap */}
        {mapTileType === 'dark' && (
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            maxZoom={19}
            subdomains="abcd"
          />
        )}
        {mapTileType === 'osm' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}
        {mapTileType === 'satellite' && (
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={18}
          />
        )}

        {/* 1. Hazard Zone Polygons */}
        {mapLayers.hazardZones &&
          riskZones.map((zone) => (
            <Polygon
              key={`zone-poly-${zone.id}`}
              positions={zone.polygon}
              pathOptions={getZonePolygonStyle(zone)}
              eventHandlers={{
                click: () => handleZoneClick(zone),
              }}
            >
              <Popup>
                <div className="p-1 min-w-[210px] text-xs font-mono">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-bold text-ink text-xs">{zone.name}</span>
                    <Badge variant={zone.riskLevel.toLowerCase() as any} size="sm">
                      {zone.riskLevel} ({zone.riskScore})
                    </Badge>
                  </div>
                  <div className="space-y-1 text-[11px] text-ink-soft">
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Total Population:</span>
                      <span className="text-ink font-semibold">{zone.population.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Vulnerable:</span>
                      <span className="text-critical font-semibold">{zone.vulnerablePopulation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Hazard Depth/Intensity:</span>
                      <span className="text-warn">+{zone.floodDepthEstMeters}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Priority:</span>
                      <span className="text-ink font-bold">{zone.priority}</span>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-col gap-1.5">
                    <button
                      onClick={() => handleZoneClick(zone)}
                      className="w-full py-1.5 px-2 rounded bg-brand hover:bg-brand/90 text-white text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
                    >
                      <span>Inspect Zone Details</span>
                      <Sparkles className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => printOrder({
                        orderId: `PLAN-${Date.now().toString().slice(-6)}`,
                        directive: `MANDATORY RELOCATION ORDER FOR ${zone.name}`,
                        targetZone: zone.name,
                        targetShelter: reliefCentres.find((s) => s.available > 0)?.name || reliefCentres[0]?.name || 'Nearest Relief Centre',
                        priorityCitizensCount: zone.vulnerablePopulation,
                        authorizedBy: 'Admin',
                        timestamp: new Date().toISOString(),
                      })}
                      className="w-full py-1 px-2 rounded bg-paper-alt hover:bg-hairline text-ink text-[10px] flex items-center justify-center gap-1 transition-colors border border-hairline"
                    >
                      <span>🖨️ Print Relocation Order</span>
                    </button>
                  </div>
                </div>
              </Popup>
            </Polygon>
          ))}

        {/* 1b. Satellite Flood Extent (Sentinel-1 SAR-derived hazard polygon) */}
        {mapLayers.satelliteFloodExtent && hazard?.status === 'available' && hazard.geojson && (
          <GeoJSON
            key={`satellite-extent-${hazard.processed_at}`}
            data={hazard.geojson as any}
            pathOptions={{
              color: '#a855f7',
              fillColor: '#a855f7',
              fillOpacity: 0.22,
              weight: 2.5,
              dashArray: '2, 6',
            }}
          >
            <Popup>
              <div className="p-1 min-w-[210px] text-xs font-mono">
                <div className="font-bold text-ink flex items-center gap-1 mb-1">
                  <Satellite className="w-3.5 h-3.5 text-purple-400" />
                  <span>Satellite Flood Extent</span>
                </div>
                <div className="space-y-1 text-[11px] text-ink-soft">
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Data Mode:</span>
                    <span className={hazard.data_mode === 'CONNECTED' ? 'text-safe font-bold' : 'text-warn font-bold'}>
                      {hazard.data_mode === 'DEMO' ? 'DEMO DATA' : hazard.data_mode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Source:</span>
                    <span className="text-ink">{hazard.source} ({hazard.product})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Affected Area:</span>
                    <span className="text-purple-700 font-semibold">{hazard.affected_area_km2.toFixed(1)} km²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Confidence:</span>
                    <span className="text-ink">{hazard.confidence}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Observation:</span>
                    <span className="text-ink">{hazard.observation_time || 'No recent observation'}</span>
                  </div>
                </div>
              </div>
            </Popup>
          </GeoJSON>
        )}

        {/* 2. Road Networks Layer (Arterials, Elevated Bypasses, High-Capacity Roads) —
             recolored by satellite-derived road risk when available. */}
        {mapLayers.roadNetwork &&
          roadNetworks.map((road) => {
            const isElevated = road.type === 'ELEVATED';
            const isHighway = road.type === 'HIGHWAY';
            const impact = getRoadImpact(road.id);
            const baseColor = isElevated ? '#38bdf8' : isHighway ? '#D97706' : '#64748b';
            const riskColor =
              impact?.status === 'BLOCKED' ? '#C62828' : impact?.status === 'AT_RISK' ? '#D97706' : baseColor;
            return (
              <Polyline
                key={`road-${road.id}`}
                positions={road.coordinates}
                pathOptions={{
                  color: riskColor,
                  weight: impact?.status === 'BLOCKED' ? 5 : isElevated ? 4 : isHighway ? 3.5 : 2.5,
                  opacity: 0.85,
                  lineCap: 'round',
                  dashArray: impact?.status === 'AT_RISK' ? '6, 6' : undefined,
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[190px] text-xs font-mono">
                    <div className="font-bold text-ink flex items-center gap-1 mb-1">
                      <Route className="w-3.5 h-3.5 text-sky-400" />
                      <span>{road.name}</span>
                    </div>
                    <div className="space-y-0.5 text-[11px] text-ink-soft">
                      <div>Type: <span className="text-sky-700 font-semibold">{road.type}</span></div>
                      <div>Lanes: <span className="text-ink">{road.lanes} Lanes</span></div>
                      <div>Speed Limit: <span className="text-ink">{road.speedLimitKmh} km/h</span></div>
                      <div>Elevation: <span className="text-safe">+{road.elevationMeters}m MSL</span></div>
                      <div>Status: <span className={road.status === 'CLEAR' ? 'text-safe' : 'text-warn'}>{road.status}</span></div>
                      {impact && (
                        <div className="pt-1 mt-1 border-t border-hairline">
                          <div>
                            Satellite Risk:{' '}
                            <span className={impact.status === 'BLOCKED' ? 'text-critical font-bold' : impact.status === 'AT_RISK' ? 'text-warn font-bold' : 'text-safe font-bold'}>
                              {impact.status.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-ink-soft mt-0.5">{impact.reason}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

        {/* 3. Population Density & Clusters */}
        {(mapLayers.populationClusters ?? mapLayers.populationHeatmap) &&
          riskZones.map((zone) => (
            <React.Fragment key={`pop-group-${zone.id}`}>
              <CircleMarker
                center={[zone.coordinates.lat, zone.coordinates.lng]}
                radius={Math.max(16, zone.population / 180)}
                pathOptions={{
                  color: '#38bdf8',
                  fillColor: '#0284c7',
                  fillOpacity: 0.2,
                  weight: 1.5,
                  dashArray: '3, 3',
                }}
              />
              <Marker
                position={[zone.coordinates.lat, zone.coordinates.lng]}
                icon={createPopulationClusterIcon(zone)}
                eventHandlers={{
                  click: () => handleZoneClick(zone),
                }}
              />
            </React.Fragment>
          ))}

        {/* 4. Vulnerability Indicators Layer */}
        {(mapLayers.vulnerabilityIndicators ?? mapLayers.vulnerabilityOverlay) &&
          riskZones.map((zone) => (
            <React.Fragment key={`vuln-group-${zone.id}`}>
              <Marker
                position={[zone.coordinates.lat, zone.coordinates.lng]}
                icon={createVulnerabilityIcon(zone)}
                eventHandlers={{
                  click: () => handleZoneClick(zone),
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[210px] text-xs font-mono">
                    <div className="font-bold text-warn mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{zone.name} Vulnerability Profile</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-ink-soft">
                      <div className="flex justify-between">
                        <span className="text-ink-soft">Elderly (&gt;65y):</span>
                        <span className="text-ink font-bold">{zone.vulnerabilityBreakdown.elderly}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-soft">Children (&lt;12y):</span>
                        <span className="text-ink font-bold">{zone.vulnerabilityBreakdown.children}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-soft">PWD / Mobility-Impaired:</span>
                        <span className="text-ink font-bold">{zone.vulnerabilityBreakdown.pwd}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-soft">Accessibility Score:</span>
                        <span className="text-sky-700">{zone.vulnerabilityBreakdown.accessibilityScore}/100</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-soft">Hazard Exposure:</span>
                        <span className="text-critical font-bold">{zone.vulnerabilityBreakdown.hazardExposureScore}/100</span>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          ))}

        {/* 5. Risk Zone Primary Labels */}
        {mapLayers.hazardZones &&
          riskZones.map((zone) => (
            <Marker
              key={`marker-${zone.id}`}
              position={[zone.coordinates.lat, zone.coordinates.lng]}
              icon={createRiskZoneIcon(zone, selectedZone?.id === zone.id)}
              eventHandlers={{
                click: () => handleZoneClick(zone),
              }}
            />
          ))}

        {/* 6. Blocked Roads Overlay */}
        {mapLayers.blockedRoads &&
          blockedRoads.map((road) => (
            <React.Fragment key={road.id}>
              <Polyline
                positions={road.coordinates}
                pathOptions={{
                  color: '#C62828',
                  weight: 5,
                  dashArray: '6, 6',
                  opacity: 0.95,
                }}
              />
              <Marker
                position={road.coordinates[0]}
                icon={createBlockageIcon(road)}
              >
                <Popup>
                  <div className="p-1 text-xs font-mono min-w-[200px]">
                    <div className="font-bold text-critical mb-1 flex items-center gap-1">
                      <AlertOctagon className="w-3.5 h-3.5" />
                      <span>{road.name}</span>
                    </div>
                    <p className="text-[11px] text-ink-soft">{road.reason}</p>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-ink-soft">
                      <span>Severity: <span className="text-critical font-bold">{road.severity}</span></span>
                      <span>{road.reportedAt}</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          ))}

        {/* 7. Safe Evacuation Routes */}
        {mapLayers.evacuationRoutes &&
          routes.map((route) => {
            const isPrimary = route.isRecommended;
            // A route that's statically flagged "recommended" can still be
            // satellite-rejected right now — the map must never draw that
            // route green and label it "PRIMARY CORRIDOR" just because the
            // rejection is only reflected elsewhere (the route pages already
            // switch away from it; this popup rendered it independently).
            const routeEval = getRouteEvaluation(route.id);
            const isRejected = !!routeEval?.rejected;
            const scoreColor = isRejected
              ? 'text-critical'
              : route.safetyScore >= 80
              ? 'text-safe'
              : route.safetyScore >= 60
              ? 'text-warn'
              : 'text-critical';
            return (
              <Polyline
                key={route.id}
                positions={route.coordinates}
                pathOptions={{
                  color: isRejected ? '#C62828' : isPrimary ? '#15803D' : '#64748b',
                  weight: isPrimary ? 6 : 3.5,
                  opacity: isPrimary ? 0.95 : 0.65,
                  lineCap: 'round',
                  dashArray: isPrimary && !isRejected ? undefined : '5, 5',
                }}
                eventHandlers={{
                  click: () => setSelectedRoute(route),
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[190px] text-xs font-mono">
                    <div className={`font-bold mb-1 flex items-center gap-1 ${isRejected ? 'text-critical' : 'text-safe'}`}>
                      <Navigation className="w-3.5 h-3.5" />
                      <span>
                        {isRejected
                          ? 'SATELLITE-REJECTED'
                          : route.isRecommended
                          ? 'PRIMARY CORRIDOR'
                          : 'ALTERNATIVE ROUTE'}
                      </span>
                    </div>
                    {isRejected && (
                      <div className="text-[10px] text-critical mb-1.5">
                        Intersects the satellite-derived hazard extent — use an alternative.
                      </div>
                    )}
                    <div className="text-[11px] text-ink-soft space-y-0.5">
                      <div>Origin: <span className="text-ink">{route.originName}</span></div>
                      <div>Destination: <span className="text-safe font-semibold">{route.destinationName}</span></div>
                      <div>Distance: <span className="text-ink font-bold">{route.distanceKm} km</span></div>
                      <div>Est Time: <span className="text-ink font-bold">{route.estimatedTimeMin} min</span></div>
                      <div>Safety Score: <span className={`${scoreColor} font-bold`}>{route.safetyScore}/100</span></div>
                      <div>Elevation Clearance: <span className="text-sky-700">+{route.elevationClearanceMeters}m</span></div>
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

        {/* 8. Relief Shelter Markers */}
        {mapLayers.reliefCentres &&
          reliefCentres.map((shelter) => (
            <Marker
              key={shelter.id}
              position={[shelter.coordinates.lat, shelter.coordinates.lng]}
              icon={createShelterIcon(shelter, selectedShelter?.id === shelter.id)}
              eventHandlers={{
                click: () => setSelectedShelter(shelter),
              }}
            >
              <Popup>
                <div className="p-1 min-w-[210px] text-xs font-mono">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-bold text-ink truncate">{shelter.name}</span>
                  </div>
                  <div className="text-[10px] text-ink-soft mb-2">{shelter.location}</div>

                  <div className="space-y-1 text-[11px] text-ink-soft mb-2">
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Total Capacity:</span>
                      <span className="text-ink">{shelter.capacity.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Occupancy:</span>
                      <span className="text-warn">{shelter.occupancy.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Available:</span>
                      <span className={`font-bold ${shelter.available > 0 ? 'text-safe' : 'text-critical'}`}>{shelter.available} beds</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Safety Score:</span>
                      <span className={`font-bold ${shelter.safetyScore >= 80 ? 'text-safe' : shelter.safetyScore >= 60 ? 'text-warn' : 'text-critical'}`}>{shelter.safetyScore}/100</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedShelter(shelter)}
                    className="w-full py-1.5 px-2 rounded bg-safe-soft hover:bg-safe-soft border border-safe/30 text-safe text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Set as Active Relocation Target</span>
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>

      {/* Floating Tactical GIS Controls Bar (Top Left) */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 bg-surface border border-hairline p-1 rounded-md shadow-2xl backdrop-blur-md">
        {/* Layer Controls Button */}
        <button
          onClick={() => setIsLayerControlOpen(!isLayerControlOpen)}
          className={`px-2.5 py-1.5 rounded text-xs font-mono flex items-center gap-1.5 transition-colors ${
            isLayerControlOpen
              ? 'bg-brand text-white font-bold shadow-sm'
              : 'text-ink-soft hover:text-ink hover:bg-surface'
          }`}
          title="Toggle Comprehensive GIS Layer Control"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Layers ({activeLayersCount}/8)</span>
          {isLayerControlOpen ? (
            <ChevronUp className="w-3 h-3 ml-0.5" />
          ) : (
            <ChevronDown className="w-3 h-3 ml-0.5" />
          )}
        </button>

        {/* Leaflet Basemap Switcher */}
        <div className="hidden sm:flex items-center bg-surface rounded p-0.5 border border-hairline text-[10px] font-mono">
          <button
            onClick={() => setMapTileType('dark')}
            className={`px-2 py-1 rounded transition-colors ${
              mapTileType === 'dark'
                ? 'bg-brand text-white font-bold'
                : 'text-ink-soft hover:text-ink'
            }`}
            title="Carto Dark Matter Tactical Leaflet Map"
          >
            Dark
          </button>
          <button
            onClick={() => setMapTileType('osm')}
            className={`px-2 py-1 rounded transition-colors ${
              mapTileType === 'osm'
                ? 'bg-brand text-white font-bold'
                : 'text-ink-soft hover:text-ink'
            }`}
            title="OpenStreetMap Standard Leaflet Map"
          >
            Street
          </button>
          <button
            onClick={() => setMapTileType('satellite')}
            className={`px-2 py-1 rounded transition-colors ${
              mapTileType === 'satellite'
                ? 'bg-brand text-white font-bold'
                : 'text-ink-soft hover:text-ink'
            }`}
            title="ESRI Satellite Imagery Leaflet Map"
          >
            Satellite
          </button>
        </div>

        {/* Reset View Button */}
        <button
          onClick={resetView}
          className="p-1.5 rounded text-ink-soft hover:text-ink hover:bg-surface transition-colors"
          title="Reset Map Center"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-1.5 rounded text-ink-soft hover:text-ink hover:bg-surface transition-colors"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* COMPREHENSIVE FLOATING LAYER CONTROL PANEL */}
      {isLayerControlOpen && (
        <div className="absolute top-14 left-3 z-[1000] w-80 sm:w-96 max-h-[calc(100%-4rem)] overflow-y-auto bg-surface border border-hairline rounded-lg p-3.5 shadow-2xl backdrop-blur-md space-y-3 font-mono text-xs text-ink">
          {/* Header & Quick Actions */}
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand" />
              <span className="font-bold text-ink uppercase text-[11px] tracking-wider">
                GIS Layer Control
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <button
                onClick={() => setAllMapLayers(true)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-paper-alt border border-hairline text-ink-soft hover:text-ink"
              >
                All On
              </button>
              <button
                onClick={() => setAllMapLayers(false)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-paper-alt border border-hairline text-ink-soft hover:text-ink"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Tactical Mode Presets */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase text-ink-soft font-semibold tracking-wider">
              Tactical Presets
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <button
                onClick={() => setMapLayerPreset('evacuation')}
                className="px-1.5 py-1 rounded bg-surface hover:bg-paper-alt border border-hairline hover:border-safe/30 text-ink-soft hover:text-safe text-center truncate transition-colors"
                title="Evacuation Corridor Focus (Routes, Blockages, Shelters)"
              >
                🛡️ Evacuation
              </button>
              <button
                onClick={() => setMapLayerPreset('vulnerability')}
                className="px-1.5 py-1 rounded bg-surface hover:bg-paper-alt border border-hairline hover:border-warn/30 text-ink-soft hover:text-warn text-center truncate transition-colors"
                title="Vulnerability Assessment (Demographics, Hotspots)"
              >
                👥 Vulnerability
              </button>
              <button
                onClick={() => setMapLayerPreset('infrastructure')}
                className="px-1.5 py-1 rounded bg-surface hover:bg-paper-alt border border-hairline hover:border-sky-400 text-ink-soft hover:text-sky-700 text-center truncate transition-colors"
                title="Infrastructure Network (Roads & Shelters)"
              >
                🛣️ Infrastructure
              </button>
            </div>
          </div>

          {/* Layer List */}
          <div className="space-y-2 pt-1 border-t border-hairline">
            {/* 1. Population Clusters */}
            <div
              onClick={() => toggleMapLayer('populationClusters')}
              className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between ${
                (mapLayers.populationClusters ?? mapLayers.populationHeatmap)
                  ? 'bg-sky-50 border-sky-300 text-sky-800'
                  : 'bg-surface border-hairline text-ink-soft hover:bg-surface'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded ${
                    (mapLayers.populationClusters ?? mapLayers.populationHeatmap)
                      ? 'bg-sky-100 text-sky-600'
                      : 'bg-paper-alt text-ink-soft'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-ink leading-tight">
                    Population Clusters
                  </div>
                  <div className="text-[10px] text-ink-soft">
                    {riskZones.length} Density zones • {riskZones.reduce((sum, z) => sum + z.population, 0).toLocaleString()} citizens
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={mapLayers.populationClusters ?? mapLayers.populationHeatmap}
                onChange={() => {}}
                className="rounded bg-white border-hairline text-sky-600 pointer-events-none"
              />
            </div>

            {/* 2. Vulnerability Indicators */}
            <div
              onClick={() => toggleMapLayer('vulnerabilityIndicators')}
              className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between ${
                (mapLayers.vulnerabilityIndicators ?? mapLayers.vulnerabilityOverlay)
                  ? 'bg-warn-soft border-warn/30 text-warn'
                  : 'bg-surface border-hairline text-ink-soft hover:bg-surface'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded ${
                    (mapLayers.vulnerabilityIndicators ?? mapLayers.vulnerabilityOverlay)
                      ? 'bg-warn-soft text-warn'
                      : 'bg-paper-alt text-ink-soft'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-ink leading-tight">
                    Vulnerability Indicators
                  </div>
                  <div className="text-[10px] text-ink-soft">
                    {riskZones.reduce((sum, z) => sum + z.vulnerablePopulation, 0).toLocaleString()} priority • Elderly, Children, PWD
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={mapLayers.vulnerabilityIndicators ?? mapLayers.vulnerabilityOverlay}
                onChange={() => {}}
                className="rounded bg-white border-hairline text-amber-600 pointer-events-none"
              />
            </div>

            {/* 3. Relief Centers */}
            <div
              onClick={() => toggleMapLayer('reliefCentres')}
              className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between ${
                mapLayers.reliefCentres
                  ? 'bg-safe-soft border-safe/30 text-safe'
                  : 'bg-surface border-hairline text-ink-soft hover:bg-surface'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded ${
                    mapLayers.reliefCentres
                      ? 'bg-safe-soft text-safe'
                      : 'bg-paper-alt text-ink-soft'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-ink leading-tight">
                    Relief Centers
                  </div>
                  <div className="text-[10px] text-ink-soft">
                    {reliefCentres.length} Shelters • {reliefCentres.reduce((sum, s) => sum + s.available, 0).toLocaleString()} available slots
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={mapLayers.reliefCentres}
                onChange={() => {}}
                className="rounded bg-white border-hairline text-emerald-600 pointer-events-none"
              />
            </div>

            {/* 4. Road Networks */}
            <div
              onClick={() => toggleMapLayer('roadNetwork')}
              className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between ${
                mapLayers.roadNetwork
                  ? 'bg-brand-soft border-brand/30 text-brand'
                  : 'bg-surface border-hairline text-ink-soft hover:bg-surface'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded ${
                    mapLayers.roadNetwork
                      ? 'bg-brand-soft text-brand'
                      : 'bg-paper-alt text-ink-soft'
                  }`}
                >
                  <Route className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-ink leading-tight">
                    Road Networks
                  </div>
                  <div className="text-[10px] text-ink-soft">
                    {roadNetworks.length} Arterials • Verified clear corridors
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={mapLayers.roadNetwork}
                onChange={() => {}}
                className="rounded bg-white border-hairline text-blue-600 pointer-events-none"
              />
            </div>

            {/* 5. Blocked Roads */}
            <div
              onClick={() => toggleMapLayer('blockedRoads')}
              className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between ${
                mapLayers.blockedRoads
                  ? 'bg-critical-soft border-critical/30 text-critical'
                  : 'bg-surface border-hairline text-ink-soft hover:bg-surface'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded ${
                    mapLayers.blockedRoads
                      ? 'bg-critical-soft text-critical'
                      : 'bg-paper-alt text-ink-soft'
                  }`}
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-ink leading-tight">
                    Blocked Roads
                  </div>
                  <div className="text-[10px] text-ink-soft">
                    {blockedRoads.length} Hazard blockage{blockedRoads.length !== 1 ? 's' : ''}{blockedRoads[0] ? ` • ${blockedRoads[0].name}` : ''}
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={mapLayers.blockedRoads}
                onChange={() => {}}
                className="rounded bg-white border-hairline text-red-600 pointer-events-none"
              />
            </div>

            {/* 6. Evacuation Routes */}
            <div
              onClick={() => toggleMapLayer('evacuationRoutes')}
              className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between ${
                mapLayers.evacuationRoutes
                  ? 'bg-safe-soft border-safe/30 text-safe'
                  : 'bg-surface border-hairline text-ink-soft hover:bg-surface'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded ${
                    mapLayers.evacuationRoutes
                      ? 'bg-safe-soft text-safe'
                      : 'bg-paper-alt text-ink-soft'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-ink leading-tight">
                    Evacuation Routes
                  </div>
                  <div className="text-[10px] text-ink-soft">
                    Safe corridors • Turn-by-turn routing
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={mapLayers.evacuationRoutes}
                onChange={() => {}}
                className="rounded bg-white border-hairline text-emerald-600 pointer-events-none"
              />
            </div>

            {/* 7. Hazard Zones */}
            <div
              onClick={() => toggleMapLayer('hazardZones')}
              className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between ${
                mapLayers.hazardZones
                  ? 'bg-critical-soft border-critical/30 text-critical'
                  : 'bg-surface border-hairline text-ink-soft hover:bg-surface'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded ${
                    mapLayers.hazardZones
                      ? 'bg-critical-soft text-critical'
                      : 'bg-paper-alt text-ink-soft'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-ink leading-tight">
                    Hazard Zones
                  </div>
                  <div className="text-[10px] text-ink-soft">
                    {riskZones.length} sectors • Hazard boundary polygons
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={mapLayers.hazardZones}
                onChange={() => {}}
                className="rounded bg-white border-hairline text-red-600 pointer-events-none"
              />
            </div>

            {/* 8. Satellite Flood Extent (Sentinel-1) */}
            <div
              onClick={() => toggleMapLayer('satelliteFloodExtent')}
              className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between ${
                mapLayers.satelliteFloodExtent
                  ? 'bg-purple-50 border-purple-300 text-purple-800'
                  : 'bg-surface border-hairline text-ink-soft hover:bg-surface'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded ${
                    mapLayers.satelliteFloodExtent
                      ? 'bg-purple-100 text-purple-600'
                      : 'bg-paper-alt text-ink-soft'
                  }`}
                >
                  <Satellite className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-ink leading-tight">
                    Satellite Flood Extent
                  </div>
                  <div className="text-[10px] text-ink-soft">
                    {hazard?.status === 'available'
                      ? `${hazard.data_mode === 'DEMO' ? 'Demo' : 'Sentinel-1'} • ${hazard.affected_area_km2.toFixed(1)} km²`
                      : 'Not yet processed'}
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={mapLayers.satelliteFloodExtent}
                onChange={() => {}}
                className="rounded bg-white border-hairline text-purple-600 pointer-events-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Floating Active Selection Badge (Top Right) */}
      <div className="absolute top-3 right-3 z-[1000] hidden sm:flex items-center gap-2 bg-surface border border-hairline px-3 py-1.5 rounded-md shadow-md">
        <div className="text-[11px] font-mono">
          <span className="text-ink-soft">Active Zone: </span>
          <span className="text-critical font-bold">
            {selectedZone ? selectedZone.name : 'None'}
          </span>
        </div>
        {selectedZone && (
          <button
            onClick={() => setSelectedDetailDrawerZone(selectedZone)}
            className="text-[10px] font-mono text-brand hover:text-brand underline"
          >
            Details
          </button>
        )}
      </div>

      {/* Floating Tactical Legend (Bottom Right) */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-surface border border-hairline p-2.5 rounded-lg shadow-md max-w-xs text-[11px] font-mono text-ink-soft">
        <div className="font-semibold text-[10px] text-ink-soft uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span>Map Intelligence Legend</span>
          <span className="text-brand text-[9px]">GIS ACTIVE</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-critical shrink-0"></span>
            <span>Critical Zone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-safe shrink-0"></span>
            <span>Relief Centre</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-safe shrink-0"></span>
            <span>Evac Route</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-sky-400 shrink-0"></span>
            <span>Elevated Road</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-critical border border-critical/30 shrink-0"></span>
            <span>Blocked Road</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-warn shrink-0"></span>
            <span>Vuln Hotspot</span>
          </div>
        </div>
      </div>
    </div>
  );
};
