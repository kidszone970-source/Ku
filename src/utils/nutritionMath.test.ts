import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAge,
  calculateBMR,
  calculateTDEE,
  calculateNutritionTargets,
  scaleNutritionByQuantity,
  calculateLabelConsumption,
  summarizeDayEntries,
  computePeriodAnalytics,
  computeMacroPercentages,
  computeIngredientShares,
  computeConsistencyStreak,
  formatLocalDate,
} from './nutritionMath';

test('calculateAge computes exact age accurately before and after birthday', () => {
  const ref = new Date(2026, 10, 19); // Nov 19, 2026
  assert.equal(calculateAge('1996-11-19', ref), 30);
  assert.equal(calculateAge('1996-11-20', ref), 29);
  assert.equal(calculateAge('2011-05-10', ref), 15);
});

test('adult Mifflin-St Jeor BMR and TDEE calculations match clinical formulas', () => {
  // Male, 75kg, 178cm, 30y: 10*75 + 6.25*178 - 5*30 + 5 = 750 + 1112.5 - 150 + 5 = 1717.5 -> 1718
  const maleBmr = calculateBMR(75, 178, 30, 'male');
  assert.equal(maleBmr, 1718);
  assert.equal(calculateTDEE(maleBmr, 'moderately_active'), Math.round(1718 * 1.55));

  // Female, 60kg, 165cm, 28y: 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25 -> 1330
  const femaleBmr = calculateBMR(60, 165, 28, 'female');
  assert.equal(femaleBmr, 1330);
});

test('minors under 18 never receive restrictive fat-loss deficits or hard mode', () => {
  const ref = new Date(2026, 10, 19);
  const targets = calculateNutritionTargets(
    {
      dateOfBirth: '2011-03-10', // 15 years old
      gender: 'female',
      heightCm: 162,
      weightKg: 58,
      activityLevel: 'moderately_active',
      fitnessGoal: 'fat_loss',
      goalPace: 'hard',
    },
    ref
  );

  assert.equal(targets.isMinor, true);
  assert.equal(targets.appliedGoal, 'general_fitness');
  assert.equal(targets.appliedPace, 'balanced');
  assert.ok(targets.targetCalories >= targets.maintenanceCalories);
  assert.ok(targets.safetyWarnings.length > 0);
});

test('adult fat loss enforces safe minimum floor and prevents extreme restriction', () => {
  const ref = new Date(2026, 10, 19);
  const targets = calculateNutritionTargets(
    {
      dateOfBirth: '1995-01-01',
      gender: 'female',
      heightCm: 155,
      weightKg: 52,
      activityLevel: 'sedentary',
      fitnessGoal: 'fat_loss',
      goalPace: 'hard',
    },
    ref
  );

  assert.equal(targets.isMinor, false);
  assert.ok(targets.targetCalories >= 1200);
  // BMI is ~21.6 (<25), so hard mode should automatically downgrade to medium
  assert.equal(targets.appliedPace, 'medium');
});

test('adult muscle building provides surplus and personalized protein targets', () => {
  const ref = new Date(2026, 10, 19);
  const targets = calculateNutritionTargets(
    {
      dateOfBirth: '1994-06-15',
      gender: 'male',
      heightCm: 180,
      weightKg: 75,
      activityLevel: 'very_active',
      fitnessGoal: 'muscle_building',
      goalPace: 'medium',
    },
    ref
  );

  assert.equal(targets.appliedGoal, 'muscle_building');
  assert.equal(targets.calorieDelta, 250);
  assert.equal(targets.targetCalories, targets.maintenanceCalories + 250);
  assert.ok(targets.proteinGrams >= 130 && targets.proteinGrams <= 150);
  assert.ok(targets.carbsGrams >= 250);
});

test('scaleNutritionByQuantity scales verified food macros deterministically', () => {
  // 60g rolled oats (389 kcal, 16.9g P, 66.3g C, 6.9g F, 10.6g fiber per 100g)
  const scaled = scaleNutritionByQuantity(
    { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9, fiber: 10.6 },
    60
  );
  assert.equal(scaled.calories, 233);
  assert.equal(scaled.protein, 10.1);
  assert.equal(scaled.carbs, 39.8);
  assert.equal(scaled.fat, 4.1);
  assert.equal(scaled.fiber, 6.4);
});

test('calculateLabelConsumption preserves missing fields without inventing values', () => {
  const consumed = calculateLabelConsumption(
    { calories: 160, protein: 8, carbs: 20, fat: 5, fiber: undefined, sodiumMg: 180 },
    1.5
  );
  assert.equal(consumed.calories, 240);
  assert.equal(consumed.protein, 12);
  assert.equal(consumed.carbs, 30);
  assert.equal(consumed.fat, 7.5);
  assert.equal(consumed.sodiumMg, 270);
  assert.equal(consumed.fiber, undefined);
  assert.equal(consumed.sugar, undefined);
});

