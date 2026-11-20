import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  Scale,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { FoodEntry, UserProfile, WeightEntry } from '../types/nutrition';
import {
  computePeriodAnalytics,
  formatLocalDate,
  GOAL_LABELS,
  NutritionTargetsResult,
  summarizeDayEntries,
} from '../utils/nutritionMath';
import { InlineMacroRow, NutrientIcon, NutrientKind } from './NutrientVisuals';

interface HistoryAnalyticsViewProps {
  profile: UserProfile;
  targets: NutritionTargetsResult;
  foodEntries: FoodEntry[];
  weightHistory: WeightEntry[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onEditEntry: (entry: FoodEntry) => void;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onQuickAddForDate: (date: string) => void;
  onLogWeight: (date: string, weightKg: number, note?: string) => Promise<void>;
}

export const HistoryAnalyticsView: React.FC<HistoryAnalyticsViewProps> = ({
  profile,
  targets,
  foodEntries,
  weightHistory,
  selectedDate,
  onSelectDate,
  onEditEntry,
  onDeleteEntry,
  onQuickAddForDate,
  onLogWeight,
}) => {
  const [subTab, setSubTab] = useState<'calendar' | 'analytics'>('calendar');
  const [analyticsWindow, setAnalyticsWindow] = useState<7 | 30>(7);
  const [viewMonth, setViewMonth] = useState(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

  // Weight logging form
  const [newWeight, setNewWeight] = useState(String(profile.weightKg));
  const [weightDate, setWeightDate] = useState(formatLocalDate());
  const [weightNote, setWeightNote] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  const caloriesByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of foodEntries) {
      map.set(entry.date, (map.get(entry.date) ?? 0) + entry.calories);
    }
    return map;
  }, [foodEntries]);

  const selectedDaySummary = useMemo(
    () => summarizeDayEntries(foodEntries, selectedDate),
    [foodEntries, selectedDate]
  );

  const selectedDayEntries = useMemo(
    () => foodEntries.filter((e) => e.date === selectedDate),
    [foodEntries, selectedDate]
  );

  const analytics = useMemo(
    () => computePeriodAnalytics(foodEntries, analyticsWindow),
    [foodEntries, analyticsWindow]
  );

  const monthDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(formatLocalDate(new Date(year, month, d)));
    }
    return cells;
  }, [viewMonth]);

  const handleWeightSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(newWeight);
    if (!Number.isFinite(w) || w < 15 || w > 400) return;
    setSavingWeight(true);
    try {
      await onLogWeight(weightDate, w, weightNote.trim() || undefined);
      setWeightNote('');
    } finally {
      setSavingWeight(false);
    }
  };

  const weightChartData = useMemo(() => {
    return weightHistory.map((w) => ({
      date: w.date.slice(5),
      weightKg: w.weightKg,
    }));
  }, [weightHistory]);

  const dayStatItems: { label: string; val: string; kind: NutrientKind }[] = [
    { label: 'Calories', val: `${selectedDaySummary.calories}`, kind: 'calories' },
    { label: 'Carbs', val: `${selectedDaySummary.carbs}g`, kind: 'carbs' },
    { label: 'Fats', val: `${selectedDaySummary.fat}g`, kind: 'fats' },
    { label: 'Protein', val: `${selectedDaySummary.protein}g`, kind: 'protein' },
    { label: 'Fiber', val: `${selectedDaySummary.fiber}g`, kind: 'fiber' },
  ];

  return (
    <div className="space-y-7">
      {/* Header & Sub-tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-3xl sm:text-[40px] font-extrabold tracking-tight leading-[1.08]">
            <span className="text-[#171715] dark:text-[#F4F4F0]">History &amp; </span>
            <span className="text-[#787872] dark:text-[#9C9C94]">Analytics</span>
          </h1>
          <p className="text-sm font-medium text-[#62625C] dark:text-[#A1A19A]">
            Browse any day or inspect weekly &amp; monthly nutrition trends
          </p>
        </div>

        <div className="inline-flex p-1 rounded-full bg-white dark:bg-[#1B1C19] card-soft border border-black/[0.04] dark:border-white/10 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSubTab('calendar')}
            className={`h-10 px-4 rounded-full text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              subTab === 'calendar'
                ? 'bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513]'
                : 'text-[#62625C] dark:text-[#A1A19A]'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            Calendar History
          </button>
          <button
            type="button"
            onClick={() => setSubTab('analytics')}
            className={`h-10 px-4 rounded-full text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              subTab === 'analytics'
                ? 'bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513]'
                : 'text-[#62625C] dark:text-[#A1A19A]'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Weekly &amp; Monthly
          </button>
        </div>
      </div>

      {/* CALENDAR HISTORY SUB-TAB */}
      {subTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Calendar Grid */}
          <section className="lg:col-span-5 bg-white dark:bg-[#1B1C19] rounded-[28px] p-5 card-soft border border-black/[0.04] dark:border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-[#171715] dark:text-white">
                {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                  }
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#F4F4F0] dark:hover:bg-white/10 text-[#171715] dark:text-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                  }
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#F4F4F0] dark:hover:bg-white/10 text-[#171715] dark:text-white"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-[#62625C] dark:text-[#9C9C94]">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="py-1.5">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {monthDays.map((dateStr, idx) => {
                if (!dateStr) return <div key={`empty-${idx}`} />;
                const dayNum = Number(dateStr.split('-')[2]);
                const cals = caloriesByDate.get(dateStr) ?? 0;
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === formatLocalDate();

                return (
                  <motion.button
                    key={dateStr}
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => onSelectDate(dateStr)}
                    aria-label={`Select ${dateStr}, ${cals} calories logged`}
                    className={`h-14 rounded-2xl flex flex-col items-center justify-center font-mono tabular-nums transition-colors ${
                      isSelected
                        ? 'bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513] font-extrabold shadow-xs'
                        : isToday
                          ? 'bg-[#EEF8E8] dark:bg-[#54A630]/20 text-[#171715] dark:text-white font-bold'
                          : 'hover:bg-[#F4F4F0] dark:hover:bg-white/5 text-[#171715] dark:text-[#E0E0DA]'
                    }`}
                  >
                    <span className="text-sm leading-tight">{dayNum}</span>
                    {cals > 0 && (
                      <span
                        className={`text-[11px] leading-none mt-1 font-bold ${
                          isSelected
                            ? 'text-[#A3F056] dark:text-[#151513]'
                            : 'text-[#4B962A] dark:text-[#A3F056]'
                        }`}
                      >
                        {Math.round(cals)}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </section>

          {/* Selected Date Nutrition Log */}
          <section className="lg:col-span-7 bg-white dark:bg-[#1B1C19] rounded-[28px] p-6 card-soft border border-black/[0.04] dark:border-white/10 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Selected Date
                </p>
                <h2 className="text-xl font-extrabold text-[#171715] dark:text-white">
                  {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </h2>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => onQuickAddForDate(selectedDate)}
                className="h-10 px-4 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Log Food
              </motion.button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              {dayStatItems.map((stat) => (
                <div
                  key={stat.label}
                  className="p-3.5 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] flex flex-col items-center gap-1.5"
                >
                  <NutrientIcon kind={stat.kind} className="w-4 h-4" />
                  <span className="text-lg font-extrabold font-mono tabular-nums text-[#171715] dark:text-white leading-none">
                    {stat.val}
                  </span>
                  <span className="text-xs font-semibold text-[#62625C] dark:text-[#9C9C94]">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            {selectedDayEntries.length === 0 ? (
              <div className="py-10 text-center space-y-2 border-t border-black/[0.06] dark:border-white/10">
                <p className="text-base font-bold text-[#171715] dark:text-white">
                  No food entries recorded on {selectedDate}
                </p>
                <p className="text-sm text-[#62625C] dark:text-[#A1A19A]">
                  Log a meal above or select another date on the calendar.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-black/[0.06] dark:divide-white/10 border-t border-black/[0.06] dark:border-white/10">
                {selectedDayEntries.map((item) => (
                  <li key={item.id} className="py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <p className="text-[15px] font-bold text-[#171715] dark:text-white truncate">
                          {item.foodName}
                        </p>
                        <span className="text-xs font-medium text-[#62625C] dark:text-[#9C9C94] capitalize">
                          {item.mealType.replace('_', ' ')} · {item.quantity}
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
                      <span className="text-sm font-extrabold font-mono tabular-nums text-[#171715] dark:text-[#A3F056] mr-2">
                        {item.calories} kcal
                      </span>
                      <button
                        type="button"
                        onClick={() => onEditEntry(item)}
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
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* WEEKLY & MONTHLY ANALYTICS SUB-TAB */}
      {subTab === 'analytics' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-[#787872] dark:text-[#9C9C94]">
              Goal:{' '}
              <strong className="text-[#171715] dark:text-white">
                {GOAL_LABELS[targets.appliedGoal]}
              </strong>{' '}
              · Target {targets.targetCalories} kcal/day · Calculated from your saved records
            </p>
            <div className="inline-flex p-1 rounded-full bg-white dark:bg-[#1B1C19] card-soft border border-black/[0.04] dark:border-white/10 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setAnalyticsWindow(7)}
                className={`h-8 px-3.5 rounded-full text-xs font-bold ${
                  analyticsWindow === 7
                    ? 'bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513]'
                    : 'text-[#62625C] dark:text-[#A1A19A]'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setAnalyticsWindow(30)}
                className={`h-8 px-3.5 rounded-full text-xs font-bold ${
                  analyticsWindow === 30
                    ? 'bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513]'
                    : 'text-[#62625C] dark:text-[#A1A19A]'
                }`}
              >
                30 Days
              </button>
            </div>
          </div>

          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                label: 'Avg Daily Calories',
                value: `${analytics.avgCalories} kcal`,
                sub: `Target ${targets.targetCalories} kcal`,
                kind: 'calories' as NutrientKind,
              },
              {
                label: 'Avg Carbs',
                value: `${analytics.avgCarbs} g`,
                sub: `Target ${targets.carbsGrams}g`,
                kind: 'carbs' as NutrientKind,
              },
              {
                label: 'Avg Fat',
                value: `${analytics.avgFat} g`,
                sub: `Target ${targets.fatGrams}g`,
                kind: 'fats' as NutrientKind,
              },
              {
                label: 'Avg Protein',
                value: `${analytics.avgProtein} g`,
                sub: `Target ${targets.proteinGrams}g`,
                kind: 'protein' as NutrientKind,
              },
              {
                label: 'Consistency',
                value: `${analytics.consistencyPercent}%`,
                sub: `${analytics.daysTracked}/${analytics.totalDaysInWindow} days logged`,
                kind: 'fiber' as NutrientKind,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-white dark:bg-[#1B1C19] rounded-[24px] p-5 card-soft border border-black/[0.04] dark:border-white/10 space-y-2"
              >
                <div className="flex items-center gap-1.5">
                  <NutrientIcon kind={kpi.kind} className="w-4 h-4" />
                  <p className="text-xs font-bold text-[#62625C] dark:text-[#A1A19A]">
                    {kpi.label}
                  </p>
                </div>
                <p className="text-2xl font-extrabold font-mono tabular-nums text-[#171715] dark:text-white">
                  {kpi.value}
                </p>
                <p className="text-xs font-medium text-[#787872] dark:text-[#9C9C94] font-mono tabular-nums">
                  {kpi.sub}
                </p>
              </div>
            ))}
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Calorie Trend Bar Chart */}
            <div className="lg:col-span-7 bg-white dark:bg-[#1B1C19] rounded-[28px] p-6 card-soft border border-black/[0.04] dark:border-white/10 space-y-4">
              <div>
                <h2 className="text-base font-extrabold text-[#171715] dark:text-white">
                  {analyticsWindow}-Day Calorie Intake vs Target
                </h2>
                <p className="text-xs text-[#787872] dark:text-[#9C9C94]">
                  Dashed line indicates your estimated daily target ({targets.targetCalories} kcal)
                </p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.dailySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#9C9C9433" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={[
                        0,
                        (dataMax: number) =>
                          Math.max(
                            Math.ceil((dataMax + 150) / 100) * 100,
                            Math.ceil((targets.targetCalories * 1.15) / 100) * 100
                          ),
                      ]}
                    />
                    <Tooltip />
                    <ReferenceLine
                      y={targets.targetCalories}
                      stroke="#171715"
                      strokeDasharray="4 4"
                    />
                    <Bar
                      dataKey="calories"
                      name="Calories (kcal)"
                      fill="#54A630"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Weight History & Logger */}
            <div className="lg:col-span-5 bg-white dark:bg-[#1B1C19] rounded-[28px] p-6 card-soft border border-black/[0.04] dark:border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extrabold text-[#171715] dark:text-white">
                    Weight History
                  </h2>
                  <p className="text-xs text-[#787872] dark:text-[#9C9C94] font-mono tabular-nums">
                    Current profile weight: {profile.weightKg} kg
                  </p>
                </div>
                <Scale className="w-5 h-5 text-[#E69718]" />
              </div>

              {weightChartData.length > 0 ? (
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#9C9C9433" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="weightKg"
                        name="Weight (kg)"
                        stroke="#E69718"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-[#787872] dark:text-[#9C9C94] py-6 text-center">
                  No weight check-ins recorded yet. Log your weight below to track trends over time.
                </p>
              )}

              <form
                onSubmit={handleWeightSubmit}
                className="grid grid-cols-2 gap-2.5 pt-2 border-t border-black/[0.06] dark:border-white/10"
              >
                <input
                  type="date"
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                  aria-label="Weight check-in date"
                  className="h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-xs text-[#171715] dark:text-white"
                />
                <input
                  type="number"
                  step="0.1"
                  min={15}
                  max={400}
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  aria-label="Weight in kilograms"
                  placeholder="Weight (kg)"
                  className="h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-xs font-mono tabular-nums text-[#171715] dark:text-white"
                />
                <input
                  type="text"
                  value={weightNote}
                  onChange={(e) => setWeightNote(e.target.value)}
                  placeholder="Optional note (e.g., morning weigh-in)"
                  aria-label="Weight check-in note"
                  className="col-span-2 h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-xs text-[#171715] dark:text-white"
                />
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.98 }}
                  disabled={savingWeight}
                  className="col-span-2 h-10 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white text-xs font-bold disabled:opacity-60"
                >
                  {savingWeight ? 'Recording...' : 'Record Weight Entry'}
                </motion.button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
