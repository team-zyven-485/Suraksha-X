import { RelocationPlan } from '../types';

/**
 * Downloads a file to the client browser
 */
export function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates official plain text bulletin (.txt)
 */
export function generatePlainTextOrder(plan: RelocationPlan): string {
  const dateStr = new Date().toLocaleString();
  return `========================================================================
             GOVERNMENT DISASTER MANAGEMENT AUTHORITY
          SURAKSHA-X AI-INTELLIGENT RELOCATION DIRECTIVE
========================================================================
ORDER ID          : ${plan.id}
DATE & TIME       : ${dateStr}
STATUS            : ${plan.status}
AUTHORIZING BODY  : Admin / Incident Commander Alpha
DIRECTIVE LEVEL   : TIER-1 MANDATORY EVACUATION PROTOCOL
------------------------------------------------------------------------

1. TARGET EVACUATION ZONE
   Zone Name      : ${plan.zoneName} (District: Kamrup / Brahmaputra Basin)
   Total Pop.     : ${plan.totalPopulation.toLocaleString()} citizens
   Priority Pop.  : ${plan.vulnerablePopulation.toLocaleString()} (Elderly, Children, Mobility-Impaired)
   Hazard Factor  : Hydrodynamic Flood Wave Level 4 (+3.4m surge)

2. ASSIGNED DESTINATION SHELTER
   Shelter Name   : ${plan.recommendedShelter.name}
   Location       : ${plan.recommendedShelter.location}
   Total Capacity : ${plan.recommendedShelter.capacity} persons
   Available Beds : ${plan.recommendedShelter.available} persons
   Facilities     : Medical Triage, Standby Generator, Potable Water, Wheelchair Accessible

3. DESIGNATED SAFE EVACUATION ROUTE
   Route Name     : ${plan.primaryRoute.destinationName}
   Distance       : ${plan.primaryRoute.distanceKm} km
   Est. Transit   : ${plan.primaryRoute.estimatedTimeMin} minutes
   Safety Rating  : ${plan.primaryRoute.safetyScore}/100 (${plan.primaryRoute.safetyLevel})
   Elevation Clr. : ${plan.primaryRoute.elevationClearanceMeters}m Above Water Line
   Active Blocks  : ${plan.primaryRoute.blockedRoadsCount} hazards bypassed via elevated link

4. OPERATIONAL ACTION CHECKLIST
${plan.checklist
  .map(
    (item, idx) =>
      `   [${idx + 1}] [${item.status}] ${item.task}\n       Assignee: ${item.assignee} | Est: ${item.estimatedTime}`
  )
  .join('\n\n')}

5. EXPLAINABLE REASONING
   ${plan.reasoning}

------------------------------------------------------------------------
AUTHENTICATION SEAL:
Issued by: Admin • Incident Command Unit Alpha
System: SURAKSHA-X Disaster Intelligence Platform (Team ZYVEN)
========================================================================`;
}

/**
 * Generates Microsoft Word (.doc) compatible HTML document
 */
