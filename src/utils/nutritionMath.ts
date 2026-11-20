export type Gender = 'male' | 'female' | 'other';
export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extremely_active';
export type DietaryPreference =
  | 'vegetarian'
  | 'non_vegetarian'
  | 'vegan'
  | 'eggetarian';
export type FitnessGoal =
  | 'fat_loss'
  | 'muscle_building'
  | 'weight_maintenance'
  | 'general_fitness';
export type GoalPace = 'slow' | 'medium' | 'hard' | 'balanced';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'daily_total';

export interface UserMetricsInput {
  dateOfBirth: string; // YYYY-MM-DD
  gender: Gender;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  fitnessGoal: FitnessGoal;
  goalPace: GoalPace;
  customCalorieTarget?: number;
}

export interface NutritionTargetsResult {
  age: number;
  isMinor: boolean;
  bmr: number;
  tdee: number;
  maintenanceCalories: number;
  targetCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  calorieDelta: number;
  appliedGoal: FitnessGoal;
  appliedPace: GoalPace;
  safetyWarnings: string[];
  explanation: string;
}

export interface MacroValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar?: number;
  sodiumMg?: number;
  saturatedFat?: number;
}

export interface FoodRecordLike {
  id: string;
  date: string;
  mealType: MealType;
  foodName: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extremely_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, { label: string; description: string }> = {
  sedentary: {
    label: 'Sedentary',
    description: 'Desk job or mostly seated with little structured exercise',
  },
  lightly_active: {
    label: 'Lightly Active',
    description: 'Light movement or exercise 1–3 days per week',
  },
  moderately_active: {
    label: 'Moderately Active',
    description: 'Moderate exercise or sports 3–5 days per week',
  },
  very_active: {
    label: 'Very Active',
    description: 'Hard exercise or physical job 6–7 days per week',
  },
  extremely_active: {
    label: 'Extremely Active',
    description: 'Intense daily training, athletic regimen, or heavy physical labor',
  },
};

export const DIETARY_LABELS: Record<DietaryPreference, string> = {
  vegetarian: 'Vegetarian',
  non_vegetarian: 'Non-Vegetarian',
  vegan: 'Vegan',
  eggetarian: 'Eggetarian',
};

export const GOAL_LABELS: Record<FitnessGoal, string> = {
  fat_loss: 'Fat Loss',
  muscle_building: 'Muscle Building',
  weight_maintenance: 'Weight Maintenance',
  general_fitness: 'General Fitness',
};

export const GOAL_PACE_LABELS: Record<GoalPace, { label: string; deltaText: string }> = {
  slow: { label: 'Slow & Steady', deltaText: 'Gentle ~250 kcal adjustment' },
  medium: { label: 'Moderate', deltaText: 'Steady ~450 kcal adjustment' },
  hard: { label: 'Focused (Adult Only)', deltaText: 'Capped ~650 kcal safe ceiling' },
  balanced: { label: 'Balanced', deltaText: 'Aligned with maintenance' },
};

/**
 * Computes exact chronological age in completed years from YYYY-MM-DD DOB.
 */
export function calculateAge(dateOfBirth: string, referenceDate: Date = new Date()): number {
  const parts = dateOfBirth.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return 25;
  }
  const [year, month, day] = parts;
  let age = referenceDate.getFullYear() - year;
  const currentMonth = referenceDate.getMonth() + 1;
  const currentDay = referenceDate.getDate();
  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1;
  }
  return Math.max(1, Math.min(120, age));
}

/**
 * Formats a Date in local timezone as YYYY-MM-DD so records never shift across timezones.
 */
export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Mifflin-St Jeor BMR equation (standard clinical estimate for adults).
 * For non-binary/other gender, uses the clinical midpoint (-78).
 * For minors (<18), uses Schofield/IOM-aligned youth resting energy estimate
 * rather than applying adult weight-loss equations indiscriminately.
 */
