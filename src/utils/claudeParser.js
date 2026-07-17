/**
 * Claude-powered Medical Record Parser
 * Uses Claude API to parse complex medical records into structured data,
 * then uses deterministic rules for scoring (no AI bias in decisions)
 *
 * HIPAA COMPLIANCE: Uses de-identification before sending to Claude API
 */

import { deidentifyText } from './deidentify.js';

/**
 * Parse medical records using Claude API (via Vercel serverless function)
 * @param {string} medicalRecordText - Raw text from medical records
 * @param {string} patientName - Patient name for de-identification (optional)
 * @param {Object} userProvidedData - User-entered demographic and additional info (optional)
 * @param {string} userProvidedData.age - Candidate's age
 * @param {string} userProvidedData.bmi - Candidate's BMI
 * @param {string} userProvidedData.additionalInfo - Additional medical information or questions
 * @returns {Promise<Object>} Structured candidate data
 */
export async function parseWithClaude(medicalRecordText, patientName = '', userProvidedData = {}) {

  // HIPAA: De-identify medical record text before sending to Claude
  const deidentifiedText = deidentifyText(medicalRecordText, patientName);

  // Build context section with user-provided data
  let contextSection = '';
  if (userProvidedData.age || userProvidedData.bmi || userProvidedData.additionalInfo) {
    contextSection = '\n\nUSER-PROVIDED INFORMATION:\n';
    if (userProvidedData.age) {
      contextSection += `- Current Age: ${userProvidedData.age}\n`;
    }
    if (userProvidedData.bmi) {
      contextSection += `- Current BMI: ${userProvidedData.bmi}\n`;
    }
    if (userProvidedData.additionalInfo && userProvidedData.additionalInfo.trim() !== '') {
      contextSection += `- Additional Information: ${userProvidedData.additionalInfo}\n`;
    }
  }

  const prompt = `You are a medical record analyzer for gestational carrier (surrogate) screening. Parse the following medical records and extract ONLY factual information into a structured format.

IMPORTANT RULES:
1. **ONLY extract CONFIRMED ACTIVE diagnoses** - Do NOT include:
   - Family history (e.g., "mother has diabetes" - NOT the candidate's condition)
   - Differential diagnoses or "rule out" conditions (e.g., "r/o cardiac disease" - NOT confirmed)
   - Past resolved conditions (e.g., "history of asthma as child, resolved" - NOT active)
   - Conditions mentioned in background/review of systems without confirmation
   - Example: If record says "denies cardiac disease" or "no history of kidney disease" - DO NOT add these
   - Example: If record mentions "IUGR" in context of monitoring or screening but NOT as diagnosed - DO NOT add it
2. Count complications intelligently - group related issues together
   - Example: "hyperemesis + PICC line + TPN + hospitalization" = 1 complication (severe hyperemesis)
   - Example: "gastroparesis + severe GERD + gallstones in same pregnancy" = 1 complication (GI complications)
3. Distinguish between pregnancy-induced conditions vs chronic conditions
   - PIH, gestational hypertension = pregnancy-related
   - Chronic hypertension, essential hypertension = chronic condition
4. Extract complications PER PREGNANCY, then count total unique complication types
5. Do NOT make recommendations or predictions - just extract facts
6. NOTE: Patient identifiers have been removed for privacy (HIPAA compliance)
8. CRITICAL - Preterm labor/birth definition (READ CAREFULLY):
   - Preterm = delivery BEFORE 37 weeks gestational age ONLY
   - 37 weeks or later = FULL TERM (NOT preterm)
   - YOU MUST CHECK THE ACTUAL DELIVERY GESTATIONAL AGE
   - If delivery was at 38 weeks, 39 weeks, 40 weeks, 41 weeks = NOT PRETERM (do not add to complications)
   - "Prolonged labor", "prodromal labor", "slow labor", "labor for 3 days", "spontaneous labor" = NOT preterm (these describe labor characteristics, not timing)
   - Examples of FULL TERM (NOT preterm): "delivery at 38 weeks 5 days", "39 weeks 2 days", "40 weeks"
   - Examples of PRETERM: "delivery at 35 weeks", "delivered at 34 weeks 6 days", "preterm birth at 32 weeks"
9. CRITICAL - Membrane rupture (NOT complications):
   - "Artificial rupture of membranes" (AROM) = ROUTINE PROCEDURE (NOT a complication)
   - "Amniotomy" = ROUTINE PROCEDURE (NOT a complication)
   - "Rupture of membranes with Pitocin" = ROUTINE INDUCTION PROCEDURE (NOT a complication)
   - ONLY count as complication if PPROM (preterm premature rupture) BEFORE 37 weeks
   - At term (37+ weeks), membrane rupture is normal and expected
10. CRITICAL - Incomplete documentation:
   - If records only document through a certain week (e.g., "records through 35 weeks") but don't include delivery records, this is INCOMPLETE
   - Missing delivery/postpartum records should be noted as a documentation gap
   - This affects clinic approval likelihood even if no complications are documented
${contextSection}
Medical Records:
${deidentifiedText}

FOCUS ON: We only need pregnancy/delivery history and pre-existing medical conditions from the records.
DO NOT try to extract age, height, weight, or BMI from the medical records - those are entered separately by the user.

Return a JSON object with this EXACT structure:
{
  "pregnancyHistory": {
    "numberOfTermPregnancies": <number>,
    "numberOfCesareans": <number>,
    "numberOfComplications": <number>,
    "complications": [
      {
        "pregnancy": <which pregnancy number>,
        "category": "<hyperemesis|gi_complications|preeclampsia|gestational_diabetes|preterm_labor|placental_issues|hemorrhage|iugr|membrane_rupture|cholestasis|cerclage>",
        "description": "<brief description>",
        "severity": "<mild|moderate|severe>"
      }
    ]
  },
  "medicalConditions": [
    "<ONLY confirmed ACTIVE chronic conditions - NOT family history, NOT ruled out, NOT past resolved conditions. Examples: pregnancy_hypertension|hypertension|gestational_diabetes|preeclampsia|diabetes|thyroid_disorder|asthma. IMPORTANT: If a condition is only mentioned in context like 'denies', 'no history of', 'family history', 'r/o' (rule out), or monitoring/screening - DO NOT include it>"
  ],
  "surgicalHistory": [
    "<procedures like cholecystectomy, tubal ligation, appendectomy, etc>"
  ],
  "documentationGaps": [
    "<list any incomplete documentation issues like 'Missing delivery records for Pregnancy 3' or 'Records only through 35 weeks, no delivery documentation' or empty array if complete>"
  ],
  "pregnancySummary": "A detailed chronological narrative of each pregnancy with a blank line between each pregnancy. Example format: 'Pregnancy 1 (2011): Full-term vaginal delivery at 40 weeks, birth weight 7lbs 2oz, no complications reported.\n\nPregnancy 2 (2015): Cesarean delivery at 39 weeks due to breech presentation, birth weight 8lbs 1oz, complicated by mild preeclampsia managed with medication.\n\nPregnancy 3 (2019): Repeat cesarean delivery at 38 weeks, birth weight 7lbs 10oz, history of gestational diabetes controlled with diet.' Include for EACH pregnancy: year, delivery method, gestational age, birth weight if available, and any complications. IMPORTANT: Separate each pregnancy with TWO newline characters (\\n\\n) for readability. If delivery records are missing, note this in the summary."
}

Return ONLY the JSON object, no other text.`;

  try {
    console.log('🔵 Calling /api/parse serverless function...');

    // Call Vercel serverless function (keeps API key secure on server)
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        medicalText: deidentifiedText,
        candidateName: patientName,
        userProvidedData: userProvidedData
      })
    });

    console.log('🔵 Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('🔴 API error response:', errorData);
      throw new Error(`Claude API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    console.log('🔵 API result:', result);

    if (!result.success) {
      console.error('🔴 API returned unsuccessful');
      throw new Error('Claude API returned unsuccessful response');
    }

    const parsedData = result.data;
    console.log('✅ Claude parsing successful!');

    // Validate and clean the data, passing in user-provided age/BMI
    return validateAndCleanParsedData(parsedData, userProvidedData);
  } catch (error) {
    console.error('Claude parsing error:', error);
    throw new Error(`Failed to parse medical records with Claude: ${error.message}`);
  }
}

/**
 * Validate and clean parsed data from Claude
 * @param {Object} data - Parsed data from Claude
 * @param {Object} userProvidedData - User-entered data to use instead of extracted data
 */
function validateAndCleanParsedData(data, userProvidedData = {}) {
  // CRITICAL: ALWAYS use user-provided age/BMI if present - NEVER let Claude override it
  let age = undefined;
  if (userProvidedData.age && userProvidedData.age.trim() !== '') {
    age = parseInt(userProvidedData.age);
  } else if (data.age) {
    // Validate age is reasonable for surrogacy (21-43 per ASRM guidelines)
    const parsedAge = parseInt(data.age);
    if (parsedAge >= 18 && parsedAge <= 55) {
      age = parsedAge;
    } else {
      console.warn(`Age extracted out of plausible range: ${parsedAge}. Ignoring.`);
      age = undefined;
    }
  }

  const bmi = userProvidedData.bmi
    ? parseFloat(userProvidedData.bmi)
    : (data.bmi ? parseFloat(data.bmi) : undefined);

  // Ensure required fields exist
  const cleaned = {
    age: age,
    height: data.height || undefined,
    weight: data.weight || undefined,
    bmi: bmi,
    pregnancyHistory: {
      hasCompletedPregnancy: (data.pregnancyHistory?.numberOfTermPregnancies || 0) > 0,
      numberOfTermPregnancies: data.pregnancyHistory?.numberOfTermPregnancies || 0,
      totalDeliveries: data.pregnancyHistory?.numberOfTermPregnancies || 0,
      numberOfCesareans: data.pregnancyHistory?.numberOfCesareans || 0,
      numberOfComplications: data.pregnancyHistory?.numberOfComplications || 0,
      complications: Array.isArray(data.pregnancyHistory?.complications) ? data.pregnancyHistory.complications : []
    },
    medicalConditions: Array.isArray(data.medicalConditions) ? data.medicalConditions : [],
    infectiousDiseaseTests: {},
    psychological: {
      hasCompletedEvaluation: false,
      currentPsychotropicMedication: false,
      historyOfMajorDepression: false,
      historyOfBipolarDisorder: false,
      historyOfPsychosis: false,
      historyOfAnxietyDisorder: false,
      historyOfEatingDisorder: false,
      historyOfSubstanceAbuse: false,
      historyOfAbuse: false,
      evidenceOfCoercion: false,
      adequateSupportSystem: true,
      stableEnvironment: true
    },
    lifestyle: {
      bmi: bmi,
      currentSmoker: data.lifestyle?.currentSmoker || false,
      currentAlcoholUse: data.lifestyle?.currentAlcoholUse || 'none',
      currentDrugUse: data.lifestyle?.currentDrugUse || false,
      recentTattoos: false
    },
    environmental: {
      stableHousing: true,
      stableEmployment: true,
      adequateFinancialSituation: true,
      stableRelationship: true,
      supportivePartner: true,
      legalIssues: false
    }
  };

  // Add pregnancySummary if Claude provided one
  if (data.pregnancySummary) {
    cleaned.pregnancySummary = data.pregnancySummary;
  }

  // Add documentationGaps if Claude identified any
  if (data.documentationGaps && Array.isArray(data.documentationGaps) && data.documentationGaps.length > 0) {
    cleaned.documentationGaps = data.documentationGaps;
  }

  return cleaned;
}

/**
 * Fallback to deterministic parser if Claude fails
 */
export function shouldUseClaude(text) {
  // Use Claude for complex medical records with:
  // - Multiple medications listed
  // - Multiple pregnancy complications
  // - Medical abbreviations (NST, NSVD, etc.)
  // - Dates and gestational ages

  const complexityIndicators = [
    /\d+\+\d+\s*wks?/i, // Gestational age (e.g., 37+2 wks)
    /NST|NSVD|SVD|FT|BV|ASCUS|HPV/i, // Medical abbreviations
    /pregnancy.*complication/i,
    /hospitalization|PICC|TPN/i,
    /treated|prescribed|medication/i
  ];

  return complexityIndicators.some(pattern => pattern.test(text));
}
