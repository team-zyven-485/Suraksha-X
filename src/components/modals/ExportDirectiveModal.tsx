import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Printer,
  FileCode,
  Download,
  Copy,
  Check,
  Radio,
  Share2,
  Sparkles,
  ShieldCheck,
  Table,
} from 'lucide-react';
import { RelocationPlan } from '../../types';
import {
  downloadBlob,
  generatePlainTextOrder,
  generateWordDocument,
  generateCapXml,
  generateCsvManifest,
} from '../../utils/exportUtils';
import { ZyvenLogo } from '../common/ZyvenLogo';

interface ExportDirectiveModalProps {
  plan: RelocationPlan | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportDirectiveModal: React.FC<ExportDirectiveModalProps> = ({
  plan,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'word' | 'txt' | 'cap' | 'json' | 'csv'>('preview');
  const [copied, setCopied] = useState(false);
  const [checksum, setChecksum] = useState<string | null>(null);

  // Compute a real SHA-256 digest of the plan payload rather than displaying
  // a fixed, made-up "SHA256-V29A-OK" string as if it were a genuine
  // integrity check on an official directive document.
  useEffect(() => {
    if (!plan) {
      setChecksum(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = new TextEncoder().encode(JSON.stringify(plan));
        const digest = await crypto.subtle.digest('SHA-256', data);
        const hex = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        if (!cancelled) setChecksum(hex.slice(0, 16).toUpperCase());
      } catch {
        if (!cancelled) setChecksum(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan]);

  if (!isOpen || !plan) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadDoc = () => {
    const docHtml = generateWordDocument(plan);
    downloadBlob(docHtml, `SURAKSHA_Relocation_Order_${plan.id}.doc`, 'application/msword');
  };

  const handleDownloadTxt = () => {
    const txt = generatePlainTextOrder(plan);
    downloadBlob(txt, `SURAKSHA_Relocation_Order_${plan.id}.txt`, 'text/plain');
  };

  const handleDownloadCapXml = () => {
    const xml = generateCapXml(plan);
    downloadBlob(xml, `CAP_Alert_${plan.id}.xml`, 'application/xml');
  };

  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(plan, null, 2);
    downloadBlob(jsonStr, `SURAKSHA_Relocation_Plan_${plan.id}.json`, 'application/json');
  };

  const handleDownloadCsv = () => {
    const csv = generateCsvManifest(plan);
    downloadBlob(csv, `SURAKSHA_Relocation_Summary_${plan.id}.csv`, 'text/csv');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-paper border border-hairline rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-hairline flex items-center justify-between bg-surface">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-brand-soft border border-brand/30 text-brand">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-brand uppercase tracking-wider">
                  EXPORT RELOCATION DIRECTIVE
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-safe-soft text-safe border border-safe/30">
                  ADMIN AUTHORIZED
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold font-mono text-ink mt-0.5">
                Protocol #{plan.id} • {plan.zoneName}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-paper-alt transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector Bar */}
        <div className="px-4 py-2 bg-surface border-b border-hairline flex items-center gap-2 overflow-x-auto text-xs font-mono">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'preview'
                ? 'bg-brand text-white font-bold'
                : 'text-ink-soft hover:text-ink hover:bg-paper-alt'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF View</span>
          </button>

          <button
            onClick={() => setActiveTab('word')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'word'
                ? 'bg-brand text-white font-bold'
                : 'text-ink-soft hover:text-ink hover:bg-paper-alt'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Word Document (.DOC)</span>
          </button>

          <button
            onClick={() => setActiveTab('txt')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'txt'
                ? 'bg-brand text-white font-bold'
                : 'text-ink-soft hover:text-ink hover:bg-paper-alt'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Plain Text (.TXT)</span>
          </button>

          <button
            onClick={() => setActiveTab('cap')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'cap'
                ? 'bg-brand text-white font-bold'
                : 'text-ink-soft hover:text-ink hover:bg-paper-alt'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>CAP Protocol (.XML)</span>
          </button>

          <button
            onClick={() => setActiveTab('csv')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'csv'
                ? 'bg-brand text-white font-bold'
                : 'text-ink-soft hover:text-ink hover:bg-paper-alt'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Spreadsheet (.CSV)</span>
          </button>

          <button
            onClick={() => setActiveTab('json')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'json'
                ? 'bg-brand text-white font-bold'
                : 'text-ink-soft hover:text-ink hover:bg-paper-alt'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>JSON Telemetry</span>
          </button>
        </div>

        {/* Content Viewer Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {activeTab === 'preview' && (
            <div className="bg-white text-slate-900 rounded-lg p-6 sm:p-8 font-sans shadow-lg border border-slate-300">
              {/* Document Header */}
              <div className="border-b-2 border-red-600 pb-4 mb-6 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-red-700 uppercase tracking-widest">
                      DISASTER INCIDENT COMMAND DIRECTIVE
                    </span>
                    <span className="text-ink-soft">•</span>
                    <span className="text-xs font-mono text-ink-faint">ID: #{plan.id}</span>
                  </div>
                  <h1 className="text-2xl font-black text-slate-950 tracking-tight">
                    MANDATORY RELOCATION DIRECTIVE
                  </h1>
                  <p className="text-xs text-ink-faint font-mono mt-0.5">
                    Authorized under Admin Incident Command Section 44 • Emergency Response Act
                  </p>
                </div>
                <div className="text-right font-mono text-xs text-slate-700">
                  <div className="font-bold text-red-600">STATUS: AUTHORIZED</div>
                  <div className="text-[11px] text-ink-faint mt-1">{new Date().toLocaleString()}</div>
                </div>
              </div>

              {/* Grid Details */}
              <div className="grid grid-cols-2 gap-4 mb-6 text-xs">
                <div className="p-3 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-mono text-ink-faint uppercase block font-semibold">
                    1. AFFECTED ZONE
                  </span>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{plan.zoneName}</div>
                  <div className="text-ink-faint mt-1">
                    Total Population: <strong>{plan.totalPopulation.toLocaleString()}</strong>
                  </div>
                  <div className="text-red-600 font-bold mt-0.5">
                    Priority Vulnerable: {plan.vulnerablePopulation.toLocaleString()}
                  </div>
                </div>

                <div className="p-3 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-mono text-ink-faint uppercase block font-semibold">
                    2. TARGET SHELTER
                  </span>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{plan.recommendedShelter.name}</div>
                  <div className="text-ink-faint mt-1">{plan.recommendedShelter.location}</div>
                  <div className="text-emerald-700 font-bold mt-0.5">
                    Capacity: {plan.recommendedShelter.available} available / {plan.recommendedShelter.capacity} total
                  </div>
                </div>
              </div>

              {/* Route Details */}
              <div className="p-3 rounded bg-blue-50 border border-blue-200 text-xs mb-6">
                <span className="text-[10px] font-mono text-blue-700 uppercase block font-bold">
                  3. DESIGNATED EVACUATION ROUTE & ELEVATION
                </span>
                <div className="text-sm font-bold text-slate-900 mt-0.5">{plan.primaryRoute.destinationName}</div>
                <div className="flex gap-4 mt-1 text-slate-700 font-mono">
                  <span>Distance: <strong>{plan.primaryRoute.distanceKm} km</strong></span>
                  <span>Est Transit: <strong>{plan.primaryRoute.estimatedTimeMin} mins</strong></span>
                  <span>Safety Score: <strong className="text-blue-700">{plan.primaryRoute.safetyScore}/100</strong></span>
                  <span>Clearance: <strong>{plan.primaryRoute.elevationClearanceMeters}m</strong></span>
                </div>
                {plan.primaryRoute.id.startsWith('direct-') && (
                  <div className="mt-1.5 text-[11px] font-mono text-amber-700">
                    ⚠ Direct-line distance estimate — not a ground-vetted road corridor. Confirm via recon before dispatch.
                  </div>
                )}
              </div>

              {/* Operational Checklist */}
              <div className="space-y-2 mb-6 text-xs">
                <span className="text-[10px] font-mono text-ink-faint uppercase block font-bold">
                  4. MANDATORY PROTOCOL CHECKLIST
                </span>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded overflow-hidden">
                  {plan.checklist.map((item, idx) => (
                    <div key={item.id} className="p-2.5 flex items-center justify-between gap-3 bg-white">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-ink-soft font-bold text-[10px]">{idx + 1}.</span>
                        <span className="font-medium text-slate-800">{item.task}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-mono text-ink-faint block">{item.assignee}</span>
                        <span className={`text-[9px] font-mono font-bold ${item.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Signoff */}
              <div className="border-t border-slate-200 pt-4 flex items-center justify-between text-[11px] text-ink-faint font-mono">
                <div>AUTHENTICATED BY: Admin (Incident Commander Alpha)</div>
                <div>SURAKSHA-X PLATFORM • TEAM ZYVEN</div>
              </div>
            </div>
          )}

          {activeTab === 'word' && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-brand-soft border border-brand/30 text-xs text-brand flex items-center justify-between">
                <span>Generates a formatted Microsoft Word document (.doc) with complete tables and official seals.</span>
                <button
                  onClick={handleDownloadDoc}
                  className="px-3 py-1.5 rounded bg-brand hover:bg-brand/90 text-white font-mono text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .DOC</span>
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-surface border border-hairline font-mono text-xs text-ink-soft overflow-x-auto max-h-[360px]">
                {generateWordDocument(plan)}
              </pre>
            </div>
          )}

          {activeTab === 'txt' && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-surface border border-hairline text-xs text-ink-soft flex items-center justify-between">
                <span>Clean ASCII Bulletin for teletype, VHF radio transcripts, or low-bandwidth tactical channels.</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(generatePlainTextOrder(plan))}
                    className="px-3 py-1.5 rounded bg-paper-alt hover:bg-hairline text-ink font-mono text-xs flex items-center gap-1.5 border border-hairline"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-safe" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy Text'}</span>
                  </button>
                  <button
                    onClick={handleDownloadTxt}
                    className="px-3 py-1.5 rounded bg-brand hover:bg-brand/90 text-white font-mono text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .TXT</span>
                  </button>
                </div>
              </div>
              <pre className="p-4 rounded-lg bg-surface border border-hairline font-mono text-xs text-ink overflow-x-auto max-h-[360px] whitespace-pre-wrap leading-relaxed">
                {generatePlainTextOrder(plan)}
              </pre>
            </div>
          )}

          {activeTab === 'cap' && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-critical-soft border border-critical/30 text-xs text-critical flex items-center justify-between">
                <span>Standard OASIS Common Alerting Protocol v1.2 XML for National Disaster Management feeds.</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(generateCapXml(plan))}
                    className="px-3 py-1.5 rounded bg-paper-alt hover:bg-hairline text-ink font-mono text-xs flex items-center gap-1.5 border border-hairline"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-safe" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy XML'}</span>
                  </button>
                  <button
                    onClick={handleDownloadCapXml}
                    className="px-3 py-1.5 rounded bg-critical hover:bg-critical/90 text-white font-mono text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .XML</span>
                  </button>
                </div>
              </div>
              <pre className="p-4 rounded-lg bg-surface border border-hairline font-mono text-xs text-safe overflow-x-auto max-h-[360px]">
                {generateCapXml(plan)}
              </pre>
            </div>
          )}

          {activeTab === 'csv' && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-safe-soft border border-safe/30 text-xs text-safe flex items-center justify-between">
                <span>Tabular spreadsheet data for logistical teams, fleet transport matrices, and triage check-in desks.</span>
                <button
                  onClick={handleDownloadCsv}
                  className="px-3 py-1.5 rounded bg-safe hover:bg-safe/90 text-white font-mono text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .CSV</span>
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-surface border border-hairline font-mono text-xs text-ink-soft overflow-x-auto max-h-[360px]">
                {generateCsvManifest(plan)}
              </pre>
            </div>
          )}

          {activeTab === 'json' && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-purple-950/30 border border-purple-500/30 text-xs text-purple-300 flex items-center justify-between">
                <span>Full JSON payload schema for REST API sync and Supabase database ingestion.</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(JSON.stringify(plan, null, 2))}
                    className="px-3 py-1.5 rounded bg-paper-alt hover:bg-hairline text-ink font-mono text-xs flex items-center gap-1.5 border border-hairline"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-safe" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                  <button
                    onClick={handleDownloadJson}
                    className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-ink font-mono text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .JSON</span>
                  </button>
                </div>
              </div>
              <pre className="p-4 rounded-lg bg-surface border border-hairline font-mono text-xs text-purple-300 overflow-x-auto max-h-[360px]">
                {JSON.stringify(plan, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-hairline bg-surface flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-ink-soft">
            <ShieldCheck className="w-4 h-4 text-safe" />
            <span>SHA-256: {checksum ? `${checksum}…` : 'Computing…'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-lg bg-paper-alt hover:bg-hairline border border-hairline text-ink text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-4 h-4 text-safe" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={handleDownloadDoc}
              className="px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export Word (.DOC)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
