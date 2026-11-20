import { jsPDF } from 'jspdf';
import { ChatDietPlan, ChatDietPlanMeal, UserProfile } from '../types/nutrition';
import { DIETARY_LABELS, GOAL_LABELS, NutritionTargetsResult } from './nutritionMath';

/**
 * Loads an image URL (same-origin /api/food-photo/image or /assets/meals/*),
 * center-crops it to a square/4:3 thumbnail with soft rounded corners, and returns
 * a clean JPEG data URL ready for jsPDF embedding.
 */
async function loadRoundedMealPhotoDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Image load failed'));
        el.src = objUrl;
      });

      const outW = 360;
      const outH = 280;
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Warm stone card backdrop behind rounded corners
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, outW, outH);

      // Rounded clip path
      const r = 24;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(outW - r, 0);
      ctx.quadraticCurveTo(outW, 0, outW, r);
      ctx.lineTo(outW, outH - r);
      ctx.quadraticCurveTo(outW, outH, outW - r, outH);
      ctx.lineTo(r, outH);
      ctx.quadraticCurveTo(0, outH, 0, outH - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.clip();

      // Center-crop cover draw
      const srcRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
      const dstRatio = outW / outH;
      let sx = 0;
      let sy = 0;
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;

      if (srcRatio > dstRatio) {
        sw = img.naturalHeight * dstRatio;
        sx = (img.naturalWidth - sw) / 2;
      } else {
        sh = img.naturalWidth / dstRatio;
        sy = (img.naturalHeight - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      return canvas.toDataURL('image/jpeg', 0.86);
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return null;
  }
}

export function resolveMealPhotoUrl(meal: ChatDietPlanMeal): string {
  if (meal.photoUrl && meal.photoUrl.trim()) {
    return meal.photoUrl;
  }
  const q = encodeURIComponent(meal.photoQuery || meal.foodName);
  const name = encodeURIComponent(meal.foodName);
  return `/api/food-photo/image?q=${q}&name=${name}`;
}

function sanitizeFileSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Generates and downloads a print-ready, warm-stone illustrated Diet Plan PDF
 * with a real food photograph embedded for EVERY meal item in the plan.
 */
export async function downloadDietPlanPdf(
  plan: ChatDietPlan,
  profile: UserProfile,
  targets: NutritionTargetsResult
): Promise<void> {
  // Fetch all meal photos in parallel before composing PDF pages
  const photoDataUrls = await Promise.all(
    plan.meals.map((meal) => loadRoundedMealPhotoDataUrl(resolveMealPhotoUrl(meal)))
  );

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentW = pageW - marginX * 2;

  const paintPageBg = () => {
    doc.setFillColor(236, 236, 232); // #ECECE8 warm stone
    doc.rect(0, 0, pageW, pageH, 'F');
  };

  paintPageBg();

  // Top Editorial Dark Charcoal Banner
  doc.setFillColor(21, 21, 19); // #151513
  doc.roundedRect(marginX, 12, contentW, 38, 6, 6, 'F');

  // Accent Lime Dot + Brand Mark
  doc.setFillColor(163, 240, 86); // #A3F056
  doc.circle(marginX + 8, 22, 2.6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(163, 240, 86);
  doc.text('NUTRIPULSE PERSONALIZED DIET PLAN', marginX + 13, 23.2);

  // Plan Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16.5);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(plan.title || 'Your Personalized Meal Plan', contentW - 16);
  doc.text(titleLines[0], marginX + 6, 33);

  // Subtitle: Client name, goal, diet, date
  const dateLabel = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(200, 200, 194);
  const subtitle = `Prepared for ${profile.fullName}  |  Goal: ${GOAL_LABELS[targets.appliedGoal]}  |  Diet: ${DIETARY_LABELS[profile.dietaryPreference]}  |  ${dateLabel}`;
  doc.text(subtitle, marginX + 6, 42.5);

  let y = 56;

  // Daily Totals Summary Strip (White Card)
  const totals = plan.meals.reduce(
    (acc, m) => ({
      calories: acc.calories + Math.round(Number(m.calories) || 0),
      protein: acc.protein + (Number(m.protein) || 0),
      carbs: acc.carbs + (Number(m.carbs) || 0),
      fat: acc.fat + (Number(m.fat) || 0),
      fiber: acc.fiber + (Number(m.fiber) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(marginX, y, contentW, 22, 5, 5, 'F');

  const summaryCols = [
    { label: 'DAILY PLAN', value: `${totals.calories} kcal`, sub: `Target ${targets.targetCalories}`, color: [23, 23, 21] as const },
    { label: 'PROTEIN', value: `${Math.round(totals.protein)}g`, sub: `Goal ${targets.proteinGrams}g`, color: [229, 72, 77] as const },
    { label: 'CARBS', value: `${Math.round(totals.carbs)}g`, sub: `Goal ${targets.carbsGrams}g`, color: [75, 150, 42] as const },
    { label: 'FATS', value: `${Math.round(totals.fat)}g`, sub: `Goal ${targets.fatGrams}g`, color: [212, 136, 15] as const },
    { label: 'FIBER', value: `${Math.round(totals.fiber)}g`, sub: `Goal ${targets.fiberGrams}g`, color: [23, 23, 21] as const },
  ];

  const colW = contentW / summaryCols.length;
  summaryCols.forEach((col, i) => {
    const cx = marginX + i * colW + 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 114);
    doc.text(col.label, cx, y + 6.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(col.color[0], col.color[1], col.color[2]);
    doc.text(col.value, cx, y + 13.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 114);
    doc.text(col.sub, cx, y + 18.5);
  });

  y += 27;

  // Goal Summary / Coach Notes box (if present)
  const noteText = [plan.goalSummary, plan.coachNotes].filter(Boolean).join('  ');
  if (noteText.trim()) {
    const noteLines = doc.splitTextToSize(noteText.trim(), contentW - 12);
    const boxH = Math.max(12, noteLines.length * 4.1 + 7);
    doc.setFillColor(244, 244, 240);
    doc.roundedRect(marginX, y, contentW, boxH, 4, 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    doc.setTextColor(58, 58, 53);
    doc.text(noteLines, marginX + 6, y + 5.5);
    y += boxH + 5;
  }

  // Section Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(23, 23, 21);
  doc.text(`Illustrated Meal Schedule (${plan.meals.length} Meals)`, marginX + 1, y + 2);
  y += 6;

  // Meal Cards — Every single meal gets its own embedded food photo!
  const imgW = 42;
  const imgH = 33;

  plan.meals.forEach((meal, idx) => {
    const textAreaX = marginX + imgW + 8;
    const textAreaW = contentW - imgW - 12;

    const dishLines = doc.splitTextToSize(meal.foodName || 'Balanced Meal', textAreaW - 22);
    const qtyLines = doc.splitTextToSize(`Portion: ${meal.suggestedQuantity || '1 serving'}`, textAreaW);
    const tipBody = [meal.rationale, meal.prepTip ? `Prep tip: ${meal.prepTip}` : '']
      .filter(Boolean)
      .join(' ');
    const tipLines = tipBody ? doc.splitTextToSize(tipBody, textAreaW).slice(0, 3) : [];

    const textBlockH =
      6 + // slot + time row
      dishLines.length * 4.8 +
      qtyLines.length * 3.8 +
      7 + // macro strip
      tipLines.length * 3.6 +
      5;
    const cardH = Math.max(imgH + 8, textBlockH);

    // Page break if needed (reserve 18mm for footer)
    if (y + cardH > pageH - 18) {
      doc.addPage();
      paintPageBg();
      y = 14;
    }

    // Card Background
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(marginX, y, contentW, cardH, 5, 5, 'F');

    // Meal Food Photo on Left
    const imgX = marginX + 4;
    const imgY = y + (cardH - imgH) / 2;
    const photoData = photoDataUrls[idx];
    if (photoData) {
      doc.addImage(photoData, 'JPEG', imgX, imgY, imgW, imgH, undefined, 'FAST');
    } else {
      doc.setFillColor(244, 244, 240);
      doc.roundedRect(imgX, imgY, imgW, imgH, 3.5, 3.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 114);
      doc.text('Meal Photo', imgX + 11, imgY + imgH / 2 + 1);
    }

    // Slot Label + Time
    let ty = y + 7.5;
    const slotTitle = `${(meal.slotLabel || meal.slot || 'MEAL').toUpperCase()}${
      meal.timeSuggestion ? `  ·  ${meal.timeSuggestion}` : ''
    }`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(75, 150, 42);
    doc.text(slotTitle, textAreaX, ty);

    // Calories top-right
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(23, 23, 21);
    doc.text(`${Math.round(Number(meal.calories) || 0)} kcal`, marginX + contentW - 5, ty, {
      align: 'right',
    });

    // Dish Name
    ty += 5.2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(23, 23, 21);
    doc.text(dishLines, textAreaX, ty);
    ty += dishLines.length * 4.6;

    // Portion
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    doc.setTextColor(98, 98, 92);
    doc.text(qtyLines, textAreaX, ty);
    ty += qtyLines.length * 3.8 + 1.5;

    // Color-coded Macro Line
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    let mx = textAreaX;
    const macros: { text: string; rgb: [number, number, number] }[] = [
      { text: `P ${Math.round(Number(meal.protein) || 0)}g`, rgb: [229, 72, 77] },
      { text: `C ${Math.round(Number(meal.carbs) || 0)}g`, rgb: [75, 150, 42] },
      { text: `F ${Math.round(Number(meal.fat) || 0)}g`, rgb: [212, 136, 15] },
      { text: `Fiber ${Math.round(Number(meal.fiber) || 0)}g`, rgb: [98, 98, 92] },
    ];
    macros.forEach((m) => {
      doc.setTextColor(m.rgb[0], m.rgb[1], m.rgb[2]);
      doc.text(m.text, mx, ty);
      mx += doc.getTextWidth(m.text) + 5.5;
    });

    // Rationale + Prep tip
    if (tipLines.length > 0) {
      ty += 4.6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.9);
      doc.setTextColor(92, 92, 87);
      doc.text(tipLines, textAreaX, ty);
    }

    y += cardH + 4;
  });

  // Safety & Disclaimer Footer on final page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(120, 120, 114);
    const disclaimer = targets.isMinor
      ? 'Youth Nutrition Guidance: Estimated values prioritize balanced growth and healthy eating habits. Consult a pediatrician or registered dietitian for medical advice.'
      : 'NutriPulse Estimate: Calorie and macronutrient figures are approximate estimates for educational guidance, not medical prescriptions.';
    doc.text(disclaimer, marginX, pageH - 8);
    doc.text(`Page ${p} of ${totalPages}`, pageW - marginX, pageH - 8, { align: 'right' });
  }

  // Trigger clean blob download (iframe-safe, never window.open)
  const pdfBlob = doc.output('blob');
  const blobUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = blobUrl;
  const slug = sanitizeFileSlug(plan.title || 'personalized_diet_plan');
  link.download = `NutriPulse_${slug || 'diet_plan'}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
}
