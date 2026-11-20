import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Leaf,
  Loader2,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  ActiveTab,
  ChatDietPlan,
  ChatDietPlanMeal,
  ChatImageAttachment,
  ChatMessage,
  FoodEntry,
  ProposedFoodItem,
  UserProfile,
} from '../types/nutrition';
import {
  formatLocalDate,
  MealType,
  NutritionTargetsResult,
  summarizeDayEntries,
} from '../utils/nutritionMath';
import {
  sendCoachChatMessage,
  synthesizeCoachSpeech,
  transcribeVoiceAudio,
} from '../services/aiClient';
import { downloadDietPlanPdf, resolveMealPhotoUrl } from '../utils/dietPlanPdf';
import { InlineMacroRow, NUTRIENT_THEME, NutrientIcon } from './NutrientVisuals';

interface AiCoachChatProps {
  profile: UserProfile;
  targets: NutritionTargetsResult;
  foodEntries: FoodEntry[];
  messages: ChatMessage[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onNavigate: (tab: ActiveTab) => void;
  onBack?: () => void;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
  onLogMealFromPlan?: (
    entry: Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onAutoLogEntries?: (
    entries: Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[]
  ) => Promise<void>;
  onAddChatMessage: (msg: Omit<ChatMessage, 'id' | 'userId' | 'createdAt'>) => Promise<string>;
  onConfirmProposedEntries: (
    messageId: string,
    entries: Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[]
  ) => Promise<void>;
}

const MAX_PHOTOS_PER_MESSAGE = 6;

const MEAL_SLOT_OPTIONS: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

const QUICK_STARTERS = [
  'Make me a personalized diet plan PDF for my goal',
  'I had 100g besan cheela with mint chutney',
  'I ate 150g cooked rice, 100g dal, and salad',
  'Suggest a high-protein dinner for my target',
];

const VOICE_WAVEFORM_BARS = [
  'h-2', 'h-3.5', 'h-5', 'h-2.5', 'h-4', 'h-5', 'h-2', 'h-3.5', 'h-5',
  'h-3', 'h-4', 'h-2', 'h-3.5', 'h-3', 'h-4', 'h-2', 'h-3.5', 'h-2.5',
];

function formatDuration(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

function mapPlanSlotToMealType(slot: ChatDietPlanMeal['slot']): MealType {
  if (slot === 'breakfast') return 'breakfast';
  if (slot === 'lunch') return 'lunch';
  if (slot === 'dinner') return 'dinner';
  return 'snacks';
}

function pickSupportedAudioMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return 'audio/webm';
  }
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read recorded voice audio.'));
    reader.readAsDataURL(blob);
  });
}

function formatBubbleTime(createdAt: unknown): string {
  let ms = 0;
  if (typeof createdAt === 'number') {
    ms = createdAt;
  } else if (typeof createdAt === 'string') {
    ms = Date.parse(createdAt) || 0;
  } else if (
    typeof createdAt === 'object' &&
    createdAt !== null &&
    'toMillis' in createdAt &&
    typeof (createdAt as { toMillis: () => number }).toMillis === 'function'
  ) {
    ms = (createdAt as { toMillis: () => number }).toMillis();
  }
  const dt = ms > 0 ? new Date(ms) : new Date();
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateDivider(dateStr: string): string {
  const today = formatLocalDate();
  const yestDate = new Date();
  yestDate.setDate(yestDate.getDate() - 1);
  const yesterday = formatLocalDate(yestDate);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const parsed = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Compresses an uploaded image file to max 960px on longest edge (JPEG 0.78)
 * so multiple photos can be sent quickly in one multimodal request.
 */
async function compressImageFile(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.readAsDataURL(file);
  });

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxEdge = 960;
      let { width, height } = img;
      if (width > maxEdge || height > maxEdge) {
        if (width >= height) {
          height = Math.round((height * maxEdge) / width);
          width = maxEdge;
        } else {
          width = Math.round((width * maxEdge) / height);
          height = maxEdge;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl: rawDataUrl, mimeType: file.type || 'image/jpeg' });
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        const compressed = canvas.toDataURL('image/jpeg', 0.78);
        resolve({ dataUrl: compressed, mimeType: 'image/jpeg' });
      } catch {
        resolve({ dataUrl: rawDataUrl, mimeType: file.type || 'image/jpeg' });
      }
    };
    img.onerror = () => {
      resolve({ dataUrl: rawDataUrl, mimeType: file.type || 'image/jpeg' });
    };
    img.src = rawDataUrl;
  });
}

