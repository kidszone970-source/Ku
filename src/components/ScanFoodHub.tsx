import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  CheckCircle2,
  Eye,
  FileText,
  Image as ImageIcon,
  Info,
  Minus,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  FoodEntry,
  NutritionLabelResponse,
  ScanFoodResponse,
  ScannedFoodItem,
  UserProfile,
} from '../types/nutrition';
import {
  calculateLabelConsumption,
  computeIngredientShares,
  computeMacroPercentages,
  MealType,
  NutritionTargetsResult,
  scaleNutritionByQuantity,
} from '../utils/nutritionMath';
import { analyzeFoodPhoto, analyzeNutritionLabel } from '../services/aiClient';
import { searchVerifiedFoods, VerifiedFoodItem } from '../data/foodDatabase';
import {
  InlineMacroRow,
  MacroPercentageTiles,
  RadialPetalChart,
} from './NutrientVisuals';

type ScanMode = 'camera' | 'gallery' | 'label' | 'manual';

interface ScanFoodHubProps {
  profile: UserProfile;
  targets: NutritionTargetsResult;
  selectedDate: string;
  onLogEntries: (
    entries: Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[]
  ) => Promise<void>;
}

const SAMPLE_PREVIEW_SCAN: ScanFoodResponse = {
  dishTitle: 'Salmon & Rice Garden Bowl',
  summary:
    'Interactive sample preview showing how scanned dishes break down into radial ingredient shares and color-coded macros. Upload your own photo for live AI analysis.',
  items: [
    {
      foodName: 'Steamed Rice',
      estimatedGrams: 150,
      unit: 'g',
      calories: 195,
      protein: 4.1,
      carbs: 42.3,
      fat: 0.4,
      fiber: 0.6,
      confidence: 'high',
    },
    {
      foodName: 'Grilled Salmon',
      estimatedGrams: 100,
      unit: 'g',
      calories: 208,
      protein: 20.4,
      carbs: 0,
      fat: 13.4,
      fiber: 0,
      confidence: 'high',
    },
    {
      foodName: 'Fresh Cucumber',
      estimatedGrams: 50,
      unit: 'g',
      calories: 8,
      protein: 0.3,
      carbs: 1.8,
      fat: 0.1,
      fiber: 0.3,
      confidence: 'high',
    },
    {
      foodName: 'Toasted Sesame',
      estimatedGrams: 20,
      unit: 'g',
      calories: 114,
      protein: 3.5,
      carbs: 4.7,
      fat: 9.9,
      fiber: 2.4,
      confidence: 'medium',
    },
    {
      foodName: 'Baby Spinach',
      estimatedGrams: 15,
      unit: 'g',
      calories: 4,
      protein: 0.4,
      carbs: 0.5,
      fat: 0.1,
      fiber: 0.3,
      confidence: 'high',
    },
    {
      foodName: 'Crisp Lettuce',
      estimatedGrams: 15,
      unit: 'g',
      calories: 3,
      protein: 0.2,
      carbs: 0.4,
      fat: 0.0,
      fiber: 0.2,
      confidence: 'high',
    },
  ],
  coachTip:
    'Balanced omega-3 fats and complex carbs. Adjust any ingredient weight below before logging.',
  uncertaintyNote:
    'This is an interactive layout preview (not saved to your diary unless you tap Confirm). Capture or upload a meal photo for real AI vision estimation.',
};