test('summarizeDayEntries and computePeriodAnalytics recalculate accurately on edit/delete', () => {
  const today = formatLocalDate(new Date(2026, 10, 19));
  const yesterday = formatLocalDate(new Date(2026, 10, 18));

  const entries = [
    {
      id: '1',
      date: today,
      mealType: 'breakfast' as const,
      foodName: 'Rolled Oats',
      quantity: 60,
      unit: 'g',
      calories: 233,
      protein: 10.1,
      carbs: 39.8,
      fat: 4.1,
      fiber: 6.4,
    },
    {
      id: '2',
      date: today,
      mealType: 'lunch' as const,
      foodName: 'Paneer Bowl',
      quantity: 320,
      unit: 'g',
      calories: 486,
      protein: 24,
      carbs: 58,
      fat: 16,
      fiber: 6.4,
    },
    {
      id: '3',
      date: yesterday,
      mealType: 'dinner' as const,
      foodName: 'Dal & Rice',
      quantity: 300,
      unit: 'g',
      calories: 360,
      protein: 14,
      carbs: 62,
      fat: 5,
      fiber: 8,
    },
  ];

  const todaySummary = summarizeDayEntries(entries, today);
  assert.equal(todaySummary.calories, 719);
  assert.equal(todaySummary.protein, 34.1);
  assert.equal(todaySummary.byMeal.breakfast.length, 1);
  assert.equal(todaySummary.byMeal.lunch.length, 1);

  const weekly = computePeriodAnalytics(entries, 7, new Date(2026, 10, 19));
  assert.equal(weekly.daysTracked, 2);
  assert.equal(weekly.avgCalories, Math.round((719 + 360) / 2));
  assert.equal(weekly.dailySeries.length, 7);
});

test('computeMacroPercentages computes accurate macro energy shares and handles zeros', () => {
  // 50g carbs (200 kcal), 20g fat (180 kcal), 30g protein (120 kcal) -> total 500 kcal
  const pct = computeMacroPercentages({ carbs: 50, fat: 20, protein: 30 });
  assert.equal(pct.carbsPct, 40);
  assert.equal(pct.fatsPct, 36);
  assert.equal(pct.proteinPct, 24);

  const zero = computeMacroPercentages({ carbs: 0, fat: 0, protein: 0 });
  assert.deepEqual(zero, { carbsPct: 0, fatsPct: 0, proteinPct: 0 });
});

test('computeIngredientShares sorts ingredients by weight share and sums accurately', () => {
  const shares = computeIngredientShares([
    { foodName: 'Salmon', estimatedGrams: 100 },
    { foodName: 'Rice', estimatedGrams: 150 },
    { foodName: 'Cucumber', estimatedGrams: 50 },
    { foodName: 'Sesame', estimatedGrams: 20 },
    { foodName: 'Spinach', estimatedGrams: 15 },
    { foodName: 'Lettuce', estimatedGrams: 15 },
  ]);

  assert.equal(shares.length, 6);
  assert.equal(shares[0].name, 'Rice');
  assert.equal(shares[0].percent, 42.9);
  assert.equal(shares[1].name, 'Salmon');
  assert.equal(shares[1].percent, 28.6);
  assert.equal(computeIngredientShares([]).length, 0);
});

test('computeConsistencyStreak handles empty, active, yesterday-alive, broken, and multi-entry days', () => {
  const ref = new Date(2026, 10, 19); // Nov 19, 2026
  const makeEntry = (id: string, date: string, calories = 400) => ({
    id,
    date,
    mealType: 'lunch' as const,
    foodName: 'Meal',
    quantity: 200,
    unit: 'g',
    calories,
    protein: 25,
    carbs: 40,
    fat: 12,
    fiber: 5,
  });

  // 1. Empty state
  const empty = computeConsistencyStreak([], ref);
  assert.equal(empty.currentStreak, 0);
  assert.equal(empty.longestStreak, 0);
  assert.equal(empty.loggedToday, false);
  assert.equal(empty.totalDaysLogged, 0);
  assert.equal(empty.last7Days.length, 7);
  assert.equal(empty.last7Days[6].isToday, true);

  // 2. Active 3-day streak including today + duplicate entries on same day
  const active = computeConsistencyStreak(
    [
      makeEntry('a', '2026-11-19', 350),
      makeEntry('b', '2026-11-19', 520),
      makeEntry('c', '2026-11-18', 600),
      makeEntry('d', '2026-11-17', 450),
    ],
    ref
  );
  assert.equal(active.currentStreak, 3);
  assert.equal(active.longestStreak, 3);
  assert.equal(active.loggedToday, true);
  assert.equal(active.totalDaysLogged, 3);
  assert.equal(active.last7Days[6].calories, 870);
  assert.equal(active.last7Days[6].entryCount, 2);

  // 3. Active streak ending yesterday (not logged today yet) remains alive
  const yesterdayAlive = computeConsistencyStreak(
    [
      makeEntry('c', '2026-11-18'),
      makeEntry('d', '2026-11-17'),
      makeEntry('e', '2026-11-16'),
    ],
    ref
  );
  assert.equal(yesterdayAlive.currentStreak, 3);
  assert.equal(yesterdayAlive.loggedToday, false);
  assert.equal(yesterdayAlive.longestStreak, 3);

  // 4. Broken streak (last logged 2 days ago) with older 4-day best streak
  const broken = computeConsistencyStreak(
    [
      makeEntry('1', '2026-11-17'),
      makeEntry('2', '2026-11-10'),
      makeEntry('3', '2026-11-11'),
      makeEntry('4', '2026-11-12'),
      makeEntry('5', '2026-11-13'),
    ],
    ref
  );
  assert.equal(broken.currentStreak, 0);
  assert.equal(broken.longestStreak, 4);
  assert.equal(broken.loggedToday, false);
  assert.equal(broken.totalDaysLogged, 5);
});


