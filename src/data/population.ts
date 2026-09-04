export interface DemographicSummary {
  totalPopulationAtRisk: number;
  totalVulnerablePopulation: number;
  activeHazardZonesCount: number;
  criticalZonesCount: number;
  reliefCentresCount: number;
  availableShelterCapacity: number;
  totalShelterCapacity: number;
  totalShelterOccupancy: number;
  vulnerabilityDistribution: {
    category: string;
    count: number;
    percentage: number;
  }[];
}

export const mockDemographicSummary: DemographicSummary = {
  totalPopulationAtRisk: 18420,
  totalVulnerablePopulation: 5280,
  activeHazardZonesCount: 12,
  criticalZonesCount: 4,
  reliefCentresCount: 18,
  availableShelterCapacity: 12640,
  totalShelterCapacity: 21500,
  totalShelterOccupancy: 8860,
  vulnerabilityDistribution: [
    { category: 'Elderly (>65 yrs)', count: 1870, percentage: 35.4 },
    { category: 'Children (<12 yrs)', count: 2110, percentage: 40.0 },
    { category: 'Persons with Disabilities', count: 530, percentage: 10.0 },
    { category: 'High-Density / Inaccessible Households', count: 770, percentage: 14.6 },
  ],
};
