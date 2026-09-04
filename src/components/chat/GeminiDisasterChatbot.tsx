import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  X,
  Minimize2,
  Maximize2,
  Printer,
  RefreshCw,
  HelpCircle,
  ShieldAlert,
  MapPin,
  Building2,
  Route,
  AlertTriangle,
  ChevronRight,
  MessageSquare,
  Radio,
  GripHorizontal,
  RotateCcw,
} from 'lucide-react';
import { useDisaster } from '../../context/DisasterContext';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isOrder?: boolean;
  orderData?: any;
}

export const GeminiDisasterChatbot: React.FC = () => {
  const {
    selectedZone,
    selectedShelter,
    selectedRoute,
    activePlan,
    blockedRoads,
    riskZones,
    reliefCentres,
    demographics,
    unreadAlertsCount,
    mapLayers,
    printOrder,
    addToast,
    setActivePage,
    scenarioMeta,
  } = useDisaster();

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // The backend tells us per-response whether Gemini actually answered or
  // the local tactical fallback engine did (e.g. no GEMINI_API_KEY configured)
  // — track it so the header badge never claims "Gemini" when it isn't.
  const [aiEngine, setAiEngine] = useState<'gemini' | 'fallback' | 'unknown'>('unknown');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatbotWindowRef = useRef<HTMLDivElement>(null);

  // Draggable window state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
  });

  const buildWelcomeMessage = (): ChatMessage => ({
    id: `msg-welcome-${scenarioMeta.id}`,
    role: 'assistant',
    content: `### 🛡️ SURAKSHA-X AI COPILOT INITIALIZED
I am your context-aware **Disaster Intelligence & Relocation Assistant**.

I have synchronized with live telemetry for **${scenarioMeta.name}** — ${selectedZone ? `focused on **${selectedZone.name}**` : `${scenarioMeta.region}, ${scenarioMeta.state}`}:
- **Hazard Level:** ${selectedZone ? `+${selectedZone.floodDepthEstMeters}m intensity • Risk Score: ${selectedZone.riskScore}/100 (${selectedZone.priority})` : `${scenarioMeta.category}`}
- **Recommended Facility:** ${selectedShelter?.name || 'Assessing available shelters'} ${selectedShelter ? `(${selectedShelter.available} beds free)` : ''}
- **Primary Transit Corridor:** ${selectedRoute?.destinationName || 'Calculating safe corridor'} ${selectedRoute ? `(${selectedRoute.safetyScore}% Safety)` : ''}

Ask me for real-time hazard assessments, safe rerouting around hazards, or click below to generate an **Official Relocation Order**.`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isOrder: true,
    orderData: {
      orderId: `PLAN-${scenarioMeta.id}`,
      directive: 'MANDATORY IMMEDIATE DISASTER RELOCATION ORDER',
      targetZone: selectedZone?.name || scenarioMeta.region,
      targetShelter: selectedShelter?.name || 'Nearest Available Relief Centre',
      priorityCitizensCount: selectedZone?.vulnerablePopulation || 0,
      authorizedBy: 'Admin / Incident Commander Alpha',
      timestamp: new Date().toISOString(),
    },
  });

  const [messages, setMessages] = useState<ChatMessage[]>([buildWelcomeMessage()]);

  useEffect(() => {
    setMessages([buildWelcomeMessage()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioMeta.id]);

  // selectedZone/Shelter/Route often resolve to their defaults a moment
  // after this component mounts, which can leave the greeting permanently
  // stuck on "Assessing available shelters" even once the rest of the app
  // shows a real recommendation. Refresh the greeting's snapshot as that
  // data arrives — but only while it's still the sole, untouched message,
  // so an in-progress conversation is never wiped out from under the user.
  useEffect(() => {
    setMessages((prev) => (prev.length === 1 && prev[0].role === 'assistant' ? [buildWelcomeMessage()] : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZone?.id, selectedShelter?.id, selectedRoute?.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Initial default placement (bottom right)
  useEffect(() => {
    if (typeof window !== 'undefined' && !position) {
      const defaultWidth = 460;
      const defaultHeight = 580;
      const defaultX = Math.max(16, window.innerWidth - defaultWidth - 24);
      const defaultY = Math.max(16, window.innerHeight - defaultHeight - 24);
      setPosition({ x: defaultX, y: defaultY });
    }
  }, [position]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isExpanded) return; // Don't drag while in fullscreen/expanded mode
    // Don't drag if clicked on button or input
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;

    setIsDragging(true);
    const currentX = position?.x || window.innerWidth - 480;
    const currentY = position?.y || window.innerHeight - 600;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: currentX,
      posY: currentY,
    };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isExpanded) return;
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;

    const touch = e.touches[0];
    setIsDragging(true);
    const currentX = position?.x || window.innerWidth - 480;
    const currentY = position?.y || window.innerHeight - 600;
    dragStartRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      posX: currentX,
      posY: currentY,
    };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;

      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const chatWidth = Math.min(460, windowWidth - 32);
      const chatHeight = Math.min(580, windowHeight - 32);

      const newX = Math.max(8, Math.min(windowWidth - chatWidth - 8, dragStartRef.current.posX + dx));
      const newY = Math.max(8, Math.min(windowHeight - chatHeight - 8, dragStartRef.current.posY + dy));

      setPosition({ x: newX, y: newY });
    },
    [isDragging]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartRef.current.startX;
      const dy = touch.clientY - dragStartRef.current.startY;

      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const chatWidth = Math.min(460, windowWidth - 32);
      const chatHeight = Math.min(580, windowHeight - 32);

      const newX = Math.max(8, Math.min(windowWidth - chatWidth - 8, dragStartRef.current.posX + dx));
      const newY = Math.max(8, Math.min(windowHeight - chatHeight - 8, dragStartRef.current.posY + dy));

      setPosition({ x: newX, y: newY });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleTouchMove, handleMouseUp]);

  const resetPosition = () => {
    if (typeof window !== 'undefined') {
      const defaultWidth = 460;
      const defaultHeight = 580;
      setPosition({
        x: Math.max(16, window.innerWidth - defaultWidth - 24),
        y: Math.max(16, window.innerHeight - defaultHeight - 24),
      });
      setIsExpanded(false);
      addToast('info', 'Chatbot Position Reset', 'SURAKSHA-X AI docked to bottom-right corner.');
    }
  };

  const quickPrompts = [
    '📋 Generate Relocation Order for active zone',
    `🗺️ What is the safest evacuation route to ${selectedShelter?.code || 'the recommended shelter'}?`,
    '⛔ What roads are blocked or unsafe right now?',
    `👥 Vulnerability breakdown for ${selectedZone?.name.split(' (')[0] || 'the active zone'}`,
    '🏥 Check relief shelter bed capacities',
  ];

  const handleSendMessage = async (textToSend?: string) => {
    const queryText = textToSend || inputValue;
    if (!queryText.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryText,
          context: {
            scenarioMeta,
            demographics,
            selectedZone,
            selectedShelter,
            selectedRoute,
            activePlan,
            blockedRoadsCount: blockedRoads.length,
            blockedRoadsDetail: blockedRoads.map((b) => ({
              name: b.name,
              severity: b.severity,
              reason: b.reason,
            })),
            riskZonesSummary: riskZones.map((z) => ({
              id: z.id,
              name: z.name,
              score: z.riskScore,
              priority: z.priority,
              vulnerablePopulation: z.vulnerablePopulation,
              floodDepthEstMeters: z.floodDepthEstMeters,
            })),
            reliefCentresSummary: reliefCentres.map((s) => ({
              code: s.code,
              name: s.name,
              capacity: s.capacity,
              occupancy: s.occupancy,
              available: s.available,
              status: s.status,
            })),
          },
          conversationHistory: messages.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      const replyText = data.reply || 'Decision support intelligence synchronized with field command.';
      setAiEngine(typeof data.model === 'string' && data.model.startsWith('gemini') ? 'gemini' : 'fallback');

      const isOrderOutput =
        replyText.includes('OPERATIONAL RELOCATION DIRECTIVE') ||
        replyText.includes('MANDATORY RELOCATION') ||
        replyText.toLowerCase().includes('order id');

      const botMsg: ChatMessage = {
        id: `msg-bot-${Date.now()}`,
        role: 'assistant',
        content: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isOrder: isOrderOutput,
        orderData: isOrderOutput
          ? {
              orderId: activePlan?.id || `ORDER-${Date.now().toString().slice(-6)}`,
              directive: 'OPERATIONAL RELOCATION DIRECTIVE',
              targetZone: selectedZone?.name || scenarioMeta.region,
              targetShelter: selectedShelter?.name || 'Nearest Available Relief Centre',
              priorityCitizensCount: selectedZone?.vulnerablePopulation || 0,
              authorizedBy: 'Admin / Incident Commander Alpha',
              timestamp: new Date().toISOString(),
            }
          : undefined,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      console.warn('[Chat Error]:', err);
      setAiEngine('fallback');
      // Resilience fallback response
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-bot-fallback-${Date.now()}`,
          role: 'assistant',
          content: `### 🛡️ SURAKSHA-X TACTICAL DIRECTIVE (${selectedZone?.name || scenarioMeta.region})
**Status:** Authorized under Admin Emergency Response Section 44
**Current Risk Score:** ${selectedZone?.riskScore || '—'}/100 [CRITICAL PRIORITY]
**Recommended Shelter:** ${selectedShelter?.name || 'Nearest Available Relief Centre'} (${selectedShelter?.available ?? '—'} available beds)
**Safe Corridor:** ${selectedRoute?.destinationName || 'Primary corridor'} (Elevation Clearance: ${selectedRoute?.elevationClearanceMeters ?? '—'}m, ${selectedRoute?.safetyScore ?? '—'}% safety rating)

**Action Directive:**
1. Mobilize priority buses for ${selectedZone?.vulnerablePopulation ?? 0} elderly and mobility-assisted residents.
2. Route convoy through the recommended corridor, avoiding known blocked roads.
3. Reception triage at ${selectedShelter?.name || 'the assigned relief centre'} standing by.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isOrder: true,
          orderData: {
            orderId: activePlan?.id || `ORDER-${Date.now().toString().slice(-6)}`,
            directive: 'EMERGENCY RELOCATION DIRECTIVE',
            targetZone: selectedZone?.name || scenarioMeta.region,
            targetShelter: selectedShelter?.name || 'Nearest Available Relief Centre',
            priorityCitizensCount: selectedZone?.vulnerablePopulation || 0,
            authorizedBy: 'Admin',
            timestamp: new Date().toISOString(),
          },
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOrderClick = (orderData?: any) => {
    printOrder(orderData);
  };

  const windowStyle: React.CSSProperties = isExpanded
    ? {}
    : position
    ? {
        left: `${position.x}px`,
        top: `${position.y}px`,
        bottom: 'auto',
        right: 'auto',
      }
    : {
        bottom: '1.5rem',
        right: '1.5rem',
      };

  return (
    <>
      {/* FLOATING TRIGGER BUTTON (Bottom Right) */}
      {!isOpen && (
        <button
          id="gemini-chatbot-trigger"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-[999] flex items-center gap-2.5 px-4 py-3 rounded-full bg-brand text-white font-mono font-bold shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          <div className="relative">
            <Bot className="w-5 h-5 text-white" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-safe rounded-full animate-ping"></span>
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-safe rounded-full"></span>
          </div>
          <div className="text-left text-xs leading-none">
            <div className="font-bold flex items-center gap-1">
              <span>SURAKSHA-X AI</span>
              <Sparkles className="w-3 h-3 text-white/80" />
            </div>
            <div className="text-[10px] text-white/80 font-sans font-normal mt-0.5">
              Gemini Disaster Intel
            </div>
          </div>
        </button>
      )}

      {/* DRAGGABLE CHATBOT WINDOW */}
      {isOpen && (
        <div
          ref={chatbotWindowRef}
          id="gemini-chatbot-window"
          style={windowStyle}
          className={`fixed z-[1001] bg-surface border border-hairline rounded-xl shadow-xl flex flex-col font-mono text-ink select-none ${
            isExpanded
              ? 'inset-4 sm:inset-8 w-auto h-auto'
              : 'w-[calc(100vw-2rem)] sm:w-[460px] h-[580px] max-h-[calc(100vh-2rem)]'
          } ${isDragging ? 'opacity-95 ring-2 ring-brand cursor-grabbing shadow-xl' : ''}`}
        >
          {/* Draggable Header Bar */}
          <div
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            className={`flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface rounded-t-xl cursor-grab active:cursor-grabbing select-none touch-none ${
              isDragging ? 'bg-paper-alt ring-1 ring-brand/50' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 pointer-events-none">
              <div className="p-1.5 rounded-lg bg-brand text-white shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-bold text-xs text-ink">
                  <span>SURAKSHA-X AI</span>
                  {aiEngine === 'gemini' && (
                    <span className="px-1.5 py-0.2 rounded bg-safe-soft border border-safe/30 text-safe text-[9px]">
                      Gemini Live
                    </span>
                  )}
                  {aiEngine === 'fallback' && (
                    <span className="px-1.5 py-0.2 rounded bg-warn-soft border border-warn/30 text-warn text-[9px]" title="Gemini API unavailable — answering from the local tactical intelligence engine using live scenario data">
                      Tactical Engine
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-ink-soft flex items-center gap-1 font-sans">
                  <GripHorizontal className="w-3 h-3 text-ink-soft" />
                  <span>Drag header to reposition</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-ink-soft pointer-events-auto">
              <button
                onClick={resetPosition}
                className="p-1.5 rounded hover:bg-paper-alt hover:text-ink transition-colors"
                title="Reset Position to Bottom-Right"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded hover:bg-paper-alt hover:text-ink transition-colors"
                title={isExpanded ? 'Restore Size' : 'Expand Fullscreen'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded hover:bg-paper-alt hover:text-ink transition-colors"
                title="Close Chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Context Telemetry Bar */}
          <div className="px-3.5 py-1.5 bg-surface border-b border-hairline text-[11px] text-ink-soft flex flex-wrap items-center justify-between gap-1 select-text">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-critical shrink-0" />
              <span className="text-ink-soft">Zone:</span>
              <span className="text-ink font-bold">{selectedZone?.name || '—'}</span>
              <span className="text-critical font-bold">({selectedZone?.riskScore ?? '—'} Risk)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3 h-3 text-safe shrink-0" />
              <span className="text-ink-soft">Shelter:</span>
              <span className="text-safe font-bold">{selectedShelter?.code || '—'} ({selectedShelter?.available ?? '—'} free)</span>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 text-xs select-text">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="text-[10px] text-ink-soft mb-1 px-1 font-mono">
                  {msg.role === 'user' ? 'Incident Commander (You)' : 'SURAKSHA-X AI'} • {msg.timestamp}
                </div>

                <div
                  className={`p-3 rounded-lg max-w-[92%] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-brand text-white rounded-tr-none shadow-md'
                      : 'bg-surface border border-hairline text-ink rounded-tl-none shadow-lg'
                  }`}
                >
                  <div className="whitespace-pre-wrap font-sans text-xs space-y-1.5 leading-relaxed">
                    {msg.content}
                  </div>

                  {/* Print Order Button in chat whenever order is shown */}
                  {msg.isOrder && (
                    <div className="mt-3 pt-2.5 border-t border-hairline flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] text-warn font-mono font-semibold flex items-center gap-1">
                        <Radio className="w-3 h-3 animate-pulse text-warn" />
                        <span>Official Directive Ready for Dispatch</span>
                      </div>
                      <button
                        onClick={() => handleOrderClick(msg.orderData)}
                        className="px-3 py-1.5 rounded bg-safe hover:bg-safe/90 text-white font-mono font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Relocation Order</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-surface border border-hairline text-ink-soft max-w-xs animate-pulse">
                <Bot className="w-4 h-4 text-brand" />
                <span className="text-xs">Analyzing telemetry & formulating directive...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="p-2 border-t border-hairline bg-surface">
            <div className="text-[9px] uppercase tracking-wider text-ink-soft font-semibold mb-1 px-1">
              Suggested Tactical Inquiries:
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {quickPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt)}
                  disabled={isLoading}
                  className="px-2 py-1 rounded bg-surface hover:bg-paper-alt border border-hairline hover:border-brand text-[11px] text-ink-soft hover:text-ink whitespace-nowrap transition-colors cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Input Box */}
          <div className="p-3 border-t border-hairline bg-paper rounded-b-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask SURAKSHA-X AI about evacuation, routes, orders..."
                disabled={isLoading}
                className="flex-1 bg-surface border border-hairline focus:border-brand rounded-lg px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                className="p-2 rounded-lg bg-brand hover:bg-brand/90 disabled:opacity-50 text-white transition-colors cursor-pointer"
                title="Send Inquiry"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
