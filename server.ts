import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Lazy Gemini Client initialization
  const getGeminiClient = (): GoogleGenAI | null => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
      return null;
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // Health endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'SURAKSHA-X Disaster Intelligence API',
      timestamp: new Date().toISOString(),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
    });
  });

  // Context-Aware Gemini Chatbot Endpoint
  app.post('/api/chat', async (req, res) => {
    try {
      const { message, context, conversationHistory } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const client = getGeminiClient();

      const scenario = context?.scenarioMeta;
      const zone = context?.selectedZone;
      const shelter = context?.selectedShelter;
      const route = context?.selectedRoute;
      const blockedRoadsList: any[] = Array.isArray(context?.blockedRoadsDetail) ? context.blockedRoadsDetail : [];

      const systemPrompt = `You are SURAKSHA-X AI Assistant, an elite disaster intelligence and relocation decision-support AI copilot built by Team ZYVEN for the Smart India Hackathon (SIH26191 — Multi-Hazard Relocation System).

You assist Admin, incident commanders, NDRF response teams, and civil administrators in making real-time, life-saving evacuation decisions.

CURRENT LIVE SITUATION & TELEMETRY CONTEXT:
- Active Disaster Scenario: ${scenario?.name || 'Unknown Scenario'} (${scenario?.disasterType || ''} — ${scenario?.category || ''}) in ${scenario?.region || 'the affected region'}, ${scenario?.state || ''}
- Active Selected Zone: ${zone?.name || 'No zone selected'} (Risk Score: ${zone?.riskScore ?? '—'}/100, Priority: ${zone?.priority || '—'}, Population: ${zone?.population ?? '—'}, Vulnerable Population: ${zone?.vulnerablePopulation ?? '—'}, Hazard Intensity: +${zone?.floodDepthEstMeters ?? '—'}m)
- Active Target Shelter: ${shelter?.name || 'No shelter assigned'} (Available Capacity: ${shelter?.available ?? '—'} beds, Elevation: +${shelter?.elevationMeters ?? '—'}m MSL, Safety Score: ${shelter?.safetyScore ?? '—'}/100)
- Active Recommended Evacuation Route: ${route?.destinationName || 'No route selected'} (${route?.distanceKm ?? '—'} km, ${route?.estimatedTimeMin ?? '—'} min ETA, Safety Score: ${route?.safetyScore ?? '—'}/100)
- Known Hazard Obstructions: ${blockedRoadsList.length > 0 ? blockedRoadsList.map((b, i) => `${i + 1}. ${b.name} (${b.severity})`).join('; ') : 'None reported'}
- Monitored Region: ${scenario?.riverBasinOrFault || scenario?.region || 'active hazard zone'} (Alert tier per active scenario)

RESPONSE GUIDELINES:
1. Provide precise, actionable tactical disaster intelligence. Be professional, clear, and structured.
2. Structure answers with bold section headers, bulleted action items, and safety scores.
3. If the user asks for a relocation plan, evacuation order, route advice, or vulnerability breakdown, provide a clear operational recommendation.
4. When relevant or requested to generate an order, include an official "OPERATIONAL RELOCATION DIRECTIVE" block with Order ID, Target Zone, Evacuation Route, Destination Shelter, and Priority Groups so the user can easily print the order.`;

      if (client) {
        // Multi-model resilience cascade: try available models in priority order
        const candidateModels = [
          'gemini-2.5-flash',
          'gemini-3.7-flash',
          'gemini-3.1-flash-lite',
          'gemini-flash-latest',
        ];

        // Format conversation history for Gemini API
        const contents: any[] = [];
        
        if (conversationHistory && Array.isArray(conversationHistory)) {
          for (const turn of conversationHistory.slice(-6)) {
            contents.push({
              role: turn.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: turn.content }],
            });
          }
        }

        // Add the current user prompt with context snapshot
        contents.push({
          role: 'user',
          parts: [
            {
              text: `[SYSTEM TELEMETRY CONTEXT: Scenario: ${scenario?.name || 'Unknown'}, Active Zone: ${zone?.name || 'None'}, Risk: ${zone?.riskScore ?? '—'}, Vulnerable Pop: ${zone?.vulnerablePopulation ?? '—'}, Target Shelter: ${shelter?.name || 'None'}, Available Beds: ${shelter?.available ?? '—'}]\n\nUser Question: ${message}`,
            },
          ],
        });

        for (const modelName of candidateModels) {
          try {
            // Attempt generation with current candidate model
            const response = await client.models.generateContent({
              model: modelName,
              contents,
              config: {
                systemInstruction: systemPrompt,
                temperature: 0.3,
                maxOutputTokens: 1000,
              },
            });

            const replyText = response.text || 'Operational response received from SURAKSHA-X intelligence core.';
            return res.json({
              reply: replyText,
              model: modelName,
              timestamp: new Date().toISOString(),
            });
          } catch (geminiError: any) {
            const errorMsg = geminiError?.message || String(geminiError);
            const isDemandOrRateLimit =
              errorMsg.includes('503') ||
              errorMsg.includes('429') ||
              errorMsg.includes('high demand') ||
              errorMsg.includes('UNAVAILABLE') ||
              errorMsg.includes('RESOURCE_EXHAUSTED');

            console.warn(`[Gemini API Warning - ${modelName} failed]: ${errorMsg.slice(0, 120)}... trying next model in cascade.`);

            // If it's a transient 503 or 429, pause 300ms before next candidate model
            if (isDemandOrRateLimit) {
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
          }
        }
      }

      // Context-aware smart tactical fallback engine (guarantees 100% reliability)
      const query = message.toLowerCase();
      let fallbackReply = '';

      const riskZonesSummary: any[] = Array.isArray(context?.riskZonesSummary) ? context.riskZonesSummary : [];
      const reliefCentresSummary: any[] = Array.isArray(context?.reliefCentresSummary) ? context.reliefCentresSummary : [];
      const demo = context?.demographics;

      if (query.includes('order') || query.includes('directive') || query.includes('evacuate') || query.includes('plan')) {
        const zoneName = zone?.name || scenario?.region || 'the active zone';
        const shelterName = shelter?.name || 'the nearest available relief centre';
        const vulnPop = zone?.vulnerablePopulation ?? 0;
        const routeName = route?.destinationName || 'the primary corridor';

        fallbackReply = `### 📋 OFFICIAL DISASTER RELOCATION DIRECTIVE
**Incident Command Protocol #PLAN-${Date.now().toString().slice(-6)}**
**Authorized Under Admin Incident Command Protocol**

- **Scenario:** ${scenario?.name || 'Active Disaster Scenario'} (${scenario?.category || ''})
- **Target Zone:** ${zoneName} (${zone?.priority || 'P1'} — Risk Score ${zone?.riskScore ?? '—'}/100)
- **Target Relief Facility:** ${shelterName} (Verified ${shelter?.available ?? '—'} beds available, +${shelter?.elevationMeters ?? '—'}m MSL)
- **Primary Transit Corridor:** ${routeName} (${route?.distanceKm ?? '—'} km • ${route?.estimatedTimeMin ?? '—'} min ETA • ${route?.safetyScore ?? '—'}% Safety)
- **Priority Evacuation Groups:**
  1. Pediatric & Geriatric residents (${vulnPop} individuals)
  2. Mobility-impaired & persons with disabilities
  3. High-exposure households
- **Immediate Tactical Action:**
  - Mobilize high-clearance Civil Defense transit convoys
  - Deploy traffic marshals along the recommended corridor
  - Bypass all known blocked or unsafe roads

*Click the **Print Order** button below to generate an official physical dispatch manifest.*`;
      } else if (query.includes('route') || query.includes('road') || query.includes('blocked') || query.includes('traffic')) {
        const obstructionsList = blockedRoadsList.length > 0
          ? blockedRoadsList.map((b, i) => `${i + 1}. ⛔ **${b.name}:** ${b.reason || b.severity}. **UNSAFE FOR TRANSIT.**`).join('\n')
          : 'No blocked roads currently reported for this scenario.';

        fallbackReply = `### 🛣️ REAL-TIME ROUTE & ROAD NETWORK INTELLIGENCE

**Current Obstructions:**
${obstructionsList}

**Recommended Safe Corridor:**
- ✅ **${route?.destinationName || 'Primary Corridor'} (RECOMMENDED):** ${route?.distanceKm ?? '—'} km distance, ${route?.estimatedTimeMin ?? '—'} min ETA, Safety Score ${route?.safetyScore ?? '—'}/100.`;
      } else if (query.includes('shelter') || query.includes('relief') || query.includes('capacity') || query.includes('bed')) {
        const shelterLines = reliefCentresSummary.length > 0
          ? reliefCentresSummary.map((s) => {
              const dot = s.status === 'AVAILABLE' ? '🟢' : s.status === 'NEAR_CAPACITY' ? '🟡' : '🔴';
              return `- ${dot} **${s.code} (${s.name}):** ${s.available} available beds (Capacity: ${s.capacity.toLocaleString()} | Occupancy: ${s.occupancy.toLocaleString()}).`;
            }).join('\n')
          : 'No relief centre data available for this scenario.';

        fallbackReply = `### 🏥 RELIEF CENTRE NETWORK CAPACITY STATUS

${shelterLines}`;
      } else if (query.includes('vulnerab') || query.includes('people') || query.includes('elderly') || query.includes('children')) {
        const topZones = [...riskZonesSummary]
          .sort((a, b) => (b.vulnerablePopulation || 0) - (a.vulnerablePopulation || 0))
          .slice(0, 3);

        const vulnBreakdown = Array.isArray(demo?.vulnerabilityDistribution)
          ? demo.vulnerabilityDistribution.map((v: any) => `  - ${v.category}: **${v.count.toLocaleString()} (${v.percentage}%)**`).join('\n')
          : '';

        fallbackReply = `### 👥 DEMOGRAPHIC & VULNERABILITY HOTSPOT ANALYSIS

**High-Risk Population Summary across ${scenario?.region || 'the affected region'}:**
- Total Citizens at Hazard Risk: **${demo?.totalPopulationAtRisk?.toLocaleString() ?? '—'}**
- Total Prioritized Vulnerable: **${demo?.totalVulnerablePopulation?.toLocaleString() ?? '—'}**
${vulnBreakdown}

**Highest Vulnerability Sectors:**
${topZones.map((z, i) => `${i + 1}. **${z.name}:** ${z.vulnerablePopulation ?? '—'} vulnerable residents (Risk Score ${z.score})`).join('\n') || 'No zone data available.'}`;
      } else {
        fallbackReply = `### 🌐 SURAKSHA-X TACTICAL COMMAND INTELLIGENCE

Active monitoring in progress for **${scenario?.riverBasinOrFault || scenario?.region || 'the active hazard zone'}**.

- **Active Monitored Zone:** ${zone?.name || 'No zone selected'} (${zone?.riskScore ?? '—'} Risk, Priority ${zone?.priority || '—'})
- **Hazard Intensity Estimate:** +${zone?.floodDepthEstMeters ?? '—'} meters
- **Priority Directive:** Immediate phased relocation to **${shelter?.name || 'the recommended shelter'}** via **${route?.destinationName || 'the primary corridor'}**
- **Road Network Status:** ${blockedRoadsList.length} known obstruction(s) reported; recommended corridor clear and secured.

*You can ask for route safety scores, generate official evacuation orders, check shelter beds, or inspect vulnerability indices.*`;
      }

      return res.json({
        reply: fallbackReply,
        model: 'suraksha-tactical-engine (fallback)',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[Chat API Internal Error]:', err);
      return res.status(500).json({ error: 'Internal server error processing disaster intelligence request' });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SURAKSHA-X] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