export function calculateBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: Gender
): number {
  const safeWeight = Math.max(15, Math.min(400, weightKg));
  const safeHeight = Math.max(50, Math.min(280, heightCm));
  const safeAge = Math.max(5, Math.min(120, age));

  if (safeAge < 18) {
    // Schofield youth resting metabolic rate equation (kcal/day)
    if (safeAge < 10) {
      return Math.round(
        gender === 'female'
          ? 20.315 * safeWeight + 485.9
          : 22.706 * safeWeight + 504.3
      );
    }
    const maleBmr = 17.686 * safeWeight + 658.2;
    const femaleBmr = 13.384 * safeWeight + 692.6;
    if (gender === 'male') return Math.round(maleBmr);
    if (gender === 'female') return Math.round(femaleBmr);
    return Math.round((maleBmr + femaleBmr) / 2);
  }

  // Adult Mifflin-St Jeor Equation
  const base = 10 * safeWeight + 6.25 * safeHeight - 5 * safeAge;
  if (gender === 'male') return Math.round(base + 5);
  if (gender === 'female') return Math.round(base - 161);
  return Math.round(base - 78);
}

/**
 * Computes TDEE & estimated maintenance calories.
 */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.2;
  return Math.round(bmr * multiplier);
}

/**
 * Computes BMI for safety guardrails (e.g., preventing hard deficits at low BMI).
 */
export function calculateBMI(weightKg: number, heightCm: number): number {
  if (heightCm <= 0) return 22;
  const heightM = heightCm / 100;
  return Number((weightKg / (heightM * heightM)).toFixed(1));
}

/**
 * Deterministic goal-based nutrition target generator with strict clinical & youth safety gates.
 */
