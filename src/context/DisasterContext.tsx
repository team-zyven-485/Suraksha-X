import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  RiskZone,
  ReliefCentre,
  EvacuationRoute,
  BlockedRoad,
  SystemAlert,
  RelocationPlan,
  MapLayerState,
  RoadSegment,
} from '../types';
import { ScenarioMeta, DemographicSummary, AnalyticsData } from '../data/scenarios';
import { scenarioList, DEFAULT_SCENARIO_ID, getScenario } from '../data/scenarios';
import { disasterService } from '../services/disasterService';

export type AppPage =
  | 'command-center'
  | 'risk-intelligence'
  | 'vulnerability'
  | 'relocation-planner'
  | 'evacuation-routes'
  | 'relocation-action-plan'
  | 'relief-centres'
  | 'rescue-control'
  | 'satellite-intel'
  | 'analytics';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
}

interface DisasterContextType {
  activePage: AppPage;
  setActivePage: (page: AppPage) => void;

  activeScenarioId: string;
  scenarioMeta: ScenarioMeta;
  demographics: DemographicSummary;
  analytics: AnalyticsData;
  allScenarios: ScenarioMeta[];
  switchScenario: (id: string) => void;

  riskZones: RiskZone[];
  reliefCentres: ReliefCentre[];
  routes: EvacuationRoute[];
  blockedRoads: BlockedRoad[];
  roadNetworks: RoadSegment[];
  alerts: SystemAlert[];
  selectedZone: RiskZone | null;
  setSelectedZone: (zone: RiskZone | null) => void;
  selectedShelter: ReliefCentre | null;
  setSelectedShelter: (shelter: ReliefCentre | null) => void;
  selectedRoute: EvacuationRoute | null;
  setSelectedRoute: (route: EvacuationRoute | null) => void;
  activePlan: RelocationPlan | null;
  setActivePlan: (plan: RelocationPlan | null) => void;
  mapLayers: MapLayerState;
  setMapLayers: React.Dispatch<React.SetStateAction<MapLayerState>>;
  toggleMapLayer: (layer: keyof MapLayerState) => void;
  setAllMapLayers: (visible: boolean) => void;
  setMapLayerPreset: (preset: 'all' | 'evacuation' | 'vulnerability' | 'infrastructure' | 'clear') => void;
  isSimulating: boolean;
  simulationStep: number;
  triggerRelocationWorkflow: (zoneId?: string, preferredShelterId?: string, preferredRouteId?: string) => Promise<void>;
  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], title: string, message: string) => void;
  removeToast: (id: string) => void;
  selectedDetailDrawerZone: RiskZone | null;
  setSelectedDetailDrawerZone: (zone: RiskZone | null) => void;
  unreadAlertsCount: number;
  markAlertsAsRead: () => void;
  addAlert: (alert: Omit<SystemAlert, 'id' | 'timestamp' | 'read'> & { id?: string; timestamp?: string }) => void;
  updateChecklistStep: (stepId: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED') => void;
  startQuick60SecDemo: () => void;
  printOrder: (customOrder?: any) => void;
}

const defaultLayers: MapLayerState = {
  hazardZones: true,
  populationClusters: true,
  vulnerabilityIndicators: true,
  reliefCentres: true,
  roadNetwork: true,
  blockedRoads: true,
  evacuationRoutes: true,
  satelliteFloodExtent: true,
  populationHeatmap: true,
  vulnerabilityOverlay: true,
};

const DisasterContext = createContext<DisasterContextType | undefined>(undefined);

