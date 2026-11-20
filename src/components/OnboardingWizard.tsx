import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  Dumbbell,
  Flame,
  Heart,
  Leaf,
  Ruler,
  Scale,
  ShieldAlert,
  Sparkles,
  User,
  Utensils,
} from 'lucide-react';
import {
  ACTIVITY_LABELS,
  ActivityLevel,
  calculateNutritionTargets,
  DIETARY_LABELS,
  DietaryPreference,
  FitnessGoal,
  Gender,
  GOAL_LABELS,
  GOAL_PACE_LABELS,
  GoalPace,
} from '../utils/nutritionMath';
import { UserProfile } from '../types/nutrition';
import { NUTRIENT_THEME, NutrientIcon, NutrientKind } from './NutrientVisuals';

interface OnboardingWizardProps {
  uid: string;
  email?: string;
  initialName?: string;
  onComplete: (profile: UserProfile) => Promise<void>;
}

const TOTAL_STEPS = 7;

const STEP_META: Record<number, { label: string; titleMain: string; titleMuted: string }> = {
  1: { label: 'Your Name', titleMain: "Let's Start With", titleMuted: 'Your Name' },
  2: { label: 'Age & Gender', titleMain: 'Tell Us Your', titleMuted: 'Age & Gender' },
  3: { label: 'Height & Weight', titleMain: 'Your Current', titleMuted: 'Body Metrics' },
  4: { label: 'Activity Level', titleMain: 'How Active Is', titleMuted: 'Your Typical Day?' },
  5: { label: 'Diet Style', titleMain: 'Choose Your', titleMuted: 'Dietary Preference' },
  6: { label: 'Your Target', titleMain: 'What Is Your', titleMuted: 'Primary Goal?' },
  7: { label: 'Your Plan', titleMain: 'Your Daily', titleMuted: 'Nutrition Blueprint' },
};

const stepVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 48 : -48,
    opacity: 0,
    scale: 0.985,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 360, damping: 30 },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -44 : 44,
    opacity: 0,
    scale: 0.985,
    transition: { duration: 0.15, ease: 'easeIn' as const },
  }),
};

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  uid,
  email,
  initialName = '',
  onComplete,
}) => {
  const [step, setStep] = useState<number>(1);
  const [direction, setDirection] = useState<number>(1);
  const autoAdvanceTimerRef = useRef<number | null>(null);

  const [fullName, setFullName] = useState(initialName);
  const [dateOfBirth, setDateOfBirth] = useState('1996-06-15');
  const [gender, setGender] = useState<Gender>('male');
  const [heightCm, setHeightCm] = useState('174');
  const [weightKg, setWeightKg] = useState('72');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderately_active');
  const [dietaryPreference, setDietaryPreference] = useState<DietaryPreference>('vegetarian');
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal>('general_fitness');
  const [goalPace, setGoalPace] = useState<GoalPace>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearAutoAdvance = () => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearAutoAdvance();
  }, []);

  const liveTargets = useMemo(() => {
    return calculateNutritionTargets({
      dateOfBirth,
      gender,
      heightCm: Number(heightCm) || 170,
      weightKg: Number(weightKg) || 70,
      activityLevel,
      fitnessGoal,
      goalPace,
    });
  }, [dateOfBirth, gender, heightCm, weightKg, activityLevel, fitnessGoal, goalPace]);

  const goToStep = (nextStep: number) => {
    clearAutoAdvance();
    setError(null);
    setDirection(nextStep > step ? 1 : -1);
    setStep(Math.max(1, Math.min(TOTAL_STEPS, nextStep)));
  };

  const scheduleAutoAdvance = (targetStep: number) => {
    clearAutoAdvance();
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      setDirection(1);
      setStep(targetStep);
      autoAdvanceTimerRef.current = null;
    }, 260);
  };

  const validateCurrentStep = (): boolean => {
    setError(null);
    if (step === 1 && !fullName.trim()) {
      setError('Please enter your name so we can personalize your plan.');
      return false;
    }
    if (step === 2 && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      setError('Please enter a valid date of birth.');
      return false;
    }
    if (step === 3) {
      const h = Number(heightCm);
      const w = Number(weightKg);
      if (!Number.isFinite(h) || h < 80 || h > 250) {
        setError('Please enter a height between 80 cm and 250 cm.');
        return false;
      }
      if (!Number.isFinite(w) || w < 20 || w > 300) {
        setError('Please enter a weight between 20 kg and 300 kg.');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    goToStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) goToStep(step - 1);
  };

  const handleFinish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const profile: UserProfile = {
        uid,
        email,
        fullName: fullName.trim() || 'Guest',
        dateOfBirth,
        gender,
        heightCm: Number(heightCm) || 170,
        weightKg: Number(weightKg) || 70,
        activityLevel,
        dietaryPreference,
        fitnessGoal: liveTargets.appliedGoal,
        goalPace: liveTargets.appliedPace,
        notificationsEnabled: true,
        mealReminderTime: '13:00',
        onboardingCompleted: true,
      };
      await onComplete(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const progressPct = (step / TOTAL_STEPS) * 100;
  const meta = STEP_META[step];

  const dietDescriptions: Record<DietaryPreference, string> = {
    vegetarian: 'Plant-forward with dairy & legumes',
    non_vegetarian: 'Includes poultry, fish, eggs & plants',
    vegan: '100% plant-based whole foods',
    eggetarian: 'Vegetarian meals plus eggs for protein',
  };

  const goalCards: {
    key: FitnessGoal;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { key: 'fat_loss', subtitle: 'Safe, sustainable calorie deficit', icon: Flame },
    { key: 'muscle_building', subtitle: 'High-protein lean surplus', icon: Dumbbell },
    { key: 'weight_maintenance', subtitle: 'Steady daily energy balance', icon: Scale },
    { key: 'general_fitness', subtitle: 'Balanced nutrients & energy', icon: Heart },
  ];

  const macroCards: { kind: NutrientKind; label: string; grams: number }[] = [
    { kind: 'carbs', label: 'Carbs', grams: liveTargets.carbsGrams },
    { kind: 'fats', label: 'Fats', grams: liveTargets.fatGrams },
    { kind: 'protein', label: 'Protein', grams: liveTargets.proteinGrams },
    { kind: 'fiber', label: 'Fiber', grams: liveTargets.fiberGrams },
  ];

  return (
    <div className="min-h-screen bg-[#ECECE8] dark:bg-[#111210] py-6 sm:py-10 px-4 sm:px-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-xl bg-white dark:bg-[#1B1C19] rounded-[32px] p-6 sm:p-9 card-soft border border-black/[0.04] dark:border-white/10 flex flex-col justify-between min-h-[560px]">
        {/* Top Navigation & Animated Progress Track */}
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {step > 1 ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={handleBack}
                  aria-label="Go to previous step"
                  className="w-10 h-10 rounded-full bg-[#F4F4F0] dark:bg-[#262723] text-[#171715] dark:text-[#F4F4F0] flex items-center justify-center hover:bg-[#E7E7E2] dark:hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </motion.button>
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#151513] dark:bg-[#A3F056] text-[#A3F056] dark:text-[#151513] flex items-center justify-center">
                  <Leaf className="w-5 h-5" />
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Step {step} of {TOTAL_STEPS} · {meta.label}
                </p>
              </div>
            </div>

            <span className="text-xs font-mono tabular-nums font-bold text-[#171715] dark:text-[#F4F4F0]">
              {Math.round(progressPct)}%
            </span>
          </div>

          {/* Smooth Spring Progress Bar */}
          <div className="h-1.5 w-full rounded-full bg-[#ECECE8] dark:bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[#171715] dark:bg-[#A3F056]"
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          </div>
        </div>

        {/* Animated Step Stage */}
        <div className="relative my-6 flex-1 flex flex-col justify-center overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.85 }}
              className="space-y-6"
            >
              {/* Two-Tone Reference Display Headline */}
              <div className="space-y-1.5">
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.12]">
                  <span className="text-[#171715] dark:text-[#F4F4F0] block">{meta.titleMain}</span>
                  <span className="text-[#787872] dark:text-[#9C9C94] block">{meta.titleMuted}</span>
                </h1>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                  className="p-3.5 rounded-2xl bg-[#FDECEC] dark:bg-[#E5484D]/15 border border-[#E5484D]/25 text-[#B42328] dark:text-[#FCA5A5] text-sm font-medium"
                >
                  {error}
                </motion.div>
              )}

              {/* STEP 1: FULL NAME */}
              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-[#787872] dark:text-[#A1A19A]">
                    We&rsquo;ll personalize your daily check-ins, meal plans, and AI nutrition coaching.
                  </p>
                  <div className="relative">
                    <User className="w-5 h-5 text-[#787872] absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      id="ob-name"
                      type="text"
                      autoFocus
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleNext();
                      }}
                      placeholder="Enter your first or full name"
                      aria-label="Full Name"
                      className="w-full h-14 pl-12 pr-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-base font-semibold text-[#171715] dark:text-white placeholder:text-[#9A9A93] focus:outline-none focus:ring-2 focus:ring-[#171715] dark:focus:ring-[#A3F056]"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: AGE & GENDER */}
              {step === 2 && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="ob-dob"
                      className="flex items-center justify-between text-xs font-semibold text-[#787872] dark:text-[#A1A19A]"
                    >
                      <span>Date of Birth</span>
                      <span className="font-mono tabular-nums text-[#171715] dark:text-[#A3F056]">
                        Age: {liveTargets.age} years
                      </span>
                    </label>
                    <input
                      id="ob-dob"
                      type="date"
                      value={dateOfBirth}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full h-13 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-semibold text-[#171715] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#171715] dark:focus:ring-[#A3F056]"
                    />
                  </div>

                  <div className="space-y-2">
                    <span className="block text-xs font-semibold text-[#787872] dark:text-[#A1A19A]">
                      Gender (used for resting metabolic rate formula)
                    </span>
                    <div className="grid grid-cols-3 gap-2.5">
                      {(
                        [
                          { id: 'male' as const, label: 'Male' },
                          { id: 'female' as const, label: 'Female' },
                          { id: 'other' as const, label: 'Neutral' },
                        ] as const
                      ).map((opt) => {
                        const active = gender === opt.id;
                        return (
                          <motion.button
                            key={opt.id}
                            type="button"
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setGender(opt.id)}
                            className={`h-14 rounded-2xl border text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${
                              active
                                ? 'bg-[#171715] dark:bg-[#A3F056] text-white dark:text-[#171715] border-transparent shadow-sm'
                                : 'bg-[#F4F4F0] dark:bg-[#111210] text-[#171715] dark:text-[#E8E8E2] border-black/5 dark:border-white/10 hover:bg-[#EAEAE4] dark:hover:bg-white/5'
                            }`}
                          >
                            <span>{opt.label}</span>
                            {active && <Check className="w-4 h-4 shrink-0" />}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {liveTargets.isMinor && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl bg-[#FEF5E5] dark:bg-[#E69718]/15 border border-[#E69718]/30 flex items-start gap-3"
                    >
                      <ShieldAlert className="w-5 h-5 text-[#D4880F] dark:text-[#FBBF24] shrink-0 mt-0.5" />
                      <div className="text-xs text-[#6F4400] dark:text-[#FDE68A] space-y-1">
                        <p className="font-bold">Youth-Safe Nutrition Mode Active (Under 18)</p>
                        <p className="leading-relaxed">
                          Aggressive fat-loss deficits are disabled under age 18. NutriPulse focuses
                          on balanced nourishment, healthy growth, and sustainable habits.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* STEP 3: HEIGHT & WEIGHT */}
              {step === 3 && (
                <div className="space-y-5">
                  {/* Height Card */}
                  <div className="p-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/[0.04] dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="ob-height"
                        className="text-sm font-bold text-[#171715] dark:text-white flex items-center gap-2"
                      >
                        <Ruler className="w-4 h-4 text-[#54A630]" />
                        Height (cm)
                      </label>
                      <input
                        id="ob-height"
                        type="number"
                        min={80}
                        max={250}
                        step="0.5"
                        value={heightCm}
                        onChange={(e) => setHeightCm(e.target.value)}
                        className="w-24 h-10 px-3 rounded-xl bg-white dark:bg-[#1B1C19] border border-black/10 dark:border-white/10 text-right font-mono tabular-nums font-extrabold text-[#171715] dark:text-white"
                      />
                    </div>
                    <input
                      type="range"
                      min={120}
                      max={220}
                      step={1}
                      aria-label="Height slider"
                      value={Math.min(220, Math.max(120, Number(heightCm) || 170))}
                      onChange={(e) => setHeightCm(e.target.value)}
                      className="w-full accent-[#171715] dark:accent-[#A3F056] cursor-pointer"
                    />
                  </div>

                  {/* Weight Card */}
                  <div className="p-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/[0.04] dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="ob-weight"
                        className="text-sm font-bold text-[#171715] dark:text-white flex items-center gap-2"
                      >
                        <Scale className="w-4 h-4 text-[#E69718]" />
                        Current Weight (kg)
                      </label>
                      <input
                        id="ob-weight"
                        type="number"
                        min={20}
                        max={300}
                        step="0.1"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                        className="w-24 h-10 px-3 rounded-xl bg-white dark:bg-[#1B1C19] border border-black/10 dark:border-white/10 text-right font-mono tabular-nums font-extrabold text-[#171715] dark:text-white"
                      />
                    </div>
                    <input
                      type="range"
                      min={35}
                      max={160}
                      step={0.5}
                      aria-label="Weight slider"
                      value={Math.min(160, Math.max(35, Number(weightKg) || 70))}
                      onChange={(e) => setWeightKg(e.target.value)}
                      className="w-full accent-[#171715] dark:accent-[#A3F056] cursor-pointer"
                    />
                  </div>

                  <p className="text-xs text-[#787872] dark:text-[#9C9C94] font-mono tabular-nums text-center">
                    Estimated resting baseline (BMR): ~{liveTargets.bmr} kcal/day
                  </p>
                </div>
              )}

              {/* STEP 4: ACTIVITY LEVEL (Auto-Advance on Tap) */}
              {step === 4 && (
                <div className="space-y-2.5">
                  <p className="text-xs text-[#787872] dark:text-[#9C9C94]">
                    Tap your daily activity level to continue automatically.
                  </p>
                  {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level, idx) => {
                    const active = activityLevel === level;
                    return (
                      <motion.button
                        key={level}
                        type="button"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04, type: 'spring', stiffness: 360, damping: 28 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setActivityLevel(level);
                          scheduleAutoAdvance(5);
                        }}
                        className={`w-full text-left px-4 py-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                          active
                            ? 'bg-[#171715] dark:bg-[#A3F056] text-white dark:text-[#171715] border-transparent shadow-sm'
                            : 'bg-[#F4F4F0] dark:bg-[#111210] text-[#171715] dark:text-white border-black/[0.04] dark:border-white/10 hover:bg-[#EAEAE4] dark:hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              active
                                ? 'bg-white/15 dark:bg-black/15'
                                : 'bg-white dark:bg-[#1B1C19]'
                            }`}
                          >
                            <Activity className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate">
                              {ACTIVITY_LABELS[level].label}
                            </p>
                            <p
                              className={`text-xs truncate ${
                                active
                                  ? 'text-white/75 dark:text-[#171715]/75'
                                  : 'text-[#787872] dark:text-[#9C9C94]'
                              }`}
                            >
                              {ACTIVITY_LABELS[level].description}
                            </p>
                          </div>
                        </div>
                        {active && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-6 h-6 rounded-full bg-[#A3F056] dark:bg-[#171715] text-[#171715] dark:text-[#A3F056] flex items-center justify-center shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </motion.span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* STEP 5: DIETARY PREFERENCE (Auto-Advance on Tap) */}
              {step === 5 && (
                <div className="space-y-3">
                  <p className="text-xs text-[#787872] dark:text-[#9C9C94]">
                    Tap a diet style — meal recommendations and AI coaching will match it.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(Object.keys(DIETARY_LABELS) as DietaryPreference[]).map((pref, idx) => {
                      const active = dietaryPreference === pref;
                      return (
                        <motion.button
                          key={pref}
                          type="button"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05, type: 'spring', stiffness: 360, damping: 28 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => {
                            setDietaryPreference(pref);
                            scheduleAutoAdvance(6);
                          }}
                          className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 min-h-[112px] ${
                            active
                              ? 'bg-[#171715] dark:bg-[#A3F056] text-white dark:text-[#171715] border-transparent shadow-sm'
                              : 'bg-[#F4F4F0] dark:bg-[#111210] text-[#171715] dark:text-white border-black/[0.04] dark:border-white/10 hover:bg-[#EAEAE4] dark:hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                                active
                                  ? 'bg-white/15 dark:bg-black/15'
                                  : 'bg-white dark:bg-[#1B1C19] text-[#54A630]'
                              }`}
                            >
                              <Utensils className="w-4 h-4" />
                            </div>
                            {active && <Check className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold">{DIETARY_LABELS[pref]}</p>
                            <p
                              className={`text-xs mt-0.5 ${
                                active
                                  ? 'text-white/75 dark:text-[#171715]/75'
                                  : 'text-[#787872] dark:text-[#9C9C94]'
                              }`}
                            >
                              {dietDescriptions[pref]}
                            </p>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 6: PRIMARY TARGET GOAL & PACE */}
              {step === 6 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {goalCards.map(({ key: g, subtitle, icon: Icon }, idx) => {
                      const disabled = liveTargets.isMinor && g === 'fat_loss';
                      const active = !disabled && fitnessGoal === g;
                      return (
                        <motion.button
                          key={g}
                          type="button"
                          disabled={disabled}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05, type: 'spring', stiffness: 360, damping: 28 }}
                          whileTap={disabled ? undefined : { scale: 0.96 }}
                          onClick={() => {
                            setFitnessGoal(g);
                            if (g === 'weight_maintenance' || g === 'general_fitness') {
                              scheduleAutoAdvance(7);
                            }
                          }}
                          className={`p-4 rounded-2xl border text-left transition-all space-y-2.5 ${
                            disabled
                              ? 'opacity-45 cursor-not-allowed bg-[#F4F4F0] dark:bg-white/5 border-transparent'
                              : active
                                ? 'bg-[#171715] dark:bg-[#A3F056] text-white dark:text-[#171715] border-transparent shadow-sm'
                                : 'bg-[#F4F4F0] dark:bg-[#111210] text-[#171715] dark:text-white border-black/[0.04] dark:border-white/10 hover:bg-[#EAEAE4] dark:hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                                active
                                  ? 'bg-white/15 dark:bg-black/15'
                                  : 'bg-white dark:bg-[#1B1C19]'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            {active && <Check className="w-4 h-4" />}
                          </div>
                          <div>
                            <span className="text-sm font-bold block">{GOAL_LABELS[g]}</span>
                            <span
                              className={`text-xs block mt-0.5 ${
                                active
                                  ? 'text-white/75 dark:text-[#171715]/75'
                                  : 'text-[#787872] dark:text-[#9C9C94]'
                              }`}
                            >
                              {disabled ? 'Disabled under age 18' : subtitle}
                            </span>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Animated Pace Reveal for Adult Fat Loss / Muscle Building */}
                  <AnimatePresence>
                    {!liveTargets.isMinor &&
                      (fitnessGoal === 'fat_loss' || fitnessGoal === 'muscle_building') && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-2 overflow-hidden pt-1"
                        >
                          <p className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                            Select your planning pace (tap to review your plan):
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {(['slow', 'medium', 'hard'] as GoalPace[]).map((p) => {
                              const active = goalPace === p;
                              return (
                                <motion.button
                                  key={p}
                                  type="button"
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => {
                                    setGoalPace(p);
                                    scheduleAutoAdvance(7);
                                  }}
                                  className={`p-3 rounded-2xl border text-left transition-colors ${
                                    active
                                      ? 'bg-[#EEF8E8] dark:bg-[#54A630]/20 border-[#54A630] text-[#171715] dark:text-white'
                                      : 'bg-[#F4F4F0] dark:bg-[#111210] border-black/5 dark:border-white/10 text-[#171715] dark:text-white'
                                  }`}
                                >
                                  <span className="text-sm font-bold block">
                                    {GOAL_PACE_LABELS[p].label}
                                  </span>
                                  <span className="text-xs text-[#62625C] dark:text-[#A1A19A] block mt-0.5">
                                    {GOAL_PACE_LABELS[p].deltaText}
                                  </span>
                                </motion.button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                  </AnimatePresence>
                </div>
              )}

              {/* STEP 7: ANIMATED PLAN REVEAL */}
              {step === 7 && (
                <div className="space-y-4">
                  {liveTargets.safetyWarnings.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-[#FEF5E5] dark:bg-[#E69718]/15 border border-[#E69718]/30 space-y-1">
                      {liveTargets.safetyWarnings.map((w, idx) => (
                        <p key={idx} className="text-xs text-[#6F4400] dark:text-[#FDE68A] leading-relaxed">
                          {w}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Highlight Daily Goal Target Card */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                    className="p-5 rounded-3xl bg-[#151513] text-white flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[#A3F056] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        {GOAL_LABELS[liveTargets.appliedGoal]}
                      </p>
                      <p className="text-3xl font-extrabold font-mono tabular-nums tracking-tight">
                        {liveTargets.targetCalories}{' '}
                        <span className="text-sm font-medium text-[#A1A19A]">kcal / day</span>
                      </p>
                      <p className="text-xs text-[#A1A19A] font-mono tabular-nums">
                        BMR {liveTargets.bmr} · Maintenance {liveTargets.maintenanceCalories} kcal
                      </p>
                    </div>
                  </motion.div>

                  {/* Color-Coded 4-Macro Target Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {macroCards.map((m, idx) => (
                      <motion.div
                        key={m.kind}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 + idx * 0.06, type: 'spring', stiffness: 340, damping: 26 }}
                        className="p-3.5 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/[0.04] dark:border-white/10 flex flex-col items-center text-center gap-1.5"
                      >
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center ${NUTRIENT_THEME[m.kind].bgSoftClass}`}
                        >
                          <NutrientIcon kind={m.kind} className="w-4 h-4" />
                        </div>
                        <span className="text-lg font-extrabold font-mono tabular-nums text-[#171715] dark:text-white leading-none">
                          {m.grams}g
                        </span>
                        <span className="text-xs font-semibold text-[#62625C] dark:text-[#A1A19A]">
                          {m.label}
                        </span>
                      </motion.div>
                    ))}
                  </div>

                  <p className="text-xs text-[#787872] dark:text-[#9C9C94] leading-relaxed">
                    {liveTargets.explanation}
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Primary CTA */}
        <div className="pt-4 border-t border-black/[0.06] dark:border-white/10 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              className="h-12 px-5 rounded-full bg-[#F4F4F0] dark:bg-[#262723] text-[#171715] dark:text-white font-semibold text-sm flex items-center gap-2 hover:bg-[#EAEAE4] dark:hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleNext}
              className="h-12 px-7 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:hover:bg-[#93E344] text-white dark:text-[#151513] font-bold text-sm flex items-center gap-2 transition-colors shadow-sm"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              disabled={submitting}
              onClick={handleFinish}
              className="h-12 px-7 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:hover:bg-[#93E344] text-white dark:text-[#151513] font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-60 shadow-sm"
            >
              <span>{submitting ? 'Saving Profile...' : 'Start Tracking'}</span>
              <Check className="w-4 h-4" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};
