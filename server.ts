import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { VERIFIED_FOOD_DATABASE } from './src/data/foodDatabase.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PRIMARY_AI_MODEL = 'gemini-4-hydrogen';
const FALLBACK_AI_MODEL = 'gemini-3.1-flash-lite';
const TRANSCRIBE_AI_MODEL = 'gemini-3.5-transcribe';
const TTS_AI_MODEL = 'gemini-3.8-flash-lite-tts';
let primaryCooldownUntil = 0;

// In-memory cache for Wikimedia food photo thumbnails (key -> { buffer, contentType, expiresAt })
const foodPhotoCache = new Map<string, { buffer: Buffer; contentType: string; expiresAt: number }>();

const LOCAL_MEAL_PHOTOS: { file: string; strongKeywords: string[]; fallbackKeywords: string[] }[] = [
  {
    file: 'besan_cheela.jpg',
    strongKeywords: ['besan cheela', 'besan chilla', 'cheela', 'chilla', 'moong dal chilla', 'gram flour pancake', 'savory pancake', 'dosa', 'uttapam'],
    fallbackKeywords: ['besan', 'pancake', 'crepe', 'paratha', 'roti'],
  },
  {
    file: 'oats_bowl.jpg',
    strongKeywords: ['oats', 'oatmeal', 'porridge', 'overnight oats', 'muesli', 'granola', 'dalia'],
    fallbackKeywords: ['cereal', 'breakfast bowl', 'chia', 'banana bowl'],
  },
  {
    file: 'paneer_bowl.jpg',
    strongKeywords: ['paneer', 'cottage cheese', 'tofu', 'tikka', 'bhurji', 'soya', 'soy chunk'],
    fallbackKeywords: ['stir fry', 'veggie bowl', 'quinoa', 'curry'],
  },
  {
    file: 'dal_rice.jpg',
    strongKeywords: ['dal', 'daal', 'lentil', 'rice', 'chawal', 'khichdi', 'rajma', 'chole', 'sambar', 'kadhi'],
    fallbackKeywords: ['bowl', 'thali', 'indian', 'curry', 'beans', 'pulav', 'pulao', 'biryani'],
  },
  {
    file: 'eggs_toast.jpg',
    strongKeywords: ['egg', 'omelette', 'omelet', 'scrambled', 'poached', 'boiled egg', 'egg toast', 'avocado toast'],
    fallbackKeywords: ['toast', 'bread', 'sandwich', 'breakfast'],
  },
  {
    file: 'grilled_chicken.jpg',
    strongKeywords: ['chicken', 'turkey', 'grilled breast', 'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'meat'],
    fallbackKeywords: ['grilled', 'roasted', 'protein plate', 'steak'],
  },
  {
    file: 'sprouts_salad.jpg',
    strongKeywords: ['sprout', 'salad', 'chaat', 'chickpea', 'chana', 'kala chana', 'cucumber', 'kachumber', 'poha', 'upma'],
    fallbackKeywords: ['vegetable', 'greens', 'veggie', 'bowl', 'fresh'],
  },
  {
    file: 'yogurt_snack.jpg',
    strongKeywords: ['yogurt', 'yoghurt', 'curd', 'dahi', 'raita', 'almond', 'walnut', 'nuts', 'fruit', 'apple', 'berry', 'smoothie', 'shake', 'lassi', 'buttermilk', 'makhana', 'peanut'],
    fallbackKeywords: ['snack', 'nuts', 'seeds', 'milk', 'chia'],
  },
];

function matchLocalMealPhoto(text: string, strongOnly: boolean): string | null {
  const lower = text.toLowerCase();
  for (const item of LOCAL_MEAL_PHOTOS) {
    if (item.strongKeywords.some((kw) => lower.includes(kw))) {
      return item.file;
    }
  }
  if (!strongOnly) {
    for (const item of LOCAL_MEAL_PHOTOS) {
      if (item.fallbackKeywords.some((kw) => lower.includes(kw))) {
        return item.file;
      }
    }
  }
  return null;
}

function getLocalMealPhotoPath(filename: string): string {
  const publicPath = path.resolve(__dirname, 'public', 'assets', 'meals', filename);
  if (fs.existsSync(publicPath)) return publicPath;
  return path.resolve(__dirname, 'dist', 'assets', 'meals', filename);
}

async function fetchWikimediaFoodPhoto(queryText: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const cleanQuery = queryText.replace(/[^a-zA-Z0-9\s-]/g, ' ').trim();
  if (!cleanQuery) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    // 1) Try Wikipedia summary pageimage for clean canonical dish photos (e.g. Poha, Idli, Masala dosa, Rajma)
    const wikiTitle = encodeURIComponent(cleanQuery.split(/\s+/).slice(0, 3).join('_'));
    const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`, {
      headers: { 'User-Agent': 'NutriPulseApp/1.0 (food-photo-lookup)' },
      signal: controller.signal,
    });
    if (wikiRes.ok) {
      const wikiJson = (await wikiRes.json()) as { thumbnail?: { source?: string }; originalimage?: { source?: string } };
      const thumbUrl = wikiJson?.thumbnail?.source;
      if (thumbUrl && /\.(jpe?g|png|webp)(\?|$)/i.test(thumbUrl)) {
        const imgRes = await fetch(thumbUrl, {
          headers: { 'User-Agent': 'NutriPulseApp/1.0' },
          signal: controller.signal,
        });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          if (contentType.startsWith('image/')) {
            const arr = await imgRes.arrayBuffer();
            if (arr.byteLength > 2500) {
              return { buffer: Buffer.from(arr), contentType };
            }
          }
        }
      }
    }

    // 2) Try Wikimedia Commons file search for dish photo
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=5&gsrsearch=${encodeURIComponent(
      `${cleanQuery} food dish`
    )}&prop=imageinfo&iiprop=url|mime&iiurlwidth=640&format=json&origin=*`;
    const commonsRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'NutriPulseApp/1.0 (food-photo-lookup)' },
      signal: controller.signal,
    });
    if (commonsRes.ok) {
      const data = (await commonsRes.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              title?: string;
              imageinfo?: { thumburl?: string; url?: string; mime?: string }[];
            }
          >;
        };
      };
      const pages = Object.values(data?.query?.pages ?? {});
      for (const p of pages) {
        const info = p.imageinfo?.[0];
        const mime = info?.mime ?? '';
        const url = info?.thumburl || info?.url;
        if (url && (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp')) {
          const imgRes = await fetch(url, {
            headers: { 'User-Agent': 'NutriPulseApp/1.0' },
            signal: controller.signal,
          });
          if (imgRes.ok) {
            const arr = await imgRes.arrayBuffer();
            if (arr.byteLength > 2500) {
              return { buffer: Buffer.from(arr), contentType: mime };
            }
          }
        }
      }
    }
  } catch {
    // Graceful fallback to curated local studio photos
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRawErrorText(err: unknown): string {
  if (err instanceof Error) return err.message || '';
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return '';
  }
}