export const DisasterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activePage, setActivePage] = useState<AppPage>('command-center');
  const [activeScenarioId, setActiveScenarioId] = useState<string>(DEFAULT_SCENARIO_ID);
  // Synchronous local defaults for first paint; loadScenarioData() below
  // replaces these with the Supabase-backed values (falling back to the same
  // local data if Supabase isn't configured yet).
  const [scenarioMeta, setScenarioMeta] = useState<ScenarioMeta>(getScenario(DEFAULT_SCENARIO_ID).meta);
  const [demographics, setDemographics] = useState<DemographicSummary>(getScenario(DEFAULT_SCENARIO_ID).demographics);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>(getScenario(DEFAULT_SCENARIO_ID).analytics);

  const [riskZones, setRiskZones] = useState<RiskZone[]>([]);
  const [reliefCentres, setReliefCentres] = useState<ReliefCentre[]>([]);
  const [routes, setRoutes] = useState<EvacuationRoute[]>([]);
  const [blockedRoads, setBlockedRoads] = useState<BlockedRoad[]>([]);
  const [roadNetworks, setRoadNetworks] = useState<RoadSegment[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);

  const [selectedZone, setSelectedZone] = useState<RiskZone | null>(null);
  const [selectedShelter, setSelectedShelter] = useState<ReliefCentre | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<EvacuationRoute | null>(null);
  const [activePlan, setActivePlan] = useState<RelocationPlan | null>(null);
  const [selectedDetailDrawerZone, setSelectedDetailDrawerZone] = useState<RiskZone | null>(null);

  const [mapLayers, setMapLayers] = useState<MapLayerState>(defaultLayers);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationStep, setSimulationStep] = useState<number>(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const loadScenarioData = async () => {
    const [zones, shelters, rts, blocks, roads, alrts, meta, demo, analytics] = await Promise.all([
      disasterService.getRiskZones(),
      disasterService.getReliefCentres(),
      disasterService.getRoutes(),
      disasterService.getBlockedRoads(),
      disasterService.getRoadNetworks(),
      disasterService.getAlerts(),
      disasterService.getScenarioMeta(),
      disasterService.getDemographics(),
      disasterService.getAnalytics(),
    ]);
    setRiskZones(zones);
    setReliefCentres(shelters);
    setRoutes(rts);
    setBlockedRoads(blocks);
    setRoadNetworks(roads);
    setAlerts(alrts);
    setScenarioMeta(meta);
    setDemographics(demo);
    setAnalyticsData(analytics);

    const topZone = [...zones].sort((a, b) => b.riskScore - a.riskScore)[0] || zones[0];
    setSelectedZone(topZone);
    const bestShelter = shelters.find((s) => s.available > 0) || shelters[0];
    setSelectedShelter(bestShelter);
    setSelectedRoute(rts.find((r) => r.isRecommended) || rts[0]);

    setActivePlan(null);
    setSelectedDetailDrawerZone(null);
  };

  useEffect(() => {
    loadScenarioData();
  }, []);

  const switchScenario = async (id: string) => {
    disasterService.setActiveScenario(id);
    setActiveScenarioId(id);
    setActivePage('command-center');
    await loadScenarioData();
    const meta = await disasterService.getScenarioMeta();
    addToast('info', 'Scenario Loaded', `Switched to: ${meta.name}`);
  };

  const toggleMapLayer = (layer: keyof MapLayerState) => {
    setMapLayers((prev) => {
      const nextVal = !prev[layer];
      const updated = { ...prev, [layer]: nextVal };
      if (layer === 'populationClusters') updated.populationHeatmap = nextVal;
      if (layer === 'populationHeatmap') updated.populationClusters = nextVal;
      if (layer === 'vulnerabilityIndicators') updated.vulnerabilityOverlay = nextVal;
      if (layer === 'vulnerabilityOverlay') updated.vulnerabilityIndicators = nextVal;
      return updated;
    });
  };

  const setAllMapLayers = (visible: boolean) => {
    setMapLayers({
      hazardZones: visible,
      populationClusters: visible,
      vulnerabilityIndicators: visible,
      reliefCentres: visible,
      roadNetwork: visible,
      blockedRoads: visible,
      evacuationRoutes: visible,
      satelliteFloodExtent: visible,
      populationHeatmap: visible,
      vulnerabilityOverlay: visible,
    });
  };

  const setMapLayerPreset = (preset: 'all' | 'evacuation' | 'vulnerability' | 'infrastructure' | 'clear') => {
    switch (preset) {
      case 'all':
        setAllMapLayers(true);
        addToast('info', 'GIS Preset Applied', 'All 8 tactical GIS layers activated');
        break;
      case 'evacuation':
        setMapLayers({
          hazardZones: true,
          populationClusters: false,
          vulnerabilityIndicators: false,
          reliefCentres: true,
          roadNetwork: true,
          blockedRoads: true,
          evacuationRoutes: true,
          satelliteFloodExtent: true,
          populationHeatmap: false,
          vulnerabilityOverlay: false,
        });
        addToast('info', 'GIS Preset Applied', 'Evacuation Corridor Mode (Routes, Blockages & Shelters)');
        break;
      case 'vulnerability':
        setMapLayers({
          hazardZones: true,
          populationClusters: true,
          vulnerabilityIndicators: true,
          reliefCentres: true,
          roadNetwork: false,
          blockedRoads: false,
          evacuationRoutes: false,
          satelliteFloodExtent: false,
          populationHeatmap: true,
          vulnerabilityOverlay: true,
        });
        addToast('info', 'GIS Preset Applied', 'Vulnerability & Demographic Assessment Mode');
        break;
      case 'infrastructure':
        setMapLayers({
          hazardZones: false,
          populationClusters: false,
          vulnerabilityIndicators: false,
          reliefCentres: true,
          roadNetwork: true,
          blockedRoads: true,
          evacuationRoutes: false,
          satelliteFloodExtent: false,
          populationHeatmap: false,
          vulnerabilityOverlay: false,
        });
        addToast('info', 'GIS Preset Applied', 'Infrastructure & Road Networks Mode');
        break;
      case 'clear':
        setAllMapLayers(false);
        addToast('info', 'GIS Preset Applied', 'Cleared all map overlays');
        break;
    }
  };

  const printOrder = (customOrder?: any) => {
    const orderData = customOrder || activePlan || {
      orderId: 'PLAN-782914',
      directive: 'MANDATORY IMMEDIATE DISASTER RELOCATION ORDER',
      targetZone: selectedZone?.name || 'Selected Zone',
      targetShelter: selectedShelter?.name || 'Assigned Relief Centre',
      priorityCitizensCount: selectedZone?.vulnerablePopulation || 0,
      authorizedBy: 'Admin / Incident Commander Alpha',
      timestamp: new Date().toISOString(),
      evacuationCorridor: selectedRoute?.destinationName || 'Primary Corridor',
    };

    console.log('[SURAKSHA-X OPERATIONAL DIRECTIVE / ORDER DISPATCHED FOR PRINTING]:', orderData);

    addToast(
      'success',
      'Operational Order Dispatched',
      `Printing Directive for ${orderData.targetZone || orderData.zoneName || 'Active Zone'} (Console logged)`
    );

    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.print();
      }, 250);
    }
  };

  const addToast = (type: ToastMessage['type'], title: string, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const unreadAlertsCount = alerts.filter((a) => !a.read).length;

  const markAlertsAsRead = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  };

  const addAlert: DisasterContextType['addAlert'] = (alert) => {
    const newAlert: SystemAlert = {
      id: alert.id ?? `alert-${Date.now().toString().slice(-6)}`,
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      zoneId: alert.zoneId,
      timestamp: alert.timestamp ?? new Date().toLocaleTimeString(),
      read: false,
    };
    setAlerts((prev) => [newAlert, ...prev]);
  };

  const updateChecklistStep = (stepId: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED') => {
    if (!activePlan) return;
    const updatedChecklist = activePlan.checklist.map((step) =>
      step.id === stepId ? { ...step, status } : step
    );
    setActivePlan({ ...activePlan, checklist: updatedChecklist });
    addToast('info', 'Checklist Updated', `Step marked as ${status.replace('_', ' ')}`);
  };

  const triggerRelocationWorkflow = async (zoneId?: string, preferredShelterId?: string, preferredRouteId?: string) => {
    const targetZoneId = zoneId || selectedZone?.id || riskZones[0]?.id;
    if (!targetZoneId) return;
    const targetZone = riskZones.find((z) => z.id === targetZoneId) || riskZones[0];
    setSelectedZone(targetZone);
    setSelectedDetailDrawerZone(null);

    setIsSimulating(true);
    setSimulationStep(1);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setSimulationStep(2);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setSimulationStep(3);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setSimulationStep(4);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setSimulationStep(5);
    await new Promise((resolve) => setTimeout(resolve, 600));

    const generatedPlan = await disasterService.generateRelocationPlan(targetZoneId, {
      preferredShelterId,
      preferredRouteId,
    });
    setActivePlan(generatedPlan);
    setSelectedShelter(generatedPlan.recommendedShelter);
    setSelectedRoute(generatedPlan.primaryRoute);
    setIsSimulating(false);
    setSimulationStep(0);

    setActivePage('relocation-action-plan');
    addToast(
      'success',
      'Relocation Plan Generated',
      `Authorized action plan for ${targetZone.name} to ${generatedPlan.recommendedShelter.name}`
    );
  };

  const startQuick60SecDemo = () => {
    const topZone = [...riskZones].sort((a, b) => b.riskScore - a.riskScore)[0] || riskZones[0];
    if (!topZone) return;
    setSelectedZone(topZone);
    setActivePage('command-center');
    setSelectedDetailDrawerZone(topZone);
    addToast(
      'info',
      'Demo Scenario Loaded',
      `${scenarioMeta.name} active. Step 1: ${topZone.name} critical risk selected.`
    );
  };

  return (
    <DisasterContext.Provider
      value={{
        activePage,
        setActivePage,
        activeScenarioId,
        scenarioMeta,
        demographics,
        analytics: analyticsData,
        allScenarios: scenarioList,
        switchScenario,
        riskZones,
        reliefCentres,
        routes,
        blockedRoads,
        roadNetworks,
        alerts,
        selectedZone,
        setSelectedZone,
        selectedShelter,
        setSelectedShelter,
        selectedRoute,
        setSelectedRoute,
        activePlan,
        setActivePlan,
        mapLayers,
        setMapLayers,
        toggleMapLayer,
        setAllMapLayers,
        setMapLayerPreset,
        isSimulating,
        simulationStep,
        triggerRelocationWorkflow,
        toasts,
        addToast,
        removeToast,
        selectedDetailDrawerZone,
        setSelectedDetailDrawerZone,
        unreadAlertsCount,
        markAlertsAsRead,
        addAlert,
        updateChecklistStep,
        startQuick60SecDemo,
        printOrder,
      }}
    >
      {children}
    </DisasterContext.Provider>
  );
};

export const useDisaster = () => {
  const context = useContext(DisasterContext);
  if (!context) {
    throw new Error('useDisaster must be used within a DisasterProvider');
  }
  return context;
};
