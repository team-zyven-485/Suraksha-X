import { GoogleGenAI } from '@google/genai';
import { ALLOWED_EMOJI, allowedRanges, hazardSpec, type LatLngT, type Severity } from '../src/shared/hazardSim';
import type { SOSDisasterType } from '../src/types/sos';

// Best model first. Pro models (gemini-3.1-pro, gemini-pro-latest) have NO free-tier quota and
// gemini-2.5-pro / 2.5-flash are closed to new keys, so the newest Flash models lead, with
// Flash-Lite as the last resort. (Probed against a free-tier key; see README.)
export const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];
const deadModels = new Set<string>(); // 404: gone for this key, never retry
const cooldownUntil = new Map<string, number>(); // overloaded / rate limited: skip for a while
const COOLDOWN_OVERLOAD_MS = 90_000;
const COOLDOWN_QUOTA_MS = 10 * 60_000;

export const modelAvailable = (m: string) => !deadModels.has(m) && (cooldownUntil.get(m) ?? 0) < Date.now();
export function noteModelFailure(model: string, message: string) {
  if (/"code":\s*404|NOT_FOUND/.test(message)) deadModels.add(model);
  else if (/429|RESOURCE_EXHAUSTED/.test(message)) cooldownUntil.set(model, Date.now() + COOLDOWN_QUOTA_MS);
  else cooldownUntil.set(model, Date.now() + COOLDOWN_OVERLOAD_MS); // 503, timeouts
}
// Generous: this runs in the background. The route answers with the rule-based sketch after a few
// seconds and upgrades the result when Gemini finally replies.
const PER_MODEL_TIMEOUT_MS = 20_000;
const HEDGE_MS = 3_500; // start the next-best model if the current one has not answered by then
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

export const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => {
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

/**
 * Ask Gemini for scenario parameters. Returns null if Gemini is not configured or every model fails.
 *
 * Staggered ("hedged") attempts: the best healthy model starts first; if it has not answered within
 * HEDGE_MS — or it fails — the next-best starts too, and the first valid answer wins. This keeps the
 * quality of the newest model when it is healthy without waiting on it when it is overloaded.
 */
export async function generateSimParams(req: SimRequest): Promise<{ raw: unknown; model: string } | null> {
  const ai = getClient();
  if (!ai) return null;
  const order = GEMINI_MODELS.filter(modelAvailable);
  if (order.length === 0) return null;
  const prompt = buildPrompt(req);

  return new Promise((resolve) => {
    let done = false;
    let next = 0;
    let running = 0;
    let hedgeTimer: ReturnType<typeof setTimeout> | null = null;
    const inflight = new Map<string, number>(); // model -> its preference rank, while still waiting

    const finish = (result: { raw: unknown; model: string } | null) => {
      if (done) return;
      done = true;
      // A higher-preference model that lost the race is evidently slow or overloaded right now:
      // let it sit out a short cooldown so the next request does not wait on it again.
      if (result) {
        const winnerRank = order.indexOf(result.model);
        for (const [model, rank] of inflight) if (rank < winnerRank) noteModelFailure(model, 'timeout (lost the race)');
      }
      if (hedgeTimer) clearTimeout(hedgeTimer);
      clearTimeout(budgetTimer);
      resolve(result);
    };
    const budgetTimer = setTimeout(() => finish(null), TOTAL_BUDGET_MS);

    const startNext = () => {
      if (done) return;
      if (hedgeTimer) clearTimeout(hedgeTimer);
      if (next >= order.length) {
        if (running === 0) finish(null);
        return;
      }
      const model = order[next++];
      running++;
      inflight.set(model, next - 1);
      hedgeTimer = setTimeout(startNext, HEDGE_MS);
      withTimeout(
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { systemInstruction: SYSTEM, temperature: 0.4, maxOutputTokens: 4096, responseMimeType: 'application/json' },
        }),
        PER_MODEL_TIMEOUT_MS
      )
        .then((response) => {
          const raw = extractJson(response.text ?? '');
          inflight.delete(model);
          finish({ raw, model });
        })
        .catch((err) => {
          const msg = String((err as Error)?.message ?? err);
          inflight.delete(model);
          noteModelFailure(model, msg);
          console.warn(`[Sim] ${model} failed: ${msg.slice(0, 100)}`);
          running--;
          startNext(); // do not wait for the hedge timer: try the next model now
        });
    };
    startNext();
  });
}
