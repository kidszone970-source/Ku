import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bell,
  CheckCircle2,
  LogOut,
  Moon,
  ShieldAlert,
  Sun,
  Trash2,
} from 'lucide-react';
import { UserProfile } from '../types/nutrition';
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
import { InlineMacroRow } from './NutrientVisuals';

interface ProfileSettingsViewProps {
  profile: UserProfile;
  isGuestMode: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onSaveProfile: (updated: UserProfile) => Promise<void>;
  onLogout: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({
  profile,
  isGuestMode,
  darkMode,
  onToggleDarkMode,
  onSaveProfile,
  onLogout,
  onDeleteAccount,
}) => {
  const [fullName, setFullName] = useState(profile.fullName);
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth);
  const [gender, setGender] = useState<Gender>(profile.gender);
  const [heightCm, setHeightCm] = useState(String(profile.heightCm));
  const [weightKg, setWeightKg] = useState(String(profile.weightKg));
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(profile.activityLevel);
  const [dietaryPreference, setDietaryPreference] = useState<DietaryPreference>(
    profile.dietaryPreference
  );
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal>(profile.fitnessGoal);
  const [goalPace, setGoalPace] = useState<GoalPace>(profile.goalPace);
  const [customCalorieTarget, setCustomCalorieTarget] = useState(
    profile.customCalorieTarget ? String(profile.customCalorieTarget) : ''
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(profile.notificationsEnabled);
  const [mealReminderTime, setMealReminderTime] = useState(profile.mealReminderTime || '13:00');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const previewTargets = useMemo(() => {
    return calculateNutritionTargets({
      dateOfBirth,
      gender,
      heightCm: Number(heightCm) || profile.heightCm,
      weightKg: Number(weightKg) || profile.weightKg,
      activityLevel,
      fitnessGoal,
      goalPace,
      customCalorieTarget: customCalorieTarget ? Number(customCalorieTarget) : undefined,
    });
  }, [
    dateOfBirth,
    gender,
    heightCm,
    weightKg,
    activityLevel,
    fitnessGoal,
    goalPace,
    customCalorieTarget,
    profile.heightCm,
    profile.weightKg,
  ]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedNotice(null);
    const h = Number(heightCm);
    const w = Number(weightKg);
    if (!fullName.trim() || h < 80 || h > 250 || w < 20 || w > 300) {
      setError('Please check your name, height (80–250 cm), and weight (20–300 kg).');
      return;
    }
    setSaving(true);
    try {
      await onSaveProfile({
        ...profile,
        fullName: fullName.trim(),
        dateOfBirth,
        gender,
        heightCm: h,
        weightKg: w,
        activityLevel,
        dietaryPreference,
        fitnessGoal: previewTargets.appliedGoal,
        goalPace: previewTargets.appliedPace,
        customCalorieTarget:
          !previewTargets.isMinor && customCalorieTarget
            ? Number(customCalorieTarget)
            : undefined,
        notificationsEnabled,
        mealReminderTime,
      });
      setSavedNotice('Profile updated and daily nutrition targets recalculated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDeleteAccount();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not delete account. You may need to sign in again recently for security.'
      );
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-7 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-3xl sm:text-[40px] font-extrabold tracking-tight leading-[1.08]">
            <span className="text-[#171715] dark:text-[#F4F4F0]">Profile &amp; </span>
            <span className="text-[#787872] dark:text-[#9C9C94]">Settings</span>
          </h1>
          <p className="text-sm font-medium text-[#62625C] dark:text-[#A1A19A]">
            {isGuestMode
              ? 'Local Preview Session · Sign in anytime to sync across devices'
              : profile.email || 'Signed-in Firebase Account'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onToggleDarkMode}
            className="h-10 px-4 rounded-full bg-white dark:bg-[#1B1C19] border border-black/[0.06] dark:border-white/10 text-xs font-bold text-[#171715] dark:text-white flex items-center gap-2 card-soft"
          >
            {darkMode ? <Sun className="w-4 h-4 text-[#FBBF24]" /> : <Moon className="w-4 h-4" />}
            {darkMode ? 'Light Theme' : 'Dark Theme'}
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onLogout}
            className="h-10 px-4 rounded-full bg-white dark:bg-[#1B1C19] border border-black/[0.06] dark:border-white/10 text-[#171715] dark:text-white text-xs font-bold flex items-center gap-2 hover:bg-[#F4F4F0] dark:hover:bg-white/10 card-soft"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </motion.button>
        </div>
      </div>

      {savedNotice && (
        <div className="p-4 rounded-2xl bg-[#EEF8E8] dark:bg-[#54A630]/15 text-[#346E1B] dark:text-[#86E05C] text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-[#FDECEC] dark:bg-[#E5484D]/15 text-[#B42328] dark:text-[#FCA5A5] text-sm"
        >
          {error}
        </div>
      )}

      {/* Live Recalculation Preview */}
      <div className="bg-[#151513] text-white rounded-[28px] p-6 space-y-4 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-[#A3F056]">
              Live Recalculated Nutrition Estimates
            </p>
            <p className="text-sm text-[#B8B8B0]">
              Changes to weight, height, activity, or goal update your targets immediately.
            </p>
            <div className="pt-1">
              <InlineMacroRow
                carbs={previewTargets.carbsGrams}
                fat={previewTargets.fatGrams}
                protein={previewTargets.proteinGrams}
                fiber={previewTargets.fiberGrams}
              />
            </div>
          </div>
          <div className="flex items-center gap-6 font-mono tabular-nums">
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-[#B0B0A8] block">BMR</span>
              <span className="text-xl font-bold">{previewTargets.bmr}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-[#B0B0A8] block">Maintenance</span>
              <span className="text-xl font-bold">{previewTargets.maintenanceCalories}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-[#A3F056] block">Daily Target</span>
              <span className="text-xl font-extrabold text-[#A3F056]">
                {previewTargets.targetCalories} kcal
              </span>
            </div>
          </div>
        </div>

        {previewTargets.safetyWarnings.length > 0 && (
          <div className="p-3 rounded-2xl bg-[#E69718]/15 border border-[#E69718]/30 text-xs text-[#FDE68A] flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#FBBF24]" />
            <div>{previewTargets.safetyWarnings.join(' ')}</div>
          </div>
        )}
      </div>

      {/* Main Profile Edit Form */}
      <form
        onSubmit={handleSave}
        className="bg-white dark:bg-[#1B1C19] rounded-[28px] p-6 card-soft border border-black/[0.04] dark:border-white/10 space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="p-name" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
              Full Name
            </label>
            <input
              id="p-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full h-11 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="p-dob" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
              Date of Birth (Age {previewTargets.age})
            </label>
            <input
              id="p-dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full h-11 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="p-gender" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
              Gender
            </label>
            <select
              id="p-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
              className="w-full h-11 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="p-diet" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
              Dietary Preference
            </label>
            <select
              id="p-diet"
              value={dietaryPreference}
              onChange={(e) => setDietaryPreference(e.target.value as DietaryPreference)}
              className="w-full h-11 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
            >
              {(Object.keys(DIETARY_LABELS) as DietaryPreference[]).map((k) => (
                <option key={k} value={k}>
                  {DIETARY_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="p-height" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
              Height (cm)
            </label>
            <input
              id="p-height"
              type="number"
              step="0.5"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="w-full h-11 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="p-weight" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
              Weight (kg)
            </label>
            <input
              id="p-weight"
              type="number"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className="w-full h-11 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="p-activity" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
              Activity Level
            </label>
            <select
              id="p-activity"
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
              className="w-full h-11 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
            >
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((k) => (
                <option key={k} value={k}>
                  {ACTIVITY_LABELS[k].label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="p-goal" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
              Fitness Goal
            </label>
            <select
              id="p-goal"
              value={fitnessGoal}
              onChange={(e) => setFitnessGoal(e.target.value as FitnessGoal)}
              className="w-full h-11 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
            >
              {(Object.keys(GOAL_LABELS) as FitnessGoal[]).map((k) => (
                <option key={k} value={k} disabled={previewTargets.isMinor && k === 'fat_loss'}>
                  {GOAL_LABELS[k]}
                  {previewTargets.isMinor && k === 'fat_loss' ? ' (Disabled under 18)' : ''}
                </option>
              ))}
            </select>
          </div>

          {!previewTargets.isMinor &&
            (fitnessGoal === 'fat_loss' || fitnessGoal === 'muscle_building') && (
              <div className="space-y-1">
                <label htmlFor="p-pace" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                  Goal Pace
                </label>
                <select
                  id="p-pace"
                  value={goalPace}
                  onChange={(e) => setGoalPace(e.target.value as GoalPace)}
                  className="w-full h-11 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white"
                >
                  {(['slow', 'medium', 'hard'] as GoalPace[]).map((p) => (
                    <option key={p} value={p}>
                      {GOAL_PACE_LABELS[p].label} ({GOAL_PACE_LABELS[p].deltaText})
                    </option>
                  ))}
                </select>
              </div>
            )}

          {!previewTargets.isMinor && (
            <div className="space-y-1">
              <label htmlFor="p-custom-cal" className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94]">
                Safe Custom Calorie Target (optional)
              </label>
              <input
                id="p-custom-cal"
                type="number"
                placeholder={`Auto (${previewTargets.targetCalories} kcal)`}
                value={customCalorieTarget}
                onChange={(e) => setCustomCalorieTarget(e.target.value)}
                className="w-full h-11 px-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm font-mono tabular-nums text-[#171715] dark:text-white"
              />
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="pt-4 border-t border-black/[0.06] dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Bell className="w-5 h-5 text-[#54A630] dark:text-[#A3F056] mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[#171715] dark:text-white">
                Daily Meal Logging Reminders
              </p>
              <p className="text-xs text-[#787872] dark:text-[#9C9C94]">
                Receive a gentle prompt to check in with your nutrition diary.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={mealReminderTime}
              onChange={(e) => setMealReminderTime(e.target.value)}
              aria-label="Meal reminder time"
              className="h-10 px-3 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-xs font-mono text-[#171715] dark:text-white"
            />
            <label className="inline-flex items-center gap-2 text-xs font-bold text-[#171715] dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#54A630]"
              />
              Enabled
            </label>
          </div>
        </div>

        <motion.button
          type="submit"
          whileTap={{ scale: 0.98 }}
          disabled={saving}
          className="h-12 px-7 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white font-bold text-sm disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Profile & Recalculate Targets'}
        </motion.button>
      </form>

      {/* Danger Zone: Account Deletion */}
      <section className="bg-white dark:bg-[#1B1C19] rounded-[28px] p-6 card-soft border border-[#E5484D]/25 space-y-3">
        <h2 className="text-base font-extrabold text-[#DC3B40] dark:text-[#F87171]">
          Delete Account
        </h2>
        <p className="text-xs text-[#787872] dark:text-[#9C9C94] leading-relaxed">
          Permanently removes your profile, food diary, weight logs, diet plans, and chat history.
          This action cannot be undone.
        </p>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="h-10 px-4 rounded-full bg-[#FDECEC] dark:bg-[#E5484D]/15 text-[#DC3B40] dark:text-[#F87171] text-xs font-bold flex items-center gap-2 hover:bg-[#FADADA]"
          >
            <Trash2 className="w-4 h-4" />
            Delete My Account
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={deleting}
              onClick={handleDeleteAccount}
              className="h-10 px-4 rounded-full bg-[#DC3B40] hover:bg-[#B91C1C] text-white text-xs font-bold disabled:opacity-60"
            >
              {deleting ? 'Deleting...' : 'Yes, Permanently Delete Everything'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="h-10 px-4 rounded-full bg-[#F4F4F0] dark:bg-white/10 text-[#171715] dark:text-white text-xs font-bold"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
