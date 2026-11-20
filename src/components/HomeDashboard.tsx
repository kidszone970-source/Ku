import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Flame,
  Info,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  ActiveTab,
  CoachRecommendation,
  FoodEntry,
  UserProfile,
} from '../types/nutrition';
import {
  computeConsistencyStreak,
  computeMacroPercentages,
  formatLocalDate,
  GOAL_LABELS,
  MealType,
  NutritionTargetsResult,
  scaleNutritionByQuantity,
  summarizeDayEntries,
} from '../utils/nutritionMath';
import { fetchCoachInsights } from '../services/aiClient';
import { searchVerifiedFoods, VerifiedFoodItem } from '../data/foodDatabase';
import {
  InlineMacroRow,
  NUTRIENT_THEME,
  NutrientIcon,
  NutrientKind,
} from './NutrientVisuals';

interface HomeDashboardProps {
  profile: UserProfile;
  targets: NutritionTargetsResult;
  foodEntries: FoodEntry[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onQuickAdd: (mealType: MealType) => void;
  onQuickLogEntry?: (
    entry: Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onEditEntry: (entry: FoodEntry) => void;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onNavigate: (tab: ActiveTab) => void;
  onRequestDietPlan?: () => void;
}

const MEAL_SECTIONS: { key: MealType; label: string; hint: string }[] = [
  { key: 'breakfast', label: 'Breakfast', hint: 'Morning fuel & steady energy' },
  { key: 'lunch', label: 'Lunch', hint: 'Midday protein & complex carbs' },
  { key: 'dinner', label: 'Dinner', hint: 'Evening nourishment & recovery' },
  { key: 'snacks', label: 'Snacks', hint: 'Between-meal bites & hydration' },
];

function guessDefaultMealType(): MealType {
  const hr = new Date().getHours();
  if (hr < 11) return 'breakfast';
  if (hr < 15) return 'lunch';
  if (hr < 21) return 'dinner';
  return 'snacks';
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  profile,
  targets,
  foodEntries,
  selectedDate,
  onSelectDate,
  onQuickAdd,
  onQuickLogEntry,
  onEditEntry,
  onDeleteEntry,
  onNavigate,
  onRequestDietPlan,
}) => {
  const [insights, setInsights] = useState<CoachRecommendation | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [showMetabolicDetails, setShowMetabolicDetails] = useState(false);

  // Reference-inspired quick food search bar
  const [quickQuery, setQuickQuery] = useState('');
  const [quickLoggedNotice, setQuickLoggedNotice] = useState<string | null>(null);

  const quickSearchResults = useMemo(() => {
    if (!quickQuery.trim()) return [];
    return searchVerifiedFoods(quickQuery).slice(0, 6);
  }, [quickQuery]);

  const daySummary = useMemo(
    () => summarizeDayEntries(foodEntries, selectedDate),
    [foodEntries, selectedDate]
  );

  // Recent scans / logged meals for the horizontal reference carousel
  const recentMeals = useMemo(() => {
    return foodEntries.slice(0, 6);
  }, [foodEntries]);

  // Deterministic consecutive-day logging streak & 7-day activity cadence
  const consistencyStreak = useMemo(
    () => computeConsistencyStreak(foodEntries),
    [foodEntries]
  );

  const remainingCalories = targets.targetCalories - daySummary.calories;
  const caloriePct = Math.min(
    100,
    Math.round((daySummary.calories / Math.max(1, targets.targetCalories)) * 100)
  );

  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (caloriePct / 100) * circumference;

  const shiftDate = (days: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    onSelectDate(formatLocalDate(dt));
  };

  const todayStr = formatLocalDate();
  const displayDateLabel =
    selectedDate === todayStr
      ? 'Today'
      : new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });

  const handleQuickLogDbFood = async (item: VerifiedFoodItem) => {
    if (!onQuickLogEntry) {
      onQuickAdd(guessDefaultMealType());
      return;
    }
    const scaled = scaleNutritionByQuantity(item.per100, item.defaultServingQty);
    const meal = guessDefaultMealType();
    await onQuickLogEntry({
      date: selectedDate,
      mealType: meal,
      foodName: item.name,
      quantity: item.defaultServingQty,
      unit: item.defaultUnit,
      servingDescription: item.servingLabel,
      calories: scaled.calories,
      protein: scaled.protein,
      carbs: scaled.carbs,
      fat: scaled.fat,
      fiber: scaled.fiber,
      sugar: scaled.sugar,
      sodiumMg: scaled.sodiumMg,
      source: 'database',
      isEstimated: false,
    });
    setQuickQuery('');
    setQuickLoggedNotice(`Added ${item.name} (${scaled.calories} kcal) to ${meal}.`);
    window.setTimeout(() => setQuickLoggedNotice(null), 3500);
  };

  const handleLoadInsights = async () => {
    setLoadingInsights(true);
    setInsightError(null);
    try {
      const result = await fetchCoachInsights({
        profile,
        targets,
        todaySummary: {
          date: selectedDate,
          calories: daySummary.calories,
          protein: daySummary.protein,
          carbs: daySummary.carbs,
          fat: daySummary.fat,
          fiber: daySummary.fiber,
        },
        recentEntries: foodEntries.slice(0, 18),
      });
      setInsights(result);
    } catch (err) {
      setInsightError(
        err instanceof Error ? err.message : 'Unable to generate coaching insights right now.'
      );
    } finally {
      setLoadingInsights(false);
    }
  };

  const macroCards: {
    kind: NutrientKind;
    label: string;
    current: number;
    target: number;
  }[] = [
    { kind: 'carbs', label: 'Carbs', current: daySummary.carbs, target: targets.carbsGrams },
    { kind: 'fats', label: 'Fats', current: daySummary.fat, target: targets.fatGrams },
    { kind: 'protein', label: 'Protein', current: daySummary.protein, target: targets.proteinGrams },
    { kind: 'fiber', label: 'Fiber', current: daySummary.fiber, target: targets.fiberGrams },
  ];

  return (
    <div className="space-y-7">
      {/* Editorial Two-Tone Display Header + Date Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-[#62625C] dark:text-[#A1A19A]">
            Hi {profile.fullName.split(' ')[0]}
          </p>
          <h1 className="text-3xl sm:text-[40px] font-extrabold tracking-tight leading-[1.08]">
            <span className="text-[#171715] dark:text-[#F4F4F0] block">Let&rsquo;s Check Your</span>
            <span className="text-[#787872] dark:text-[#9C9C94] block">Meal Together</span>
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[#787872] dark:text-[#9C9C94] pt-0.5">
            {GOAL_LABELS[targets.appliedGoal]} ·{' '}
            <span className="font-mono tabular-nums font-semibold text-[#171715] dark:text-[#E8E8E2]">
              {targets.targetCalories.toLocaleString()} kcal
            </span>{' '}
            daily target
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <div className="inline-flex items-center bg-white dark:bg-[#1B1C19] border border-black/[0.06] dark:border-white/10 rounded-full p-1 card-soft">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              aria-label="Previous day"
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#171715] dark:text-white hover:bg-[#F4F4F0] dark:hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onSelectDate(todayStr)}
              className="px-3.5 text-sm font-bold text-[#171715] dark:text-white whitespace-nowrap"
            >
              {displayDateLabel}
            </button>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              aria-label="Next day"
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#171715] dark:text-white hover:bg-[#F4F4F0] dark:hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => onNavigate('scan')}
            className="h-11 px-5 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white text-sm font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors shadow-sm"
          >
            <Camera className="w-4 h-4" />
            <span>Scan Food</span>
          </motion.button>
        </div>
      </div>

      {/* Reference-Inspired Tactile Food Search Bar */}
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#787872] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              placeholder="Enter a food to log quickly (e.g., oats, salmon, paneer, rice)..."
              aria-label="Quick search food database"
              className="w-full h-12 pl-11 pr-10 rounded-full bg-white dark:bg-[#1B1C19] border border-black/[0.05] dark:border-white/10 text-sm text-[#171715] dark:text-white placeholder:text-[#8E8E87] card-soft focus:outline-none focus:ring-2 focus:ring-[#171715] dark:focus:ring-[#A3F056]"
            />
            {quickQuery && (
              <button
                type="button"
                onClick={() => setQuickQuery('')}
                aria-label="Clear food search"
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#787872] hover:bg-[#F4F4F0] dark:hover:bg-white/10 absolute right-2.5 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => onQuickAdd(guessDefaultMealType())}
            aria-label="Open full food entry modal"
            className="w-12 h-12 rounded-full bg-white dark:bg-[#1B1C19] border border-black/[0.05] dark:border-white/10 flex items-center justify-center text-[#171715] dark:text-white card-soft hover:bg-[#F4F4F0] dark:hover:bg-white/10 shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Instant Search Results Popover */}
        <AnimatePresence>
          {quickSearchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute left-0 right-14 mt-2 z-30 bg-white dark:bg-[#1B1C19] rounded-3xl border border-black/[0.06] dark:border-white/10 shadow-xl overflow-hidden divide-y divide-black/[0.05] dark:divide-white/10"
            >
              {quickSearchResults.map((item) => {
                const preview = scaleNutritionByQuantity(item.per100, item.defaultServingQty);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleQuickLogDbFood(item)}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#F4F4F0] dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-bold text-[#171715] dark:text-white truncate">
                        {item.name}
                      </p>
                      <InlineMacroRow
                        carbs={preview.carbs}
                        fat={preview.fat}
                        protein={preview.protein}
                        compact
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tabular-nums text-sm font-extrabold text-[#171715] dark:text-[#A3F056]">
                        {preview.calories} kcal
                      </span>
                      <span className="w-7 h-7 rounded-full bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513] flex items-center justify-center">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {quickLoggedNotice && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-2xl bg-[#EEF8E8] dark:bg-[#54A630]/15 border border-[#54A630]/25 text-[#346E1B] dark:text-[#86E05C] text-xs font-semibold flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{quickLoggedNotice}</span>
        </motion.div>
      )}

      {/* Minor Safety Banner if applicable */}
      {targets.isMinor && (
        <div className="p-4 rounded-2xl bg-[#FEF5E5] dark:bg-[#E69718]/15 border border-[#E69718]/30 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#D4880F] dark:text-[#FBBF24] shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm text-[#6F4400] dark:text-[#FDE68A] leading-relaxed">
            Youth Nutrition Mode is active (Age {targets.age}). Targets prioritize balanced meals,
            growth, and steady energy rather than calorie restriction.
          </p>
        </div>
      )}

      {/* Primary Hero Summary Grid (Desktop 12-col split: Calorie & Color-Coded Macro Card + AI Coach Panel) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Daily Calorie & Color-Coded Macro Progress Card */}
        <section
          aria-label="Daily Calorie and Macronutrient Summary"
          className="lg:col-span-7 bg-white dark:bg-[#1B1C19] rounded-[28px] p-6 sm:p-7 card-soft border border-black/[0.04] dark:border-white/10 flex flex-col justify-between space-y-6"
        >
          {/* Card Section Header */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-[#171715] dark:text-white tracking-tight">
              Daily Nutrition
            </h2>
            <button
              type="button"
              onClick={() => setShowMetabolicDetails((v) => !v)}
              className="h-8 px-3 rounded-full bg-[#F4F4F0] dark:bg-white/5 text-[#62625C] dark:text-[#B6B6AE] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap hover:bg-[#EAEAE4] dark:hover:bg-white/10 transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
              <span className="font-mono tabular-nums">
                BMR {targets.bmr} · TDEE {targets.tdee}
              </span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-7">
            {/* Animated Circular Calorie Gauge */}
            <div className="relative w-40 h-40 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140" aria-hidden="true">
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-[#ECECE8] dark:text-white/10"
                />
                <motion.circle
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: dashOffset }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  className={
                    remainingCalories < -250
                      ? 'text-[#E69718]'
                      : 'text-[#54A630] dark:text-[#A3F056]'
                  }
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                <span className="text-[28px] leading-none font-extrabold text-[#171715] dark:text-white font-mono tabular-nums">
                  {daySummary.calories.toLocaleString()}
                </span>
                <span className="text-xs font-medium text-[#787872] dark:text-[#9C9C94] mt-1">
                  of {targets.targetCalories.toLocaleString()} kcal
                </span>
              </div>
            </div>

            {/* Key Calorie Figures & Quick Add */}
            <div className="flex-1 w-full space-y-5">
              <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">Target</p>
                  <p className="text-xl font-extrabold text-[#171715] dark:text-white font-mono tabular-nums">
                    {targets.targetCalories.toLocaleString()}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">Consumed</p>
                  <p className="text-xl font-extrabold text-[#4B962A] dark:text-[#A3F056] font-mono tabular-nums">
                    {daySummary.calories.toLocaleString()}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                    {remainingCalories >= 0 ? 'Remaining' : 'Over Goal'}
                  </p>
                  <p
                    className={`text-xl font-extrabold font-mono tabular-nums ${
                      remainingCalories >= 0
                        ? 'text-[#171715] dark:text-white'
                        : 'text-[#D4880F] dark:text-[#FBBF24]'
                    }`}
                  >
                    {Math.abs(remainingCalories).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="pt-3.5 border-t border-black/[0.06] dark:border-white/10">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onQuickAdd(guessDefaultMealType())}
                  className="h-11 px-5 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Quick Add Food
                </motion.button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {showMetabolicDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] text-sm text-[#4A4A45] dark:text-[#B6B6AE] space-y-1.5 leading-relaxed">
                  <p className="font-bold text-[#171715] dark:text-white">
                    Estimated Maintenance: {targets.maintenanceCalories.toLocaleString()} kcal/day
                    (BMR {targets.bmr} · TDEE {targets.tdee})
                  </p>
                  <p className="text-xs leading-relaxed">{targets.explanation}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 4 Color-Coded Macronutrient Progress Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-black/[0.06] dark:border-white/10">
            {macroCards.map((macro) => {
              const pct = Math.min(100, Math.round((macro.current / Math.max(1, macro.target)) * 100));
              const theme = NUTRIENT_THEME[macro.kind];
              return (
                <div
                  key={macro.label}
                  className="p-3.5 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <NutrientIcon kind={macro.kind} className="w-4 h-4" />
                      <span className="text-xs font-bold text-[#5C5C57] dark:text-[#B6B6AE] truncate">
                        {macro.label}
                      </span>
                    </div>
                    <span className="text-sm font-mono tabular-nums font-extrabold text-[#171715] dark:text-white shrink-0">
                      {macro.current}g
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white dark:bg-white/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ type: 'spring', stiffness: 140, damping: 22 }}
                      className={`h-full rounded-full ${theme.barClass}`}
                    />
                  </div>
                  <p className="text-xs font-medium text-[#62625C] dark:text-[#9C9C94] font-mono tabular-nums">
                    {macro.target}g goal · {pct}%
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Personalized AI Nutrition Coach Card (Deep Charcoal Reference Contrast) */}
        <section
          aria-label="Personalized AI Nutrition Coach"
          className="lg:col-span-5 bg-[#151513] text-white rounded-[28px] p-6 sm:p-7 flex flex-col justify-between space-y-6 shadow-md"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-[#A3F056]">AI Nutrition Coach</p>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={handleLoadInsights}
                disabled={loadingInsights}
                className="h-9 px-3.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingInsights ? 'animate-spin' : ''}`} />
                {loadingInsights ? 'Analyzing...' : insights ? 'Refresh' : 'Analyze Day'}
              </motion.button>
            </div>

            {insightError && (
              <p className="text-xs text-amber-300 bg-amber-950/50 p-3.5 rounded-xl leading-relaxed">
                {insightError}
              </p>
            )}

            {insights ? (
              <div className="space-y-3.5">
                <h2 className="text-xl font-extrabold text-white leading-snug tracking-tight">
                  {insights.headline}
                </h2>
                <p className="text-sm text-[#C8C8C2] leading-relaxed">{insights.summary}</p>
                <ul className="space-y-2">
                  {insights.suggestions.slice(0, 3).map((s, idx) => (
                    <li key={idx} className="p-3 rounded-2xl bg-white/[0.06] text-xs space-y-0.5 leading-relaxed">
                      <span className="font-bold text-[#A3F056] block">{s.title}</span>
                      <span className="text-[#E0E0DA]">{s.detail}</span>
                    </li>
                  ))}
                </ul>
                {insights.foodIdeas.length > 0 && (
                  <p className="text-xs text-[#A1A19A] leading-relaxed">
                    <span className="font-bold text-white">Try adding:</span>{' '}
                    {insights.foodIdeas.join(' · ')}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-xl font-extrabold text-white leading-snug tracking-tight">
                  {daySummary.entryCount === 0
                    ? 'Log your first meal to unlock live coaching'
                    : `${daySummary.calories.toLocaleString()} kcal and ${daySummary.protein}g protein logged`}
                </h2>
                <p className="text-sm text-[#C0C0B8] leading-relaxed">
                  {daySummary.entryCount === 0
                    ? `Calibrated for ${GOAL_LABELS[targets.appliedGoal].toLowerCase()} with ${targets.proteinGrams}g protein, ${targets.carbsGrams}g carbs, and ${targets.fatGrams}g fats. Chat anytime to auto-log meals or request a Diet Plan PDF.`
                    : `Tap "Analyze Day" for tailored feedback on your ${displayDateLabel.toLowerCase()} meals against your ${targets.targetCalories.toLocaleString()} kcal and ${targets.proteinGrams}g protein targets.`}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-4 border-t border-white/10">
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => onNavigate('coach')}
              className="h-11 px-5 rounded-full bg-[#A3F056] hover:bg-[#93E344] text-[#151513] text-sm font-extrabold flex items-center gap-2 whitespace-nowrap transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Open Coach Chat
            </motion.button>
            <button
              type="button"
              onClick={() => (onRequestDietPlan ? onRequestDietPlan() : onNavigate('coach'))}
              className="h-10 px-3.5 rounded-full text-xs sm:text-sm font-bold text-[#D8D8D0] hover:text-white whitespace-nowrap transition-colors"
            >
              Diet Plan PDF →
            </button>
          </div>
        </section>
      </div>

      {/* Consistency Streak Indicator (Warm-Stone Card + Interactive 7-Day Cadence) */}
      <section
        aria-label="Meal Logging Consistency Streak"
        className="bg-white dark:bg-[#1B1C19] rounded-[26px] p-6 card-soft border border-black/[0.04] dark:border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-6"
      >
        <div className="flex items-start sm:items-center gap-4 min-w-0">
          <div
            className={`w-13 h-13 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
              consistencyStreak.currentStreak > 0
                ? 'bg-[#FEF5E5] dark:bg-[#E69718]/15 text-[#D4880F] dark:text-[#FBBF24]'
                : 'bg-[#F4F4F0] dark:bg-white/10 text-[#8E8E87] dark:text-[#9C9C94]'
            }`}
          >
            <Flame className="w-6 h-6" />
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h2 className="text-2xl font-extrabold text-[#171715] dark:text-white font-mono tabular-nums tracking-tight leading-none">
                {consistencyStreak.currentStreak}{' '}
                {consistencyStreak.currentStreak === 1 ? 'Day' : 'Days'}
              </h2>
              <span className="text-sm font-bold text-[#62625C] dark:text-[#A1A19A]">
                Consistency Streak
              </span>
            </div>
            <p className="text-sm text-[#62625C] dark:text-[#A1A19A] leading-relaxed">
              {consistencyStreak.currentStreak === 0
                ? 'Log your first meal today to start your daily streak.'
                : consistencyStreak.loggedToday
                  ? 'Logged today — your streak is active and protected.'
                  : `Log a meal today to extend your streak to ${consistencyStreak.currentStreak + 1} days.`}
            </p>
            <div className="flex items-center gap-4 text-xs font-mono tabular-nums font-semibold text-[#787872] dark:text-[#9C9C94] pt-0.5">
              <span>Best: {consistencyStreak.longestStreak}d</span>
              <span>
                Total logged: {consistencyStreak.totalDaysLogged}{' '}
                {consistencyStreak.totalDaysLogged === 1 ? 'day' : 'days'}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive 7-Day Logging Cadence Strip */}
        <div className="grid grid-cols-7 gap-2 sm:gap-2.5 shrink-0">
          {consistencyStreak.last7Days.map((day) => {
            const isSelected = day.date === selectedDate;
            return (
              <motion.button
                key={day.date}
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => onSelectDate(day.date)}
                aria-label={`${day.dayShort} ${day.dayNum}: ${
                  day.logged ? `${day.calories} kcal logged` : 'No meals logged'
                }`}
                className={`flex flex-col items-center justify-center py-2.5 px-1.5 sm:px-3 rounded-2xl transition-colors min-w-[44px] ${
                  isSelected
                    ? 'bg-[#151513] dark:bg-white/15 text-white'
                    : 'bg-[#F4F4F0] dark:bg-[#111210] hover:bg-[#EAEAE4] dark:hover:bg-white/10 text-[#171715] dark:text-[#E8E8E2]'
                }`}
              >
                <span
                  className={`text-xs font-bold ${
                    isSelected
                      ? 'text-[#D0D0C8]'
                      : 'text-[#62625C] dark:text-[#9C9C94]'
                  }`}
                >
                  {day.dayShort.slice(0, 2)}
                </span>
                <span
                  className={`my-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                    day.logged
                      ? isSelected
                        ? 'bg-[#A3F056] text-[#151513]'
                        : 'bg-[#54A630] dark:bg-[#A3F056] text-white dark:text-[#151513]'
                      : isSelected
                        ? 'border border-dashed border-white/40 text-transparent'
                        : 'border border-dashed border-black/15 dark:border-white/20 text-transparent'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.75]" />
                </span>
                <span
                  className={`text-xs font-mono tabular-nums font-extrabold ${
                    isSelected
                      ? 'text-white'
                      : day.isToday
                        ? 'text-[#4B962A] dark:text-[#A3F056]'
                        : 'text-[#5C5C57] dark:text-[#A1A19A]'
                  }`}
                >
                  {day.dayNum}
                </span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Reference-Inspired "Recent Meals & Scans" Strip */}
      <section aria-label="Last scans and recent meals" className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-[#171715] dark:text-[#F4F4F0] tracking-tight">
            Recent meals
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="text-sm font-semibold text-[#62625C] dark:text-[#A1A19A] hover:text-[#171715] dark:hover:text-white transition-colors"
          >
            See all →
          </button>
        </div>

        {recentMeals.length === 0 ? (
          <div className="bg-white dark:bg-[#1B1C19] rounded-[24px] p-6 card-soft border border-black/[0.04] dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-base font-bold text-[#171715] dark:text-white">
                No logged meals yet
              </p>
              <p className="text-sm text-[#62625C] dark:text-[#A1A19A] leading-relaxed">
                Scan a meal photo, chat with your AI coach, or use the quick search above to start
                building your nutrition diary.
              </p>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => onNavigate('scan')}
              className="h-11 px-5 rounded-full bg-[#F4F4F0] dark:bg-white/10 text-[#171715] dark:text-white text-sm font-bold flex items-center gap-2 whitespace-nowrap self-start sm:self-auto hover:bg-[#EAEAE4] transition-colors"
            >
              <Camera className="w-4 h-4" />
              Scan First Meal
            </motion.button>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-1.5 no-scrollbar">
            {recentMeals.map((entry, idx) => {
              const pcts = computeMacroPercentages({
                carbs: entry.carbs,
                fat: entry.fat,
                protein: entry.protein,
              });
              return (
                <motion.button
                  key={entry.id}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onEditEntry(entry)}
                  className="min-w-[235px] max-w-[260px] shrink-0 bg-white dark:bg-[#1B1C19] rounded-[24px] p-4.5 card-soft border border-black/[0.04] dark:border-white/10 text-left space-y-3.5 hover:border-black/15 dark:hover:border-white/20 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <p className="text-[15px] font-extrabold text-[#171715] dark:text-white truncate">
                      {entry.foodName}
                    </p>
                    <p className="text-xs font-medium text-[#62625C] dark:text-[#A1A19A] font-mono tabular-nums">
                      {entry.quantity}
                      {entry.unit} · {entry.calories} kcal
                    </p>
                  </div>

                  {/* Reference 3-Column Color-Coded Macro % Readout */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-black/[0.06] dark:border-white/10 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <NutrientIcon kind="carbs" className="w-4 h-4" />
                      <span className="text-sm font-extrabold font-mono tabular-nums text-[#171715] dark:text-white">
                        {pcts.carbsPct.toFixed(0)}%
                      </span>
                      <span className="text-xs font-medium text-[#787872] dark:text-[#9C9C94]">
                        Carbs
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <NutrientIcon kind="fats" className="w-4 h-4" />
                      <span className="text-sm font-extrabold font-mono tabular-nums text-[#171715] dark:text-white">
                        {pcts.fatsPct.toFixed(0)}%
                      </span>
                      <span className="text-xs font-medium text-[#787872] dark:text-[#9C9C94]">
                        Fats
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <NutrientIcon kind="protein" className="w-4 h-4" />
                      <span className="text-sm font-extrabold font-mono tabular-nums text-[#171715] dark:text-white">
                        {pcts.proteinPct.toFixed(0)}%
                      </span>
                      <span className="text-xs font-medium text-[#787872] dark:text-[#9C9C94]">
                        Protein
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </section>

      {/* Daily Total Entries (if user logged full-day calories via AI Coach) */}
      {daySummary.byMeal.daily_total.length > 0 && (
        <section className="bg-white dark:bg-[#1B1C19] rounded-[24px] p-5 card-soft border border-black/[0.04] dark:border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#171715] dark:text-white">
              Full-Day Summary Logs
            </h2>
            <span className="text-xs text-[#787872] dark:text-[#9C9C94]">
              Logged as daily total
            </span>
          </div>
          <div className="divide-y divide-black/[0.06] dark:divide-white/10">
            {daySummary.byMeal.daily_total.map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[#171715] dark:text-white">
                    {item.foodName}
                  </p>
                  <InlineMacroRow
                    carbs={item.carbs}
                    fat={item.fat}
                    protein={item.protein}
                    compact
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-extrabold font-mono tabular-nums text-[#171715] dark:text-[#A3F056] mr-1">
                    {item.calories} kcal
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditEntry(item as FoodEntry)}
                    aria-label={`Edit ${item.foodName}`}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[#787872] hover:bg-[#F4F4F0] dark:hover:bg-white/10"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteEntry(item.id)}
                    aria-label={`Delete ${item.foodName}`}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[#E5484D] hover:bg-[#FDECEC] dark:hover:bg-[#E5484D]/15"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Four Meal Sections Grid (2x2 on desktop, stacked on mobile) */}
      <section aria-label="Daily meal log" className="space-y-4">
        <h2 className="text-xl font-extrabold text-[#171715] dark:text-[#F4F4F0] tracking-tight">
          {selectedDate === todayStr ? "Today's meals" : `Meals on ${displayDateLabel}`}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {MEAL_SECTIONS.map((section, sectionIdx) => {
            const items = daySummary.byMeal[section.key] as FoodEntry[];
            const mealCalories = items.reduce((acc, i) => acc + i.calories, 0);
            const mealProtein = items.reduce((acc, i) => acc + i.protein, 0);

            return (
              <motion.section
                key={section.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sectionIdx * 0.04 }}
                aria-label={section.label}
                className="bg-white dark:bg-[#1B1C19] rounded-[26px] p-6 card-soft border border-black/[0.04] dark:border-white/10 flex flex-col justify-between space-y-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 className="text-lg font-extrabold text-[#171715] dark:text-white tracking-tight">
                      {section.label}
                    </h3>
                    <p
                      className={`text-xs sm:text-sm text-[#62625C] dark:text-[#A1A19A] ${
                        items.length > 0 ? 'font-mono tabular-nums font-semibold' : ''
                      }`}
                    >
                      {items.length === 0
                        ? section.hint
                        : `${Math.round(mealCalories)} kcal · ${mealProtein.toFixed(1)}g protein`}
                    </p>
                  </div>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => onQuickAdd(section.key)}
                    aria-label={`Add food to ${section.label}`}
                    className="h-10 px-4 rounded-full bg-[#F4F4F0] dark:bg-white/10 hover:bg-[#EAEAE4] dark:hover:bg-white/15 text-[#171715] dark:text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </motion.button>
                </div>

                {items.length === 0 ? (
                  <p className="text-sm text-[#787872] dark:text-[#9C9C94] py-3.5 border-t border-black/[0.06] dark:border-white/10">
                    Nothing logged for {section.label.toLowerCase()}{' '}
                    {selectedDate === todayStr ? 'yet today' : `on ${displayDateLabel}`}.
                  </p>
                ) : (
                  <ul className="divide-y divide-black/[0.06] dark:divide-white/10 border-t border-black/[0.06] dark:border-white/10">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="py-3.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex items-baseline gap-2">
                            <p className="text-[15px] font-bold text-[#171715] dark:text-white truncate">
                              {item.foodName}
                            </p>
                            <span className="text-xs font-medium text-[#787872] dark:text-[#9C9C94] font-mono shrink-0">
                              {item.quantity}
                              {item.unit}
                            </span>
                          </div>
                          <InlineMacroRow
                            carbs={item.carbs}
                            fat={item.fat}
                            protein={item.protein}
                            compact
                          />
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[15px] font-extrabold font-mono tabular-nums text-[#171715] dark:text-[#A3F056] mr-1.5">
                            {item.calories}
                          </span>
                          <button
                            type="button"
                            onClick={() => onEditEntry(item)}
                            aria-label={`Edit ${item.foodName}`}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-[#787872] hover:text-[#171715] dark:hover:text-white hover:bg-[#F4F4F0] dark:hover:bg-white/10 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteEntry(item.id)}
                            aria-label={`Delete ${item.foodName}`}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-[#787872] hover:text-[#E5484D] hover:bg-[#FDECEC] dark:hover:bg-[#E5484D]/15 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.section>
            );
          })}
        </div>
      </section>
    </div>
  );
};