export const ScanFoodHub: React.FC<ScanFoodHubProps> = ({
  profile,
  targets,
  selectedDate,
  onLogEntries,
}) => {
  const [mode, setMode] = useState<ScanMode>('camera');
  const [mealType, setMealType] = useState<MealType>('lunch');

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);

  // Image + AI Food Scan state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanFoodResponse | null>(null);
  const [isSamplePreview, setIsSamplePreview] = useState(false);
  const [editableItems, setEditableItems] = useState<ScannedFoodItem[]>([]);
  const [portionMultiplier, setPortionMultiplier] = useState(1.0);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Nutrition Label OCR state
  const [labelPreviewUrl, setLabelPreviewUrl] = useState<string | null>(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [labelResult, setLabelResult] = useState<NutritionLabelResponse | null>(null);
  const [servingsConsumed, setServingsConsumed] = useState('1');

  // Manual & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<VerifiedFoodItem | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState('100');
  const [manualUnit, setManualUnit] = useState('g');
  const [manualServing, setManualServing] = useState('');
  const [manualCal, setManualCal] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualFiber, setManualFiber] = useState('0');
  const [manualError, setManualError] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    setCameraNotice(null);
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraNotice('Camera access is unavailable in this browser. Upload a photo instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraNotice(
        'Camera permission was declined or no camera is connected. You can upload a meal photo directly.'
      );
    }
  };

  const runFoodAnalysis = async (dataUrl: string, mimeType: string) => {
    setPreviewUrl(dataUrl);
    setScanError(null);
    setSaveSuccess(null);
    setIsSamplePreview(false);
    setScanLoading(true);
    try {
      const result = await analyzeFoodPhoto(dataUrl, mimeType, {
        dietaryPreference: profile.dietaryPreference,
        fitnessGoal: targets.appliedGoal,
        isMinor: targets.isMinor,
      });
      setScanResult(result);
      setEditableItems(result.items ?? []);
      setPortionMultiplier(1.0);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to analyze food photo.');
    } finally {
      setScanLoading(false);
    }
  };

  const handleLoadInteractivePreview = () => {
    setScanError(null);
    setSaveSuccess(null);
    setPreviewUrl(null);
    setIsSamplePreview(true);
    setScanResult(SAMPLE_PREVIEW_SCAN);
    setEditableItems(SAMPLE_PREVIEW_SCAN.items.map((item) => ({ ...item })));
    setPortionMultiplier(1.0);
  };

  const handleCaptureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopCamera();
    void runFoodAnalysis(dataUrl, 'image/jpeg');
  };

  const handleFilePick = (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'food' | 'label'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (kind === 'food') {
        void runFoodAnalysis(result, file.type || 'image/jpeg');
      } else {
        void runLabelAnalysis(result, file.type || 'image/jpeg');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const runLabelAnalysis = async (dataUrl: string, mimeType: string) => {
    setLabelPreviewUrl(dataUrl);
    setLabelError(null);
    setSaveSuccess(null);
    setLabelLoading(true);
    try {
      const res = await analyzeNutritionLabel(dataUrl, mimeType);
      setLabelResult(res);
      setServingsConsumed('1');
    } catch (err) {
      setLabelError(err instanceof Error ? err.message : 'Could not read nutrition label.');
    } finally {
      setLabelLoading(false);
    }
  };

  // Deterministic scaled totals for food scan
  const scaledScanTotals = useMemo(() => {
    return editableItems.reduce(
      (acc, item) => ({
        weight: acc.weight + Math.round(item.estimatedGrams * portionMultiplier),
        calories: acc.calories + Math.round(item.calories * portionMultiplier),
        protein: Number((acc.protein + item.protein * portionMultiplier).toFixed(1)),
        carbs: Number((acc.carbs + item.carbs * portionMultiplier).toFixed(1)),
        fat: Number((acc.fat + item.fat * portionMultiplier).toFixed(1)),
        fiber: Number((acc.fiber + item.fiber * portionMultiplier).toFixed(1)),
      }),
      { weight: 0, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
  }, [editableItems, portionMultiplier]);

  const scanMacroPcts = useMemo(
    () =>
      computeMacroPercentages({
        carbs: scaledScanTotals.carbs,
        fat: scaledScanTotals.fat,
        protein: scaledScanTotals.protein,
      }),
    [scaledScanTotals]
  );

  const scanIngredientShares = useMemo(
    () =>
      computeIngredientShares(
        editableItems.map((item) => ({
          foodName: item.foodName,
          estimatedGrams: Math.round(item.estimatedGrams * portionMultiplier),
        }))
      ),
    [editableItems, portionMultiplier]
  );

  const handleSaveScannedMeal = async () => {
    if (editableItems.length === 0) return;
    const entries = editableItems.map((item) => ({
      date: selectedDate,
      mealType,
      foodName: item.foodName,
      quantity: Math.round(item.estimatedGrams * portionMultiplier),
      unit: item.unit || 'g',
      servingDescription: `${portionMultiplier.toFixed(2)}x estimated portion`,
      calories: Math.round(item.calories * portionMultiplier),
      protein: Number((item.protein * portionMultiplier).toFixed(1)),
      carbs: Number((item.carbs * portionMultiplier).toFixed(1)),
      fat: Number((item.fat * portionMultiplier).toFixed(1)),
      fiber: Number((item.fiber * portionMultiplier).toFixed(1)),
      source: (mode === 'camera' ? 'camera' : 'gallery') as 'camera' | 'gallery',
      isEstimated: true,
    }));
    await onLogEntries(entries);
    setSaveSuccess(`Logged ${entries.length} item(s) (${scaledScanTotals.calories} kcal) to ${mealType}.`);
  };

  // Deterministic label consumption math
  const labelCalculated = useMemo(() => {
    if (!labelResult) return null;
    const mult = Number(servingsConsumed) || 0;
    return calculateLabelConsumption(
      {
        calories: labelResult.calories ?? undefined,
        protein: labelResult.protein ?? undefined,
        carbs: labelResult.carbs ?? undefined,
        fat: labelResult.fat ?? undefined,
        fiber: labelResult.fiber ?? undefined,
        sugar: labelResult.sugar ?? undefined,
        saturatedFat: labelResult.saturatedFat ?? undefined,
        sodiumMg: labelResult.sodiumMg ?? undefined,
      },
      mult
    );
  }, [labelResult, servingsConsumed]);

  const handleSaveLabelEntry = async () => {
    if (!labelResult || !labelCalculated) return;
    const mult = Number(servingsConsumed) || 1;
    await onLogEntries([
      {
        date: selectedDate,
        mealType,
        foodName: labelResult.productName || 'Packaged Food',
        quantity: labelResult.servingGramsOrMl
          ? Math.round(labelResult.servingGramsOrMl * mult)
          : mult,
        unit: labelResult.servingGramsOrMl ? 'g' : 'serving',
        servingDescription: `${mult} × ${labelResult.servingSizeText}`,
        calories: labelCalculated.calories ?? 0,
        protein: labelCalculated.protein ?? 0,
        carbs: labelCalculated.carbs ?? 0,
        fat: labelCalculated.fat ?? 0,
        fiber: labelCalculated.fiber ?? 0,
        sugar: labelCalculated.sugar,
        sodiumMg: labelCalculated.sodiumMg,
        saturatedFat: labelCalculated.saturatedFat,
        source: 'label',
        isEstimated: false,
      },
    ]);
    setSaveSuccess(`Saved ${labelResult.productName} to ${mealType}.`);
  };

  const filteredFoods = useMemo(() => searchVerifiedFoods(searchQuery).slice(0, 15), [searchQuery]);

  const handleSelectDbFood = (item: VerifiedFoodItem) => {
    const scaled = scaleNutritionByQuantity(item.per100, item.defaultServingQty);
    setSelectedFood(item);
    setManualName(item.name);
    setManualQty(String(item.defaultServingQty));
    setManualUnit(item.defaultUnit);
    setManualServing(item.servingLabel);
    setManualCal(String(scaled.calories));
    setManualProtein(String(scaled.protein));
    setManualCarbs(String(scaled.carbs));
    setManualFat(String(scaled.fat));
    setManualFiber(String(scaled.fiber));
    setManualError(null);
  };

  const handleManualQtyChange = (val: string) => {
    setManualQty(val);
    if (selectedFood) {
      const num = Number(val);
      if (Number.isFinite(num) && num >= 0) {
        const scaled = scaleNutritionByQuantity(selectedFood.per100, num);
        setManualCal(String(scaled.calories));
        setManualProtein(String(scaled.protein));
        setManualCarbs(String(scaled.carbs));
        setManualFat(String(scaled.fat));
        setManualFiber(String(scaled.fiber));
      }
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    setSaveSuccess(null);
    if (!manualName.trim()) {
      setManualError('Please enter a food name.');
      return;
    }
    const cal = Number(manualCal);
    if (!Number.isFinite(cal) || cal < 0) {
      setManualError('Please enter valid calories.');
      return;
    }
    await onLogEntries([
      {
        date: selectedDate,
        mealType,
        foodName: manualName.trim(),
        quantity: Number(manualQty) || 100,
        unit: manualUnit,
        servingDescription: manualServing.trim() || undefined,
        calories: Math.round(cal),
        protein: Number(manualProtein) || 0,
        carbs: Number(manualCarbs) || 0,
        fat: Number(manualFat) || 0,
        fiber: Number(manualFiber) || 0,
        source: selectedFood ? 'database' : 'manual',
        isEstimated: !selectedFood,
      },
    ]);
    setSaveSuccess(`Logged ${manualName.trim()} (${Math.round(cal)} kcal) to ${mealType}.`);
    setManualName('');
    setManualCal('');
    setManualProtein('');
    setManualCarbs('');
    setManualFat('');
    setManualFiber('0');
    setSelectedFood(null);
  };

  return (
    <div className="space-y-7">
      {/* Header & Meal Section Selector */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-3xl sm:text-[40px] font-extrabold tracking-tight leading-[1.08]">
            <span className="text-[#171715] dark:text-[#F4F4F0]">Scan &amp; </span>
            <span className="text-[#787872] dark:text-[#9C9C94]">Analyze Food</span>
          </h1>
          <p className="text-sm font-medium text-[#62625C] dark:text-[#A1A19A]">
            Logging for <span className="font-mono tabular-nums font-semibold text-[#171715] dark:text-[#E8E8E2]">{selectedDate}</span> · Photo, Nutrition Label &amp; Verified Search
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <label
            htmlFor="scan-meal-select"
            className="text-sm font-semibold text-[#62625C] dark:text-[#A1A19A]"
          >
            Meal:
          </label>
          <select
            id="scan-meal-select"
            value={mealType}
            onChange={(e) => setMealType(e.target.value as MealType)}
            className="h-10 px-4 rounded-full bg-white dark:bg-[#1B1C19] border border-black/[0.06] dark:border-white/10 text-sm font-bold text-[#171715] dark:text-white card-soft"
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snacks">Snacks</option>
          </select>
        </div>
      </div>

      {/* 4-Method Animated Segmented Switcher */}
      <div
        role="tablist"
        aria-label="Food logging methods"
        className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 rounded-[22px] bg-white dark:bg-[#1B1C19] card-soft border border-black/[0.04] dark:border-white/10"
      >
        {[
          { id: 'camera' as const, label: 'Camera Scan', icon: Camera },
          { id: 'gallery' as const, label: 'Gallery Upload', icon: ImageIcon },
          { id: 'label' as const, label: 'Nutrition Label', icon: FileText },
          { id: 'manual' as const, label: 'Manual & Search', icon: Search },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                if (tab.id !== 'camera') stopCamera();
                setMode(tab.id);
                setSaveSuccess(null);
              }}
              className={`relative h-11 px-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                active
                  ? 'text-white dark:text-[#151513]'
                  : 'text-[#62625C] dark:text-[#A1A19A] hover:text-[#171715] dark:hover:text-white'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="scan-tab-pill"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-2xl bg-[#151513] dark:bg-[#A3F056]"
                />
              )}
              <Icon className="w-4 h-4 shrink-0 relative z-10" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-4 rounded-2xl bg-[#EEF8E8] dark:bg-[#54A630]/15 border border-[#54A630]/30 text-[#346E1B] dark:text-[#86E05C] text-sm font-semibold flex items-center gap-2.5"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{saveSuccess}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CAMERA & GALLERY MODES */}
      {(mode === 'camera' || mode === 'gallery') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Viewfinder with Lime Laser Sweep & Bold Black Shutter */}
          <div className="lg:col-span-6 flex flex-col space-y-4 lg:sticky lg:top-6">
            <div className="relative w-full aspect-[4/3] sm:aspect-[4/3.5] rounded-[32px] overflow-hidden bg-[#151513] border border-black/10 dark:border-white/10 shadow-md">
              {cameraActive ? (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Captured meal preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-white space-y-4">
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-[#A3F056]">
                    {mode === 'camera' ? (
                      <Camera className="w-8 h-8" />
                    ) : (
                      <Upload className="w-8 h-8" />
                    )}
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <p className="text-base font-extrabold">
                      {mode === 'camera' ? 'Frame Your Meal Plate' : 'Upload a Meal Photo'}
                    </p>
                    <p className="text-xs text-[#A1A19A] leading-relaxed">
                      {mode === 'camera'
                        ? 'Open your camera or pick a photo to unlock radial ingredient breakdown and color-coded macros.'
                        : 'Select a clear overhead plate photo from your device gallery for instant AI macro estimation.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Luminous Lime Corner Reticles matching reference screen 2 */}
              <div className="pointer-events-none absolute inset-6">
                <div className="absolute top-0 left-0 w-9 h-9 border-t-4 border-l-4 border-[#A3F056] rounded-tl-2xl drop-shadow-[0_0_8px_rgba(163,240,86,0.65)]" />
                <div className="absolute top-0 right-0 w-9 h-9 border-t-4 border-r-4 border-[#A3F056] rounded-tr-2xl drop-shadow-[0_0_8px_rgba(163,240,86,0.65)]" />
                <div className="absolute bottom-0 left-0 w-9 h-9 border-b-4 border-l-4 border-[#A3F056] rounded-bl-2xl drop-shadow-[0_0_8px_rgba(163,240,86,0.65)]" />
                <div className="absolute bottom-0 right-0 w-9 h-9 border-b-4 border-r-4 border-[#A3F056] rounded-br-2xl drop-shadow-[0_0_8px_rgba(163,240,86,0.65)]" />

                {/* Animated Sweeping Lime Scan Laser */}
                {(cameraActive || scanLoading) && (
                  <motion.div
                    initial={{ top: '8%' }}
                    animate={{ top: ['8%', '88%', '8%'] }}
                    transition={{
                      duration: scanLoading ? 1.5 : 2.8,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="absolute left-1 right-1 h-14 -translate-y-1/2 pointer-events-none"
                  >
                    <div className="w-full h-[2.5px] bg-[#A3F056] shadow-[0_0_16px_4px_rgba(163,240,86,0.85)]" />
                    <div className="w-full h-12 bg-gradient-to-b from-[#A3F056]/30 to-transparent" />
                  </motion.div>
                )}
              </div>

              {scanLoading && (
                <div className="absolute inset-0 bg-[#151513]/70 backdrop-blur-[2px] flex flex-col items-center justify-center text-white gap-3">
                  <RefreshCw className="w-8 h-8 text-[#A3F056] animate-spin" />
                  <p className="text-sm font-bold">Identifying ingredients &amp; macro shares...</p>
                </div>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {cameraNotice && (
              <p className="text-xs text-[#6F4400] dark:text-[#FDE68A] bg-[#FEF5E5] dark:bg-[#E69718]/15 p-3 rounded-2xl">
                {cameraNotice}
              </p>
            )}

            {scanError && (
              <p
                role="alert"
                className="text-xs text-[#B42328] dark:text-[#FCA5A5] bg-[#FDECEC] dark:bg-[#E5484D]/15 p-3 rounded-2xl"
              >
                {scanError}
              </p>
            )}

            {/* Reference-Inspired Shutter & Upload Action Bar */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              {mode === 'camera' && !cameraActive && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => startCamera()}
                  className="h-14 px-6 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white text-sm font-bold flex items-center gap-2.5 shadow-md"
                >
                  <span className="w-7 h-7 rounded-full border-2 border-white/80 dark:border-[#151513]/80 flex items-center justify-center">
                    <Camera className="w-3.5 h-3.5" />
                  </span>
                  Open Camera
                </motion.button>
              )}

              {cameraActive && (
                <>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={handleCaptureFrame}
                    aria-label="Capture and analyze meal photo"
                    className="w-16 h-16 rounded-full bg-[#151513] dark:bg-white p-1.5 shadow-xl flex items-center justify-center"
                  >
                    <span className="w-full h-full rounded-full border-2 border-white dark:border-[#151513] flex items-center justify-center">
                      <Camera className="w-5 h-5 text-[#A3F056] dark:text-[#151513]" />
                    </span>
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = cameraFacing === 'environment' ? 'user' : 'environment';
                      setCameraFacing(next);
                      void startCamera(next);
                    }}
                    className="h-11 px-4 rounded-full bg-white dark:bg-[#1B1C19] border border-black/10 dark:border-white/10 text-xs font-bold text-[#171715] dark:text-white"
                  >
                    Flip Camera
                  </button>
                </>
              )}

              <label className="h-12 px-5 rounded-full bg-white dark:bg-[#1B1C19] border border-black/10 dark:border-white/10 text-[#171715] dark:text-white text-sm font-bold flex items-center gap-2 cursor-pointer hover:bg-[#F4F4F0] dark:hover:bg-white/10 card-soft">
                <Upload className="w-4 h-4" />
                <span>{previewUrl ? 'Choose Another Photo' : 'Upload Meal Photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture={mode === 'camera' ? 'environment' : undefined}
                  onChange={(e) => handleFilePick(e, 'food')}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Right: Radial Petal Breakdown + Color-Coded Macro Tiles + Editable Ingredients */}
          <div className="lg:col-span-6 bg-white dark:bg-[#1B1C19] rounded-[32px] p-6 card-soft border border-black/[0.04] dark:border-white/10 flex flex-col justify-between space-y-5">
            {scanResult ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-[#4B962A] dark:text-[#A3F056]">
                      {isSamplePreview
                        ? 'Interactive Preview · Upload a photo for live AI scan'
                        : 'Approximate Visual Estimate · Review Before Saving'}
                    </p>
                    <h2 className="text-2xl font-extrabold text-[#171715] dark:text-white mt-0.5 tracking-tight">
                      {scanResult.dishTitle}
                    </h2>
                    <p className="text-xs text-[#787872] dark:text-[#9C9C94] font-mono tabular-nums mt-0.5">
                      Est. {scaledScanTotals.weight} g total
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-3xl font-extrabold font-mono tabular-nums text-[#171715] dark:text-[#A3F056] leading-none">
                      {scaledScanTotals.calories}
                    </span>
                    <span className="block text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                      est. kcal
                    </span>
                  </div>
                </div>

                {/* Reference Screen 2: 3 Pure-White Color-Coded Macro Percentage Cards */}
                <MacroPercentageTiles
                  percentages={scanMacroPcts}
                  grams={{
                    carbs: scaledScanTotals.carbs,
                    fat: scaledScanTotals.fat,
                    protein: scaledScanTotals.protein,
                  }}
                />

                {/* Reference Screen 3: Signature Radial Petal Ingredient Breakdown */}
                {scanIngredientShares.length > 0 && (
                  <div className="rounded-3xl bg-[#F4F4F0] dark:bg-[#111210] p-3 border border-black/[0.03] dark:border-white/5">
                    <RadialPetalChart
                      shares={scanIngredientShares}
                      centerImageUrl={previewUrl}
                      dishTitle={scanResult.dishTitle}
                      totalGrams={scaledScanTotals.weight}
                    />
                  </div>
                )}

                {/* Interactive Portion Multiplier */}
                <div className="p-3.5 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Scale className="w-5 h-5 text-[#171715] dark:text-[#A3F056]" />
                    <div>
                      <p className="text-sm font-bold text-[#171715] dark:text-white">
                        Portion Multiplier
                      </p>
                      <p className="text-xs text-[#787872] dark:text-[#9C9C94] font-mono tabular-nums">
                        Scales all ingredients &amp; petals live
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white dark:bg-[#1B1C19] p-1 rounded-full border border-black/10 dark:border-white/10">
                    <button
                      type="button"
                      aria-label="Decrease portion"
                      onClick={() =>
                        setPortionMultiplier((p) => Math.max(0.25, Number((p - 0.25).toFixed(2))))
                      }
                      className="w-8 h-8 rounded-full bg-[#F4F4F0] dark:bg-white/10 flex items-center justify-center text-[#171715] dark:text-white"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-mono tabular-nums text-sm font-extrabold px-2 text-[#171715] dark:text-white">
                      {portionMultiplier.toFixed(2)}x
                    </span>
                    <button
                      type="button"
                      aria-label="Increase portion"
                      onClick={() =>
                        setPortionMultiplier((p) => Math.min(3.0, Number((p + 0.25).toFixed(2))))
                      }
                      className="w-8 h-8 rounded-full bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513] flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Reference Screen 3: Clean White Editable Ingredient Cards with Color-Coded Inline Macros */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-[#787872] dark:text-[#9C9C94]">
                    Ingredient Breakdown (edit names or grams before saving)
                  </p>
                  <div className="space-y-2">
                    {editableItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/[0.04] dark:border-white/5 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.foodName}
                            aria-label={`Food item ${idx + 1} name`}
                            onChange={(e) => {
                              const next = [...editableItems];
                              next[idx] = { ...next[idx], foodName: e.target.value };
                              setEditableItems(next);
                            }}
                            className="flex-1 min-w-0 h-9 px-2.5 rounded-xl bg-white dark:bg-[#1B1C19] text-sm font-bold text-[#171715] dark:text-white border border-black/[0.05] dark:border-white/10"
                          />
                          <input
                            type="number"
                            min={0}
                            value={item.estimatedGrams}
                            aria-label={`Food item ${idx + 1} grams`}
                            onChange={(e) => {
                              const newGrams = Math.max(0, Number(e.target.value) || 0);
                              const oldGrams = item.estimatedGrams || 100;
                              const ratio = oldGrams > 0 ? newGrams / oldGrams : 1;
                              const next = [...editableItems];
                              next[idx] = {
                                ...item,
                                estimatedGrams: newGrams,
                                calories: Math.round(item.calories * ratio),
                                protein: Number((item.protein * ratio).toFixed(1)),
                                carbs: Number((item.carbs * ratio).toFixed(1)),
                                fat: Number((item.fat * ratio).toFixed(1)),
                                fiber: Number((item.fiber * ratio).toFixed(1)),
                              };
                              setEditableItems(next);
                            }}
                            className="w-20 h-9 px-2 rounded-xl bg-white dark:bg-[#1B1C19] text-sm font-mono tabular-nums text-right font-bold text-[#171715] dark:text-white border border-black/[0.05] dark:border-white/10"
                          />
                          <span className="text-xs font-semibold text-[#787872]">
                            {item.unit || 'g'}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${item.foodName}`}
                            onClick={() =>
                              setEditableItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[#E5484D] hover:bg-[#FDECEC] dark:hover:bg-[#E5484D]/15"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2 px-1">
                          <InlineMacroRow
                            carbs={Number((item.carbs * portionMultiplier).toFixed(1))}
                            fat={Number((item.fat * portionMultiplier).toFixed(1))}
                            protein={Number((item.protein * portionMultiplier).toFixed(1))}
                            compact
                          />
                          <span className="text-xs font-mono tabular-nums font-bold text-[#787872] dark:text-[#A1A19A]">
                            {Math.round(item.calories * portionMultiplier)} kcal
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Coach Note & Uncertainty Disclosure */}
                <div className="p-3.5 rounded-2xl bg-[#EEF8E8] dark:bg-[#54A630]/15 text-xs text-[#2B5D16] dark:text-[#B7F297] space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Coach Note
                  </p>
                  <p className="leading-relaxed">{scanResult.coachTip}</p>
                </div>

                <div className="flex items-start gap-2 text-xs text-[#787872] dark:text-[#9C9C94]">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {scanResult.uncertaintyNote ||
                      'Visual food recognition and portion weights are approximate estimates. Please verify items and quantities before saving.'}
                  </span>
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveScannedMeal}
                  disabled={editableItems.length === 0}
                  className="w-full h-12 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Confirm &amp; Log to Daily Nutrition Diary
                </motion.button>
              </>
            ) : (
              <div className="h-full flex flex-col justify-between py-2 space-y-6">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-[#4B962A] dark:text-[#A3F056]">
                    How AI Photo Breakdown Works
                  </p>
                  <h2 className="text-2xl font-extrabold text-[#171715] dark:text-white tracking-tight">
                    Radial Ingredient &amp; Macro Analysis
                  </h2>
                  <p className="text-sm text-[#787872] dark:text-[#9C9C94] leading-relaxed">
                    Capture a meal photo or upload from your gallery. NutriPulse visualizes each
                    ingredient&rsquo;s percentage share in a radial petal diagram with color-coded
                    carbs, fats, and protein.
                  </p>
                </div>

                <ol className="space-y-3 text-sm">
                  <li className="p-3.5 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] space-y-0.5">
                    <span className="font-bold text-[#171715] dark:text-white block">
                      01. Visual Ingredient Detection
                    </span>
                    <span className="text-xs text-[#787872] dark:text-[#9C9C94]">
                      Identifies grains, proteins, vegetables, and toppings with gram weight shares.
                    </span>
                  </li>
                  <li className="p-3.5 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] space-y-0.5">
                    <span className="font-bold text-[#171715] dark:text-white block">
                      02. Live Portion &amp; Gram Editing
                    </span>
                    <span className="text-xs text-[#787872] dark:text-[#9C9C94]">
                      Adjust the plate multiplier (0.25x–3.0x) or refine individual item weights.
                    </span>
                  </li>
                  <li className="p-3.5 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] space-y-0.5">
                    <span className="font-bold text-[#171715] dark:text-white block">
                      03. Review Before Saving
                    </span>
                    <span className="text-xs text-[#787872] dark:text-[#9C9C94]">
                      Nothing is added to your diary until you inspect and confirm the breakdown.
                    </span>
                  </li>
                </ol>

                <div className="space-y-3 pt-2 border-t border-black/[0.06] dark:border-white/10">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={handleLoadInteractivePreview}
                    className="w-full h-11 rounded-full bg-[#F4F4F0] dark:bg-white/10 hover:bg-[#EAEAE4] dark:hover:bg-white/15 text-[#171715] dark:text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Preview Radial Petal Breakdown (Sample Dish)
                  </motion.button>
                  <div className="flex items-start gap-2 text-xs text-[#787872] dark:text-[#9C9C94]">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Photo-based portions are approximate estimates. For packaged items, use the
                      Nutrition Label tab for exact printed facts.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NUTRITION LABEL OCR MODE */}
      {mode === 'label' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white dark:bg-[#1B1C19] rounded-[28px] p-6 card-soft border border-black/[0.04] dark:border-white/10 space-y-4">
            <h2 className="text-lg font-extrabold text-[#171715] dark:text-white">
              Scan Packaged Nutrition Label
            </h2>
            <p className="text-xs text-[#787872] dark:text-[#9C9C94] leading-relaxed">
              Upload or capture the Nutrition Facts table. Missing values on the package are left
              blank and never invented.
            </p>

            {labelPreviewUrl && (
              <img
                src={labelPreviewUrl}
                alt="Uploaded nutrition label"
                className="w-full max-h-64 object-contain rounded-2xl bg-[#F4F4F0] dark:bg-[#111210]"
              />
            )}

            {labelError && (
              <p
                role="alert"
                className="text-xs text-[#B42328] dark:text-[#FCA5A5] bg-[#FDECEC] dark:bg-[#E5484D]/15 p-3 rounded-2xl"
              >
                {labelError}
              </p>
            )}

            <label className="w-full h-12 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer">
              {labelLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Extracting label facts...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>{labelPreviewUrl ? 'Upload Another Label' : 'Capture / Upload Label'}</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleFilePick(e, 'label')}
                className="hidden"
              />
            </label>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[#1B1C19] rounded-[28px] p-6 card-soft border border-black/[0.04] dark:border-white/10 space-y-5">
            {labelResult && labelCalculated ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-extrabold text-[#171715] dark:text-white">
                      {labelResult.productName}
                    </h3>
                    <p className="text-xs text-[#787872] dark:text-[#9C9C94]">
                      Printed serving size: {labelResult.servingSizeText}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-extrabold font-mono tabular-nums text-[#171715] dark:text-[#A3F056]">
                      {labelCalculated.calories ?? '—'}
                    </span>
                    <span className="block text-xs text-[#787872]">kcal consumed</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label
                    htmlFor="label-servings"
                    className="text-sm font-bold text-[#171715] dark:text-white"
                  >
                    How many servings did you consume?
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="label-servings"
                      type="number"
                      min={0.1}
                      step="0.25"
                      value={servingsConsumed}
                      onChange={(e) => setServingsConsumed(e.target.value)}
                      className="w-24 h-10 px-3 rounded-xl bg-white dark:bg-[#1B1C19] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-center font-bold text-[#171715] dark:text-white"
                    />
                    <span className="text-xs text-[#787872]">serving(s)</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {[
                    { label: 'Calories', val: labelCalculated.calories, unit: 'kcal' },
                    { label: 'Carbs', val: labelCalculated.carbs, unit: 'g' },
                    { label: 'Total Fat', val: labelCalculated.fat, unit: 'g' },
                    { label: 'Protein', val: labelCalculated.protein, unit: 'g' },
                    { label: 'Saturated Fat', val: labelCalculated.saturatedFat, unit: 'g' },
                    { label: 'Fiber', val: labelCalculated.fiber, unit: 'g' },
                    { label: 'Sugar', val: labelCalculated.sugar, unit: 'g' },
                    { label: 'Sodium', val: labelCalculated.sodiumMg, unit: 'mg' },
                  ].map((field) => (
                    <div
                      key={field.label}
                      className="p-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210]"
                    >
                      <span className="text-xs text-[#787872] dark:text-[#9C9C94] block">
                        {field.label}
                      </span>
                      <span className="font-mono tabular-nums font-extrabold text-[#171715] dark:text-white">
                        {field.val !== undefined ? `${field.val}${field.unit}` : 'Not listed'}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-[#787872] dark:text-[#9C9C94]">
                  {labelResult.extractionNotes}
                </p>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveLabelEntry}
                  className="w-full h-12 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white font-bold text-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Save Calculated Label Intake
                </motion.button>
              </>
            ) : (
              <div className="py-12 text-center space-y-2">
                <p className="text-base font-extrabold text-[#171715] dark:text-white">
                  Exact Nutrition Label Calculation
                </p>
                <p className="text-sm text-[#787872] dark:text-[#9C9C94] max-w-md mx-auto">
                  Upload any packaged food nutrition table. NutriPulse extracts only the printed
                  nutrients and multiplies them deterministically by the exact servings you ate.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MANUAL ENTRY & VERIFIED FOOD DATABASE MODE */}
      {mode === 'manual' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Verified Food Search */}
          <div className="lg:col-span-5 bg-white dark:bg-[#1B1C19] rounded-[28px] p-6 card-soft border border-black/[0.04] dark:border-white/10 space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-[#171715] dark:text-white">
                Verified Food Database
              </h2>
              <p className="text-xs text-[#787872] dark:text-[#9C9C94]">
                Select any item to auto-scale deterministic per-100g nutrition values.
              </p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-[#787872] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search oats, milk, paneer, rice, dal..."
                aria-label="Search food database"
                className="w-full h-11 pl-10 pr-4 rounded-full bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
              />
            </div>

            <div className="divide-y divide-black/[0.05] dark:divide-white/10 max-h-96 overflow-y-auto rounded-2xl border border-black/[0.06] dark:border-white/10">
              {filteredFoods.map((item) => {
                const preview = scaleNutritionByQuantity(item.per100, item.defaultServingQty);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectDbFood(item)}
                    className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-3 ${
                      selectedFood?.id === item.id
                        ? 'bg-[#EEF8E8] dark:bg-[#54A630]/15'
                        : 'hover:bg-[#F4F4F0] dark:hover:bg-white/5'
                    }`}
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
              })}
            </div>
          </div>

          {/* Manual Form */}
          <form
            onSubmit={handleManualSubmit}
            className="lg:col-span-7 bg-white dark:bg-[#1B1C19] rounded-[28px] p-6 card-soft border border-black/[0.04] dark:border-white/10 space-y-4"
          >
            <h2 className="text-lg font-extrabold text-[#171715] dark:text-white">
              Manual Food Entry
            </h2>

            {manualError && (
              <p
                role="alert"
                className="text-xs text-[#B42328] dark:text-[#FCA5A5] bg-[#FDECEC] dark:bg-[#E5484D]/15 p-3 rounded-2xl"
              >
                {manualError}
              </p>
            )}

            <div className="space-y-1">
              <label
                htmlFor="man-name"
                className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]"
              >
                Food Name
              </label>
              <input
                id="man-name"
                type="text"
                required
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g., Paneer Bhurji or Boiled Eggs"
                className="w-full h-11 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label htmlFor="man-qty" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Quantity
                </label>
                <input
                  id="man-qty"
                  type="number"
                  min={0}
                  step="any"
                  value={manualQty}
                  onChange={(e) => handleManualQtyChange(e.target.value)}
                  className="w-full h-11 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="man-unit" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Unit
                </label>
                <select
                  id="man-unit"
                  value={manualUnit}
                  onChange={(e) => setManualUnit(e.target.value)}
                  className="w-full h-11 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="serving">serving</option>
                  <option value="piece">piece</option>
                  <option value="cup">cup</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="man-cal" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Calories (kcal)
                </label>
                <input
                  id="man-cal"
                  type="number"
                  min={0}
                  required
                  value={manualCal}
                  onChange={(e) => setManualCal(e.target.value)}
                  className="w-full h-11 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums font-extrabold text-[#171715] dark:text-[#A3F056]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label htmlFor="man-c" className="text-xs font-semibold text-[#4B962A] dark:text-[#86E05C]">
                  Carbs (g)
                </label>
                <input
                  id="man-c"
                  type="number"
                  min={0}
                  step="0.1"
                  value={manualCarbs}
                  onChange={(e) => setManualCarbs(e.target.value)}
                  className="w-full h-11 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="man-f" className="text-xs font-semibold text-[#D4880F] dark:text-[#FBBF24]">
                  Fat (g)
                </label>
                <input
                  id="man-f"
                  type="number"
                  min={0}
                  step="0.1"
                  value={manualFat}
                  onChange={(e) => setManualFat(e.target.value)}
                  className="w-full h-11 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="man-p" className="text-xs font-semibold text-[#DC3B40] dark:text-[#F87171]">
                  Protein (g)
                </label>
                <input
                  id="man-p"
                  type="number"
                  min={0}
                  step="0.1"
                  value={manualProtein}
                  onChange={(e) => setManualProtein(e.target.value)}
                  className="w-full h-11 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="man-fib" className="text-xs font-semibold text-[#257968] dark:text-[#5EEAD4]">
                  Fiber (g)
                </label>
                <input
                  id="man-fib"
                  type="number"
                  min={0}
                  step="0.1"
                  value={manualFiber}
                  onChange={(e) => setManualFiber(e.target.value)}
                  className="w-full h-11 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
                />
              </div>
            </div>

            <motion.button
              type="submit"
              whileTap={{ scale: 0.98 }}
              className="w-full h-12 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white font-bold text-sm"
            >
              Log Food to {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
            </motion.button>
          </form>
        </div>
      )}
    </div>
  );
};
