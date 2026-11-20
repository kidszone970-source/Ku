import React from 'react';
import { motion } from 'motion/react';
import { Box, Droplet, Flame, Sprout, Wheat } from 'lucide-react';
import { IngredientShare, MacroPercentageBreakdown } from '../utils/nutritionMath';

export type NutrientKind = 'carbs' | 'fats' | 'protein' | 'fiber' | 'sugar' | 'calories';

export const NUTRIENT_THEME: Record<
  NutrientKind,
  {
    label: string;
    color: string;
    textClass: string;
    bgSoftClass: string;
    barClass: string;
  }
> = {
  carbs: {
    label: 'Carbs',
    color: '#54A630',
    textClass: 'text-[#4B962A] dark:text-[#86E05C]',
    bgSoftClass: 'bg-[#EEF8E8] dark:bg-[#54A630]/15',
    barClass: 'bg-[#54A630] dark:bg-[#86E05C]',
  },
  fats: {
    label: 'Fats',
    color: '#E69718',
    textClass: 'text-[#D4880F] dark:text-[#FBBF24]',
    bgSoftClass: 'bg-[#FEF5E5] dark:bg-[#E69718]/15',
    barClass: 'bg-[#E69718] dark:bg-[#FBBF24]',
  },
  protein: {
    label: 'Protein',
    color: '#E5484D',
    textClass: 'text-[#DC3B40] dark:text-[#F87171]',
    bgSoftClass: 'bg-[#FDECEC] dark:bg-[#E5484D]/15',
    barClass: 'bg-[#E5484D] dark:bg-[#F87171]',
  },
  fiber: {
    label: 'Fiber',
    color: '#2E8B78',
    textClass: 'text-[#257968] dark:text-[#5EEAD4]',
    bgSoftClass: 'bg-[#E8F6F3] dark:bg-[#2E8B78]/15',
    barClass: 'bg-[#2E8B78] dark:bg-[#5EEAD4]',
  },
  sugar: {
    label: 'Sugar',
    color: '#D94670',
    textClass: 'text-[#C83B64] dark:text-[#FB7185]',
    bgSoftClass: 'bg-[#FCEBF0] dark:bg-[#D94670]/15',
    barClass: 'bg-[#D94670] dark:bg-[#FB7185]',
  },
  calories: {
    label: 'Calories',
    color: '#171715',
    textClass: 'text-[#171715] dark:text-[#F4F4F0]',
    bgSoftClass: 'bg-[#F4F4F0] dark:bg-white/10',
    barClass: 'bg-[#171715] dark:bg-[#A3F056]',
  },
};

export const NutrientIcon: React.FC<{
  kind: NutrientKind;
  className?: string;
}> = ({ kind, className = 'w-4 h-4' }) => {
  const theme = NUTRIENT_THEME[kind];
  if (kind === 'carbs') {
    return <Wheat className={`${className} ${theme.textClass} shrink-0`} aria-hidden="true" />;
  }
  if (kind === 'fats') {
    return (
      <Droplet
        className={`${className} ${theme.textClass} fill-current shrink-0`}
        aria-hidden="true"
      />
    );
  }
  if (kind === 'protein' || kind === 'sugar') {
    return <Box className={`${className} ${theme.textClass} shrink-0`} aria-hidden="true" />;
  }
  if (kind === 'fiber') {
    return <Sprout className={`${className} ${theme.textClass} shrink-0`} aria-hidden="true" />;
  }
  return <Flame className={`${className} ${theme.textClass} shrink-0`} aria-hidden="true" />;
};

/**
 * Clean inline macro readout matching the reference's color-coded ingredient rows
 * (Green Wheat Carbs · Amber Droplet Fats · Coral Cube Protein).
 */
