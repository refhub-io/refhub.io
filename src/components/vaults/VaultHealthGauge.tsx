import { CheckCircle2, AlertTriangle, AlertOctagon, type LucideIcon } from 'lucide-react';
import { getVaultHealthStatus, VaultHealthStatusLevel } from '@/lib/vaultHealthCheck';

interface VaultHealthGaugeProps {
  scorePercent: number;
  completeCount: number;
  totalCount: number;
}

/**
 * Status colors, not a categorical/sequential ramp — exactly one is shown at
 * a time (the current score's level), so simultaneous colorblind-separation
 * checks don't apply here the way they would for a legend. State is never
 * color-alone regardless: every level ships with an icon + text label.
 */
const STATUS_COLOR: Record<VaultHealthStatusLevel, string> = {
  good: 'hsl(var(--accent))',
  warning: 'hsl(var(--sunset-orange))',
  critical: 'hsl(var(--destructive))',
};

const STATUS_ICON: Record<VaultHealthStatusLevel, LucideIcon> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  critical: AlertOctagon,
};

const CX = 100;
const CY = 100;
const RADIUS = 80;
const STROKE_WIDTH = 14;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy - r * Math.sin(angleRad) };
}

/** Arc from startAngle to endAngle, both in degrees, 180 = left, 90 = top, 0 = right. */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = startAngle - endAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

/**
 * Semicircular arc meter summarizing vault health as a single completeness
 * score. Deliberately a single-color fill (severity of the current score)
 * against a neutral track, not a simultaneous multi-band rainbow — a 3-4
 * band version was validated with the dataviz skill's palette checker and
 * failed colorblind-separation (red/orange/green sit in the classic
 * red-green confusion region). See `references/marks-and-anatomy.md`'s
 * Meter spec: "the fill carries severity... unfilled track is a lighter
 * step of the same ramp."
 */
export function VaultHealthGauge({ scorePercent, completeCount, totalCount }: VaultHealthGaugeProps) {
  const clamped = Math.max(0, Math.min(100, scorePercent));
  const status = getVaultHealthStatus(clamped);
  const color = STATUS_COLOR[status.level];
  const Icon = STATUS_ICON[status.level];

  const fillEndAngle = 180 - (clamped / 100) * 180;
  const needleLength = RADIUS - STROKE_WIDTH / 2 - 6;
  const needleTip = polarToCartesian(CX, CY, needleLength, fillEndAngle);

  return (
    <div className="flex flex-col items-center gap-1.5 py-2" data-testid="vault-health-gauge">
      <div className="w-full max-w-[220px]">
        <svg viewBox="0 0 200 108" className="w-full" role="img" aria-label={`vault health score ${clamped} percent, ${status.label}`}>
          <path
            d={describeArc(CX, CY, RADIUS, 180, 0)}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />
          {clamped > 0 && (
            <path
              d={describeArc(CX, CY, RADIUS, 180, fillEndAngle)}
              fill="none"
              stroke={color}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
            />
          )}
          <line
            x1={CX}
            y1={CY}
            x2={needleTip.x}
            y2={needleTip.y}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle cx={CX} cy={CY} r={6} fill={color} />
          <text
            x={CX}
            y={CY - 22}
            textAnchor="middle"
            className="fill-foreground font-bold"
            style={{ fontSize: '28px' }}
          >
            {clamped}%
          </text>
        </svg>
      </div>
      <div className="flex items-center gap-1.5 font-mono text-xs font-semibold" style={{ color }}>
        <Icon className="w-3.5 h-3.5" />
        <span>{status.label}</span>
      </div>
      <p className="text-xs text-muted-foreground font-mono">
        {completeCount}_of_{totalCount}_papers_complete
      </p>
    </div>
  );
}
