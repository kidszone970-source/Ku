import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  Calendar,
  Home,
  Leaf,
  MailCheck,
  MessageSquare,
  Moon,
  ScanLine,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { auth } from './firebase';
import {
  ActiveTab,
  ChatMessage,
  FoodEntry,
  UserProfile,
  WeightEntry,
} from './types/nutrition';
import {
  calculateNutritionTargets,
  formatLocalDate,
  MealType,
} from './utils/nutritionMath';
import {
  addChatMessageToFirestore,
  addFoodEntryToFirestore,
  addWeightEntryToFirestore,
  deleteAllUserDataFromFirestore,
  deleteFoodEntryFromFirestore,
  markChatMessageLoggedInFirestore,
  saveUserProfileToFirestore,
  subscribeChatMessages,
  subscribeFoodEntries,
  subscribeUserProfile,
  subscribeWeightHistory,
  updateFoodEntryInFirestore,
} from './services/nutritionStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthScreen } from './components/AuthScreen';
import { OnboardingWizard } from './components/OnboardingWizard';
import { HomeDashboard } from './components/HomeDashboard';
import { ScanFoodHub } from './components/ScanFoodHub';
import { AiCoachChat } from './components/AiCoachChat';
import { HistoryAnalyticsView } from './components/HistoryAnalyticsView';
import { ProfileSettingsView } from './components/ProfileSettingsView';
import { FoodEntryModal } from './components/FoodEntryModal';

const GUEST_STORAGE_KEY = 'nutripulse_guest_state_v1';

interface GuestStoreState {
  profile: UserProfile | null;
  foodEntries: FoodEntry[];
  weightHistory: WeightEntry[];
  chatMessages: ChatMessage[];
}

function createInitialGuestProfile(): UserProfile {
  return {
    uid: 'guest_local_session',
    email: 'guest@local.preview',
    fullName: 'Maya Patel',
    dateOfBirth: '1996-05-14',
    gender: 'female',
    heightCm: 166,
    weightKg: 62,
    activityLevel: 'moderately_active',
    dietaryPreference: 'vegetarian',
    fitnessGoal: 'general_fitness',
    goalPace: 'balanced',
    notificationsEnabled: true,
    mealReminderTime: '13:00',
    onboardingCompleted: true,
  };
}

function loadGuestState(): GuestStoreState {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as GuestStoreState;
  } catch {
    // ignore storage errors
  }
  return {
    profile: createInitialGuestProfile(),
    foodEntries: [],
    weightHistory: [],
    chatMessages: [],
  };
}

const DESKTOP_NAV_ITEMS: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'scan', label: 'Scan Food', icon: ScanLine },
  { id: 'coach', label: 'AI Coach', icon: MessageSquare },
  { id: 'history', label: 'History', icon: Calendar },
];

const MOBILE_DOCK_ITEMS: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'history', label: 'History', icon: Calendar },
  { id: 'scan', label: 'Scan', icon: ScanLine },
  { id: 'coach', label: 'AI Coach', icon: MessageSquare },
  { id: 'profile', label: 'Profile', icon: UserIcon },
];

