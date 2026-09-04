import React from 'react';
import { X, Navigation, ShieldCheck, MapPin, AlertCircle, Printer, Download } from 'lucide-react';
import { useDisaster } from '../../context/DisasterContext';
import { Badge } from '../common/Badge';

interface TurnByTurnModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TurnByTurnModal: React.FC<TurnByTurnModalProps> = ({ isOpen, onClose }) => {
  const { selectedRoute, selectedZone, selectedShelter } = useDisaster();

  if (!isOpen || !selectedRoute) return null;

  // Routes synthesized as a straight-line distance estimate (no authored
  // corridor exists) were never actually vetted by anyone — see the matching
  // disclaimer on the citizen evacuation route view.
  const isDirectEstimate = selectedRoute.id.startsWith('direct-');

  // Match the score's actual safety level instead of always showing green.
  const safetyTextColor =
    selectedRoute.safetyLevel === 'HIGH'
      ? 'text-safe'
      : selectedRoute.safetyLevel === 'MODERATE'
      ? 'text-warn'
      : 'text-critical';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inset backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl bg-surface border border-hairline rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-hairline bg-paper flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded bg-safe-soft border border-safe/30 text-safe">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono text-ink">
                Turn-by-Turn Evacuation Route
              </h3>
              <div className="text-xs font-mono text-ink-soft">
                {selectedRoute.originName} → {selectedRoute.destinationName}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded text-ink-soft hover:text-ink hover:bg-paper-alt"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Route Highlights Bar */}
        <div className="grid grid-cols-4 gap-2 p-3 bg-inset border-b border-hairline text-center font-mono text-xs">
          <div>
            <span className="text-ink-faint text-[10px] block">TOTAL DISTANCE</span>
            <span className="text-ink font-bold text-sm">{selectedRoute.distanceKm} km</span>
          </div>
          <div>
            <span className="text-ink-faint text-[10px] block">EST. TIME</span>
            <span className="text-ink font-bold text-sm">{selectedRoute.estimatedTimeMin} min</span>
          </div>
          <div>
            <span className="text-ink-faint text-[10px] block">SAFETY SCORE</span>
            <span className={`${safetyTextColor} font-bold text-sm`}>
              {selectedRoute.safetyScore}/100
            </span>
          </div>
          <div>
            <span className="text-ink-faint text-[10px] block">ELEVATION GAIN</span>
            <span className="text-brand font-bold text-sm">
              +{selectedRoute.elevationClearanceMeters}m
            </span>
          </div>
        </div>

        {/* Steps List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {selectedRoute.turnByTurn.map((step) => {
            const conditionColors = {
              CLEAR: 'text-safe bg-safe-soft border-safe/30',
              WATERLOGGED_PASSABLE: 'text-warn bg-warn-soft border-warn/30',
              CONGESTED: 'text-warn bg-warn-soft border-warn/30',
            };

            return (
              <div
                key={step.step}
                className="p-3.5 rounded-lg bg-inset border border-hairline flex items-start gap-3.5"
              >
                <div className="w-6 h-6 rounded-full bg-paper-alt border border-hairline flex items-center justify-center text-xs font-mono font-bold text-ink-soft shrink-0">
                  {step.step}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-sans text-ink leading-relaxed font-medium">
                    {step.instruction}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-ink-soft">
                      Leg: {step.distance}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-2 py-0.5 rounded border uppercase ${
                        conditionColors[step.roadCondition]
                      }`}
                    >
                      {step.roadCondition.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-hairline bg-paper flex items-center justify-between">
          <span className="text-xs font-mono text-ink-faint flex items-center gap-1.5">
            {isDirectEstimate ? (
              <>
                <AlertCircle className="w-4 h-4 text-warn" />
                <span>Direct-line estimate — not a ground-vetted corridor</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-safe" />
                <span>Route vetted by Admin Ground Recon Team</span>
              </>
            )}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded bg-paper-alt hover:bg-paper-alt text-ink text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Manifest</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-brand hover:bg-brand/90 text-white text-xs font-mono font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