export const InlineMacroRow: React.FC<{
  carbs: number;
  fat: number;
  protein: number;
  fiber?: number;
  compact?: boolean;
}> = ({ carbs, fat, protein, fiber, compact = false }) => {
  const textSize = compact ? 'text-xs' : 'text-[13px]';
  const iconSize = 'w-3.5 h-3.5';

  return (
    <div className={`flex flex-wrap items-center gap-x-3.5 gap-y-1 font-mono tabular-nums ${textSize}`}>
      <span className="inline-flex items-center gap-1 text-[#171715] dark:text-[#E8E8E2]">
        <NutrientIcon kind="carbs" className={iconSize} />
        <span className="font-bold">{carbs}g</span>
        <span className="text-[#787872] dark:text-[#9C9C94] font-sans font-medium">C</span>
      </span>
      <span className="inline-flex items-center gap-1 text-[#171715] dark:text-[#E8E8E2]">
        <NutrientIcon kind="fats" className={iconSize} />
        <span className="font-bold">{fat}g</span>
        <span className="text-[#787872] dark:text-[#9C9C94] font-sans font-medium">F</span>
      </span>
      <span className="inline-flex items-center gap-1 text-[#171715] dark:text-[#E8E8E2]">
        <NutrientIcon kind="protein" className={iconSize} />
        <span className="font-bold">{protein}g</span>
        <span className="text-[#787872] dark:text-[#9C9C94] font-sans font-medium">P</span>
      </span>
      {fiber !== undefined && fiber > 0 && !compact && (
        <span className="inline-flex items-center gap-1 text-[#171715] dark:text-[#E8E8E2]">
          <NutrientIcon kind="fiber" className={iconSize} />
          <span className="font-bold">{fiber}g</span>
          <span className="text-[#787872] dark:text-[#9C9C94] font-sans font-medium">Fib</span>
        </span>
      )}
    </div>
  );
};

/**
 * Three pure-white rounded nutrient percentage cards matching the reference scan summary
 * (Green Carbs %, Amber Fats %, Coral Protein %).
 */