export function calculateNutritionTargets(
  input: UserMetricsInput,
  referenceDate: Date = new Date()
): NutritionTargetsResult {
  const age = calculateAge(input.dateOfBirth, referenceDate);
  const isMinor = age < 18;
  const bmr = calculateBMR(input.weightKg, input.heightCm, age, input.gender);
  const tdee = calculateTDEE(bmr, input.activityLevel);
  const maintenanceCalories = tdee;
  const bmi = calculateBMI(input.weightKg, input.heightCm);
  const safetyWarnings: string[] = [];

  let appliedGoal: FitnessGoal = input.fitnessGoal;
  let appliedPace: GoalPace = input.goalPace;
  let calorieDelta = 0;

  // Clinical minimum calorie floors for adults (never prescribe extreme restriction)
  const adultMinimumFloor =
    input.gender === 'male' ? 1500 : input.gender === 'female' ? 1200 : 1350;

  if (isMinor) {
    // Minors MUST NOT receive restrictive fat-loss targets or hard weight-loss modes.
    if (input.fitnessGoal === 'fat_loss' || input.goalPace === 'hard') {
      safetyWarnings.push(
        'Because you are under 18, restrictive calorie deficits and aggressive weight-loss modes are disabled. Your plan focuses on balanced nutrition, healthy growth, and steady energy. Please consult a pediatrician or registered dietitian for individualized guidance.'
      );
    }
    appliedGoal =
      input.fitnessGoal === 'fat_loss' ? 'general_fitness' : input.fitnessGoal;
    appliedPace = 'balanced';
    calorieDelta = appliedGoal === 'muscle_building' ? 150 : 0;
  } else {
    // Adult goal logic with BMI & minimum floor safety checks
    if (input.fitnessGoal === 'fat_loss') {
      if (bmi < 18.5) {
        safetyWarnings.push(
          'Your current weight-to-height ratio is in the underweight range, so a calorie deficit is not recommended. Targets are set to estimated maintenance for safety.'
        );
        appliedGoal = 'weight_maintenance';
        appliedPace = 'balanced';
        calorieDelta = 0;
      } else {
        if (input.goalPace === 'hard') {
          if (bmi < 25) {
            safetyWarnings.push(
              'Focused deficit mode is reserved for higher energy reserves. We adjusted your plan to a moderate, sustainable pace to protect lean mass.'
            );
            appliedPace = 'medium';
            calorieDelta = -450;
          } else {
            // Cap hard deficit at 25% of TDEE or 650 kcal max
            calorieDelta = -Math.min(650, Math.round(tdee * 0.22));
            safetyWarnings.push(
              'Focused fat-loss mode uses a capped estimate and should be paired with high protein intake and regular check-ins. Adjust upward if you feel fatigued.'
            );
          }
        } else if (input.goalPace === 'medium') {
          calorieDelta = -Math.min(450, Math.round(tdee * 0.17));
        } else {
          appliedPace = 'slow';
          calorieDelta = -250;
        }
      }
    } else if (input.fitnessGoal === 'muscle_building') {
      if (input.goalPace === 'hard') {
        calorieDelta = 350;
      } else if (input.goalPace === 'medium') {
        calorieDelta = 250;
      } else {
        calorieDelta = 175;
      }
    } else {
      appliedPace = 'balanced';
      calorieDelta = 0;
    }
  }

  let targetCalories = maintenanceCalories + calorieDelta;

  // Enforce safe floor for adults and minors
  if (!isMinor && targetCalories < adultMinimumFloor) {
    targetCalories = adultMinimumFloor;
    calorieDelta = targetCalories - maintenanceCalories;
    safetyWarnings.push(
      `Daily target was raised to a safe minimum estimate of ${adultMinimumFloor} kcal to avoid extreme calorie restriction.`
    );
  }
  if (isMinor && targetCalories < maintenanceCalories) {
    targetCalories = maintenanceCalories;
    calorieDelta = 0;
  }

  // Optional adult custom target (clamped to safe range)
  if (!isMinor && input.customCalorieTarget && input.customCalorieTarget > 0) {
    const safeCustom = Math.max(
      adultMinimumFloor,
      Math.min(maintenanceCalories + 800, Math.round(input.customCalorieTarget))
    );
    if (input.customCalorieTarget < adultMinimumFloor) {
      safetyWarnings.push(
        `Custom calorie target cannot be set below the safe minimum of ${adultMinimumFloor} kcal.`
      );
    }
    targetCalories = safeCustom;
    calorieDelta = targetCalories - maintenanceCalories;
  }

  // Deterministic macronutrient calculation
  // Protein scaled to body weight (g/kg) appropriate for goal and age
  let proteinPerKg = 1.4;
  if (isMinor) {
    proteinPerKg = appliedGoal === 'muscle_building' ? 1.4 : 1.15;
  } else if (appliedGoal === 'muscle_building') {
    proteinPerKg = 1.8;
  } else if (appliedGoal === 'fat_loss') {
    proteinPerKg = 1.7;
  } else if (appliedGoal === 'general_fitness') {
    proteinPerKg = 1.4;
  } else {
    proteinPerKg = 1.35;
  }

  // Clamp protein to 15%–35% of total calories
  const rawProtein = Math.round(input.weightKg * proteinPerKg);
  const minProtein = Math.round((targetCalories * 0.16) / 4);
  const maxProtein = Math.round((targetCalories * 0.34) / 4);
  const proteinGrams = Math.max(minProtein, Math.min(maxProtein, rawProtein));

  // Fat ~25%–30% of calories (minimum 0.6g/kg for hormonal health)
  const fatShare = appliedGoal === 'muscle_building' ? 0.25 : 0.28;
  const fatGrams = Math.max(
    Math.round(input.weightKg * 0.65),
    Math.round((targetCalories * fatShare) / 9)
  );

  // Remaining calories allocated to complex carbohydrates (never demonizing carbs)
  const remainingForCarbs = Math.max(
    targetCalories * 0.35,
    targetCalories - proteinGrams * 4 - fatGrams * 9
  );
  const carbsGrams = Math.round(remainingForCarbs / 4);

  // Fiber: ~14g per 1000 kcal (IOM guideline), clamped 20–45g
  const fiberGrams = Math.max(20, Math.min(45, Math.round((targetCalories / 1000) * 14)));

  const explanation = isMinor
    ? `Estimated maintenance energy (${maintenanceCalories} kcal/day) supports healthy growth, daily movement, and balanced nutrition. Estimates vary naturally from person to person.`
    : `Estimated maintenance calories (${maintenanceCalories} kcal/day) represent an approximate daily energy level to maintain current body weight over time. Individual metabolism, sleep, and activity vary, so treat this as a flexible starting estimate rather than a guarantee.`;

  return {
    age,
    isMinor,
    bmr,
    tdee,
    maintenanceCalories,
    targetCalories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    fiberGrams,
    calorieDelta,
    appliedGoal,
    appliedPace,
    safetyWarnings,
    explanation,
  };
}