export function generateWordDocument(plan: RelocationPlan): string {
  const dateStr = new Date().toLocaleString();
  return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>Relocation Order ${plan.id}</title>
  <style>
    body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; color: #111827; }
    h1 { color: #b91c1c; font-size: 18pt; margin-bottom: 2px; }
    h2 { color: #1e3a8a; font-size: 13pt; border-bottom: 1.5pt solid #1e3a8a; padding-bottom: 3px; margin-top: 15px; }
    .header-box { border: 2pt solid #b91c1c; background-color: #fef2f2; padding: 12px; margin-bottom: 15px; }
    .badge { background-color: #dc2626; color: white; padding: 3px 8px; font-weight: bold; border-radius: 3px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 15px; }
    th { background-color: #f3f4f6; border: 1pt solid #d1d5db; padding: 6px; text-align: left; font-weight: bold; }
    td { border: 1pt solid #d1d5db; padding: 6px; }
    .seal { margin-top: 30px; border-top: 1pt solid #6b7280; padding-top: 10px; font-size: 10pt; color: #4b5563; }
  </style>
</head>
<body>
  <div class="header-box">
    <div style="font-size: 10pt; color: #7f1d1d; font-weight: bold;">ZYVEN / DISASTER INCIDENT COMMAND • PROTOCOL #${plan.id}</div>
    <h1>OFFICIAL RELOCATION DIRECTIVE</h1>
    <div><strong>STATUS:</strong> <span class="badge">AUTHORIZED & MANDATORY</span> | <strong>DATE:</strong> ${dateStr}</div>
    <div><strong>ISSUING AUTHORITY:</strong> Admin (Incident Commander Alpha)</div>
  </div>

  <h2>1. SITUATION & TARGET DEMOGRAPHICS</h2>
  <table>
    <tr><th>Affected Zone</th><td><strong>${plan.zoneName}</strong> (Kamrup District)</td></tr>
    <tr><th>Total Population</th><td>${plan.totalPopulation.toLocaleString()} citizens</td></tr>
    <tr><th>Priority Vulnerable Citizens</th><td><strong style="color: #b91c1c;">${plan.vulnerablePopulation.toLocaleString()}</strong> (Elderly, pediatric, mobility-assisted)</td></tr>
    <tr><th>Assessment Rationale</th><td>${plan.reasoning}</td></tr>
  </table>

  <h2>2. ASSIGNED DESTINATION SHELTER</h2>
  <table>
    <tr><th>Shelter Facility</th><td><strong>${plan.recommendedShelter.name}</strong></td></tr>
    <tr><th>Location / Address</th><td>${plan.recommendedShelter.location}</td></tr>
    <tr><th>Bed Capacity</th><td>${plan.recommendedShelter.capacity} total / <strong>${plan.recommendedShelter.available} available</strong></td></tr>
    <tr><th>Facilities</th><td>Medical Post, Standby Power, Sanitation, Wheelchair Access</td></tr>
  </table>

  <h2>3. AUTHORIZED EVACUATION ROUTE</h2>
  <table>
    <tr><th>Primary Route</th><td><strong>${plan.primaryRoute.destinationName}</strong></td></tr>
    <tr><th>Distance & Transit Time</th><td>${plan.primaryRoute.distanceKm} km (Est. ${plan.primaryRoute.estimatedTimeMin} minutes)</td></tr>
    <tr><th>Safety Score</th><td><strong>${plan.primaryRoute.safetyScore} / 100</strong> (${plan.primaryRoute.safetyLevel})</td></tr>
    <tr><th>Elevation Clearance</th><td>${plan.primaryRoute.elevationClearanceMeters} meters above surge crest</td></tr>
  </table>

  <h2>4. OPERATIONAL ACTION CHECKLIST</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 10%;">Seq</th>
        <th style="width: 50%;">Task Description</th>
        <th style="width: 25%;">Assigned Response Unit</th>
        <th style="width: 15%;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${plan.checklist
        .map(
          (item, idx) => `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><strong>${item.task}</strong></td>
          <td>${item.assignee}</td>
          <td><span style="font-weight: bold; color: ${item.status === 'COMPLETED' ? '#15803d' : '#b45309'};">${item.status}</span></td>
        </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="seal">
    <p><strong>AUTHORIZED UNDER ADMIN INCIDENT COMMAND</strong></p>
    <p>Powered by SURAKSHA-X Disaster Intelligence Platform (Team ZYVEN). All responding NDRF/SDRF units and civil transport marshals must adhere to this route directive.</p>
  </div>
</body>
</html>`;
}

/**
 * Generates OASIS Common Alerting Protocol (CAP v1.2) XML
 */
export function generateCapXml(plan: RelocationPlan): string {
  const sentDate = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>SURAKSHA-CAP-${plan.id}-${Date.now()}</identifier>
  <sender>Admin@suraksha-incident-command.gov.in</sender>
  <sent>${sentDate}</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <incidents>${plan.id}</incidents>
  <info>
    <category>Safety</category>
    <event>Flash Flood Evacuation Order</event>
    <urgency>Immediate</urgency>
    <severity>Extreme</severity>
    <certainty>Observed</certainty>
    <eventCode>
      <valueName>SAME</valueName>
      <value>EVI</value>
    </eventCode>
    <expires>${new Date(Date.now() + 86400000).toISOString()}</expires>
    <senderName>Admin (Incident Commander Alpha - SURAKSHA-X)</senderName>
    <headline>IMMEDIATE EVACUATION ORDER: ${plan.zoneName} to ${plan.recommendedShelter.name}</headline>
    <description>Rapid hydrodynamic flood surge. Mandatory phased relocation of ${plan.vulnerablePopulation} vulnerable residents via ${plan.primaryRoute.destinationName}. Primary shelter: ${plan.recommendedShelter.name} (${plan.recommendedShelter.location}).</description>
    <instruction>Evacuate immediately via authorized elevated route. Follow traffic marshals. Transport available for mobility-impaired residents.</instruction>
    <area>
      <areaDesc>${plan.zoneName}, Kamrup District, Assam</areaDesc>
      <circle>26.215,91.705,5.0</circle>
    </area>
  </info>
</alert>`;
}

/**
 * Generates CSV tabular export
 */
export function generateCsvManifest(plan: RelocationPlan): string {
  const rows = [
    ['Field', 'Value'],
    ['Order ID', plan.id],
    ['Date Generated', plan.generatedAt],
    ['Status', plan.status],
    ['Affected Zone', plan.zoneName],
    ['Total Population', String(plan.totalPopulation)],
    ['Vulnerable Population', String(plan.vulnerablePopulation)],
    ['Destination Shelter', plan.recommendedShelter.name],
    ['Shelter Location', plan.recommendedShelter.location],
    ['Shelter Available Beds', String(plan.recommendedShelter.available)],
    ['Evacuation Route', plan.primaryRoute.destinationName],
    ['Route Distance (km)', String(plan.primaryRoute.distanceKm)],
    ['Route Safety Score', String(plan.primaryRoute.safetyScore)],
    ['Route Safety Level', plan.primaryRoute.safetyLevel],
    ['Authorizing Body', 'Admin - Incident Command Alpha'],
    ['', ''],
    ['CHECKLIST ID', 'TASK', 'ASSIGNEE', 'PRIORITY', 'STATUS', 'EST TIME'],
    ...plan.checklist.map((c) => [c.id, `"${c.task}"`, `"${c.assignee}"`, c.priority, c.status, c.estimatedTime]),
  ];

  return rows.map((r) => r.join(',')).join('\n');
}