function isTransientHighDemandError(err: unknown): boolean {
  const text = extractRawErrorText(err).toLowerCase();
  const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
  return (
    status === 503 ||
    status === 429 ||
    status === 500 ||
    text.includes('503') ||
    text.includes('unavailable') ||
    text.includes('high demand') ||
    text.includes('overloaded') ||
    text.includes('resource_exhausted') ||
    text.includes('429') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('fetch failed')
  );
}

/**
 * Calls Gemini with fast failover between gemini-4-hydrogen and gemini-3.1-flash-lite
 * on transient 503/429 demand spikes. When preferFast is true (live WhatsApp Coach chat),
 * prioritizes gemini-3.1-flash-lite (lowest latency) and falls back to gemini-4-hydrogen (LOW thinking).
 */
async function generateContentWithFallback(
  ai: GoogleGenAI,
  request: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>,
  options?: { preferFast?: boolean }
) {
  const preferFast = Boolean(options?.preferFast);
  const primaryInCooldown = Date.now() < primaryCooldownUntil;
  const plan: { model: string; delayBeforeMs: number; lowThinking?: boolean }[] = preferFast
    ? [
        { model: FALLBACK_AI_MODEL, delayBeforeMs: 0 },
        { model: PRIMARY_AI_MODEL, delayBeforeMs: 100, lowThinking: true },
        { model: FALLBACK_AI_MODEL, delayBeforeMs: 500 },
      ]
    : primaryInCooldown
      ? [
          { model: FALLBACK_AI_MODEL, delayBeforeMs: 0 },
          { model: FALLBACK_AI_MODEL, delayBeforeMs: 600 },
          { model: PRIMARY_AI_MODEL, delayBeforeMs: 300, lowThinking: true },
        ]
      : [
          { model: PRIMARY_AI_MODEL, delayBeforeMs: 0, lowThinking: true },
          { model: FALLBACK_AI_MODEL, delayBeforeMs: 120 },
          { model: FALLBACK_AI_MODEL, delayBeforeMs: 650 },
        ];

  let lastError: unknown;
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    if (step.delayBeforeMs > 0) {
      await sleep(step.delayBeforeMs);
    }
    try {
      const mergedConfig =
        step.lowThinking && step.model === PRIMARY_AI_MODEL
          ? {
              ...(request.config ?? {}),
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            }
          : request.config;

      const result = await ai.models.generateContent({
        ...request,
        config: mergedConfig,
        model: step.model,
      });
      if (step.model === PRIMARY_AI_MODEL) {
        primaryCooldownUntil = 0;
      }
      return result;
    } catch (err) {
      lastError = err;
      const transient = isTransientHighDemandError(err);
      console.warn(
        `[AI Attempt ${i + 1}/${plan.length}] model=${step.model} failed (transient=${transient}):`,
        extractRawErrorText(err).slice(0, 220)
      );
      if (transient && step.model === PRIMARY_AI_MODEL) {
        primaryCooldownUntil = Date.now() + 60_000;
      }
      if (!transient) {
        throw err;
      }
    }
  }
  throw lastError;
}

function buildVerifiedReferenceSnippet(): string {
  return VERIFIED_FOOD_DATABASE.slice(0, 30)
    .map(
      (f) =>
        `${f.name}(${f.state ?? 'std'}/100${f.defaultUnit}):${f.per100.calories}kcal,P${f.per100.protein},C${f.per100.carbs},F${f.per100.fat},Fib${f.per100.fiber}`
    )
    .join('; ');
}

function parseJsonSafe<T>(text: string | undefined, fallbackError: string): T {
  const cleaned = (text ?? '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  if (!cleaned) {
    throw new Error(fallbackError);
  }
  return JSON.parse(cleaned) as T;
}