/**
 * Deterministically scales per-100g/ml nutrition values to a given quantity.
 */
export function scaleNutritionByQuantity(
  per100: MacroValues,
  quantity: number
): MacroValues {
  const safeQty = Math.max(0, quantity);
  const ratio = safeQty / 100;
  return {
    calories: Math.round(per100.calories * ratio),
    protein: Number((per100.protein * ratio).toFixed(1)),
    carbs: Number((per100.carbs * ratio).toFixed(1)),
    fat: Number((per100.fat * ratio).toFixed(1)),
    fiber: Number((per100.fiber * ratio).toFixed(1)),
    sugar: per100.sugar !== undefined ? Number((per100.sugar * ratio).toFixed(1)) : undefined,
    sodiumMg: per100.sodiumMg !== undefined ? Math.round(per100.sodiumMg * ratio) : undefined,
    saturatedFat:
      per100.saturatedFat !== undefined
        ? Number((per100.saturatedFat * ratio).toFixed(1))
        : undefined,
  };
}

/**
 * Deterministically scales a nutrition label's per-serving values by servings consumed.
 * Strictly preserves undefined fields — never invents missing label values.
 */
export function calculateLabelConsumption(
  perServing: Partial<MacroValues>,
  servingsConsumed: number
): Partial<MacroValues> {
  const mult = Math.max(0, servingsConsumed);
  const result: Partial<MacroValues> = {};
  if (typeof perServing.calories === 'number') {
    result.calories = Math.round(perServing.calories * mult);
  }
  if (typeof perServing.protein === 'number') {
    result.protein = Number((perServing.protein * mult).toFixed(1));
  }
  if (typeof perServing.carbs === 'number') {
    result.carbs = Number((perServing.carbs * mult).toFixed(1));
  }
  if (typeof perServing.fat === 'number') {
    result.fat = Number((perServing.fat * mult).toFixed(1));
  }
  if (typeof perServing.fiber === 'number') {
    result.fiber = Number((perServing.fiber * mult).toFixed(1));
  }
  if (typeof perServing.sugar === 'number') {
    result.sugar = Number((perServing.sugar * mult).toFixed(1));
  }
  if (typeof perServing.saturatedFat === 'number') {
    result.saturatedFat = Number((perServing.saturatedFat * mult).toFixed(1));
  }
  if (typeof perServing.sodiumMg === 'number') {
    result.sodiumMg = Math.round(perServing.sodiumMg * mult);
  }
  return result;
}

/**
 * Aggregates daily totals from saved food records for a specific date.
 */
export function summarizeDayEntries(entries: FoodRecordLike[], date: string): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  entryCount: number;
  byMeal: Record<MealType, FoodRecordLike[]>;
} {
  const dayEntries = entries.filter((e) => e.date === date);
  const byMeal: Record<MealType, FoodRecordLike[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
    daily_total: [],
  };

  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let fiber = 0;

  for (const item of dayEntries) {
    byMeal[item.mealType]?.push(item);
    calories += Number(item.calories) || 0;
    protein += Number(item.protein) || 0;
    carbs += Number(item.carbs) || 0;
    fat += Number(item.fat) || 0;
    fiber += Number(item.fiber) || 0;
  }

  return {
    calories: Math.round(calories),
    protein: Number(protein.toFixed(1)),
    carbs: Number(carbs.toFixed(1)),
    fat: Number(fat.toFixed(1)),
    fiber: Number(fiber.toFixed(1)),
    entryCount: dayEntries.length,
    byMeal,
  };
}

