import { GoogleGenAI } from '@google/genai';
import { ALLOWED_EMOJI, allowedRanges, hazardSpec, type LatLngT, type Severity } from '../src/shared/hazardSim';
import type { SOSDisasterType } from '../src/types/sos';

// Fast, available models first. gemini-2.5-flash now returns 404 for new users, so it is last and
// permanently skipped once it has failed that way.
const MODELS = ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
const deadModels = new Set<string>();
let lastGoodModel: string | null = null; // try the model that worked last time first, to keep latency low
// Generous: this runs in the background. The route answers with the rule-based sketch after a few
// seconds and upgrades the result when Gemini finally replies.
const PER_MODEL_TIMEOUT_MS = 10_000;
const TOTAL_BUDGET_MS = 28_000;

export function geminiConfigured(): boolean {
  const k = process.env.GEMINI_API_KEY?.trim();
  return !!k && k !== 'MY_GEMINI_API_KEY';
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  if (!geminiConfigured()) return null;
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!.trim() });
  return client;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, rej) => {
    timer = setTimeout(() => rej(new Error('timeout')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
};

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model output');
  return JSON.parse(text.slice(start, end + 1));
}

export interface SimRequest {
  hazard: SOSDisasterType;
  severity: Severity;
  origin: LatLngT;
  /** Plain facts we already hold about the surroundings (from the bundled sample scenario). */
  context: string[];
}

const SYSTEM = `You are the parameter generator for a disaster-response TRAINING SIMULATOR.
This is a pure simulation: there is no real-time sensor, satellite, weather or terrain data, and you must not claim certainty or describe it as a forecast.
You do NOT draw maps or output coordinates. You only choose a few bounded numeric parameters and short texts; software draws the footprint from them.
Reply with ONE JSON object and nothing else.`;

function buildPrompt(req: SimRequest): string {
  const spec = hazardSpec(req.hazard);
  const r = allowedRanges(req.hazard, req.severity);
  return `Hazard: ${req.hazard}
Severity to simulate: ${req.severity}
Location (for general context only): ${req.origin.lat.toFixed(4)}, ${req.origin.lng.toFixed(4)}
Known sample context:
${req.context.length ? req.context.map((c) => `- ${c}`).join('\n') : '- none'}

Return JSON with exactly these keys:
{
  "headline": string (max 80 chars, plain),
  "narrative": string (2 sentences, max 300 chars, say it is illustrative),
  "bearingDeg": number 0-359 (clockwise from north: direction of ${req.hazard === 'FLOOD' ? 'water flow' : req.hazard === 'LANDSLIDE' ? 'downslope movement' : req.hazard === 'TSUNAMI' ? 'inland push' : req.hazard === 'FIRE' ? 'wind-driven spread' : req.hazard === 'CYCLONE' ? 'cyclone track' : 'principal spread'}),
  "lengthKm": number between ${r.lengthKm[0]} and ${r.lengthKm[1]},
  "widthKm": number between ${r.widthKm[0]} and ${r.widthKm[1]},
  "peakAfterHours": number between ${r.peakAfterHours[0]} and ${r.peakAfterHours[1]},
  "intensity": { "value": number between ${r.intensity[0]} and ${r.intensity[1]} }   // ${spec.intensity.label} (${spec.intensity.unit})
  "assumptions": string[] (2-3 short items stating what is assumed because no real data exists),
  "considerations": string[] (3-4 short suggestions staff should VERIFY, phrased as considerations, not orders),
  "markers": [ { "emoji": one of ${ALLOWED_EMOJI.join(' ')}, "label": string (max 40 chars, start with "Possible" or "Assumed" where uncertain), "bearingDeg": number, "distanceKm": number between 0.1 and ${r.lengthKm[1]} } ]   // 3 to 5 markers of plausible impacts or features
}
Keep every value physically plausible for this hazard and severity.
If this hazard is implausible at this kind of location (for example a tsunami far from any coast), say so plainly in the first assumption instead of pretending otherwise.`;
}

/** Ask Gemini for scenario parameters. Returns null if Gemini is not configured or every model fails. */
export async function generateSimParams(req: SimRequest): Promise<{ raw: unknown; model: string } | null> {
  const ai = getClient();
  if (!ai) return null;
  const order = (lastGoodModel ? [lastGoodModel, ...MODELS.filter((m) => m !== lastGoodModel)] : MODELS).filter((m) => !deadModels.has(m));
  const started = Date.now();
  for (const model of order) {
    if (Date.now() - started > TOTAL_BUDGET_MS) break;
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: buildPrompt(req) }] }],
          config: { systemInstruction: SYSTEM, temperature: 0.4, maxOutputTokens: 1200, responseMimeType: 'application/json' },
        }),
        Math.min(PER_MODEL_TIMEOUT_MS, Math.max(2000, TOTAL_BUDGET_MS - (Date.now() - started)))
      );
      const raw = extractJson(response.text ?? '');
      lastGoodModel = model;
      return { raw, model };
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (/"code":\s*404|NOT_FOUND/.test(msg)) deadModels.add(model);
      console.warn(`[Sim] ${model} failed: ${msg.slice(0, 100)}`);
    }
  }
  return null;
}