function handleAiError(res: express.Response, err: unknown, fallbackMessage: string) {
  console.error('[AI Route Error]:', err);
  const rawMessage = extractRawErrorText(err);
  let cleanMessage = rawMessage;

  // Unwrap JSON-encoded upstream SDK error messages so raw JSON never reaches the UI
  if (rawMessage.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage) as {
        error?: { message?: string; status?: string; code?: number };
        message?: string;
      };
      cleanMessage = parsed?.error?.message || parsed?.message || fallbackMessage;
    } catch {
      cleanMessage = fallbackMessage;
    }
  }

  const lower = rawMessage.toLowerCase();
  if (
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('gemini_api_key')
  ) {
    res.status(503).json({
      error: 'AI service key is unavailable or invalid. Please check GEMINI_API_KEY in Settings > Secrets.',
    });
    return;
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) {
    res.status(503).json({
      error: 'The AI nutrition service is temporarily busy due to high demand. Please tap Retry in a moment.',
    });
    return;
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    res.status(429).json({
      error: 'AI request limit reached temporarily. Please wait a few seconds and tap Retry.',
    });
    return;
  }
  res.status(500).json({ error: cleanMessage || fallbackMessage });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 0. Real Food Photo Resolver for Illustrated Diet Plan Cards & PDF Embedding (Same-origin, zero CORS)
  app.get('/api/food-photo/image', async (req, res) => {
    try {
      const queryStr = String(req.query.q ?? '').trim();
      const nameStr = String(req.query.name ?? '').trim();
      const combined = `${queryStr} ${nameStr}`.trim();

      // Exact bespoke studio photos for core dishes (Besan Cheela, Oats, Paneer, Dal-Rice, Eggs, Chicken, Sprouts, Yogurt)
      const strongStudioMatches: { file: string; terms: string[] }[] = [
        { file: 'besan_cheela.jpg', terms: ['besan cheela', 'besan chilla', 'cheela', 'chilla', 'moong dal chilla'] },
        { file: 'oats_bowl.jpg', terms: ['oats', 'oatmeal', 'porridge', 'overnight oats'] },
        { file: 'paneer_bowl.jpg', terms: ['paneer', 'tofu bowl', 'paneer tikka', 'paneer bhurji'] },
        { file: 'dal_rice.jpg', terms: ['dal', 'daal', 'lentil', 'dal rice', 'dal chawal'] },
        { file: 'eggs_toast.jpg', terms: ['egg', 'omelette', 'omelet', 'boiled egg', 'egg toast', 'scrambled egg'] },
        { file: 'grilled_chicken.jpg', terms: ['grilled chicken', 'chicken breast', 'roast chicken', 'chicken salad'] },
        { file: 'sprouts_salad.jpg', terms: ['sprouts', 'sprout salad', 'moong sprouts', 'chickpea salad'] },
        { file: 'yogurt_snack.jpg', terms: ['greek yogurt', 'yogurt bowl', 'curd', 'dahi', 'mixed nuts', 'almonds', 'walnuts'] },
      ];

      const lower = combined.toLowerCase();
      for (const item of strongStudioMatches) {
        if (item.terms.some((t) => lower.includes(t))) {
          const filePath = getLocalMealPhotoPath(item.file);
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.sendFile(filePath);
            return;
          }
        }
      }

      // Check cache for Wikimedia dish photo
      const cacheKey = lower.slice(0, 80);
      const cached = foodPhotoCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(cached.buffer);
        return;
      }

      // Live Wikimedia Commons / Wikipedia lookup for any other dish (Poha, Idli, Dosa, Rajma, Upma, Smoothie, etc.)
      const wikiPhoto = await fetchWikimediaFoodPhoto(queryStr || nameStr);
      if (wikiPhoto) {
        foodPhotoCache.set(cacheKey, {
          ...wikiPhoto,
          expiresAt: Date.now() + 15 * 60 * 1000,
        });
        res.setHeader('Content-Type', wikiPhoto.contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(wikiPhoto.buffer);
        return;
      }

      // Fallback to closest curated studio photo so every meal ALWAYS displays a crisp food photo
      const fallbackFile =
        matchLocalMealPhoto(combined, true) ||
        matchLocalMealPhoto(combined, false) ||
        'paneer_bowl.jpg';
      const fallbackPath = getLocalMealPhotoPath(fallbackFile);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(fallbackPath);
    } catch (err) {
      console.warn('[Food Photo Proxy] Falling back to studio image:', err);
      res.setHeader('Content-Type', 'image/jpeg');
      res.sendFile(getLocalMealPhotoPath('oats_bowl.jpg'));
    }
  });

  // 0b. Voice Message Transcription (WhatsApp Voice Notes -> Text via free-tier gemini-3.5-transcribe)
  app.post('/api/ai/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };
      if (!audioBase64) {
        res.status(400).json({ error: 'Audio recording data is required.' });
        return;
      }
      const ai = getAiClient();
      const base64Data = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
      const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';

      const promptParts = [
        { inlineData: { mimeType: cleanMime, data: base64Data } },
        {
          text: 'Transcribe this voice message accurately. If the speaker uses English or Hinglish, write it in clear, natural English/Roman script preserving exact food names and quantities (e.g., "100g besan cheela", "make me a fat loss diet plan"). Return ONLY the transcript text with no quotes or labels.',
        },
      ];

      let response;
      try {
        response = await ai.models.generateContent({
          model: TRANSCRIBE_AI_MODEL,
          contents: { parts: promptParts },
        });
      } catch (primaryErr) {
        console.warn('[Transcribe] Primary failed, falling back to flash-lite:', extractRawErrorText(primaryErr).slice(0, 180));
        response = await ai.models.generateContent({
          model: FALLBACK_AI_MODEL,
          contents: { parts: promptParts },
        });
      }

      const transcript = (response.text ?? '').trim().replace(/^["']|["']$/g, '');
      if (!transcript) {
        res.status(422).json({ error: 'Could not hear any speech in that voice note. Please try speaking clearly.' });
        return;
      }
      res.json({ transcript });
    } catch (err) {
      handleAiError(res, err, 'Failed to transcribe voice message.');
    }
  });

  // 0c. Coach Voice Reply Playback (TTS via free-tier gemini-3.8-flash-lite-tts)
  app.post('/api/ai/tts', async (req, res) => {
    try {
      const { text } = req.body as { text?: string };
      const cleaned = (text ?? '')
        .replace(/[*_`#]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 650);
      if (!cleaned) {
        res.status(400).json({ error: 'Text is required for coach voice playback.' });
        return;
      }
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: TTS_AI_MODEL,
        contents: `Speak warmly and clearly like a friendly personal nutrition coach:\n${cleaned}`,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      const audioBase64 = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType || 'audio/wav';
      if (!audioBase64) {
        res.status(500).json({ error: 'Could not generate coach voice audio.' });
        return;
      }
      res.json({ audioDataUrl: `data:${mimeType};base64,${audioBase64}` });
    } catch (err) {
      handleAiError(res, err, 'Failed to synthesize coach voice message.');
    }
  });

  // 1. Multimodal Food Photo Scanner (Camera & Gallery)
  app.post('/api/ai/scan-food', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg', userContext } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        userContext?: { dietaryPreference?: string; fitnessGoal?: string; isMinor?: boolean };
      };

      if (!imageBase64) {
        res.status(400).json({ error: 'An image is required for food scanning.' });
        return;
      }

      const ai = getAiClient();
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

      const systemInstruction = `You are a careful nutrition analysis assistant.
Analyze the meal photo and identify visible food items with realistic portion weights (in grams or ml).
Use this verified nutrition reference whenever foods match:
${buildVerifiedReferenceSnippet()}

Rules:
- Visual portion estimation is inherently approximate. Clearly state uncertainty in uncertaintyNote.
- Break the meal into individual identifiable items so the user can edit or remove items before saving.
- Never claim guaranteed accuracy. Never demonize carbohydrates.
- If the user is a minor (isMinor: true), keep coachTip strictly focused on balanced energy, protein, micronutrients, and healthy growth—never weight loss or restriction.`;

      const response = await generateContentWithFallback(ai, {
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            {
              text: `Identify the visible food items in this meal photo and estimate portion sizes and macros. User context: ${JSON.stringify(userContext ?? {})}`,
            },
          ],
        },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              dishTitle: { type: Type.STRING },
              summary: { type: Type.STRING },
              uncertaintyNote: { type: Type.STRING },
              coachTip: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    foodName: { type: Type.STRING },
                    estimatedGrams: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    calories: { type: Type.NUMBER },
                    protein: { type: Type.NUMBER },
                    carbs: { type: Type.NUMBER },
                    fat: { type: Type.NUMBER },
                    fiber: { type: Type.NUMBER },
                    confidence: { type: Type.STRING },
                  },
                  required: ['foodName', 'estimatedGrams', 'unit', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'confidence'],
                },
              },
            },
            required: ['dishTitle', 'summary', 'uncertaintyNote', 'coachTip', 'items'],
          },
        },
      });

      const parsed = parseJsonSafe(response.text, 'Could not parse AI food scan response.');
      res.json(parsed);
    } catch (err) {
      handleAiError(res, err, 'Failed to analyze food photo.');
    }
  });

  // 2. Nutrition Label OCR Scanner (Never invents missing values)
  app.post('/api/ai/scan-label', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg' } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };

      if (!imageBase64) {
        res.status(400).json({ error: 'A nutrition label image is required.' });
        return;
      }

      const ai = getAiClient();
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

      const response = await generateContentWithFallback(ai, {
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            {
              text: 'Extract the exact per-serving nutrition facts printed on this packaged food label. If any nutrient is NOT clearly printed on the label, return null for that field. Do NOT invent or guess missing values.',
            },
          ],
        },
        config: {
          systemInstruction:
            'You are a precision OCR nutrition label extractor. Strictly transcribe only printed per-serving values. Return null for any unreadable or absent nutrient—never fabricate numbers.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              productName: { type: Type.STRING },
              servingSizeText: { type: Type.STRING },
              servingGramsOrMl: { type: Type.NUMBER, nullable: true },
              calories: { type: Type.NUMBER, nullable: true },
              protein: { type: Type.NUMBER, nullable: true },
              carbs: { type: Type.NUMBER, nullable: true },
              fat: { type: Type.NUMBER, nullable: true },
              saturatedFat: { type: Type.NUMBER, nullable: true },
              fiber: { type: Type.NUMBER, nullable: true },
              sugar: { type: Type.NUMBER, nullable: true },
              sodiumMg: { type: Type.NUMBER, nullable: true },
              extractionNotes: { type: Type.STRING },
            },
            required: ['productName', 'servingSizeText', 'extractionNotes'],
          },
        },
      });

      const parsed = parseJsonSafe(response.text, 'Could not read nutrition label.');
      res.json(parsed);
    } catch (err) {
      handleAiError(res, err, 'Failed to read nutrition label.');
    }
  });

  // 3. Conversational AI Nutrition Coach & Multi-Photo Food Logger
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const {
        message,
        images = [],
        imageBase64,
        mimeType = 'image/jpeg',
        imageKind = 'food',
        history = [],
        profile,
        targets,
        todaySummary,
        selectedDate,
        currentHour,
      } = req.body as {
        message: string;
        images?: { dataUrl: string; mimeType?: string; kind?: 'food' | 'label' }[];
        imageBase64?: string;
        mimeType?: string;
        imageKind?: 'food' | 'label';
        history?: { role: 'user' | 'assistant'; content: string }[];
        profile?: Record<string, unknown>;
        targets?: Record<string, unknown>;
        todaySummary?: Record<string, unknown>;
        selectedDate?: string;
        currentHour?: number;
      };

      const normalizedImages: { dataUrl: string; mimeType: string; kind: 'food' | 'label' }[] = [];
      if (Array.isArray(images) && images.length > 0) {
        for (const img of images.slice(0, 6)) {
          if (img?.dataUrl) {
            normalizedImages.push({
              dataUrl: img.dataUrl,
              mimeType: img.mimeType || 'image/jpeg',
              kind: img.kind === 'label' ? 'label' : 'food',
            });
          }
        }
      } else if (imageBase64) {
        normalizedImages.push({
          dataUrl: imageBase64,
          mimeType,
          kind: imageKind === 'label' ? 'label' : 'food',
        });
      }

      if (!message?.trim() && normalizedImages.length === 0) {
        res.status(400).json({ error: 'Message or at least one image is required.' });
        return;
      }

      const safeHour =
        typeof currentHour === 'number' && Number.isFinite(currentHour)
          ? currentHour
          : new Date().getHours();
      const inferredMealSlot =
        safeHour < 11 ? 'breakfast' : safeHour < 15 ? 'lunch' : safeHour < 18 ? 'snacks' : 'dinner';

      const compactProfile = {
        name: profile?.fullName ?? 'User',
        age: targets?.age ?? undefined,
        gender: profile?.gender ?? undefined,
        heightCm: profile?.heightCm ?? undefined,
        weightKg: profile?.weightKg ?? undefined,
        activityLevel: profile?.activityLevel ?? undefined,
        diet: profile?.dietaryPreference ?? 'vegetarian',
        goal: targets?.appliedGoal ?? profile?.fitnessGoal ?? 'general_fitness',
        targetKcal: targets?.targetCalories ?? 2000,
        targetProtein: targets?.proteinGrams ?? 100,
        targetCarbs: targets?.carbsGrams ?? 220,
        targetFat: targets?.fatGrams ?? 65,
        isMinor: Boolean(targets?.isMinor),
      };

      const isHinglishMessage = /\b(mujhe|banao|bana do|chahiye|pasand|kya|hai|khana|din|mera|meri|aap|aapko|nahi|aur|ke liye|se|karo|batao)\b/i.test(
        `${message || ''} ${history.slice(-2).map((h) => h.content).join(' ')}`
      );

      const ai = getAiClient();
      const systemInstruction = `You are NutriPulse, a certified professional dietitian, personalized diet planner, and fast WhatsApp food logger.

Client Profile: ${JSON.stringify(compactProfile)}
Logged for ${selectedDate ?? 'today'}: ${JSON.stringify(todaySummary ?? {})}
Default meal slot by current local time (${safeHour}:00): "${inferredMealSlot}"
Required Reply Language: ${
        isHinglishMessage
          ? 'Warm, professional Hinglish (natural Roman Hindi + English, e.g. "Namaste ...").'
          : 'Clear, polished English ONLY. Do NOT use Hindi/Hinglish words.'
      }

Verified Reference (per 100g/ml): ${buildVerifiedReferenceSnippet()}

RULES:
1. Professional Dietitian Tone & Formatting:
   - Sound like a knowledgeable, caring, certified clinical diet planner — clear, structured, calm, and practical.
   - Strictly follow the Required Reply Language specified above.
   - Plain text only in reply (never use markdown asterisks like **bold**). Use clean line breaks (\n) between numbered points.
   - For regular meal logging/questions, keep replies concise (2–4 crisp sentences). For Diet Plan consultations, write out the complete numbered questions cleanly in reply so nothing is cut off.
2. INSTANT DIRECT AUTO-LOGGING (CRITICAL — FOR LOGGING EATEN FOOD ONLY):
   - Whenever the user shares food they ate (text, voice note, or 1–6 meal/label photos), IMMEDIATELY compute accurate macros and populate proposedEntries so the app automatically records them straight into their diary right away!
   - NEVER ask "tap Confirm & Save" and NEVER delay logging eaten food by asking which meal slot it was. Use the meal slot they mention, or infer from the food / "${inferredMealSlot}".
   - For grains/lentils/meats with weights like "150g rice" or "100g dal" where cooked/raw isn't stated, assume cooked weight and record immediately (briefly note "logged as cooked weight").
   - Set needsClarification: false, followUpOptions: [], dietPlan: null, and confirm directly that it is recorded with 1 short actionable tip.
3. Multi-photo + caption: Inspect all attached photos together and combine with the caption without duplicating items. For nutrition labels, transcribe only printed values accurately.
4. Full-day total logging: If the user states only a daily calorie total (e.g. "Today I ate 2000 calories") without foods, log ONE item in proposedEntries with mealType: "daily_total", foodName: "Daily Calorie Total", quantity: 1, unit: "day", calories: 2000, protein: 0, carbs: 0, fat: 0, fiber: 0. Never invent foods.
5. PROFESSIONAL PERSONALIZED DIET PLANNER CONSULTATION (STRICT 2-STEP CLINICAL INTAKE BEFORE GENERATING ANY DIET PLAN):
   - Whenever the user asks for a diet plan, meal plan, or diet PDF (e.g. "make me a diet plan", "diet plan banao", "fat loss/muscle gain diet chart", "personalized diet plan PDF"):
   - MANDATORY CHECK: Look carefully at the user's current message AND recent conversation history. Have they explicitly told you BOTH:
     (A) What foods / cuisine they LIKE to eat (e.g. Indian home-cooked, Besan Cheela, Oats, Dal-Rice, Paneer, Poha, Eggs, Chicken, South Indian, etc.)
     AND
     (B) Whether they have ANY FOOD ALLERGIES, intolerances, or foods they dislike/avoid (e.g. "no allergies", or specific allergies like dairy/lactose, nuts/peanuts, gluten/wheat, soy, eggs, seafood)?
   - PHASE A — MANDATORY CONSULTATION INTAKE (if EITHER food likes OR allergy status is NOT yet clearly answered in the conversation):
     * STRICT RULE: You MUST set dietPlan: null, proposedEntries: [], needsClarification: true. NEVER generate or attach dietPlan until you know both their food preferences AND allergy/avoidance status!
     * Act like a genuine certified diet planner conducting a personal intake consultation:
       - Acknowledge their profile baseline in 1 sentence (goal: ${String(compactProfile.goal)}, daily target: ${String(compactProfile.targetKcal)} kcal & ${String(compactProfile.targetProtein)}g protein, ${String(compactProfile.diet)} diet).
       - You MUST write out ALL missing consultation questions in full inside reply using numbered lines separated by \n (never stop after a colon!):
         1. Food likes & cuisine — What foods or dishes do you genuinely enjoy eating daily? (give examples matching their ${String(compactProfile.diet)} diet, e.g. Besan Cheela, Poha, Oats, Dal-Rice, Roti-Sabzi, Paneer/Tofu, Sprouts)
         2. Food allergies & dislikes — Are you allergic or intolerant to any foods (such as dairy/lactose, nuts/peanuts, gluten/wheat, soy), or are there foods you dislike and want avoided?
         3. Meal routine — How many meals per day fit your daily schedule best (3, 4, or 5 meals)?
       - Provide 4 short one-tap followUpOptions that STRICTLY obey their "${String(compactProfile.diet)}" diet (NEVER suggest eggs/chicken/fish to a vegetarian or vegan!) and cover both preferences + allergy status clearly in the Required Reply Language.
         (If they already gave food likes and only allergy status is missing, acknowledge their likes and offer allergy chips like: ["No food allergies", "Dairy / lactose allergy", "Nut / peanut allergy", "Gluten / wheat allergy"]).
   - PHASE B — DELIVER PERSONALIZED ILLUSTRATED DIET PLAN PDF (ONLY once BOTH food likes AND allergy/avoidance status have been shared, OR when swapping/adjusting a meal in an already-delivered plan):
     * Build a balanced, realistic, clinically sound 1-day personalized diet plan in dietPlan with 4–6 meals (slots: breakfast, morning_snack, lunch, evening_snack, dinner) whose total calories match within ~5% of ${String(compactProfile.targetKcal)} kcal and hit near ${String(compactProfile.targetProtein)}g protein.
     * ZERO-ALLERGEN GUARANTEE: Strictly exclude EVERY allergen, intolerance, and disliked food the user mentioned (e.g. if dairy/lactose allergy -> zero milk, paneer, curd, whey, cheese, ghee; if nut allergy -> zero almonds, walnuts, peanuts, cashews; if gluten allergy -> zero wheat roti, bread, regular oats; if soy allergy -> zero tofu/soya). Strictly obey "${String(compactProfile.diet)}" too!
     * Feature their favorite dishes naturally across the day.
     * Every meal MUST include: slot, slotLabel, timeSuggestion, foodName, photoQuery (short 2–3 word culinary photo query like "besan cheela", "oats bowl", "paneer bowl", "dal rice", "sprouts salad", "greek yogurt nuts", "poha", "idli sambar", "eggs toast", "grilled chicken"), suggestedQuantity, calories, protein, carbs, fat, fiber, rationale (1 concise dietitian note explaining why it fits their goal & preferences), prepTip.
     * In coachNotes and reply, act as their professional diet planner: confirm that their favorite foods are included, explicitly reassure them that their reported allergies/dislikes were avoided (or note "allergy-safe plan"), share 1 practical hydration/timing tip, and let them know the illustrated Diet Plan PDF (with photos for every dish) is ready below.
     * Set proposedEntries: [], needsClarification: false, followUpOptions: ["Swap breakfast", "Make it higher protein", "Create Day 2 plan"].
6. Safety & Minors: If isMinor is true, NEVER recommend calorie deficits, fat loss, or restrictive dieting. Strictly obey dietary preference (${String(compactProfile.diet)}). Never demonize carbs.`;

      const historyText = history
        .slice(-8)
        .map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
        .join('\n');

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      normalizedImages.forEach((img) => {
        const base64Data = img.dataUrl.includes(',') ? img.dataUrl.split(',')[1] : img.dataUrl;
        parts.push({ inlineData: { mimeType: img.mimeType, data: base64Data } });
      });

      const imageSummaryText =
        normalizedImages.length > 0
          ? `Photos: ${normalizedImages.length} (${normalizedImages
              .map((i, idx) => `#${idx + 1} ${i.kind}`)
              .join(', ')})`
          : 'Photos: none';

      parts.push({
        text: `${historyText ? `History:\n${historyText}\n\n` : ''}Message (date ${selectedDate ?? 'today'}, ${imageSummaryText}):\n${message || 'Log the meal in the attached photo(s).'}`,
      });

      const response = await generateContentWithFallback(
        ai,
        {
          contents: { parts },
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
              needsClarification: { type: Type.BOOLEAN },
              followUpOptions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              proposedEntries: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    foodName: { type: Type.STRING },
                    mealType: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    servingDescription: { type: Type.STRING },
                    calories: { type: Type.NUMBER },
                    protein: { type: Type.NUMBER },
                    carbs: { type: Type.NUMBER },
                    fat: { type: Type.NUMBER },
                    fiber: { type: Type.NUMBER },
                    isEstimated: { type: Type.BOOLEAN },
                  },
                  required: [
                    'foodName',
                    'mealType',
                    'quantity',
                    'unit',
                    'calories',
                    'protein',
                    'carbs',
                    'fat',
                    'fiber',
                    'isEstimated',
                  ],
                },
              },
              dietPlan: {
                type: Type.OBJECT,
                nullable: true,
                properties: {
                  title: { type: Type.STRING },
                  goalSummary: { type: Type.STRING },
                  targetCalories: { type: Type.NUMBER },
                  coachNotes: { type: Type.STRING },
                  meals: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        slot: { type: Type.STRING },
                        slotLabel: { type: Type.STRING },
                        timeSuggestion: { type: Type.STRING },
                        foodName: { type: Type.STRING },
                        photoQuery: { type: Type.STRING },
                        suggestedQuantity: { type: Type.STRING },
                        calories: { type: Type.NUMBER },
                        protein: { type: Type.NUMBER },
                        carbs: { type: Type.NUMBER },
                        fat: { type: Type.NUMBER },
                        fiber: { type: Type.NUMBER },
                        rationale: { type: Type.STRING },
                        prepTip: { type: Type.STRING },
                      },
                      required: [
                        'slot',
                        'slotLabel',
                        'timeSuggestion',
                        'foodName',
                        'photoQuery',
                        'suggestedQuantity',
                        'calories',
                        'protein',
                        'carbs',
                        'fat',
                        'fiber',
                      ],
                    },
                  },
                },
                required: ['title', 'targetCalories', 'meals'],
              },
            },
              required: ['reply', 'needsClarification', 'followUpOptions', 'proposedEntries'],
            },
          },
        },
        { preferFast: true }
      );

      const parsed = parseJsonSafe<{
        reply: string;
        needsClarification: boolean;
        followUpOptions?: string[];
        proposedEntries?: unknown[];
        dietPlan?: {
          title: string;
          goalSummary?: string;
          targetCalories: number;
          coachNotes?: string;
          meals?: {
            slot: string;
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
          }[];
        } | null;
      }>(response.text, 'Could not parse AI coach reply.');

      // Safeguard: If a consultation clarification reply accidentally cuts off after a colon, append the structured questions cleanly
      if (parsed.needsClarification && !parsed.dietPlan && parsed.reply && parsed.reply.trim().endsWith(':')) {
        const isHinglish = /\b(mujhe|banao|bana do|chahiye|pasand|allergy|kya|hai|khana|din|mera|meri)\b/i.test(
          message || ''
        );
        parsed.reply = isHinglish
          ? `${parsed.reply.trim()}\n1. Aapko kya khana pasand hai? (jaise Besan Cheela, Poha, Oats, Dal-Chawal, Roti-Sabzi, Paneer/Tofu)\n2. Kya aapko kisi food se allergy ya dislike hai? (jaise dairy/lactose, nuts/peanuts, gluten, soy — ya koi allergy nahi)\n3. Din mein kitne meals aapke schedule ke liye best rahenge (3, 4 ya 5 meals)?`
          : `${parsed.reply.trim()}\n1. Food likes & cuisine: What dishes do you enjoy eating daily (e.g., Besan Cheela, Poha, Oats, Dal-Rice, Roti-Sabzi, Paneer/Tofu)?\n2. Food allergies & dislikes: Are you allergic or intolerant to anything (dairy/lactose, nuts/peanuts, gluten, soy), or any foods you dislike?\n3. Meal routine: How many meals per day fit your schedule best (3, 4, or 5 meals)?`;
      }

      // Attach deterministic same-origin photo URL to EVERY single meal in the generated diet plan
      if (parsed.dietPlan && Array.isArray(parsed.dietPlan.meals) && parsed.dietPlan.meals.length > 0) {
        parsed.dietPlan.meals = parsed.dietPlan.meals.slice(0, 8).map((meal) => ({
          ...meal,
          photoUrl: `/api/food-photo/image?q=${encodeURIComponent(
            meal.photoQuery || meal.foodName
          )}&name=${encodeURIComponent(meal.foodName)}`,
        }));
      } else {
        parsed.dietPlan = null;
      }

      res.json(parsed);
    } catch (err) {
      handleAiError(res, err, 'Failed to get AI nutrition coach response.');
    }
  });

  // 4. Personalized AI Coach Insights (Grounded in actual logged data)
  app.post('/api/ai/coach-insights', async (req, res) => {
    try {
      const { profile, targets, todaySummary, recentEntries = [] } = req.body as {
        profile: Record<string, unknown>;
        targets: Record<string, unknown>;
        todaySummary: Record<string, unknown>;
        recentEntries: unknown[];
      };

      const ai = getAiClient();
      const response = await generateContentWithFallback(ai, {
        contents: `Generate personalized nutrition coaching insights based strictly on this user's actual data:
Profile: ${JSON.stringify(profile)}
Targets: ${JSON.stringify(targets)}
Today's Logged Totals: ${JSON.stringify(todaySummary)}
Recent Logged Foods: ${JSON.stringify(recentEntries.slice(0, 20))}`,
        config: {
          systemInstruction: `You are NutriPulse, a registered-dietitian-informed nutrition coach.
Analyze the user's ACTUAL logged calories, protein, carbs, fat, fiber, and recent meals against their calculated targets and dietaryPreference.
- Do NOT give generic boilerplate advice; reference their actual numbers and foods.
- For Fat Loss: improve meal satiety, protein, and nutritional balance without automatically recommending further calorie cuts.
- For Muscle Building: if protein is behind target, suggest foods matching their dietaryPreference (e.g., paneer, tofu, soy chunks, lentils, Greek yogurt for vegetarian; tofu, tempeh, soy chunks, edamame, lentils for vegan; eggs + vegetarian for eggetarian; lean poultry, fish, eggs, Greek yogurt for non-veg).
- If targets.isMinor is true: focus exclusively on balanced growth, variety, energy, and healthy habits—never fat loss.
- Never assume carbohydrates are bad.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              summary: { type: Type.STRING },
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    detail: { type: Type.STRING },
                    category: { type: Type.STRING },
                  },
                  required: ['title', 'detail', 'category'],
                },
              },
              foodIdeas: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              disclaimer: { type: Type.STRING },
            },
            required: ['headline', 'summary', 'suggestions', 'foodIdeas', 'disclaimer'],
          },
        },
      });

      const parsed = parseJsonSafe(response.text, 'Could not parse coach insights.');
      res.json(parsed);
    } catch (err) {
      handleAiError(res, err, 'Failed to generate personalized coaching insights.');
    }
  });

  // 5. Personalized AI Diet Planner & Meal Replacer
  app.post('/api/ai/diet-plan', async (req, res) => {
    try {
      const {
        profile,
        targets,
        customInstruction,
        replaceSlot,
        existingMeals,
        overrideDietaryPreference,
      } = req.body as {
        profile: Record<string, unknown>;
        targets: Record<string, unknown>;
        customInstruction?: string;
        replaceSlot?: string;
        existingMeals?: unknown[];
        overrideDietaryPreference?: string;
      };

      const ai = getAiClient();
      const effectiveDiet = overrideDietaryPreference || String(profile?.dietaryPreference ?? 'vegetarian');

      const prompt = replaceSlot
        ? `Replace ONLY the "${replaceSlot}" meal in this diet plan with a fresh alternative that keeps daily totals close to the user's targets.
Dietary Preference: ${effectiveDiet}
Targets: ${JSON.stringify(targets)}
Existing Meals: ${JSON.stringify(existingMeals ?? [])}
Additional request: ${customInstruction || 'Provide a delicious, practical alternative.'}
Return the full updated 5-meal plan array (breakfast, morning_snack, lunch, evening_snack, dinner).`
        : `Generate a balanced, realistic 1-day personalized meal plan with 5 slots: breakfast, morning_snack, lunch, evening_snack, dinner.
User Profile: ${JSON.stringify(profile)}
Dietary Preference: ${effectiveDiet}
Targets: ${JSON.stringify(targets)}
User custom modification: ${customInstruction || 'Balanced, whole-food practical meals.'}`;

      const response = await generateContentWithFallback(ai, {
        contents: prompt,
        config: {
          systemInstruction: `You are NutriPulse's personalized AI diet planner.
Build realistic, culturally versatile meals with explicit weights/quantities and accurate estimated calories, protein, carbs, fat, and fiber grounded in standard nutrition data:
${buildVerifiedReferenceSnippet()}

Rules:
- Strictly respect dietaryPreference (${effectiveDiet}). Never suggest meat/fish/eggs to vegetarians or dairy/eggs/meat to vegans.
- Total calories across the 5 meals should land within ~5% of targets.targetCalories.
- Never prescribe restrictive fad diets, never eliminate carbohydrates, and never promise guaranteed weight-loss results.
- If targets.isMinor is true, focus on balanced growth and nourishment.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              coachNotes: { type: Type.STRING },
              meals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    slot: { type: Type.STRING },
                    slotLabel: { type: Type.STRING },
                    foodName: { type: Type.STRING },
                    suggestedQuantity: { type: Type.STRING },
                    calories: { type: Type.NUMBER },
                    protein: { type: Type.NUMBER },
                    carbs: { type: Type.NUMBER },
                    fat: { type: Type.NUMBER },
                    fiber: { type: Type.NUMBER },
                    rationale: { type: Type.STRING },
                  },
                  required: [
                    'slot',
                    'slotLabel',
                    'foodName',
                    'suggestedQuantity',
                    'calories',
                    'protein',
                    'carbs',
                    'fat',
                    'fiber',
                  ],
                },
              },
            },
            required: ['title', 'coachNotes', 'meals'],
          },
        },
      });

      const parsed = parseJsonSafe(response.text, 'Could not parse generated diet plan.');
      res.json(parsed);
    } catch (err) {
      handleAiError(res, err, 'Failed to generate personalized diet plan.');
    }
  });

  // Vite dev middleware vs static production serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NutriPulse server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NutriPulse server:', err);
  process.exit(1);
});