export interface PeriodAnalytics {
  daysTracked: number;
  totalDaysInWindow: number;
  consistencyPercent: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  avgFiber: number;
  dailySeries: {
    date: string;
    label: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  }[];
}

/**
 * Deterministically computes weekly (7d) or monthly (30d) analytics strictly from saved food entries.
 */
export function computePeriodAnalytics(
  entries: FoodRecordLike[],
  days: number,
  endDate: Date = new Date()
): PeriodAnalytics {
  const dailySeries: PeriodAnalytics['dailySeries'] = [];
  const totalsByDate = new Map<string, { calories: number; protein: number; carbs: number; fat: number; fiber: number }>();

  for (const e of entries) {
    const existing = totalsByDate.get(e.date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    existing.calories += Number(e.calories) || 0;
    existing.protein += Number(e.protein) || 0;
    existing.carbs += Number(e.carbs) || 0;
    existing.fat += Number(e.fat) || 0;
    existing.fiber += Number(e.fiber) || 0;
    totalsByDate.set(e.date, existing);
  }

  let daysTracked = 0;
  let sumCal = 0;
  let sumP = 0;
  let sumC = 0;
  let sumF = 0;
  let sumFiber = 0;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const key = formatLocalDate(d);
    const label =
      days <= 7
        ? d.toLocaleDateString('en-US', { weekday: 'short' })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayData = totalsByDate.get(key);
    const calories = dayData ? Math.round(dayData.calories) : 0;
    const protein = dayData ? Number(dayData.protein.toFixed(1)) : 0;
    const carbs = dayData ? Number(dayData.carbs.toFixed(1)) : 0;
    const fat = dayData ? Number(dayData.fat.toFixed(1)) : 0;
    const fiber = dayData ? Number(dayData.fiber.toFixed(1)) : 0;

    if (dayData && calories > 0) {
      daysTracked += 1;
      sumCal += calories;
      sumP += protein;
      sumC += carbs;
      sumF += fat;
      sumFiber += fiber;
    }

    dailySeries.push({ date: key, label, calories, protein, carbs, fat, fiber });
  }

  const divisor = daysTracked > 0 ? daysTracked : 1;

  return {
    daysTracked,
    totalDaysInWindow: days,
    consistencyPercent: Math.round((daysTracked / days) * 100),
    avgCalories: daysTracked > 0 ? Math.round(sumCal / divisor) : 0,
    avgProtein: daysTracked > 0 ? Number((sumP / divisor).toFixed(1)) : 0,
    avgCarbs: daysTracked > 0 ? Number((sumC / divisor).toFixed(1)) : 0,
    avgFat: daysTracked > 0 ? Number((sumF / divisor).toFixed(1)) : 0,
    avgFiber: daysTracked > 0 ? Number((sumFiber / divisor).toFixed(1)) : 0,
    dailySeries,
  };
}

export interface MacroPercentageBreakdown {
  carbsPct: number;
  fatsPct: number;
  proteinPct: number;
}

/**
 * Deterministically computes kcal-weighted macro percentage breakdown (Carbs 4, Fats 9, Protein 4).
 */
export function computeMacroPercentages(macros: {
  carbs: number;
  fat: number;
  protein: number;
}): MacroPercentageBreakdown {
  const cCal = Math.max(0, Number(macros.carbs) || 0) * 4;
  const fCal = Math.max(0, Number(macros.fat) || 0) * 9;
  const pCal = Math.max(0, Number(macros.protein) || 0) * 4;
  const total = cCal + fCal + pCal;
  if (total <= 0) {
    return { carbsPct: 0, fatsPct: 0, proteinPct: 0 };
  }
  const carbsPct = Number(((cCal / total) * 100).toFixed(1));
  const fatsPct = Number(((fCal / total) * 100).toFixed(1));
  const proteinPct = Number(Math.max(0, 100 - carbsPct - fatsPct).toFixed(1));
  return { carbsPct, fatsPct, proteinPct };
}

