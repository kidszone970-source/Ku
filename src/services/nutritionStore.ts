import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  ChatMessage,
  DietPlan,
  FoodEntry,
  UserProfile,
  WeightEntry,
} from '../types/nutrition';
import { formatLocalDate } from '../utils/nutritionMath';

function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

function clampString(val: string | undefined, max: number): string {
  return (val ?? '').trim().slice(0, max);
}

function clampNumber(val: number | undefined, min: number, max: number, fallback = 0): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return Date.parse(ts) || 0;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export async function saveUserProfileToFirestore(
  profile: UserProfile,
  isNew: boolean
): Promise<void> {
  const path = `users/${profile.uid}`;
  const ref = doc(db, 'users', profile.uid);

  const sanitized: Record<string, unknown> = {
    uid: profile.uid,
    fullName: clampString(profile.fullName, 120) || 'Member',
    dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(profile.dateOfBirth)
      ? profile.dateOfBirth
      : '1996-01-01',
    gender: profile.gender,
    heightCm: clampNumber(profile.heightCm, 50, 280, 170),
    weightKg: clampNumber(profile.weightKg, 15, 400, 70),
    activityLevel: profile.activityLevel,
    dietaryPreference: profile.dietaryPreference,
    fitnessGoal: profile.fitnessGoal,
    goalPace: profile.goalPace,
    notificationsEnabled: Boolean(profile.notificationsEnabled),
    onboardingCompleted: Boolean(profile.onboardingCompleted),
    updatedAt: serverTimestamp(),
  };

  if (profile.email) sanitized.email = clampString(profile.email, 200);
  if (profile.mealReminderTime) {
    sanitized.mealReminderTime = clampString(profile.mealReminderTime, 10);
  }
  if (profile.customCalorieTarget !== undefined && profile.customCalorieTarget > 0) {
    sanitized.customCalorieTarget = clampNumber(profile.customCalorieTarget, 0, 10000, 0);
  }

  try {
    if (isNew) {
      sanitized.createdAt = serverTimestamp();
      await setDoc(ref, sanitized);
    } else {
      const updatePayload = { ...sanitized };
      delete updatePayload.uid;
      await updateDoc(ref, updatePayload);
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function addFoodEntryToFirestore(
  uid: string,
  entry: Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = generateSafeId('food');
  const path = `users/${uid}/foodEntries/${id}`;
  const ref = doc(db, 'users', uid, 'foodEntries', id);

  const payload: Record<string, unknown> = {
    userId: uid,
    date: /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date : formatLocalDate(),
    mealType: entry.mealType,
    foodName: clampString(entry.foodName, 160) || 'Food Item',
    quantity: clampNumber(entry.quantity, 0, 20000, 100),
    unit: clampString(entry.unit, 32) || 'g',
    calories: clampNumber(entry.calories, 0, 25000, 0),
    protein: clampNumber(entry.protein, 0, 1000, 0),
    carbs: clampNumber(entry.carbs, 0, 2000, 0),
    fat: clampNumber(entry.fat, 0, 1000, 0),
    fiber: clampNumber(entry.fiber, 0, 500, 0),
    source: entry.source,
    isEstimated: Boolean(entry.isEstimated),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (entry.servingDescription) {
    payload.servingDescription = clampString(entry.servingDescription, 120);
  }
  if (typeof entry.sugar === 'number') {
    payload.sugar = clampNumber(entry.sugar, 0, 1000, 0);
  }
  if (typeof entry.sodiumMg === 'number') {
    payload.sodiumMg = clampNumber(entry.sodiumMg, 0, 50000, 0);
  }
  if (typeof entry.saturatedFat === 'number') {
    payload.saturatedFat = clampNumber(entry.saturatedFat, 0, 500, 0);
  }
  if (entry.notes) {
    payload.notes = clampString(entry.notes, 300);
  }

  try {
    await setDoc(ref, payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFoodEntryInFirestore(
  uid: string,
  entryId: string,
  updates: Partial<Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'source'>>
): Promise<void> {
  const path = `users/${uid}/foodEntries/${entryId}`;
  const ref = doc(db, 'users', uid, 'foodEntries', entryId);

  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.date !== undefined) payload.date = updates.date;
  if (updates.mealType !== undefined) payload.mealType = updates.mealType;
  if (updates.foodName !== undefined) payload.foodName = clampString(updates.foodName, 160);
  if (updates.quantity !== undefined) payload.quantity = clampNumber(updates.quantity, 0, 20000, 0);
  if (updates.unit !== undefined) payload.unit = clampString(updates.unit, 32);
  if (updates.servingDescription !== undefined) {
    payload.servingDescription = clampString(updates.servingDescription, 120);
  }
  if (updates.calories !== undefined) payload.calories = clampNumber(updates.calories, 0, 25000, 0);
  if (updates.protein !== undefined) payload.protein = clampNumber(updates.protein, 0, 1000, 0);
  if (updates.carbs !== undefined) payload.carbs = clampNumber(updates.carbs, 0, 2000, 0);
  if (updates.fat !== undefined) payload.fat = clampNumber(updates.fat, 0, 1000, 0);
  if (updates.fiber !== undefined) payload.fiber = clampNumber(updates.fiber, 0, 500, 0);
  if (updates.notes !== undefined) payload.notes = clampString(updates.notes, 300);
  if (updates.isEstimated !== undefined) payload.isEstimated = Boolean(updates.isEstimated);

  try {
    await updateDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFoodEntryFromFirestore(
  uid: string,
  entryId: string
): Promise<void> {
  const path = `users/${uid}/foodEntries/${entryId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'foodEntries', entryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addWeightEntryToFirestore(
  uid: string,
  date: string,
  weightKg: number,
  note?: string
): Promise<string> {
  const id = generateSafeId('weight');
  const path = `users/${uid}/weightHistory/${id}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : formatLocalDate(),
    weightKg: clampNumber(weightKg, 15, 400, 70),
    createdAt: serverTimestamp(),
  };
  if (note?.trim()) {
    payload.note = clampString(note, 200);
  }
  try {
    await setDoc(doc(db, 'users', uid, 'weightHistory', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveDietPlanToFirestore(
  uid: string,
  plan: Omit<DietPlan, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = generateSafeId('plan');
  const path = `users/${uid}/dietPlans/${id}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    title: clampString(plan.title, 140) || 'Personalized Nutrition Plan',
    dietaryPreference: clampString(plan.dietaryPreference, 40),
    fitnessGoal: clampString(plan.fitnessGoal, 40),
    targetCalories: clampNumber(plan.targetCalories, 800, 10000, 2000),
    meals: plan.meals.slice(0, 10),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (plan.coachNotes) {
    payload.coachNotes = clampString(plan.coachNotes, 600);
  }
  try {
    await setDoc(doc(db, 'users', uid, 'dietPlans', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function addChatMessageToFirestore(
  uid: string,
  msg: Omit<ChatMessage, 'id' | 'userId' | 'createdAt'>
): Promise<string> {
  const id = generateSafeId('msg');
  const path = `users/${uid}/chatMessages/${id}`;
  const payload: Record<string, unknown> = {
    userId: uid,
    role: msg.role,
    content: clampString(msg.content, 4000) || '...',
    createdAt: serverTimestamp(),
  };
  if (msg.dateContext && /^\d{4}-\d{2}-\d{2}$/.test(msg.dateContext)) {
    payload.dateContext = msg.dateContext;
  }
  if (msg.proposedEntries && msg.proposedEntries.length > 0) {
    payload.proposedEntries = msg.proposedEntries.slice(0, 20);
  }
  if (msg.followUpOptions && msg.followUpOptions.length > 0) {
    payload.followUpOptions = msg.followUpOptions
      .map((opt) => clampString(opt, 60))
      .filter(Boolean)
      .slice(0, 8);
  }
  if (typeof msg.attachmentCount === 'number' && msg.attachmentCount > 0) {
    payload.attachmentCount = clampNumber(msg.attachmentCount, 0, 10, 0);
  }
  if (typeof msg.voiceDurationSec === 'number' && msg.voiceDurationSec > 0) {
    payload.voiceDurationSec = clampNumber(Math.round(msg.voiceDurationSec), 1, 600, 1);
  }
  if (msg.dietPlan && Array.isArray(msg.dietPlan.meals) && msg.dietPlan.meals.length > 0) {
    payload.dietPlan = {
      title: clampString(msg.dietPlan.title, 140) || 'Personalized Diet Plan',
      goalSummary: clampString(msg.dietPlan.goalSummary, 240),
      targetCalories: clampNumber(msg.dietPlan.targetCalories, 800, 10000, 2000),
      coachNotes: clampString(msg.dietPlan.coachNotes, 800),
      meals: msg.dietPlan.meals.slice(0, 10).map((m) => ({
        slot: m.slot || 'lunch',
        slotLabel: clampString(m.slotLabel, 40) || 'Meal',
        timeSuggestion: clampString(m.timeSuggestion, 30),
        foodName: clampString(m.foodName, 140) || 'Balanced Meal',
        photoQuery: clampString(m.photoQuery, 120),
        photoUrl: clampString(m.photoUrl, 300),
        suggestedQuantity: clampString(m.suggestedQuantity, 120) || '1 serving',
        calories: clampNumber(m.calories, 0, 5000, 0),
        protein: clampNumber(m.protein, 0, 300, 0),
        carbs: clampNumber(m.carbs, 0, 500, 0),
        fat: clampNumber(m.fat, 0, 250, 0),
        fiber: clampNumber(m.fiber, 0, 120, 0),
        rationale: clampString(m.rationale, 240),
        prepTip: clampString(m.prepTip, 200),
      })),
    };
  }
  if (msg.entriesLogged !== undefined) {
    payload.entriesLogged = Boolean(msg.entriesLogged);
  }
  try {
    await setDoc(doc(db, 'users', uid, 'chatMessages', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markChatMessageLoggedInFirestore(
  uid: string,
  messageId: string
): Promise<void> {
  const path = `users/${uid}/chatMessages/${messageId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'chatMessages', messageId), {
      entriesLogged: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAllUserDataFromFirestore(uid: string): Promise<void> {
  const subcollections = ['foodEntries', 'weightHistory', 'dietPlans', 'chatMessages'] as const;
  try {
    for (const sub of subcollections) {
      const q = query(collection(db, 'users', uid, sub), where('userId', '==', uid));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      if (!snap.empty) {
        await batch.commit();
      }
    }
    await deleteDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError?: (err: Error) => void
) {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
      } else {
        onData(snap.data() as UserProfile);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        onError?.(e as Error);
      }
    }
  );
}

export function subscribeFoodEntries(
  uid: string,
  onData: (entries: FoodEntry[]) => void
) {
  const path = `users/${uid}/foodEntries`;
  const q = query(collection(db, 'users', uid, 'foodEntries'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: FoodEntry[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FoodEntry, 'id'>),
      }));
      list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeWeightHistory(
  uid: string,
  onData: (entries: WeightEntry[]) => void
) {
  const path = `users/${uid}/weightHistory`;
  const q = query(collection(db, 'users', uid, 'weightHistory'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: WeightEntry[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<WeightEntry, 'id'>),
      }));
      list.sort((a, b) => a.date.localeCompare(b.date));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeDietPlans(
  uid: string,
  onData: (plans: DietPlan[]) => void
) {
  const path = `users/${uid}/dietPlans`;
  const q = query(collection(db, 'users', uid, 'dietPlans'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: DietPlan[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DietPlan, 'id'>),
      }));
      list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeChatMessages(
  uid: string,
  onData: (messages: ChatMessage[]) => void
) {
  const path = `users/${uid}/chatMessages`;
  const q = query(collection(db, 'users', uid, 'chatMessages'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: ChatMessage[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ChatMessage, 'id'>),
      }));
      list.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
