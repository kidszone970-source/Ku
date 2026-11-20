import {
  ChatDietPlan,
  CoachRecommendation,
  FoodEntry,
  NutritionLabelResponse,
  ProposedFoodItem,
  ScanFoodResponse,
  UserProfile,
} from '../types/nutrition';
import { NutritionTargetsResult } from '../utils/nutritionMath';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function analyzeFoodPhoto(
  imageBase64: string,
  mimeType: string,
  userContext: { dietaryPreference: string; fitnessGoal: string; isMinor: boolean }
): Promise<ScanFoodResponse> {
  return postJson<ScanFoodResponse>('/api/ai/scan-food', {
    imageBase64,
    mimeType,
    userContext,
  });
}

export async function analyzeNutritionLabel(
  imageBase64: string,
  mimeType: string
): Promise<NutritionLabelResponse> {
  return postJson<NutritionLabelResponse>('/api/ai/scan-label', {
    imageBase64,
    mimeType,
  });
}

export interface ChatApiResponse {
  reply: string;
  needsClarification: boolean;
  followUpOptions?: string[];
  proposedEntries: ProposedFoodItem[];
  dietPlan?: ChatDietPlan | null;
}

export async function sendCoachChatMessage(params: {
  message: string;
  images?: { dataUrl: string; mimeType: string; kind?: 'food' | 'label' }[];
  imageBase64?: string;
  mimeType?: string;
  imageKind?: 'food' | 'label';
  history: { role: 'user' | 'assistant'; content: string }[];
  profile: UserProfile;
  targets: NutritionTargetsResult;
  todaySummary: Record<string, unknown>;
  selectedDate: string;
  currentHour?: number;
}): Promise<ChatApiResponse> {
  return postJson<ChatApiResponse>('/api/ai/chat', params);
}

export async function fetchCoachInsights(params: {
  profile: UserProfile;
  targets: NutritionTargetsResult;
  todaySummary: Record<string, unknown>;
  recentEntries: FoodEntry[];
}): Promise<CoachRecommendation> {
  return postJson<CoachRecommendation>('/api/ai/coach-insights', params);
}

export async function transcribeVoiceAudio(
  audioBase64: string,
  mimeType: string
): Promise<{ transcript: string }> {
  return postJson<{ transcript: string }>('/api/ai/transcribe', {
    audioBase64,
    mimeType,
  });
}

export async function synthesizeCoachSpeech(
  text: string
): Promise<{ audioDataUrl: string }> {
  return postJson<{ audioDataUrl: string }>('/api/ai/tts', { text });
}