export interface IngredientShare {
  name: string;
  grams: number;
  percent: number;
}

/**
 * Deterministically computes ingredient weight percentages for the radial petal diagram.
 */
export function computeIngredientShares(
  items: { foodName: string; estimatedGrams: number }[]
): IngredientShare[] {
  const valid = items
    .map((item) => ({
      name: item.foodName.trim() || 'Ingredient',
      grams: Math.max(0, Number(item.estimatedGrams) || 0),
    }))
    .filter((i) => i.grams > 0);

  const totalGrams = valid.reduce((sum, i) => sum + i.grams, 0);
  if (totalGrams <= 0) return [];

  return valid
    .map((item) => ({
      name: item.name,
      grams: Math.round(item.grams),
      percent: Number(((item.grams / totalGrams) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.grams - a.grams);
}

export interface ConsistencyStreakDay {
  date: string;
  dayShort: string;
  dayNum: number;
  logged: boolean;
  isToday: boolean;
  calories: number;
  entryCount: number;
}

export interface ConsistencyStreakResult {
  currentStreak: number;
  longestStreak: number;
  loggedToday: boolean;
  totalDaysLogged: number;
  last7Days: ConsistencyStreakDay[];
}

function parseLocalDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(year, month - 1, day);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

/**
 * Deterministically computes the user's consecutive meal-logging consistency streak,
 * longest historical streak, and 7-day activity cadence strictly from saved food entries.
 * If the user has not logged today yet but logged yesterday, the active streak remains intact
 * with loggedToday = false so they are prompted to keep it alive.
 */
export function computeConsistencyStreak(
  entries: FoodRecordLike[],
  referenceDate: Date = new Date()
): ConsistencyStreakResult {
  const todayMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const todayKey = formatLocalDate(todayMidnight);

  const byDate = new Map<string, { calories: number; entryCount: number }>();
  for (const entry of entries) {
    const parsed = parseLocalDateKey(entry.date);
    if (!parsed) continue;
    // Ignore future dates when computing streak
    if (parsed.getTime() > todayMidnight.getTime()) continue;
    const prev = byDate.get(entry.date) ?? { calories: 0, entryCount: 0 };
    prev.calories += Number(entry.calories) || 0;
    prev.entryCount += 1;
    byDate.set(entry.date, prev);
  }

  const loggedToday = byDate.has(todayKey);

  // Compute current consecutive streak ending today (or yesterday if not yet logged today)
  let currentStreak = 0;
  const cursor = new Date(todayMidnight);
  if (!loggedToday) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (byDate.has(formatLocalDate(cursor))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Compute longest historical consecutive streak
  const sortedDateKeys = Array.from(byDate.keys()).sort();
  let longestStreak = 0;
  let running = 0;
  let prevDayMs: number | null = null;

  for (const key of sortedDateKeys) {
    const dt = parseLocalDateKey(key);
    if (!dt) continue;
    const dayMs = Math.round(dt.getTime() / 86_400_000);
    if (prevDayMs !== null && dayMs - prevDayMs === 1) {
      running += 1;
    } else {
      running = 1;
    }
    if (running > longestStreak) longestStreak = running;
    prevDayMs = dayMs;
  }

  // Build 7-day cadence ending on referenceDate
  const last7Days: ConsistencyStreakDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayMidnight);
    d.setDate(d.getDate() - i);
    const key = formatLocalDate(d);
    const stat = byDate.get(key);
    last7Days.push({
      date: key,
      dayShort: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      logged: Boolean(stat && stat.entryCount > 0),
      isToday: key === todayKey,
      calories: stat ? Math.round(stat.calories) : 0,
      entryCount: stat ? stat.entryCount : 0,
    });
  }

  return {
    currentStreak,
    longestStreak,
    loggedToday,
    totalDaysLogged: byDate.size,
    last7Days,
  };
}