export const MacroPercentageTiles: React.FC<{
  percentages: MacroPercentageBreakdown;
  grams?: { carbs: number; fat: number; protein: number };
}> = ({ percentages, grams }) => {
  const tiles: {
    kind: NutrientKind;
    pct: number;
    gramsVal?: number;
    label: string;
  }[] = [
    { kind: 'carbs', pct: percentages.carbsPct, gramsVal: grams?.carbs, label: 'Carbs' },
    { kind: 'fats', pct: percentages.fatsPct, gramsVal: grams?.fat, label: 'Fats' },
    { kind: 'protein', pct: percentages.proteinPct, gramsVal: grams?.protein, label: 'Protein' },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((tile, idx) => (
        <motion.div
          key={tile.kind}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, delay: idx * 0.06 }}
          className="bg-white dark:bg-[#1B1C19] rounded-2xl p-3.5 text-center card-soft border border-black/[0.04] dark:border-white/10 flex flex-col items-center justify-center gap-1.5"
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${NUTRIENT_THEME[tile.kind].bgSoftClass}`}>
            <NutrientIcon kind={tile.kind} className="w-4 h-4" />
          </div>
          <p className="text-lg font-extrabold font-mono tabular-nums text-[#171715] dark:text-[#F4F4F0] leading-none">
            {tile.pct.toFixed(1)}%
          </p>
          <p className="text-xs font-medium text-[#787872] dark:text-[#A1A19A]">
            {tile.label}
            {grams ? ` · ${tile.gramsVal}g` : ''}
          </p>
        </motion.div>
      ))}
    </div>
  );
};

/**
 * Signature Radial Petal Ingredient Breakdown matching the right panel of the reference screenshot:
 * A central circular meal emblem/photo surrounded by luminous white petals tinted with soft
 * lime-to-amber inner radial glows, each showing the ingredient's exact % share & name.
 */
export const RadialPetalChart: React.FC<{
  shares: IngredientShare[];
  centerImageUrl?: string | null;
  dishTitle: string;
  totalGrams: number;
}> = ({ shares, centerImageUrl, dishTitle, totalGrams }) => {
  const petals = shares.slice(0, 6);
  const count = Math.max(1, petals.length);

  // Compute radial coordinates around a 360x360 SVG canvas (center 180,180)
  // with generous radius so petals and labels never collide with the center medallion
  const cx = 180;
  const cy = 180;
  const petalRadius = count <= 3 ? 96 : 108;

  const petalGlows = [
    ['#A7F059', '#FBD38D'],
    ['#FBD38D', '#A7F059'],
    ['#9AE647', '#F6AD55'],
    ['#F6E05E', '#84CC16'],
    ['#A3F056', '#FBD38D'],
    ['#FCD34D', '#9AE647'],
  ];

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className="relative w-full max-w-[360px] aspect-square flex items-center justify-center">
        <svg
          viewBox="0 0 360 360"
          className="w-full h-full overflow-visible"
          role="img"
          aria-label={`Ingredient composition breakdown for ${dishTitle}`}
        >
          <defs>
            {petals.map((_, idx) => {
              const [c1, c2] = petalGlows[idx % petalGlows.length];
              return (
                <radialGradient
                  key={`grad-${idx}`}
                  id={`petal-glow-${idx}`}
                  cx="50%"
                  cy="80%"
                  r="72%"
                >
                  <stop offset="0%" stopColor={c1} stopOpacity="0.6" />
                  <stop offset="50%" stopColor={c2} stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                </radialGradient>
              );
            })}
            <filter id="petal-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#171715" floodOpacity="0.06" />
            </filter>
          </defs>

          {petals.map((item, idx) => {
            const angleDeg = (idx * 360) / count - 90;
            const angleRad = (angleDeg * Math.PI) / 180;
            const px = cx + Math.cos(angleRad) * petalRadius;
            const py = cy + Math.sin(angleRad) * petalRadius;
            const shortName =
              item.name.length > 12 ? `${item.name.slice(0, 11).trim()}…` : item.name;

            return (
              <motion.g
                key={`${item.name}-${idx}`}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 24,
                  delay: idx * 0.06,
                }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              >
                {/* Soft White Petal */}
                <g transform={`translate(${px}, ${py})`} filter="url(#petal-shadow)">
                  <rect
                    x={-52}
                    y={-38}
                    width={104}
                    height={76}
                    rx={32}
                    className="fill-white dark:fill-[#22241F]"
                  />
                  {/* Luminous Organic Lime/Amber Inner Glow */}
                  <rect
                    x={-52}
                    y={-38}
                    width={104}
                    height={76}
                    rx={32}
                    fill={`url(#petal-glow-${idx})`}
                    transform={`rotate(${angleDeg + 90})`}
                  />
                  <text
                    x="0"
                    y="-4"
                    textAnchor="middle"
                    className="fill-[#171715] dark:fill-[#F4F4F0] text-[15px] font-extrabold font-mono"
                  >
                    {item.percent}%
                  </text>
                  <text
                    x="0"
                    y="16"
                    textAnchor="middle"
                    className="fill-[#64645E] dark:fill-[#B6B6AE] text-[12px] font-semibold"
                  >
                    {shortName}
                  </text>
                </g>
              </motion.g>
            );
          })}
        </svg>

        {/* Center Dish Medallion */}
        <motion.div
          initial={{ scale: 0.75, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          className="absolute w-18 h-18 rounded-full bg-white dark:bg-[#1B1C19] p-1 shadow-lg border border-black/5 dark:border-white/10 flex items-center justify-center overflow-hidden"
        >
          {centerImageUrl ? (
            <img
              src={centerImageUrl}
              alt={dishTitle}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <div className="w-full h-full rounded-full bg-gradient-to-br from-[#A3F056] to-[#54A630] flex flex-col items-center justify-center text-[#171715]">
              <span className="text-xs font-extrabold font-mono tabular-nums leading-none">
                {totalGrams}g
              </span>
              <span className="text-[10px] font-bold mt-0.5">Total</span>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