export const AiCoachChat: React.FC<AiCoachChatProps> = ({
  profile,
  targets,
  foodEntries,
  messages,
  selectedDate,
  onSelectDate,
  onNavigate,
  onBack,
  initialPrompt,
  onConsumeInitialPrompt,
  onLogMealFromPlan,
  onAutoLogEntries,
  onAddChatMessage,
  onConfirmProposedEntries,
}) => {
  const [input, setInput] = useState('');
  const [stagedImages, setStagedImages] = useState<ChatImageAttachment[]>([]);
  const [sessionImageMap, setSessionImageMap] = useState<Record<string, string[]>>({});
  const [sessionAudioMap, setSessionAudioMap] = useState<Record<string, string>>({});
  const [mealOverrideMap, setMealOverrideMap] = useState<Record<string, MealType>>({});
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Voice recording state (WhatsApp-style voice notes)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [transcribingVoice, setTranscribingVoice] = useState(false);

  // Audio playback state (for both user voice notes & Coach TTS replies)
  const [playingAudioKey, setPlayingAudioKey] = useState<string | null>(null);
  const [loadingTtsId, setLoadingTtsId] = useState<string | null>(null);
  const [ttsCache, setTtsCache] = useState<Record<string, string>>({});

  // PDF generation & individual diet-plan meal logging state
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [loggedPlanMeals, setLoggedPlanMeals] = useState<Record<string, boolean>>({});

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedRequest, setLastFailedRequest] = useState<{
    text: string;
    images: ChatImageAttachment[];
  } | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordingSecRef = useRef<number>(0);
  const cancelRecordingRef = useRef<boolean>(false);
  const activeAudioElRef = useRef<HTMLAudioElement | null>(null);
  const consumedPromptRef = useRef<string | null>(null);

  const daySummary = useMemo(
    () => summarizeDayEntries(foodEntries, selectedDate),
    [foodEntries, selectedDate]
  );

  // Build 7-day interactive calendar strip ending on selectedDate (or today if selectedDate is recent)
  const calendarWeek = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const anchor = new Date(y, (m || 1) - 1, d || 1);
    const todayStr = formatLocalDate();
    const caloriesByDate = new Map<string, number>();
    for (const entry of foodEntries) {
      caloriesByDate.set(entry.date, (caloriesByDate.get(entry.date) ?? 0) + (Number(entry.calories) || 0));
    }
    // Show 6 days leading up to anchor (or anchor centered if in past)
    const days: {
      date: string;
      dayShort: string;
      dayNum: number;
      calories: number;
      pct: number;
      isToday: boolean;
    }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(anchor);
      dt.setDate(dt.getDate() - i);
      const key = formatLocalDate(dt);
      const cal = Math.round(caloriesByDate.get(key) ?? 0);
      days.push({
        date: key,
        dayShort: dt.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: dt.getDate(),
        calories: cal,
        pct: Math.min(100, Math.round((cal / Math.max(1, targets.targetCalories)) * 100)),
        isToday: key === todayStr,
      });
    }
    return days;
  }, [foodEntries, selectedDate, targets.targetCalories]);

  const shiftDate = (delta: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + delta);
    onSelectDate(formatLocalDate(dt));
  };

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending, transcribingVoice]);

  // Auto-grow WhatsApp multi-line textarea cleanly (exact 44px on 1 line to match action icons, growing smoothly up to ~5 lines)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!input) {
      el.style.height = '44px';
      return;
    }
    el.style.height = '0px';
    const nextHeight = Math.min(Math.max(44, el.scrollHeight + 2), 136);
    el.style.height = `${nextHeight}px`;
  }, [input, isRecordingVoice]);

  // Cleanup active mic stream / audio playback on unmount
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (activeAudioElRef.current) {
        activeAudioElRef.current.pause();
        activeAudioElRef.current = null;
      }
    };
  }, []);

  const handleMultiImagePick = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'food' | 'label'
  ) => {
    const fileList = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (fileList.length === 0) return;

    const remainingSlots = MAX_PHOTOS_PER_MESSAGE - stagedImages.length;
    if (remainingSlots <= 0) {
      setError(`You can attach up to ${MAX_PHOTOS_PER_MESSAGE} photos in a single message.`);
      return;
    }

    setError(null);
    const filesToProcess = fileList.slice(0, remainingSlots);
    const processed: ChatImageAttachment[] = [];

    for (const file of filesToProcess) {
      try {
        const compressed = await compressImageFile(file);
        processed.push({
          id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          dataUrl: compressed.dataUrl,
          mimeType: compressed.mimeType,
          kind,
        });
      } catch {
        // skip unreadable file
      }
    }

    if (processed.length > 0) {
      setStagedImages((prev) => [...prev, ...processed].slice(0, MAX_PHOTOS_PER_MESSAGE));
      // Focus the caption input so the user can immediately add a description
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  const handleRemoveStagedImage = (id: string) => {
    setStagedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleToggleStagedKind = (id: string) => {
    setStagedImages((prev) =>
      prev.map((img) =>
        img.id === id ? { ...img, kind: img.kind === 'food' ? 'label' : 'food' } : img
      )
    );
  };

  const requestCoachReply = async (
    textToSend: string,
    imagesToSend: ChatImageAttachment[]
  ) => {
    const nowHour = new Date().getHours();
    const fallbackMealSlot: MealType =
      nowHour < 11 ? 'breakfast' : nowHour < 15 ? 'lunch' : nowHour < 18 ? 'snacks' : 'dinner';

    const aiReply = await sendCoachChatMessage({
      message: textToSend,
      images:
        imagesToSend.length > 0
          ? imagesToSend.map((img) => ({
              dataUrl: img.dataUrl,
              mimeType: img.mimeType,
              kind: img.kind,
            }))
          : undefined,
      history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      profile,
      targets,
      todaySummary: {
        date: selectedDate,
        calories: daySummary.calories,
        protein: daySummary.protein,
        carbs: daySummary.carbs,
        fat: daySummary.fat,
        fiber: daySummary.fiber,
      },
      selectedDate,
      currentHour: nowHour,
    });

    const proposedItems = Array.isArray(aiReply.proposedEntries) ? aiReply.proposedEntries : [];
    let autoLogged = false;

    // Directly record reported food entries into the user's diary immediately (no confirmation prompt)
    if (proposedItems.length > 0) {
      const validMeals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks', 'daily_total'];
      const entriesToSave: Omit<FoodEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[] =
        proposedItems.map((item) => ({
          date: selectedDate,
          mealType: validMeals.includes(item.mealType) ? item.mealType : fallbackMealSlot,
          foodName: item.foodName,
          quantity: Number(item.quantity) || 1,
          unit: item.unit || 'g',
          servingDescription: item.servingDescription,
          calories: Math.round(Number(item.calories) || 0),
          protein: Number(item.protein) || 0,
          carbs: Number(item.carbs) || 0,
          fat: Number(item.fat) || 0,
          fiber: Number(item.fiber) || 0,
          source: 'chatbot',
          isEstimated: Boolean(item.isEstimated),
        }));

      if (onAutoLogEntries) {
        await onAutoLogEntries(entriesToSave);
        autoLogged = true;
      } else if (onLogMealFromPlan) {
        for (const entry of entriesToSave) {
          await onLogMealFromPlan(entry);
        }
        autoLogged = true;
      }
    }

    await onAddChatMessage({
      role: 'assistant',
      content: aiReply.reply,
      dateContext: selectedDate,
      proposedEntries: proposedItems,
      followUpOptions: aiReply.followUpOptions ?? [],
      dietPlan:
        aiReply.dietPlan && Array.isArray(aiReply.dietPlan.meals) && aiReply.dietPlan.meals.length > 0
          ? aiReply.dietPlan
          : undefined,
      needsClarification: aiReply.needsClarification,
      entriesLogged: autoLogged,
    });
  };

  const handleSend = async (customText?: string) => {
    const textToSend = (customText ?? input).trim();
    const imagesToSend = customText ? [] : stagedImages;

    if (!textToSend && imagesToSend.length === 0) return;
    setError(null);
    setLastFailedRequest(null);
    setSending(true);

    if (!customText) {
      setInput('');
      setStagedImages([]);
    }

    const fallbackCaption =
      imagesToSend.length > 1
        ? `Shared ${imagesToSend.length} meal photos for nutrition analysis.`
        : imagesToSend[0]?.kind === 'label'
          ? 'Shared a nutrition label photo for analysis.'
          : 'Shared a meal photo for nutrition analysis.';

    try {
      const userMessageId = await onAddChatMessage({
        role: 'user',
        content: textToSend || fallbackCaption,
        dateContext: selectedDate,
        attachmentCount: imagesToSend.length > 0 ? imagesToSend.length : undefined,
        localImages: imagesToSend.length > 0 ? imagesToSend.map((img) => img.dataUrl) : undefined,
      });

      if (imagesToSend.length > 0) {
        setSessionImageMap((prev) => ({
          ...prev,
          [userMessageId]: imagesToSend.map((img) => img.dataUrl),
        }));
      }

      await requestCoachReply(textToSend, imagesToSend);
    } catch (err) {
      setLastFailedRequest({ text: textToSend, images: imagesToSend });
      setError(
        err instanceof Error
          ? err.message
          : 'The coach could not respond right now. Tap Retry to try again.'
      );
    } finally {
      setSending(false);
    }
  };

  // Auto-send initial prompt if navigated from HomeDashboard ("Get Diet Plan PDF →")
  useEffect(() => {
    if (!initialPrompt || sending || consumedPromptRef.current === initialPrompt) return;
    consumedPromptRef.current = initialPrompt;
    onConsumeInitialPrompt?.();
    void handleSend(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const stopPlayback = () => {
    if (activeAudioElRef.current) {
      activeAudioElRef.current.pause();
      activeAudioElRef.current.currentTime = 0;
      activeAudioElRef.current = null;
    }
    setPlayingAudioKey(null);
  };

  const playAudioUrl = (key: string, audioUrl: string) => {
    if (playingAudioKey === key) {
      stopPlayback();
      return;
    }
    stopPlayback();
    const audio = new Audio(audioUrl);
    activeAudioElRef.current = audio;
    setPlayingAudioKey(key);
    audio.onended = () => {
      setPlayingAudioKey(null);
      activeAudioElRef.current = null;
    };
    audio.onerror = () => {
      setPlayingAudioKey(null);
      activeAudioElRef.current = null;
    };
    void audio.play().catch(() => {
      setPlayingAudioKey(null);
      activeAudioElRef.current = null;
    });
  };

  const handlePlayCoachTts = async (msg: ChatMessage) => {
    const key = `tts_${msg.id}`;
    if (playingAudioKey === key) {
      stopPlayback();
      return;
    }
    if (ttsCache[msg.id]) {
      playAudioUrl(key, ttsCache[msg.id]);
      return;
    }
    setLoadingTtsId(msg.id);
    setError(null);
    try {
      const { audioDataUrl } = await synthesizeCoachSpeech(msg.content);
      setTtsCache((prev) => ({ ...prev, [msg.id]: audioDataUrl }));
      playAudioUrl(key, audioDataUrl);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to play coach voice reply right now.'
      );
    } finally {
      setLoadingTtsId(null);
    }
  };

  const cleanupRecordingHandles = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setIsRecordingVoice(false);
  };

  const handleStartVoiceRecording = async () => {
    if (isRecordingVoice || sending || transcribingVoice) return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording is not supported in this browser. You can type your message below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      cancelRecordingRef.current = false;
      recordingSecRef.current = 0;
      setRecordingSec(0);

      const mimeType = pickSupportedAudioMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const wasCancelled = cancelRecordingRef.current;
        const durationSec = Math.max(1, recordingSecRef.current);
        const chunks = audioChunksRef.current;
        const recordedMime = recorder.mimeType || mimeType || 'audio/webm';
        cleanupRecordingHandles();

        if (wasCancelled || chunks.length === 0) return;

        const blob = new Blob(chunks, { type: recordedMime });
        if (blob.size < 400) {
          setError('Voice note was too short. Hold or speak for at least 1 second.');
          return;
        }

        const localAudioUrl = URL.createObjectURL(blob);
        setTranscribingVoice(true);
        setError(null);
        setLastFailedRequest(null);

        try {
          const base64Audio = await blobToBase64(blob);
          const { transcript } = await transcribeVoiceAudio(base64Audio, recordedMime);

          setTranscribingVoice(false);
          setSending(true);

          const userMessageId = await onAddChatMessage({
            role: 'user',
            content: transcript,
            dateContext: selectedDate,
            voiceDurationSec: durationSec,
            localAudioUrl,
          });

          setSessionAudioMap((prev) => ({
            ...prev,
            [userMessageId]: localAudioUrl,
          }));

          await requestCoachReply(transcript, []);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not transcribe your voice note. Please try again.'
          );
        } finally {
          setTranscribingVoice(false);
          setSending(false);
        }
      };

      recorder.start(250);
      setIsRecordingVoice(true);
      recordTimerRef.current = window.setInterval(() => {
        recordingSecRef.current += 1;
        setRecordingSec(recordingSecRef.current);
        if (recordingSecRef.current >= 120 && mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 1000);
    } catch {
      cleanupRecordingHandles();
      setError('Microphone permission is required to send WhatsApp voice messages.');
    }
  };

  const handleCancelVoiceRecording = () => {
    cancelRecordingRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      cleanupRecordingHandles();
    }
  };

  const handleFinishVoiceRecording = () => {
    cancelRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleDownloadPlanPdf = async (msgId: string, plan: ChatDietPlan) => {
    setDownloadingPdfId(msgId);
    setError(null);
    try {
      await downloadDietPlanPdf(plan, profile, targets);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not build the diet plan PDF right now.'
      );
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const handleLogSinglePlanMeal = async (msgId: string, mealIndex: number, meal: ChatDietPlanMeal) => {
    if (!onLogMealFromPlan) return;
    const key = `${msgId}_${mealIndex}`;
    try {
      await onLogMealFromPlan({
        date: selectedDate,
        mealType: mapPlanSlotToMealType(meal.slot),
        foodName: meal.foodName,
        quantity: 1,
        unit: 'serving',
        servingDescription: meal.suggestedQuantity,
        calories: Math.round(Number(meal.calories) || 0),
        protein: Number(meal.protein) || 0,
        carbs: Number(meal.carbs) || 0,
        fat: Number(meal.fat) || 0,
        fiber: Number(meal.fiber) || 0,
        source: 'diet_plan',
        isEstimated: true,
        notes: meal.rationale,
      });
      setLoggedPlanMeals((prev) => ({ ...prev, [key]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log meal from your diet plan.');
    }
  };

  const handleRetryFailed = async () => {
    if (!lastFailedRequest || sending) return;
    const retryPayload = lastFailedRequest;
    setError(null);
    setSending(true);
    try {
      await requestCoachReply(retryPayload.text, retryPayload.images);
      setLastFailedRequest(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Still busy right now. Please tap Retry in a few seconds.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleConfirmEntries = async (msg: ChatMessage, items: ProposedFoodItem[]) => {
    setConfirmingId(msg.id);
    setError(null);
    try {
      const targetDate = msg.dateContext || selectedDate;
      const validMeals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks', 'daily_total'];
      const overriddenMeal = mealOverrideMap[msg.id];
      await onConfirmProposedEntries(
        msg.id,
        items.map((item) => {
          const resolvedMeal =
            overriddenMeal ?? (validMeals.includes(item.mealType) ? item.mealType : 'snacks');
          return {
            date: targetDate,
            mealType: item.mealType === 'daily_total' ? 'daily_total' : resolvedMeal,
            foodName: item.foodName,
            quantity: Number(item.quantity) || 1,
            unit: item.unit || 'g',
            servingDescription: item.servingDescription,
            calories: Math.round(Number(item.calories) || 0),
            protein: Number(item.protein) || 0,
            carbs: Number(item.carbs) || 0,
            fat: Number(item.fat) || 0,
            fiber: Number(item.fiber) || 0,
            source: 'chatbot',
            isEstimated: Boolean(item.isEstimated),
          };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save entries to your diary.');
    } finally {
      setConfirmingId(null);
    }
  };

  const dayCalPct = Math.min(
    100,
    Math.round((daySummary.calories / Math.max(1, targets.targetCalories)) * 100)
  );

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-white dark:bg-[#1B1C19] overflow-hidden">
      {/* Full-Width WhatsApp Contact Header */}
      <header className="pt-safe px-2.5 sm:px-5 py-2.5 bg-white dark:bg-[#1B1C19] border-b border-black/[0.06] dark:border-white/10 flex items-center justify-between gap-2 shrink-0 z-10">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile Back Arrow (WhatsApp Chat Navigation) */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => (onBack ? onBack() : onNavigate('home'))}
            aria-label="Back to Home dashboard"
            className="lg:hidden w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-[#171715] dark:text-white hover:bg-[#F4F4F0] dark:hover:bg-white/10 shrink-0 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>

          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#151513] dark:bg-[#A3F056] text-[#A3F056] dark:text-[#151513] flex items-center justify-center shrink-0">
            <Leaf className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-extrabold text-[#171715] dark:text-white tracking-tight truncate leading-tight">
              NutriPulse Coach
            </h1>
            <p className="text-xs font-medium text-[#62625C] dark:text-[#A1A19A] truncate font-mono tabular-nums leading-snug mt-0.5">
              {isRecordingVoice
                ? `Recording voice ${formatDuration(recordingSec)}...`
                : transcribingVoice
                  ? 'Listening to voice note...'
                  : sending
                    ? 'Coach is replying...'
                    : `${daySummary.calories.toLocaleString()} / ${targets.targetCalories.toLocaleString()} kcal · ${Math.round(daySummary.protein)}g protein`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => setCalendarOpen((v) => !v)}
            aria-expanded={calendarOpen}
            aria-label="Toggle calendar date tracker and daily progress"
            className={`h-10 px-2.5 sm:px-3.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              calendarOpen
                ? 'bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513]'
                : 'bg-[#F4F4F0] dark:bg-white/10 text-[#171715] dark:text-white hover:bg-[#EAEAE4] dark:hover:bg-white/15'
            }`}
          >
            <CalendarDays className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{formatDateDivider(selectedDate)}</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('history')}
            aria-label="Open full calendar history and progress analytics"
            title="Full Calendar & Progress"
            className="w-10 h-10 rounded-full bg-[#F4F4F0] dark:bg-white/10 hover:bg-[#EAEAE4] dark:hover:bg-white/15 text-[#171715] dark:text-white flex items-center justify-center shrink-0 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
          </motion.button>
        </div>
      </header>

      {/* Collapsible Calendar & Daily Progress Tracking Strip */}
      <AnimatePresence initial={false}>
        {calendarOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden border-b border-black/[0.06] dark:border-white/10 bg-[#F7F6F2] dark:bg-[#141612] shrink-0"
          >
            <div className="p-4 space-y-3.5">
              {/* Date navigation row + native calendar jump */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => shiftDate(-7)}
                    aria-label="Previous week"
                    className="w-8 h-8 rounded-full bg-white dark:bg-[#1B1C19] border border-black/[0.06] dark:border-white/10 flex items-center justify-center text-[#171715] dark:text-white hover:bg-[#EAEAE4]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => e.target.value && onSelectDate(e.target.value)}
                    aria-label="Jump to calendar date"
                    className="h-8 px-3 rounded-full bg-white dark:bg-[#1B1C19] border border-black/[0.06] dark:border-white/10 text-xs font-mono font-bold text-[#171715] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#151513] dark:focus:ring-[#A3F056]"
                  />
                  <button
                    type="button"
                    onClick={() => shiftDate(7)}
                    aria-label="Next week"
                    className="w-8 h-8 rounded-full bg-white dark:bg-[#1B1C19] border border-black/[0.06] dark:border-white/10 flex items-center justify-center text-[#171715] dark:text-white hover:bg-[#EAEAE4]"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate('history')}
                  className="text-xs font-bold text-[#4B962A] dark:text-[#A3F056] hover:underline whitespace-nowrap"
                >
                  Full Progress Calendar →
                </button>
              </div>

              {/* 7-Day Tap-to-Select Calendar Bar */}
              <div className="grid grid-cols-7 gap-1.5">
                {calendarWeek.map((day) => {
                  const active = day.date === selectedDate;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => onSelectDate(day.date)}
                      className={`py-2 px-1 rounded-2xl flex flex-col items-center gap-1 transition-colors ${
                        active
                          ? 'bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513]'
                          : 'bg-white dark:bg-[#1B1C19] text-[#171715] dark:text-[#E8E8E2] border border-black/[0.04] dark:border-white/10 hover:bg-[#EAEAE4] dark:hover:bg-white/10'
                      }`}
                    >
                      <span
                        className={`text-xs font-semibold ${
                          active
                            ? 'text-white/80 dark:text-[#151513]/80'
                            : 'text-[#62625C] dark:text-[#A1A19A]'
                        }`}
                      >
                        {day.dayShort.slice(0, 2)}
                      </span>
                      <span className="text-sm font-extrabold font-mono tabular-nums">
                        {day.dayNum}
                      </span>
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          day.calories > 0
                            ? active
                              ? 'bg-[#A3F056] dark:bg-[#151513]'
                              : 'bg-[#54A630] dark:bg-[#A3F056]'
                            : 'bg-black/10 dark:bg-white/15'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Selected Date Progress Bar & Color-Coded Macro Summary */}
              <div className="bg-white dark:bg-[#1B1C19] rounded-2xl p-3.5 border border-black/[0.04] dark:border-white/10 space-y-2.5">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-bold text-[#171715] dark:text-white">
                    {formatDateDivider(selectedDate)} Progress
                  </span>
                  <span className="font-mono tabular-nums font-extrabold text-[#171715] dark:text-[#A3F056]">
                    {daySummary.calories} / {targets.targetCalories} kcal ({dayCalPct}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#ECECE8] dark:bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${dayCalPct}%` }}
                    transition={{ type: 'spring', stiffness: 150, damping: 24 }}
                    className={`h-full rounded-full ${
                      daySummary.calories > targets.targetCalories + 250
                        ? 'bg-[#E69718]'
                        : 'bg-[#54A630] dark:bg-[#A3F056]'
                    }`}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-[#62625C] dark:text-[#A1A19A] pt-0.5">
                  <span className="inline-flex items-center gap-1.5">
                    <NutrientIcon kind="carbs" className="w-3.5 h-3.5" />
                    <strong className={NUTRIENT_THEME.carbs.textClass}>{daySummary.carbs}g</strong>/
                    {targets.carbsGrams}g
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <NutrientIcon kind="fats" className="w-3.5 h-3.5" />
                    <strong className={NUTRIENT_THEME.fats.textClass}>{daySummary.fat}g</strong>/
                    {targets.fatGrams}g
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <NutrientIcon kind="protein" className="w-3.5 h-3.5" />
                    <strong className={NUTRIENT_THEME.protein.textClass}>
                      {daySummary.protein}g
                    </strong>
                    /{targets.proteinGrams}g
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-Height WhatsApp-Style Chat Stream Canvas */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 sm:px-6 py-5 chat-wallpaper">
        <div className="max-w-4xl mx-auto w-full space-y-4">
        {/* Welcome / Empty Conversation */}
        {messages.length === 0 && (
          <div className="max-w-lg mx-auto py-4 space-y-4">
            <div className="flex justify-center">
              <span className="px-3.5 py-1 rounded-xl bg-white/90 dark:bg-[#1E201C]/90 text-xs font-bold text-[#62625C] dark:text-[#A1A19A] shadow-2xs">
                {formatDateDivider(selectedDate)}
              </span>
            </div>

            {/* Coach Welcome WhatsApp Bubble */}
            <div className="flex justify-start">
              <div className="max-w-[92%] bg-white dark:bg-[#1D1F1B] rounded-2xl rounded-tl-[4px] px-4 py-3.5 shadow-xs border border-black/[0.05] dark:border-white/10 space-y-2">
                <p className="text-[15px] font-extrabold text-[#171715] dark:text-white leading-snug">
                  Hi {profile.fullName.split(' ')[0]}! Your personal nutrition coach &amp; diet planner is ready.
                </p>
                <p className="text-sm text-[#4A4A45] dark:text-[#C8C8C2] leading-relaxed">
                  Send what you ate, share <strong>meal photos</strong>, or send a{' '}
                  <strong>voice note</strong> to log straight to your diary. Ask for a{' '}
                  <strong>Diet Plan PDF with food photos</strong> and I&rsquo;ll first check your
                  food likes and any allergies to tailor every meal safely.
                </p>
                <p className="text-xs text-[#8E8E87] text-right font-mono tabular-nums">
                  {formatBubbleTime(Date.now())}
                </p>
              </div>
            </div>

            {/* Quick Tap Starter Suggestions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {QUICK_STARTERS.map((prompt) => (
                <motion.button
                  key={prompt}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSend(prompt)}
                  className="p-3.5 rounded-2xl bg-white/95 dark:bg-[#1D1F1B] hover:bg-white dark:hover:bg-[#242721] border border-black/[0.06] dark:border-white/10 text-left text-sm font-semibold text-[#171715] dark:text-[#E8E8E2] leading-snug shadow-2xs transition-colors"
                >
                  &ldquo;{prompt}&rdquo;
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Chat Messages */}
        {messages.map((msg, msgIndex) => {
          const isUser = msg.role === 'user';
          const prevDate = msgIndex > 0 ? messages[msgIndex - 1].dateContext : null;
          const showDateDivider =
            Boolean(msg.dateContext) && (msgIndex === 0 || msg.dateContext !== prevDate);

          const bubbleImages = msg.localImages ?? sessionImageMap[msg.id] ?? [];
          const bubbleAudioUrl = msg.localAudioUrl ?? sessionAudioMap[msg.id];
          const isVoiceNote = typeof msg.voiceDurationSec === 'number' && msg.voiceDurationSec > 0;
          const voiceKey = `voice_${msg.id}`;
          const isPlayingVoice = playingAudioKey === voiceKey;
          const ttsKey = `tts_${msg.id}`;
          const isPlayingTts = playingAudioKey === ttsKey;

          const proposed = msg.proposedEntries ?? [];
          const totalProposedCal = proposed.reduce((sum, i) => sum + Math.round(i.calories), 0);
          const totalProposedPro = proposed.reduce((sum, i) => sum + Number(i.protein), 0);

          const isLatestAssistant = !isUser && msgIndex === messages.length - 1;
          const followUps = msg.followUpOptions ?? [];
          const showFollowUpChips =
            isLatestAssistant && followUps.length > 0 && !msg.entriesLogged && !sending;

          const activeMealSlot: MealType =
            mealOverrideMap[msg.id] ?? (proposed[0]?.mealType || 'lunch');

          return (
            <React.Fragment key={msg.id}>
              {showDateDivider && msg.dateContext && (
                <div className="flex justify-center py-1">
                  <span className="px-3.5 py-1 rounded-xl bg-white/90 dark:bg-[#1E201C]/90 text-xs font-bold text-[#62625C] dark:text-[#A1A19A] shadow-2xs">
                    {formatDateDivider(msg.dateContext)}
                  </span>
                </div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2.5`}
              >
                {/* WhatsApp Chat Bubble */}
                <div
                  className={`max-w-[88%] sm:max-w-[76%] px-4 py-3 shadow-xs ${
                    isUser
                      ? 'bg-[#DCF5C8] dark:bg-[#243918] text-[#171715] dark:text-[#F4F4F0] rounded-2xl rounded-tr-[4px]'
                      : 'bg-white dark:bg-[#1D1F1B] text-[#171715] dark:text-[#F4F4F0] rounded-2xl rounded-tl-[4px] border border-black/[0.05] dark:border-white/10'
                  }`}
                >
                  {/* Multi-Photo WhatsApp Collage inside User Bubble */}
                  {bubbleImages.length > 0 && (
                    <div
                      className={`mb-2 overflow-hidden rounded-xl grid gap-1 ${
                        bubbleImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                      }`}
                    >
                      {bubbleImages.slice(0, 4).map((src, idx) => {
                        const isThreeTop = bubbleImages.length === 3 && idx === 0;
                        const extraCount = bubbleImages.length - 4;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setLightboxImage(src)}
                            aria-label={`View photo ${idx + 1}`}
                            className={`relative overflow-hidden rounded-lg bg-black/10 block text-left ${
                              isThreeTop ? 'col-span-2 h-40' : bubbleImages.length === 1 ? 'h-52' : 'h-32'
                            }`}
                          >
                            <img
                              src={src}
                              alt={`Shared meal photo ${idx + 1}`}
                              className="w-full h-full object-cover hover:scale-[1.03] transition-transform"
                            />
                            {idx === 3 && extraCount > 0 && (
                              <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                                <span className="text-white text-lg font-extrabold font-mono">
                                  +{extraCount}
                                </span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Fallback badge for historical multi-photo messages reloaded from Firestore */}
                  {bubbleImages.length === 0 &&
                    typeof msg.attachmentCount === 'number' &&
                    msg.attachmentCount > 0 && (
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#3F7A20] dark:text-[#A3F056]">
                        <Camera className="w-3.5 h-3.5" />
                        <span>
                          {msg.attachmentCount}{' '}
                          {msg.attachmentCount === 1 ? 'photo shared' : 'photos shared'}
                        </span>
                      </div>
                    )}

                  {/* WhatsApp Playable Voice Note Strip */}
                  {isVoiceNote && (
                    <div className="mb-2 flex items-center gap-2.5 min-w-[215px] sm:min-w-[245px] py-1">
                      <button
                        type="button"
                        disabled={!bubbleAudioUrl}
                        onClick={() => bubbleAudioUrl && playAudioUrl(voiceKey, bubbleAudioUrl)}
                        aria-label={isPlayingVoice ? 'Pause voice message' : 'Play voice message'}
                        className="w-9 h-9 rounded-full bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513] flex items-center justify-center shrink-0 disabled:opacity-55 transition-transform active:scale-95"
                      >
                        {isPlayingVoice ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current translate-x-[1px]" />
                        )}
                      </button>

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-[3px] h-5" aria-hidden="true">
                          {VOICE_WAVEFORM_BARS.map((heightClass, barIdx) => (
                            <span
                              key={barIdx}
                              className={`w-[3px] rounded-full transition-colors ${heightClass} ${
                                isPlayingVoice
                                  ? 'bg-[#3F8820] dark:bg-[#A3F056]'
                                  : 'bg-[#4B6B38]/55 dark:bg-[#A4C690]/55'
                              }`}
                            />
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono tabular-nums text-[#4B6B38] dark:text-[#A4C690]">
                          <span className="inline-flex items-center gap-1 font-sans font-semibold">
                            <Mic className="w-3 h-3" />
                            Voice note
                          </span>
                          <span>{formatDuration(msg.voiceDurationSec ?? 1)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <p
                    className={`whitespace-pre-wrap break-words ${
                      isVoiceNote
                        ? 'text-sm italic leading-relaxed text-[#2F4722] dark:text-[#D9ECCE] border-t border-black/[0.06] dark:border-white/10 pt-2'
                        : 'text-[15px] leading-[1.5]'
                    }`}
                  >
                    {isVoiceNote ? `“${msg.content}”` : msg.content}
                  </p>

                  {/* Footer: Coach Listen Button + Timestamp + WhatsApp Double Check */}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {!isUser ? (
                      <button
                        type="button"
                        onClick={() => void handlePlayCoachTts(msg)}
                        disabled={loadingTtsId === msg.id}
                        aria-label={isPlayingTts ? 'Stop coach voice' : 'Listen to coach reply'}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#62625C] dark:text-[#A1A19A] hover:text-[#171715] dark:hover:text-[#A3F056] transition-colors disabled:opacity-60"
                      >
                        {loadingTtsId === msg.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isPlayingTts ? (
                          <Square className="w-3 h-3 fill-current text-[#E5484D]" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {loadingTtsId === msg.id
                            ? 'Loading voice...'
                            : isPlayingTts
                              ? 'Stop'
                              : 'Listen'}
                        </span>
                      </button>
                    ) : (
                      <span />
                    )}

                    <div className="flex items-center gap-1">
                      <span
                        className={`text-xs font-mono tabular-nums ${
                          isUser
                            ? 'text-[#4B6B38] dark:text-[#A4C690]'
                            : 'text-[#8E8E87] dark:text-[#8C8C85]'
                        }`}
                      >
                        {formatBubbleTime(msg.createdAt)}
                      </span>
                      {isUser && (
                        <CheckCheck
                          className="w-3.5 h-3.5 text-[#3F8820] dark:text-[#A3F056]"
                          aria-label="Read"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* WhatsApp Illustrated Diet Plan PDF Document Card (Every Food Item with Real Photo) */}
                {!isUser && msg.dietPlan && msg.dietPlan.meals && msg.dietPlan.meals.length > 0 && (() => {
                  const plan = msg.dietPlan;
                  const planTotals = plan.meals.reduce(
                    (acc, m) => ({
                      calories: acc.calories + Math.round(Number(m.calories) || 0),
                      protein: acc.protein + (Number(m.protein) || 0),
                      carbs: acc.carbs + (Number(m.carbs) || 0),
                      fat: acc.fat + (Number(m.fat) || 0),
                    }),
                    { calories: 0, protein: 0, carbs: 0, fat: 0 }
                  );
                  const isDownloading = downloadingPdfId === msg.id;

                  return (
                    <div className="max-w-[96%] sm:max-w-[84%] w-full bg-white dark:bg-[#1B1C19] rounded-2xl overflow-hidden border border-black/[0.08] dark:border-white/10 shadow-sm">
                      {/* WhatsApp PDF File Header Strip */}
                      <div className="p-4 bg-[#151513] text-white flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-[#E5484D] text-white font-extrabold text-xs flex flex-col items-center justify-center shrink-0 tracking-tight">
                            <span>PDF</span>
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-[15px] font-extrabold text-white truncate">
                              {plan.title || 'Personalized Diet Plan'}
                            </p>
                            <p className="text-xs text-[#C8C8C2] font-mono tabular-nums truncate">
                              {plan.meals.length} Meals · {planTotals.calories} kcal ·{' '}
                              {Math.round(planTotals.protein)}g Protein
                            </p>
                          </div>
                        </div>

                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.94 }}
                          disabled={isDownloading}
                          onClick={() => void handleDownloadPlanPdf(msg.id, plan)}
                          className="h-10 px-4 rounded-full bg-[#A3F056] hover:bg-[#93E344] text-[#151513] text-xs font-extrabold flex items-center gap-1.5 shrink-0 disabled:opacity-65 whitespace-nowrap"
                        >
                          {isDownloading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          <span>{isDownloading ? 'Building...' : 'Download PDF'}</span>
                        </motion.button>
                      </div>

                      {/* Illustrated Meal List — Each Food Has Its Own Real Food Photograph */}
                      <div className="divide-y divide-black/[0.06] dark:divide-white/10">
                        {plan.meals.map((meal, mealIdx) => {
                          const photoSrc = resolveMealPhotoUrl(meal);
                          const logKey = `${msg.id}_${mealIdx}`;
                          const isMealLogged = Boolean(loggedPlanMeals[logKey]);

                          return (
                            <div
                              key={`${meal.slot}_${mealIdx}`}
                              className="p-3.5 sm:p-4 flex items-start gap-3.5 hover:bg-[#F7F6F2]/70 dark:hover:bg-white/[0.02] transition-colors"
                            >
                              {/* Crisp Food Photo Thumbnail (tap to preview fullscreen) */}
                              <button
                                type="button"
                                onClick={() => setLightboxImage(photoSrc)}
                                aria-label={`Preview photo of ${meal.foodName}`}
                                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-[#ECECE8] dark:bg-white/10 shrink-0 border border-black/[0.06] dark:border-white/10 block"
                              >
                                <img
                                  src={photoSrc}
                                  alt={meal.foodName}
                                  loading="lazy"
                                  className="w-full h-full object-cover hover:scale-105 transition-transform"
                                />
                              </button>

                              {/* Meal Info & Color-Coded Macros */}
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-[#4B962A] dark:text-[#A3F056] truncate">
                                    {meal.slotLabel || meal.slot}
                                    {meal.timeSuggestion ? ` · ${meal.timeSuggestion}` : ''}
                                  </span>
                                  <span className="text-sm font-mono tabular-nums font-extrabold text-[#171715] dark:text-white shrink-0">
                                    {Math.round(meal.calories)} kcal
                                  </span>
                                </div>

                                <p className="text-[15px] font-extrabold text-[#171715] dark:text-white leading-snug">
                                  {meal.foodName}
                                </p>
                                <p className="text-xs text-[#62625C] dark:text-[#A1A19A] leading-relaxed">
                                  {meal.suggestedQuantity}
                                </p>

                                <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                                  <InlineMacroRow
                                    carbs={meal.carbs}
                                    fat={meal.fat}
                                    protein={meal.protein}
                                    compact
                                  />
                                  {onLogMealFromPlan && (
                                    <button
                                      type="button"
                                      disabled={isMealLogged}
                                      onClick={() =>
                                        void handleLogSinglePlanMeal(msg.id, mealIdx, meal)
                                      }
                                      className={`h-8 px-3 rounded-full text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap ${
                                        isMealLogged
                                          ? 'bg-[#EEF8E8] dark:bg-[#54A630]/20 text-[#3F7A20] dark:text-[#A3F056]'
                                          : 'bg-[#F4F4F0] dark:bg-white/10 hover:bg-[#151513] hover:text-white dark:hover:bg-[#A3F056] dark:hover:text-[#151513] text-[#171715] dark:text-white'
                                      }`}
                                    >
                                      {isMealLogged ? (
                                        <>
                                          <Check className="w-3.5 h-3.5" />
                                          Logged
                                        </>
                                      ) : (
                                        <>
                                          <Plus className="w-3.5 h-3.5" />
                                          Log Meal
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Coach Notes + Bottom Full-Width PDF Download Action */}
                      <div className="p-4 bg-[#F7F6F2] dark:bg-[#141612] border-t border-black/[0.06] dark:border-white/10 space-y-3">
                        {(plan.coachNotes || plan.goalSummary) && (
                          <p className="text-xs text-[#5C5C57] dark:text-[#A1A19A] leading-relaxed">
                            {plan.coachNotes || plan.goalSummary}
                          </p>
                        )}
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.98 }}
                          disabled={isDownloading}
                          onClick={() => void handleDownloadPlanPdf(msg.id, plan)}
                          className="w-full h-11 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-65 transition-colors"
                        >
                          {isDownloading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          <span>
                            {isDownloading
                              ? 'Embedding Food Photos into PDF...'
                              : 'Download Diet Plan PDF (with Photos)'}
                          </span>
                        </motion.button>
                      </div>
                    </div>
                  );
                })()}

                {/* One-Tap Follow-Up Quick-Reply Chips (e.g. Diet Preferences or Meal Slot) */}
                {showFollowUpChips && (
                  <div className="max-w-[90%] flex flex-wrap gap-2 pl-1">
                    {followUps.map((option) => (
                      <motion.button
                        key={option}
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        onClick={() => handleSend(option)}
                        className="h-9 px-4 rounded-full bg-white dark:bg-[#1D1F1B] hover:bg-[#151513] hover:text-white dark:hover:bg-[#A3F056] dark:hover:text-[#151513] text-[#171715] dark:text-[#F4F4F0] text-xs font-bold border border-black/[0.08] dark:border-white/15 shadow-2xs transition-colors whitespace-nowrap"
                      >
                        {option}
                      </motion.button>
                    ))}
                  </div>
                )}

                {/* Directly Recorded Food Entry Receipt Card (Auto-Logged Immediately) */}
                {!isUser && proposed.length > 0 && (
                  <div className="max-w-[92%] sm:max-w-[78%] w-full bg-white dark:bg-[#1B1C19] rounded-2xl p-4 border border-[#54A630]/35 card-soft space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#4B962A] dark:text-[#A3F056]">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          {msg.entriesLogged ? 'Recorded in Diary' : 'Ready to Log'} ·{' '}
                          {proposed[0]?.mealType === 'daily_total'
                            ? 'Daily Total'
                            : MEAL_SLOT_OPTIONS.find((s) => s.key === activeMealSlot)?.label ??
                              'Meal'}
                        </span>
                      </div>
                      <span className="text-sm font-mono tabular-nums font-extrabold text-[#171715] dark:text-white">
                        {totalProposedCal} kcal · {totalProposedPro.toFixed(1)}g P
                      </span>
                    </div>

                    {/* Legacy meal slot override only for older unlogged historical messages */}
                    {!msg.entriesLogged && proposed[0]?.mealType !== 'daily_total' && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94] mr-1">
                          Meal:
                        </span>
                        {MEAL_SLOT_OPTIONS.map((slot) => {
                          const selected = activeMealSlot === slot.key;
                          return (
                            <button
                              key={slot.key}
                              type="button"
                              onClick={() =>
                                setMealOverrideMap((prev) => ({
                                  ...prev,
                                  [msg.id]: slot.key,
                                }))
                              }
                              className={`h-8 px-3 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                                selected
                                  ? 'bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513]'
                                  : 'bg-[#F4F4F0] dark:bg-white/10 text-[#62625C] dark:text-[#C8C8C2] hover:bg-[#EAEAE4]'
                              }`}
                            >
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <ul className="divide-y divide-black/[0.06] dark:divide-white/10">
                      {proposed.map((item, idx) => (
                        <li key={idx} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <span className="text-sm font-bold text-[#171715] dark:text-white block truncate">
                              {item.foodName}{' '}
                              <span className="text-xs font-medium text-[#787872] dark:text-[#9C9C94] font-mono">
                                ({item.quantity}
                                {item.unit})
                              </span>
                            </span>
                            <InlineMacroRow
                              carbs={item.carbs}
                              fat={item.fat}
                              protein={item.protein}
                              compact
                            />
                          </div>
                          <span className="text-sm font-mono tabular-nums font-extrabold text-[#171715] dark:text-[#A3F056] shrink-0">
                            {Math.round(item.calories)} kcal
                          </span>
                        </li>
                      ))}
                    </ul>

                    {msg.entriesLogged ? (
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-black/[0.06] dark:border-white/10">
                        <span className="text-xs font-semibold text-[#62625C] dark:text-[#A1A19A]">
                          Saved to {formatDateDivider(msg.dateContext || selectedDate)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onNavigate('home')}
                          className="text-xs font-extrabold text-[#171715] dark:text-[#A3F056] hover:underline whitespace-nowrap"
                        >
                          View in Diary →
                        </button>
                      </div>
                    ) : (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        disabled={confirmingId === msg.id}
                        onClick={() => handleConfirmEntries(msg, proposed)}
                        className="w-full h-11 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                        {confirmingId === msg.id ? 'Saving to Diary...' : 'Save to Diary'}
                      </motion.button>
                    )}
                  </div>
                )}
              </motion.div>
            </React.Fragment>
          );
        })}

        {/* WhatsApp-Style Transcribing / Typing Indicator Bubble */}
        {(sending || transcribingVoice) && (
          <div className="flex items-start">
            <div className="rounded-2xl rounded-tl-[4px] px-4 py-3 bg-white dark:bg-[#1D1F1B] border border-black/[0.04] dark:border-white/10 shadow-xs flex items-center gap-2">
              <div className="flex items-center gap-1" aria-hidden="true">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{
                      duration: 0.9,
                      repeat: Infinity,
                      delay: dot * 0.16,
                    }}
                    className="w-1.5 h-1.5 rounded-full bg-[#54A630] dark:bg-[#A3F056]"
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-[#62625C] dark:text-[#9C9C94]">
                {transcribingVoice ? 'Transcribing your voice message...' : 'Coach is analyzing...'}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-2xl bg-[#FDECEC] dark:bg-[#E5484D]/15 border border-[#E5484D]/25 text-[#9F1D22] dark:text-[#FCA5A5] text-xs font-medium flex items-center justify-between gap-3"
          >
            <span className="leading-relaxed">{error}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {lastFailedRequest && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  disabled={sending}
                  onClick={handleRetryFailed}
                  className="h-8 px-3 rounded-full bg-[#151513] dark:bg-[#A3F056] text-white dark:text-[#151513] text-xs font-bold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${sending ? 'animate-spin' : ''}`} />
                  Retry
                </motion.button>
              )}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setLastFailedRequest(null);
                }}
                aria-label="Dismiss error"
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#9F1D22] dark:text-[#FCA5A5] hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        <div ref={scrollEndRef} />
        </div>
      </div>

      {/* Full-Width Bottom WhatsApp Multi-Photo Composer */}
      <div className="px-2.5 sm:px-5 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] bg-[#F4F4F0] dark:bg-[#161814] border-t border-black/[0.06] dark:border-white/10 shrink-0">
        <div className="max-w-4xl mx-auto w-full space-y-2">
        <AnimatePresence>
          {stagedImages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-3 rounded-2xl bg-white dark:bg-[#1D1F1B] border border-black/[0.06] dark:border-white/10 space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-bold text-[#171715] dark:text-white">
                    {stagedImages.length} of {MAX_PHOTOS_PER_MESSAGE} photos selected · Add a
                    caption below
                  </p>
                  <button
                    type="button"
                    onClick={() => setStagedImages([])}
                    className="text-xs font-bold text-[#787872] hover:text-[#E5484D]"
                  >
                    Clear all
                  </button>
                </div>

                <div className="flex items-center gap-2.5 overflow-x-auto pb-0.5 no-scrollbar">
                  {stagedImages.map((img, idx) => (
                    <div
                      key={img.id}
                      className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-black/10 dark:border-white/15 group"
                    >
                      <img
                        src={img.dataUrl}
                        alt={`Selected photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveStagedImage(img.id)}
                        aria-label={`Remove photo ${idx + 1}`}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-[#E5484D]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStagedKind(img.id)}
                        title="Tap to switch between Meal photo and Nutrition Label"
                        className="absolute bottom-1 left-1 right-1 py-0.5 rounded-md bg-black/70 text-xs font-bold text-white text-center truncate leading-tight"
                      >
                        {img.kind === 'label' ? 'Label' : 'Meal'}
                      </button>
                    </div>
                  ))}

                  {stagedImages.length < MAX_PHOTOS_PER_MESSAGE && (
                    <label
                      title="Add more photos"
                      className="w-16 h-16 rounded-xl border-2 border-dashed border-black/15 dark:border-white/20 flex flex-col items-center justify-center gap-0.5 text-[#62625C] dark:text-[#A1A19A] hover:border-[#151513] dark:hover:border-[#A3F056] cursor-pointer shrink-0 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-xs font-bold">Add</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        aria-label="Add more photos"
                        onChange={(e) => handleMultiImagePick(e, 'food')}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isRecordingVoice ? (
          /* Authentic WhatsApp Live Voice Recording Bar */
          <div className="flex items-center gap-2.5">
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={handleCancelVoiceRecording}
              aria-label="Cancel voice recording"
              className="w-11 h-11 rounded-full bg-[#FDECEC] dark:bg-[#E5484D]/20 text-[#E5484D] flex items-center justify-center shrink-0 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </motion.button>

            <div className="flex-1 min-w-0 h-11 px-4 rounded-full bg-white dark:bg-[#1D1F1B] border border-[#E5484D]/35 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E5484D] animate-pulse shrink-0" />
                <span className="font-mono tabular-nums text-sm font-extrabold text-[#171715] dark:text-white shrink-0">
                  {formatDuration(recordingSec)}
                </span>
                <span className="text-xs font-semibold text-[#787872] dark:text-[#9C9C94] truncate">
                  Recording voice message...
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-[3px] h-4 shrink-0" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <motion.span
                    key={i}
                    animate={{ scaleY: [0.35, 1, 0.4] }}
                    transition={{
                      duration: 0.75,
                      repeat: Infinity,
                      delay: i * 0.09,
                    }}
                    className="w-[3px] h-4 rounded-full bg-[#E5484D]/75 origin-center"
                  />
                ))}
              </div>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={handleFinishVoiceRecording}
              aria-label="Send voice message"
              className="w-11 h-11 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white flex items-center justify-center shrink-0 transition-colors shadow-xs"
            >
              <Send className="w-4 h-4 translate-x-[0.5px]" />
            </motion.button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-end gap-2.5"
          >
            {/* Multi-Photo Meal & Label Picker — stays anchored cleanly at single-line baseline */}
            <label
              title="Select one or multiple food or nutrition label photos"
              className="w-11 h-11 rounded-full bg-white dark:bg-[#1D1F1B] border border-black/10 dark:border-white/10 flex items-center justify-center text-[#171715] dark:text-[#E8E8E2] cursor-pointer hover:bg-[#EAEAE4] dark:hover:bg-white/10 shrink-0 transition-colors shadow-2xs"
            >
              <ImagePlus className="w-[18px] h-[18px]" />
              <input
                type="file"
                accept="image/*"
                multiple
                aria-label="Select food or nutrition label photos"
                onChange={(e) => handleMultiImagePick(e, 'food')}
                className="hidden"
              />
            </label>

            {/* WhatsApp Auto-Growing Multi-Line Composer (exact 44px single-line height, clean wrapping up to 5 lines) */}
            <div className="flex-1 min-w-0">
              <textarea
                ref={inputRef}
                rows={1}
                wrap="soft"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={
                  stagedImages.length > 0
                    ? `Add caption for ${stagedImages.length} ${
                        stagedImages.length === 1 ? 'photo' : 'photos'
                      }...`
                    : 'Tell me what you ate or ask for a diet plan...'
                }
                aria-label="Message AI Nutrition Coach"
                className="block box-border w-full min-h-[44px] max-h-[136px] py-[10px] px-4 rounded-[22px] bg-white dark:bg-[#1D1F1B] border border-black/10 dark:border-white/10 text-[15px] leading-[24px] text-[#171715] dark:text-white placeholder:text-[#8E8E87] resize-none overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words focus:outline-none focus:ring-2 focus:ring-[#151513] dark:focus:ring-[#A3F056] shadow-2xs"
              />
            </div>

            {/* WhatsApp Dynamic Mic / Send Action Button — stays anchored cleanly at single-line baseline */}
            {input.trim() || stagedImages.length > 0 ? (
              <motion.button
                type="submit"
                whileTap={{ scale: 0.92 }}
                disabled={sending || transcribingVoice}
                aria-label="Send message"
                className="w-11 h-11 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white flex items-center justify-center disabled:opacity-45 shrink-0 transition-colors shadow-xs"
              >
                <Send className="w-[18px] h-[18px] translate-x-[0.5px]" />
              </motion.button>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                disabled={sending || transcribingVoice}
                onClick={() => void handleStartVoiceRecording()}
                aria-label="Record WhatsApp voice message"
                title="Tap to record a voice message"
                className="w-11 h-11 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-[#A3F056] dark:text-[#151513] text-white flex items-center justify-center disabled:opacity-45 shrink-0 transition-colors shadow-xs"
              >
                <Mic className="w-[18px] h-[18px]" />
              </motion.button>
            )}
          </form>
        )}
        </div>
      </div>

      {/* Fullscreen Photo Lightbox Modal */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="Close photo preview"
              className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <motion.img
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.94 }}
              src={lightboxImage}
              alt="Full meal photo preview"
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
