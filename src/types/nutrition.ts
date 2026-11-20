import {
  ActivityLevel,
  DietaryPreference,
  FitnessGoal,
  Gender,
  GoalPace,
  MealType,
} from '../utils/nutritionMath';

export interface UserProfile {
  uid: string;
  email?: string;
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  dietaryPreference: DietaryPreference;
  fitnessGoal: FitnessGoal;
  goalPace: GoalPace;
  customCalorieTarget?: number;
  notificationsEnabled: boolean;
  mealReminderTime?: string;
  onboardingCompleted: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type FoodEntrySource =
  | 'manual'
  | 'database'
  | 'camera'
  | 'gallery'
  | 'label'
  | 'chatbot'
  | 'diet_plan';

export interface FoodEntry {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  mealType: MealType;
  foodName: string;
  quantity: number;
  unit: string;
  servingDescription?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar?: number;
  sodiumMg?: number;
  saturatedFat?: number;
  source: FoodEntrySource;
  isEstimated: boolean;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WeightEntry {
  id: string;
  userId: string;
  date: string;
  weightKg: number;
  note?: string;
  createdAt?: unknown;
}

export interface DietPlanMeal {
  slot: 'breakfast' | 'morning_snack' | 'lunch' | 'evening_snack' | 'dinner';
  slotLabel: string;
  foodName: string;
  suggestedQuantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  rationale?: string;
}

export interface DietPlan {
  id: string;
  userId: string;
  title: string;
  dietaryPreference: DietaryPreference;
  fitnessGoal: FitnessGoal;
  targetCalories: number;
  meals: DietPlanMeal[];
  coachNotes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProposedFoodItem {
  foodName: string;
  mealType: MealType;
  quantity: number;
  unit: string;
  servingDescription?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  isEstimated: boolean;
  source?: FoodEntrySource;
}

export interface ChatImageAttachment {
  id: string;
  dataUrl: string;
  mimeType: string;
  kind: 'food' | 'label';
}

export interface ChatDietPlanMeal {
  slot: 'breakfast' | 'morning_snack' | 'lunch' | 'evening_snack' | 'dinner';
  slotLabel: string;
  timeSuggestion?: string;
  foodName: string;
  photoQuery?: string;
  photoUrl?: string;
  suggestedQuantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  rationale?: string;
  prepTip?: string;
}

export interface ChatDietPlan {
  title: string;
  goalSummary?: string;
  targetCalories: number;
  coachNotes?: string;
  meals: ChatDietPlanMeal[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  dateContext?: string;
  proposedEntries?: ProposedFoodItem[];
  followUpOptions?: string[];
  attachmentCount?: number;
  /** Duration in seconds for WhatsApp voice notes (persisted to Firestore). */
  voiceDurationSec?: number;
  /** Structured personalized diet plan sent by Coach inside WhatsApp chat (downloadable as illustrated PDF). */
  dietPlan?: ChatDietPlan;
  /** Session-only compressed thumbnails for WhatsApp chat bubbles (never persisted to Firestore). */
  localImages?: string[];
  /** Session-only local object/data URL for playing back recorded voice note (never persisted to Firestore). */
  localAudioUrl?: string;
  entriesLogged?: boolean;
  needsClarification?: boolean;
  createdAt?: unknown;
}

export interface ScannedFoodItem {
  foodName: string;
  estimatedGrams: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScanFoodResponse {
  dishTitle: string;
  summary: string;
  uncertaintyNote: string;
  coachTip: string;
  items: ScannedFoodItem[];
}

export interface NutritionLabelResponse {
  productName: string;
  servingSizeText: string;
  servingGramsOrMl?: number | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  saturatedFat?: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodiumMg?: number | null;
  extractionNotes: string;
}

export interface CoachRecommendation {
  headline: string;
  summary: string;
  suggestions: {
    title: string;
    detail: string;
    category: 'protein' | 'balance' | 'hydration_fiber' | 'habit';
  }[];
  foodIdeas: string[];
  disclaimer: string;
}

export type ActiveTab = 'home' | 'coach' | 'scan' | 'history' | 'profile';
