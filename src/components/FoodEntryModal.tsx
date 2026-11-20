import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Search, X } from 'lucide-react';
import { VERIFIED_FOOD_DATABASE, searchVerifiedFoods, VerifiedFoodItem } from '../data/foodDatabase';
import { FoodEntry, FoodEntrySource } from '../types/nutrition';
import {
  DietaryPreference,
  MealType,
  scaleNutritionByQuantity,
} from '../utils/nutritionMath';
import { InlineMacroRow } from './NutrientVisuals';

interface FoodEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate: string;
  defaultMealType?: MealType;
  dietaryPreference?: DietaryPreference;
  editingEntry?: FoodEntry | null;
  onSaveNew: (entry: Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onSaveEdit?: (
    entryId: string,
    updates: Partial<Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'source'>>
  ) => Promise<void>;
}

export const FoodEntryModal: React.FC<FoodEntryModalProps> = ({
  isOpen,
  onClose,
  defaultDate,
  defaultMealType = 'breakfast',
  dietaryPreference,
  editingEntry,
  onSaveNew,
  onSaveEdit,
}) => {
  const [mode, setMode] = useState<'search' | 'manual'>(editingEntry ? 'manual' : 'search');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterByDiet, setFilterByDiet] = useState(false);
  const [selectedFood, setSelectedFood] = useState<VerifiedFoodItem | null>(null);

  const [date, setDate] = useState(editingEntry?.date ?? defaultDate);
  const [mealType, setMealType] = useState<MealType>(editingEntry?.mealType ?? defaultMealType);
  const [foodName, setFoodName] = useState(editingEntry?.foodName ?? '');
  const [quantity, setQuantity] = useState(String(editingEntry?.quantity ?? 100));
  const [unit, setUnit] = useState(editingEntry?.unit ?? 'g');
  const [servingDescription, setServingDescription] = useState(
    editingEntry?.servingDescription ?? ''
  );
  const [calories, setCalories] = useState(String(editingEntry?.calories ?? ''));
  const [protein, setProtein] = useState(String(editingEntry?.protein ?? ''));
  const [carbs, setCarbs] = useState(String(editingEntry?.carbs ?? ''));
  const [fat, setFat] = useState(String(editingEntry?.fat ?? ''));
  const [fiber, setFiber] = useState(String(editingEntry?.fiber ?? '0'));
  const [sugar, setSugar] = useState(
    editingEntry?.sugar !== undefined ? String(editingEntry.sugar) : ''
  );
  const [sodiumMg, setSodiumMg] = useState(
    editingEntry?.sodiumMg !== undefined ? String(editingEntry.sodiumMg) : ''
  );
  const [notes, setNotes] = useState(editingEntry?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchResults = useMemo(
    () =>
      searchVerifiedFoods(searchQuery, filterByDiet ? dietaryPreference : undefined).slice(0, 24),
    [searchQuery, filterByDiet, dietaryPreference]
  );

  if (!isOpen) return null;

  const applyVerifiedFood = (item: VerifiedFoodItem, qty = item.defaultServingQty) => {
    const scaled = scaleNutritionByQuantity(item.per100, qty);
    setSelectedFood(item);
    setFoodName(item.name);
    setQuantity(String(qty));
    setUnit(item.defaultUnit);
    setServingDescription(item.servingLabel);
    setCalories(String(scaled.calories));
    setProtein(String(scaled.protein));
    setCarbs(String(scaled.carbs));
    setFat(String(scaled.fat));
    setFiber(String(scaled.fiber));
    setSugar(scaled.sugar !== undefined ? String(scaled.sugar) : '');
    setSodiumMg(scaled.sodiumMg !== undefined ? String(scaled.sodiumMg) : '');
    setMode('manual');
  };

  const handleQuantityChange = (nextVal: string) => {
    setQuantity(nextVal);
    if (selectedFood) {
      const num = Number(nextVal);
      if (Number.isFinite(num) && num >= 0) {
        const scaled = scaleNutritionByQuantity(selectedFood.per100, num);
        setCalories(String(scaled.calories));
        setProtein(String(scaled.protein));
        setCarbs(String(scaled.carbs));
        setFat(String(scaled.fat));
        setFiber(String(scaled.fiber));
        if (scaled.sugar !== undefined) setSugar(String(scaled.sugar));
        if (scaled.sodiumMg !== undefined) setSodiumMg(String(scaled.sodiumMg));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!foodName.trim()) {
      setError('Food name is required.');
      return;
    }
    const calNum = Number(calories);
    if (!Number.isFinite(calNum) || calNum < 0) {
      setError('Please enter valid calories (0 or more).');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date,
        mealType,
        foodName: foodName.trim(),
        quantity: Number(quantity) || 1,
        unit: unit.trim() || 'g',
        servingDescription: servingDescription.trim() || undefined,
        calories: Math.round(calNum),
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
        fiber: Number(fiber) || 0,
        sugar: sugar !== '' ? Number(sugar) : undefined,
        sodiumMg: sodiumMg !== '' ? Number(sodiumMg) : undefined,
        notes: notes.trim() || undefined,
        isEstimated: editingEntry ? editingEntry.isEstimated : !selectedFood,
      };

      if (editingEntry && onSaveEdit) {
        await onSaveEdit(editingEntry.id, payload);
      } else {
        const source: FoodEntrySource = selectedFood ? 'database' : 'manual';
        await onSaveNew({ ...payload, source });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save food entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editingEntry ? 'Edit Food Entry' : 'Log Food Entry'}
    >
      <motion.div
        initial={{ y: 36, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-[#1B1C19] rounded-t-[32px] sm:rounded-[32px] p-6 border border-black/[0.06] dark:border-white/10 shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-[#171715] dark:text-white">
              {editingEntry ? 'Edit Food Record' : 'Add Food to Diary'}
            </h2>
            <p className="text-xs text-[#787872] dark:text-[#9C9C94]">
              {VERIFIED_FOOD_DATABASE.length} verified whole foods or custom entry
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close food entry modal"
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#787872] hover:text-[#171715] dark:hover:text-white hover:bg-[#F4F4F0] dark:hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!editingEntry && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-[#F4F4F0] dark:bg-[#111210]">
            <button
              type="button"
              onClick={() => setMode('search')}
              className={`h-9 rounded-full text-xs font-bold transition-colors ${
                mode === 'search'
                  ? 'bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513] shadow-xs'
                  : 'text-[#62625C] dark:text-[#9C9C94]'
              }`}
            >
              Search Food Database
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`h-9 rounded-full text-xs font-bold transition-colors ${
                mode === 'manual'
                  ? 'bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513] shadow-xs'
                  : 'text-[#62625C] dark:text-[#9C9C94]'
              }`}
            >
              Manual Entry
            </button>
          </div>
        )}

        {mode === 'search' && !editingEntry ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#787872] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search oats, paneer, rice, dal, eggs, chicken..."
                aria-label="Search verified foods"
                className="w-full h-11 pl-10 pr-4 rounded-full bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#171715] dark:focus:ring-[#A3F056]"
              />
            </div>

            {dietaryPreference && (
              <label className="flex items-center gap-2 text-xs text-[#62625C] dark:text-[#9C9C94] cursor-pointer px-1">
                <input
                  type="checkbox"
                  checked={filterByDiet}
                  onChange={(e) => setFilterByDiet(e.target.checked)}
                  className="rounded accent-[#54A630]"
                />
                Match my dietary preference only
              </label>
            )}

            <div className="divide-y divide-black/[0.05] dark:divide-white/10 max-h-80 overflow-y-auto rounded-2xl border border-black/[0.06] dark:border-white/10">
              {searchResults.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <p className="text-sm text-[#787872] dark:text-[#9C9C94]">
                    No matching food found in database.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFoodName(searchQuery);
                      setSelectedFood(null);
                      setMode('manual');
                    }}
                    className="text-xs font-bold text-[#4B962A] dark:text-[#A3F056] hover:underline"
                  >
                    Enter &ldquo;{searchQuery || 'custom food'}&rdquo; manually
                  </button>
                </div>
              ) : (
                searchResults.map((item) => {
                  const preview = scaleNutritionByQuantity(item.per100, item.defaultServingQty);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => applyVerifiedFood(item)}
                      className="w-full text-left px-4 py-3 hover:bg-[#F4F4F0] dark:hover:bg-white/5 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
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
                      <span className="font-mono tabular-nums text-sm font-extrabold text-[#171715] dark:text-[#A3F056] shrink-0">
                        {preview.calories} kcal
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-[#FDECEC] dark:bg-[#E5484D]/15 text-[#B42328] dark:text-[#FCA5A5] text-xs"
              >
                {error}
              </div>
            )}

            {selectedFood && (
              <div className="p-3 rounded-2xl bg-[#EEF8E8] dark:bg-[#54A630]/15 text-xs text-[#2B5D16] dark:text-[#B7F297] flex items-center justify-between gap-2">
                <span>
                  Auto-scaling from verified data ({selectedFood.per100.calories} kcal per 100
                  {selectedFood.defaultUnit})
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedFood(null)}
                  className="font-bold underline shrink-0"
                >
                  Unlock
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="fe-date" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Date
                </label>
                <input
                  id="fe-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="fe-meal" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Meal Section
                </label>
                <select
                  id="fe-meal"
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value as MealType)}
                  className="w-full h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snacks">Snacks</option>
                  <option value="daily_total">Full-Day Total</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="fe-name" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                Food Name
              </label>
              <input
                id="fe-name"
                type="text"
                value={foodName}
                onChange={(e) => setFoodName(e.target.value)}
                placeholder="e.g., Rolled Oats (Dry)"
                required
                className="w-full h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label htmlFor="fe-qty" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Quantity
                </label>
                <input
                  id="fe-qty"
                  type="number"
                  min={0}
                  step="any"
                  value={quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="fe-unit" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Unit
                </label>
                <select
                  id="fe-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
                >
                  <option value="g">g (grams)</option>
                  <option value="ml">ml</option>
                  <option value="serving">serving</option>
                  <option value="piece">piece</option>
                  <option value="cup">cup</option>
                  <option value="day">day</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="fe-cal" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Calories (kcal)
                </label>
                <input
                  id="fe-cal"
                  type="number"
                  min={0}
                  step="1"
                  required
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums font-extrabold text-[#171715] dark:text-[#A3F056]"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              <div className="space-y-1">
                <label htmlFor="fe-carbs" className="text-xs font-semibold text-[#4B962A] dark:text-[#86E05C]">
                  Carbs (g)
                </label>
                <input
                  id="fe-carbs"
                  type="number"
                  min={0}
                  step="0.1"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="fe-fat" className="text-xs font-semibold text-[#D4880F] dark:text-[#FBBF24]">
                  Fat (g)
                </label>
                <input
                  id="fe-fat"
                  type="number"
                  min={0}
                  step="0.1"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="fe-protein" className="text-xs font-semibold text-[#DC3B40] dark:text-[#F87171]">
                  Protein (g)
                </label>
                <input
                  id="fe-protein"
                  type="number"
                  min={0}
                  step="0.1"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="fe-fiber" className="text-xs font-semibold text-[#257968] dark:text-[#5EEAD4]">
                  Fiber (g)
                </label>
                <input
                  id="fe-fiber"
                  type="number"
                  min={0}
                  step="0.1"
                  value={fiber}
                  onChange={(e) => setFiber(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="fe-sugar" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Sugar (g, optional)
                </label>
                <input
                  id="fe-sugar"
                  type="number"
                  min={0}
                  step="0.1"
                  value={sugar}
                  onChange={(e) => setSugar(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="fe-sodium" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Sodium (mg, optional)
                </label>
                <input
                  id="fe-sodium"
                  type="number"
                  min={0}
                  step="1"
                  value={sodiumMg}
                  onChange={(e) => setSodiumMg(e.target.value)}
                  className="w-full h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="fe-notes" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                Notes (optional)
              </label>
              <input
                id="fe-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., homemade, cooked weight"
                className="w-full h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-5 rounded-full bg-[#F4F4F0] dark:bg-white/10 text-[#171715] dark:text-white text-sm font-bold"
              >
                Cancel
              </button>
              <motion.button
                type="submit"
                whileTap={{ scale: 0.97 }}
                disabled={saving}
                className="h-11 px-6 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white text-sm font-bold disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingEntry ? 'Save Changes' : 'Add to Diary'}
              </motion.button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
};