function NutriPulseApp() {
  const [authReady, setAuthReady] = useState(false);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [forceOnboardingPreview, setForceOnboardingPreview] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('onboarding') === '1';
  });
  const [isGuestMode, setIsGuestMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' || params.get('onboarding') === '1';
  });

  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingCoachPrompt, setPendingCoachPrompt] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate());
  const [darkMode, setDarkMode] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Modal state for Quick Add & Edit Food Entry
  const [foodModalOpen, setFoodModalOpen] = useState(false);
  const [foodModalMeal, setFoodModalMeal] = useState<MealType>('breakfast');
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFbUser(user);
      if (user) {
        setIsGuestMode(false);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Load guest local browser session when explicitly started
  useEffect(() => {
    if (!isGuestMode || fbUser) return;
    if (forceOnboardingPreview) {
      setProfile(null);
      return;
    }
    const saved = loadGuestState();
    setProfile(saved.profile);
    setFoodEntries(saved.foodEntries);
    setWeightHistory(saved.weightHistory);
    setChatMessages(saved.chatMessages);
  }, [isGuestMode, fbUser, forceOnboardingPreview]);

  // Persist guest local browser session
  useEffect(() => {
    if (!isGuestMode || fbUser || forceOnboardingPreview) return;
    try {
      const payload: GuestStoreState = {
        profile,
        foodEntries,
        weightHistory,
        chatMessages: chatMessages.map(
          ({ localImages: _localImages, localAudioUrl: _localAudioUrl, ...rest }) => rest
        ),
      };
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota errors
    }
  }, [
    isGuestMode,
    fbUser,
    forceOnboardingPreview,
    profile,
    foodEntries,
    weightHistory,
    chatMessages,
  ]);

  // Subscribe to real Firestore collections ONLY when authenticated
  useEffect(() => {
    if (!fbUser) {
      if (!isGuestMode) {
        setProfile(null);
        setFoodEntries([]);
        setWeightHistory([]);
        setChatMessages([]);
      }
      return;
    }

    setProfileLoading(true);
    const uid = fbUser.uid;
    const unsubProfile = subscribeUserProfile(uid, (p) => {
      setProfile(p);
      setProfileLoading(false);
    });
    const unsubFood = subscribeFoodEntries(uid, setFoodEntries);
    const unsubWeight = subscribeWeightHistory(uid, setWeightHistory);
    const unsubChat = subscribeChatMessages(uid, setChatMessages);

    return () => {
      unsubProfile();
      unsubFood();
      unsubWeight();
      unsubChat();
    };
  }, [fbUser, isGuestMode]);

  const targets = useMemo(() => {
    if (!profile) return null;
    return calculateNutritionTargets({
      dateOfBirth: profile.dateOfBirth,
      gender: profile.gender,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      activityLevel: profile.activityLevel,
      fitnessGoal: profile.fitnessGoal,
      goalPace: profile.goalPace,
      customCalorieTarget: profile.customCalorieTarget,
    });
  }, [profile]);

  const handleCompleteOnboarding = async (newProfile: UserProfile) => {
    if (fbUser) {
      await saveUserProfileToFirestore(newProfile, !profile);
      await addWeightEntryToFirestore(
        fbUser.uid,
        formatLocalDate(),
        newProfile.weightKg,
        'Starting weight'
      );
    } else {
      setForceOnboardingPreview(false);
      setProfile(newProfile);
      setWeightHistory([
        {
          id: `w_${Date.now()}`,
          userId: newProfile.uid,
          date: formatLocalDate(),
          weightKg: newProfile.weightKg,
          note: 'Starting weight',
        },
      ]);
    }
  };

  const handleSaveProfile = async (updated: UserProfile) => {
    const weightChanged = profile && updated.weightKg !== profile.weightKg;
    if (fbUser) {
      await saveUserProfileToFirestore(updated, false);
      if (weightChanged) {
        await addWeightEntryToFirestore(
          fbUser.uid,
          formatLocalDate(),
          updated.weightKg,
          'Profile weight update'
        );
      }
    } else {
      setProfile(updated);
      if (weightChanged) {
        setWeightHistory((prev) => [
          ...prev,
          {
            id: `w_${Date.now()}`,
            userId: updated.uid,
            date: formatLocalDate(),
            weightKg: updated.weightKg,
            note: 'Profile weight update',
          },
        ]);
      }
    }
  };

  const handleAddFoodEntry = async (
    entry: Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (fbUser) {
      await addFoodEntryToFirestore(fbUser.uid, entry);
    } else {
      const created: FoodEntry = {
        ...entry,
        id: `food_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: profile?.uid ?? 'guest_local_session',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setFoodEntries((prev) => [created, ...prev]);
    }
  };

  const handleLogMultipleEntries = async (
    entries: Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[]
  ) => {
    for (const entry of entries) {
      await handleAddFoodEntry(entry);
    }
  };

  const handleEditFoodEntry = async (
    entryId: string,
    updates: Partial<Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'source'>>
  ) => {
    if (fbUser) {
      await updateFoodEntryInFirestore(fbUser.uid, entryId, updates);
    } else {
      setFoodEntries((prev) =>
        prev.map((item) => (item.id === entryId ? { ...item, ...updates } : item))
      );
    }
  };

  const handleDeleteFoodEntry = async (entryId: string) => {
    if (fbUser) {
      await deleteFoodEntryFromFirestore(fbUser.uid, entryId);
    } else {
      setFoodEntries((prev) => prev.filter((item) => item.id !== entryId));
    }
  };

  const handleLogWeight = async (date: string, weightKg: number, note?: string) => {
    if (fbUser) {
      await addWeightEntryToFirestore(fbUser.uid, date, weightKg, note);
      if (profile) {
        await saveUserProfileToFirestore({ ...profile, weightKg }, false);
      }
    } else {
      setWeightHistory((prev) =>
        [
          ...prev,
          {
            id: `w_${Date.now()}`,
            userId: profile?.uid ?? 'guest_local_session',
            date,
            weightKg,
            note,
          },
        ].sort((a, b) => a.date.localeCompare(b.date))
      );
      if (profile) setProfile({ ...profile, weightKg });
    }
  };

  const handleAddChatMessage = async (
    msg: Omit<ChatMessage, 'id' | 'userId' | 'createdAt'>
  ): Promise<string> => {
    if (fbUser) {
      return addChatMessageToFirestore(fbUser.uid, msg);
    }
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const created: ChatMessage = {
      ...msg,
      id,
      userId: profile?.uid ?? 'guest_local_session',
      createdAt: Date.now(),
    };
    setChatMessages((prev) => [...prev, created]);
    return id;
  };

  const handleConfirmChatEntries = async (
    messageId: string,
    entries: Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[]
  ) => {
    await handleLogMultipleEntries(entries);
    if (fbUser) {
      await markChatMessageLoggedInFirestore(fbUser.uid, messageId);
    } else {
      setChatMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, entriesLogged: true } : m))
      );
    }
  };

  const handleLogout = async () => {
    if (fbUser) {
      await signOut(auth);
    }
    setIsGuestMode(false);
    setForceOnboardingPreview(false);
    setActiveTab('home');
  };

  const handleDeleteAccount = async () => {
    if (fbUser) {
      await deleteAllUserDataFromFirestore(fbUser.uid);
      await deleteUser(fbUser);
    } else {
      localStorage.removeItem(GUEST_STORAGE_KEY);
      setIsGuestMode(false);
      setProfile(null);
      setFoodEntries([]);
      setWeightHistory([]);
      setChatMessages([]);
    }
  };

  // Loading auth state
  if (!authReady || (fbUser && profileLoading)) {
    return (
      <div className="min-h-screen bg-[#ECECE8] dark:bg-[#111210] flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-[#171715] dark:text-[#A3F056]">
          <Leaf className="w-6 h-6 animate-spin" />
          <span className="text-sm font-bold">Loading NutriPulse...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated view
  if (!fbUser && !isGuestMode) {
    return (
      <AuthScreen
        onStartPreview={() => {
          setIsGuestMode(true);
        }}
      />
    );
  }

  // Email/password unverified notice gate
  if (fbUser && !fbUser.emailVerified) {
    return (
      <div className="min-h-screen bg-[#ECECE8] dark:bg-[#111210] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-[#1B1C19] rounded-[32px] p-8 card-soft border border-black/[0.04] dark:border-white/10 space-y-5 text-center">
          <div className="w-12 h-12 rounded-full bg-[#EEF8E8] dark:bg-[#54A630]/15 text-[#4B962A] dark:text-[#A3F056] mx-auto flex items-center justify-center">
            <MailCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-extrabold text-[#171715] dark:text-white">
            Verify your email to secure your nutrition data
          </h1>
          <p className="text-sm text-[#787872] dark:text-[#9C9C94] leading-relaxed">
            We sent a verification link to <strong>{fbUser.email}</strong>. Click the link in your
            inbox, then tap &ldquo;I&rsquo;ve Verified&rdquo; below.
          </p>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={async () => {
                await fbUser.reload();
                setFbUser({ ...fbUser } as FirebaseUser);
                window.location.reload();
              }}
              className="w-full h-11 rounded-full bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513] font-bold text-sm"
            >
              I&rsquo;ve Verified My Email
            </button>
            <button
              type="button"
              onClick={async () => {
                await sendEmailVerification(fbUser);
                setVerificationSent(true);
              }}
              className="w-full h-10 rounded-full bg-[#F4F4F0] dark:bg-white/10 text-[#171715] dark:text-white font-bold text-xs"
            >
              {verificationSent ? 'Verification Email Resent' : 'Resend Verification Email'}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-semibold text-[#787872] hover:underline pt-1"
            >
              Sign out and use another account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 7-Step Animated Onboarding Wizard before accessing main dashboard
  if (!profile || !profile.onboardingCompleted || !targets) {
    return (
      <OnboardingWizard
        uid={fbUser?.uid ?? 'guest_local_session'}
        email={fbUser?.email ?? undefined}
        initialName={fbUser?.displayName ?? ''}
        onComplete={handleCompleteOnboarding}
      />
    );
  }

  const initials = profile.fullName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`${
        activeTab === 'coach' ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'
      } bg-[#ECECE8] dark:bg-[#111210] text-[#171715] dark:text-[#F4F4F0] flex`}
    >
      {/* Desktop Left Sidebar Rail */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-[#1B1C19] border-r border-black/[0.05] dark:border-white/10 p-5 justify-between z-30">
        <div className="space-y-8">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#151513] dark:bg-[#A3F056] text-[#A3F056] dark:text-[#151513] flex items-center justify-center">
                <Leaf className="w-5 h-5" />
              </div>
              <span className="text-lg font-extrabold tracking-tight text-[#171715] dark:text-white">
                NutriPulse
              </span>
            </div>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              className="w-9 h-9 rounded-full bg-[#F4F4F0] dark:bg-white/10 text-[#171715] dark:text-white flex items-center justify-center hover:bg-[#EAEAE4] dark:hover:bg-white/15 transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4 text-[#FBBF24]" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          <nav aria-label="Main navigation" className="space-y-1.5">
            {DESKTOP_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full h-11 px-4 rounded-full text-sm font-bold flex items-center gap-3 transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513] shadow-xs'
                      : 'text-[#62625C] dark:text-[#A1A19A] hover:bg-[#F4F4F0] dark:hover:bg-white/5 hover:text-[#171715] dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </motion.button>
              );
            })}
          </nav>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`w-full p-3 rounded-2xl flex items-center gap-3 text-left transition-colors ${
            activeTab === 'profile'
              ? 'bg-[#F4F4F0] dark:bg-white/10'
              : 'hover:bg-[#F4F4F0] dark:hover:bg-white/5'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-[#151513] dark:bg-[#A3F056] text-[#A3F056] dark:text-[#151513] font-bold text-xs flex items-center justify-center shrink-0">
            {initials || <UserIcon className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#171715] dark:text-white truncate">
              {profile.fullName}
            </p>
            <p className="text-xs text-[#787872] dark:text-[#9C9C94] truncate">
              Profile &amp; Settings
            </p>
          </div>
        </button>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Compact Mobile Top Bar (hidden during full-screen WhatsApp Coach chat) */}
        {activeTab !== 'coach' && (
          <header className="lg:hidden sticky top-0 z-30 h-14 px-4 bg-[#ECECE8]/90 dark:bg-[#111210]/90 backdrop-blur-md border-b border-black/[0.05] dark:border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#151513] dark:bg-[#A3F056] text-[#A3F056] dark:text-[#151513] flex items-center justify-center">
                <Leaf className="w-4 h-4" />
              </div>
              <span className="text-base font-extrabold tracking-tight text-[#171715] dark:text-white whitespace-nowrap">
                NutriPulse
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDarkMode((d) => !d)}
                aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
                className="w-9 h-9 rounded-full bg-white dark:bg-[#1B1C19] text-[#171715] dark:text-white flex items-center justify-center card-soft"
              >
                {darkMode ? <Sun className="w-4 h-4 text-[#FBBF24]" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                aria-label="Open profile and settings"
                className="w-9 h-9 rounded-full bg-[#151513] dark:bg-[#A3F056] text-[#A3F056] dark:text-[#151513] text-xs font-extrabold flex items-center justify-center"
              >
                {initials || <UserIcon className="w-4 h-4" />}
              </button>
            </div>
          </header>
        )}

        {/* Active View Area with Smooth Tab Transition */}
        <main
          className={
            activeTab === 'coach'
              ? 'flex-1 w-full h-[100dvh] p-0 overflow-hidden'
              : 'flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-28 lg:pb-10'
          }
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: activeTab === 'coach' ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: activeTab === 'coach' ? 0 : -4 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className={activeTab === 'coach' ? 'h-full w-full' : undefined}
            >
              {activeTab === 'home' && (
                <HomeDashboard
                  profile={profile}
                  targets={targets}
                  foodEntries={foodEntries}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  onQuickAdd={(meal) => {
                    setEditingEntry(null);
                    setFoodModalMeal(meal);
                    setFoodModalOpen(true);
                  }}
                  onQuickLogEntry={handleAddFoodEntry}
                  onEditEntry={(entry) => {
                    setEditingEntry(entry);
                    setFoodModalOpen(true);
                  }}
                  onDeleteEntry={handleDeleteFoodEntry}
                  onNavigate={setActiveTab}
                  onRequestDietPlan={() => {
                    setPendingCoachPrompt('Make me a personalized diet plan PDF for my goal');
                    setActiveTab('coach');
                  }}
                />
              )}

              {activeTab === 'coach' && (
                <AiCoachChat
                  profile={profile}
                  targets={targets}
                  foodEntries={foodEntries}
                  messages={chatMessages}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  onNavigate={setActiveTab}
                  onBack={() => setActiveTab('home')}
                  initialPrompt={pendingCoachPrompt}
                  onConsumeInitialPrompt={() => setPendingCoachPrompt(null)}
                  onLogMealFromPlan={handleAddFoodEntry}
                  onAutoLogEntries={handleLogMultipleEntries}
                  onAddChatMessage={handleAddChatMessage}
                  onConfirmProposedEntries={handleConfirmChatEntries}
                />
              )}

              {activeTab === 'scan' && (
                <ScanFoodHub
                  profile={profile}
                  targets={targets}
                  selectedDate={selectedDate}
                  onLogEntries={handleLogMultipleEntries}
                />
              )}

              {activeTab === 'history' && (
                <HistoryAnalyticsView
                  profile={profile}
                  targets={targets}
                  foodEntries={foodEntries}
                  weightHistory={weightHistory}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  onEditEntry={(entry) => {
                    setEditingEntry(entry);
                    setFoodModalOpen(true);
                  }}
                  onDeleteEntry={handleDeleteFoodEntry}
                  onQuickAddForDate={(date) => {
                    setSelectedDate(date);
                    setEditingEntry(null);
                    setFoodModalMeal('lunch');
                    setFoodModalOpen(true);
                  }}
                  onLogWeight={handleLogWeight}
                />
              )}

              {activeTab === 'profile' && (
                <ProfileSettingsView
                  profile={profile}
                  isGuestMode={isGuestMode}
                  darkMode={darkMode}
                  onToggleDarkMode={() => setDarkMode((d) => !d)}
                  onSaveProfile={handleSaveProfile}
                  onLogout={handleLogout}
                  onDeleteAccount={handleDeleteAccount}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Reference Screen 1: Mobile White Dock (hidden during full-screen WhatsApp Coach chat) */}
        {activeTab !== 'coach' && (
          <nav
            aria-label="Mobile bottom navigation"
            className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#1B1C19]/95 backdrop-blur-md border-t border-black/[0.06] dark:border-white/10 pb-safe rounded-t-3xl shadow-[0_-8px_24px_rgba(23,23,21,0.06)]"
          >
            <div className="grid grid-cols-5 h-16 items-center px-1">
              {MOBILE_DOCK_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                const isScan = item.id === 'scan';

                if (isScan) {
                  return (
                    <div key={item.id} className="flex items-center justify-center">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setActiveTab('scan')}
                        aria-label="Scan Food"
                        className={`-mt-6 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-colors ${
                          active
                            ? 'bg-[#A3F056] text-[#151513]'
                            : 'bg-[#151513] dark:bg-white text-white dark:text-[#151513]'
                        }`}
                      >
                        <Icon className="w-6 h-6" />
                      </motion.button>
                    </div>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex flex-col items-center justify-center h-full gap-1 transition-colors ${
                      active
                        ? 'text-[#E69718] dark:text-[#A3F056]'
                        : 'text-[#8E8E87] dark:text-[#787872]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-bold tracking-tight whitespace-nowrap">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>

      {/* Reusable Quick-Add / Edit Food Modal */}
      <AnimatePresence>
        {foodModalOpen && (
          <FoodEntryModal
            isOpen={foodModalOpen}
            onClose={() => {
              setFoodModalOpen(false);
              setEditingEntry(null);
            }}
            defaultDate={selectedDate}
            defaultMealType={foodModalMeal}
            dietaryPreference={profile.dietaryPreference}
            editingEntry={editingEntry}
            onSaveNew={handleAddFoodEntry}
            onSaveEdit={handleEditFoodEntry}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <NutriPulseApp />
      </ErrorBoundary>
    </MotionConfig>
  );
}
