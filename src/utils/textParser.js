/**
 * Natural Language Parser for Surrogacy Candidate Information
 * Extracts structured data from free-text descriptions
 */

import { CONDITION_SYNONYMS } from './medicalGlossary.js';

/**
 * Parse text input and extract candidate information
 */
export function parseTextInput(text) {
  const candidateData = {
    age: extractAge(text),
    pregnancyHistory: extractPregnancyHistory(text),
    medicalConditions: extractMedicalConditions(text),
    infectiousDiseaseTests: extractInfectiousDiseaseInfo(text),
    psychological: extractPsychologicalInfo(text),
    lifestyle: extractLifestyleInfo(text),
    environmental: extractEnvironmentalInfo(text)
  };

  return candidateData;
}

/**
 * Extract age from text
 */
function extractAge(text) {
  const patterns = [
    /(\d{2})\s*(?:years?\s*old|yo|y\/o)/i,
    /age[:\s]+(\d{2})/i,
    /(?:is|aged?)\s+(\d{2})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const age = parseInt(match[1], 10);
      // Validate age is reasonable for surrogacy (21-43 per ASRM guidelines)
      if (age >= 21 && age <= 43) {
        return age;
      } else {
        console.warn(`Invalid age extracted: ${age}. Must be 21-43 for surrogacy. Ignoring.`);
        continue; // Try next pattern
      }
    }
  }

  return undefined;
}

/**
 * Extract pregnancy history information
 */
function extractPregnancyHistory(text) {
  const history = {
    hasCompletedPregnancy: false,
    numberOfTermPregnancies: 0,
    numberOfComplications: 0,
    totalDeliveries: 0,
    numberOfCesareans: 0
  };

  // Check for pregnancy mentions - including medical notes format
  const pregnancyPatterns = [
    /(?:hx|history)\s*of\s*(\d+)\s*pregnanc(?:y|ies)/i,  // "hx of 3 pregnancies"
    /(\d+)\s*(?:previous|prior|past)?\s*(?:full[- ]?term|term|successful)\s*pregnanc(?:y|ies)/i,
    /(?:delivered|had|gave birth to)\s*(\d+)\s*(?:children|babies|kids)/i,
    /has\s*(\d+)\s*(?:children|kids|child)/i,
    /(\d+)\s*(?:children|kids|child)/i,
    /mother\s*of\s*(\d+)/i,
    /mom\s*of\s*(\d+)/i,
    /(\d+)\s*(?:previous|prior)\s*(?:deliveries|births|pregnancies)/i,
    /pregnant\s*(\d+)\s*times?/i,
    /(\d+)\s+pregnanc(?:y|ies)/i,  // "5 pregnancies" (plain, e.g. in a question)
    /G(\d+)P(\d+)/i,  // G3P2 notation
    /been\s*pregnant/i,
    /was\s*pregnant/i,
    /had\s*a\s*baby/i,
    /had\s*babies/i,
    /gave\s*birth/i,
    /(?:first|second|third|1st|2nd|3rd)\s+pregnancy\s+resulted/i  // Medical notes: "first pregnancy resulted in..."
  ];

  for (const pattern of pregnancyPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[1]) {
        const count = parseInt(match[1], 10);
        history.hasCompletedPregnancy = count > 0;
        history.numberOfTermPregnancies = count;
        history.totalDeliveries = count;
      } else {
        // Pattern matched but no number (e.g., "had a baby", "gave birth")
        history.hasCompletedPregnancy = true;
        history.numberOfTermPregnancies = 1;
        history.totalDeliveries = 1;
      }
      break;
    }
  }

  // Check for complications - group related keywords into complication categories
  const lowerText = text.toLowerCase();

  // First check for explicit complication counts
  const explicitCountPatterns = [
    /(\d+)\s+(?:previous\s+)?(?:pregnancy\s+)?complications?/i,
    /complications?\s*:\s*(\d+)/i,
    /history\s+of\s+(\d+)\s+complications?/i
  ];

  let explicitCount = null;
  for (const pattern of explicitCountPatterns) {
    const match = text.match(pattern);
    if (match) {
      explicitCount = parseInt(match[1]);
      break;
    }
  }

  // If explicit count found, use it
  if (explicitCount !== null) {
    history.numberOfComplications = explicitCount;
  } else {
    // Otherwise, count major complication categories (not individual keywords)
    const complicationCategories = {
      'preeclampsia': ['preeclampsia', 'pre-eclampsia', 'hellp'],
      'hyperemesis': ['hyperemesis', 'severe hyperemesis', 'picc line', 'tpn', 'home tpn'],
      'gestational_diabetes': ['gestational diabetes', 'gdm'],
      'preterm_labor': ['preterm labor', 'preterm delivery', 'preterm birth', 'premature delivery', 'premature birth', 'ptl', 'ptb', 'delivered preterm', 'born preterm'],
      'placental_issues': ['previa', 'abruption', 'placental abruption', 'placenta previa'],
      'hemorrhage': ['pph', 'postpartum hemorrhage'],
      'iugr': ['iugr', 'fetal growth restriction', 'fgr'],
      'membrane_rupture': ['pprom', 'prom'],
      'cholestasis': ['icp', 'cholestasis'],
      'gi_complications': ['severe gerd', 'gastroparesis', 'cholecystectomy', 'gallstones'],
      'cerclage': ['cerclage']
    };

    const foundCategories = new Set();

    for (const [category, keywords] of Object.entries(complicationCategories)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          foundCategories.add(category);
          break; // Found this category, move to next
        }
      }
    }

    history.numberOfComplications = foundCategories.size;

    // ONLY override to 0 if explicitly stated ALL pregnancies were uncomplicated
    if (foundCategories.size === 0 &&
        (lowerText.includes('all uncomplicated') ||
         lowerText.includes('all healthy pregnancies') ||
         lowerText.includes('uncomplicated pregnancies'))) {
      history.numberOfComplications = 0;
    }
  }

  // Check for C-sections - using glossary terms
  const csectionPatterns = [
    /(\d+)\s*c[- ]?section/i,
    /(\d+)\s*cesarean/i,
    /(\d+)\s*caesarean/i,
    /(\d+)\s*cs\b/i,
    /(\d+)\s*c\/s/i
  ];

  for (const pattern of csectionPatterns) {
    const match = text.match(pattern);
    if (match) {
      history.numberOfCesareans = parseInt(match[1], 10);
      break;
    }
  }

  // Check for VBAC mention (implies previous C-section)
  if ((lowerText.includes('vbac') || lowerText.includes('vaginal birth after cesarean')) &&
      history.numberOfCesareans === 0) {
    history.numberOfCesareans = 1;
  }

  if (text.toLowerCase().includes('vaginal') && !text.toLowerCase().includes('c-section') &&
      !text.toLowerCase().includes('vbac')) {
    history.numberOfCesareans = 0;
  }

  // If C-sections mentioned, assume they've had pregnancies
  if (history.numberOfCesareans > 0 && !history.hasCompletedPregnancy) {
    history.hasCompletedPregnancy = true;
    history.numberOfTermPregnancies = history.numberOfCesareans;
    history.totalDeliveries = history.numberOfCesareans;
  }

  return history;
}

/**
 * Extract medical conditions - using medical glossary for better recognition
 */
function extractMedicalConditions(text) {
  const conditions = [];
  const lowerText = text.toLowerCase();

  // Check for gestational diabetes FIRST (to avoid confusing with regular diabetes)
  const gestationalDiabetesKeywords = CONDITION_SYNONYMS.gestational_diabetes || ['gdm', 'gestational diabetes', 'diabetes during pregnancy', 'pregnancy diabetes'];
  const hasGestationalDiabetes = gestationalDiabetesKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));

  if (hasGestationalDiabetes) {
    conditions.push('gestational_diabetes');
  }

  // IMPORTANT: In surrogacy context, candidates with chronic hypertension would never be in the pool
  // So "hypertension" mentions almost always mean pregnancy-induced hypertension (PIH)
  // ONLY flag as chronic if explicitly stated as "chronic hypertension" or "essential hypertension"

  // Check for explicit chronic hypertension (rare in this context)
  const chronicHtnKeywords = ['chronic hypertension', 'essential hypertension', 'pre-existing hypertension'];
  const hasChronicHTN = chronicHtnKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));

  // Check for any hypertension mentions (will be treated as PIH unless chronic is specified)
  const anyHypertensionKeywords = [
    'pih',
    'pregnancy-induced hypertension',
    'pregnancy induced hypertension',
    'gestational hypertension',
    'hypertension in pregnancy',
    'hypertension during pregnancy',
    'pregnancy-related hypertension',
    'pregnancy related hypertension',
    'hypertension' // Generic hypertension = assume PIH in surrogacy context
  ];
  const hasAnyHypertension = anyHypertensionKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));

  // Add the appropriate condition
  if (hasChronicHTN) {
    conditions.push('hypertension'); // Chronic hypertension
  } else if (hasAnyHypertension) {
    conditions.push('pregnancy_hypertension'); // PIH (default assumption)
  }

  // Check for gastric bypass / bariatric surgery
  const gastricBypassKeywords = [
    'gastric bypass',
    'gastric by-pass',
    'gastric by pass',
    'bariatric surgery',
    'bariatric',
    'weight loss surgery',
    'lap band',
    'lapband',
    'gastric sleeve',
    'sleeve gastrectomy',
    'roux-en-y',
    'gastric banding'
  ];
  const hasGastricBypass = gastricBypassKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  if (hasGastricBypass) {
    conditions.push('bariatric_surgery');
  }

  // Enhanced condition map with glossary abbreviations AND medical chart terminology
  const conditionMap = {
    // Remove hypertension from conditionMap since we handle it above
    // 'hypertension': CONDITION_SYNONYMS.hypertension || ['chronic hypertension', 'essential hypertension'],
    'preeclampsia': CONDITION_SYNONYMS.preeclampsia || ['preeclampsia', 'pre-eclampsia', 'toxemia'],
    'diabetes': ['t1dm', 't2dm', 'type 1 diabetes', 'type 2 diabetes', 'type1 diabetes', 'type2 diabetes'],
    'thyroid_disorder': ['thyroid', 'hypothyroid', 'hyperthyroid', 'hashimoto'],
    'autoimmune_disease': ['autoimmune', 'lupus', 'rheumatoid'],
    'pulmonary_hypertension': ['pulmonary hypertension'],
    'cardiac_disease': ['heart disease', 'cardiac'],
    'kidney_disease': ['kidney disease', 'renal'],
    'asthma': ['asthma'],
    'cancer': ['cancer', 'malignancy'],
    'IUGR': CONDITION_SYNONYMS.IUGR || ['iugr', 'intrauterine growth restriction', 'fetal growth restriction', 'fgr'],
    'placenta_previa': CONDITION_SYNONYMS.placenta_previa || ['previa', 'placenta previa', 'low-lying placenta'],
    'placental_abruption': CONDITION_SYNONYMS.placental_abruption || ['abruption', 'placental abruption'],
    'postpartum_hemorrhage': CONDITION_SYNONYMS.postpartum_hemorrhage || ['pph', 'postpartum hemorrhage'],
    // GI/metabolic conditions from medical notes
    'gerd': ['gerd', 'severe gerd', 'acid reflux', 'gastroesophageal reflux'],
    'gastroparesis': ['gastroparesis'],
    'hyperemesis': ['hyperemesis', 'severe hyperemesis'],
    'gallstones': ['gallstones', 'cholecystectomy', 'gallbladder'],
    'gastritis': ['gastritis']
  };

  // Helper function to check if a condition mention is a negative/denial
  const isNegativeMention = (text, keyword) => {
    const keywordIndex = text.indexOf(keyword.toLowerCase());
    if (keywordIndex === -1) return false;

    // Get context around the keyword (50 chars before and after)
    const start = Math.max(0, keywordIndex - 50);
    const end = Math.min(text.length, keywordIndex + keyword.length + 50);
    const context = text.substring(start, end);

    // Check for negative indicators
    const negativePatterns = [
      'no history of',
      'denies',
      'denied',
      'negative for',
      'rule out',
      'r/o',
      'family history',
      'mother has',
      'father has',
      'sister has',
      'brother has',
      'screened for',
      'monitoring for',
      'no evidence of',
      'unremarkable',
      'within normal limits',
      'wn'
    ];

    return negativePatterns.some(pattern => context.includes(pattern));
  };

  Object.keys(conditionMap).forEach(condition => {
    // Check if any keyword matches
    const matchedKeyword = conditionMap[condition].find(keyword =>
      lowerText.includes(keyword.toLowerCase())
    );

    // Only add if matched AND not a negative mention AND not already in the array
    if (matchedKeyword && !isNegativeMention(lowerText, matchedKeyword) && !conditions.includes(condition)) {
      conditions.push(condition);
    }
  });

  // ONLY flag regular diabetes/hypertension if VERY explicitly stated
  // Rationale: Candidates with chronic conditions wouldn't be in the pool at all
  // Generic mentions are too broad and likely refer to pregnancy-related conditions
  // PIH and gestational diabetes are already handled above

  // Check for "healthy" or "no medical conditions"
  if ((lowerText.includes('healthy') || lowerText.includes('no medical') ||
       lowerText.includes('no health')) && conditions.length === 0) {
    return [];
  }

  return [...new Set(conditions)]; // Remove duplicates
}

/**
 * Extract infectious disease testing information
 */
function extractInfectiousDiseaseInfo(text) {
  const tests = {};
  const lowerText = text.toLowerCase();

  const testKeywords = {
    'HIV-1': ['hiv', 'hiv-1', 'hiv 1'],
    'HIV-2': ['hiv-2', 'hiv 2'],
    'Hepatitis-B-surface-antigen': ['hepatitis b', 'hep b', 'hbsag'],
    'Hepatitis-C-antibody': ['hepatitis c', 'hep c', 'hcv'],
    'syphilis': ['syphilis', 'vdrl', 'rpr'],
    'gonorrhea': ['gonorrhea', 'gc'],
    'chlamydia': ['chlamydia']
  };

  // Check for mention of STI testing
  const stiTestMentioned = lowerText.includes('sti') ||
                           lowerText.includes('std') ||
                           lowerText.includes('infectious disease') ||
                           lowerText.includes('blood test');

  Object.keys(testKeywords).forEach(test => {
    testKeywords[test].forEach(keyword => {
      if (lowerText.includes(keyword)) {
        // Try to determine if positive or negative
        const contextStart = Math.max(0, lowerText.indexOf(keyword) - 20);
        const contextEnd = Math.min(lowerText.length, lowerText.indexOf(keyword) + keyword.length + 20);
        const context = lowerText.substring(contextStart, contextEnd);

        if (context.includes('negative') || context.includes('clear')) {
          tests[test] = 'negative';
        } else if (context.includes('positive')) {
          tests[test] = 'positive';
        } else if (stiTestMentioned) {
          tests[test] = 'negative'; // Assume negative if testing mentioned but no result stated
        }
      }
    });
  });

  return tests;
}

/**
 * Extract psychological information
 */
function extractPsychologicalInfo(text) {
  const psychInfo = {
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
  };

  const lowerText = text.toLowerCase();

  // Psychological evaluation
  if (lowerText.includes('psych eval') ||
      lowerText.includes('psychological evaluation') ||
      lowerText.includes('mental health evaluation')) {
    psychInfo.hasCompletedEvaluation = true;
  }

  // Medications
  const medicationKeywords = ['antidepressant', 'ssri', 'antipsychotic', 'mood stabilizer',
                               'psych medication', 'zoloft', 'prozac', 'lexapro', 'wellbutrin'];
  medicationKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      psychInfo.currentPsychotropicMedication = true;
    }
  });

  // Mental health history
  if (lowerText.includes('depression') && !lowerText.includes('no depression')) {
    psychInfo.historyOfMajorDepression = true;
  }

  if (lowerText.includes('bipolar')) {
    psychInfo.historyOfBipolarDisorder = true;
  }

  if (lowerText.includes('psychosis') || lowerText.includes('schizophrenia')) {
    psychInfo.historyOfPsychosis = true;
  }

  if (lowerText.includes('anxiety') && !lowerText.includes('no anxiety')) {
    psychInfo.historyOfAnxietyDisorder = true;
  }

  if (lowerText.includes('eating disorder') || lowerText.includes('anorexia') ||
      lowerText.includes('bulimia')) {
    psychInfo.historyOfEatingDisorder = true;
  }

  // Substance use
  const substanceKeywords = ['alcoholic', 'drug abuse', 'addiction', 'substance abuse',
                             'rehab', 'recovery'];
  substanceKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      psychInfo.historyOfSubstanceAbuse = true;
    }
  });

  // Abuse history
  if (lowerText.includes('abuse') &&
      (lowerText.includes('physical') || lowerText.includes('sexual') ||
       lowerText.includes('emotional') || lowerText.includes('domestic'))) {
    psychInfo.historyOfAbuse = true;
  }

  // Coercion
  const coercionKeywords = ['coerced', 'forced', 'pressured', 'desperate for money',
                            'financial hardship'];
  coercionKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      psychInfo.evidenceOfCoercion = true;
    }
  });

  // Support system
  if (lowerText.includes('no support') || lowerText.includes('lack of support') ||
      lowerText.includes('unsupportive')) {
    psychInfo.adequateSupportSystem = false;
  }

  if (lowerText.includes('supportive') || lowerText.includes('strong support') ||
      lowerText.includes('family support')) {
    psychInfo.adequateSupportSystem = true;
  }

  // Stability
  if (lowerText.includes('unstable') || lowerText.includes('chaotic') ||
      lowerText.includes('crisis') || lowerText.includes('stressful situation')) {
    psychInfo.stableEnvironment = false;
  }

  return psychInfo;
}

/**
 * Extract lifestyle information
 */
function extractLifestyleInfo(text) {
  const lifestyle = {
    bmi: undefined,
    currentSmoker: false,
    currentAlcoholUse: 'none',
    currentDrugUse: false,
    recentTattoos: false
  };

  const lowerText = text.toLowerCase();

  // BMI
  const bmiPattern = /bmi[:\s]+(\d{2}(?:\.\d+)?)/i;
  const bmiMatch = text.match(bmiPattern);
  if (bmiMatch) {
    const parsedBMI = parseFloat(bmiMatch[1]);
    // Only accept BMI values in surrogate candidate range (18-37)
    if (parsedBMI >= 18 && parsedBMI <= 37) {
      lifestyle.bmi = parsedBMI;
    }
  }

  // Weight/height for BMI calculation
  const weightPattern = /(\d{2,3})\s*(?:lbs?|pounds)/i;
  const heightPattern = /(\d)\s*['\u2032]\s*(\d{1,2})\s*["\u2033]?/; // 5'6"

  const weightMatch = text.match(weightPattern);
  const heightMatch = text.match(heightPattern);

  if (weightMatch && heightMatch && !lifestyle.bmi) {
    const weightLbs = parseInt(weightMatch[1], 10);
    const feet = parseInt(heightMatch[1], 10);
    const inches = parseInt(heightMatch[2], 10);
    const heightInches = feet * 12 + inches;
    const calculatedBMI = (weightLbs / (heightInches * heightInches)) * 703;
    const roundedBMI = Math.round(calculatedBMI * 10) / 10; // Round to 1 decimal

    // Only accept BMI values in surrogate candidate range (18-37)
    if (roundedBMI >= 18 && roundedBMI <= 37) {
      lifestyle.bmi = roundedBMI;
    }
  }

  // Smoking - DEFAULT TO FALSE (not a smoker)
  // Rationale: Current smokers wouldn't be in the candidate pool at all
  // ONLY flag as current smoker if VERY explicitly stated as current/active smoking
  lifestyle.currentSmoker = false; // Default to false

  if (lowerText.includes('current smoker') || lowerText.includes('currently smokes') ||
      lowerText.includes('active smoker') ||
      lowerText.includes('smokes daily') || lowerText.includes('smokes regularly') ||
      (lowerText.includes('tobacco:') && lowerText.includes('yes')) ||
      (lowerText.includes('tobacco use:') && lowerText.includes('current'))) {
    lifestyle.currentSmoker = true;
  }

  // Alcohol
  if (lowerText.includes('drinks alcohol') || lowerText.includes('social drinker')) {
    lifestyle.currentAlcoholUse = 'social';
  }

  if (lowerText.includes('heavy drinker') || lowerText.includes('excessive') ||
      lowerText.includes('alcoholic')) {
    lifestyle.currentAlcoholUse = 'excessive';
  }

  if (lowerText.includes('no alcohol') || lowerText.includes('doesn\'t drink') ||
      lowerText.includes('non-drinker')) {
    lifestyle.currentAlcoholUse = 'none';
  }

  // Drug use - DEFAULT TO FALSE (not using drugs)
  // Rationale: Current drug users wouldn't be in the candidate pool at all
  // ONLY flag as current drug user if VERY explicitly stated
  lifestyle.currentDrugUse = false; // Default to false

  if (lowerText.includes('current drug use') || lowerText.includes('currently uses drugs') ||
      lowerText.includes('active drug use') || lowerText.includes('uses marijuana') ||
      lowerText.includes('recreational drug use') ||
      (lowerText.includes('drug use:') && lowerText.includes('yes')) ||
      (lowerText.includes('drug use:') && lowerText.includes('current'))) {
    lifestyle.currentDrugUse = true;
  }

  // Tattoos
  if (lowerText.includes('recent tattoo') || lowerText.includes('recently tattooed') ||
      lowerText.includes('new tattoo')) {
    lifestyle.recentTattoos = true;
  }

  return lifestyle;
}

/**
 * Extract environmental/stability information
 */
function extractEnvironmentalInfo(text) {
  const environmental = {
    stableHousing: true,
    stableEmployment: true,
    adequateFinancialSituation: true,
    stableRelationship: true,
    supportivePartner: true,
    legalIssues: false
  };

  const lowerText = text.toLowerCase();

  // Housing
  if (lowerText.includes('homeless') || lowerText.includes('unstable housing') ||
      lowerText.includes('moving frequently')) {
    environmental.stableHousing = false;
  }

  // Employment
  if (lowerText.includes('unemployed') || lowerText.includes('no job') ||
      lowerText.includes('unstable employment')) {
    environmental.stableEmployment = false;
  }

  if (lowerText.includes('employed') || lowerText.includes('has a job') ||
      lowerText.includes('works as')) {
    environmental.stableEmployment = true;
  }

  // Financial
  if (lowerText.includes('financial hardship') || lowerText.includes('bankruptcy') ||
      lowerText.includes('desperate for money') || lowerText.includes('financial crisis')) {
    environmental.adequateFinancialSituation = false;
  }

  // Relationship
  if (lowerText.includes('divorce') || lowerText.includes('separated') ||
      lowerText.includes('relationship problems') || lowerText.includes('unstable relationship')) {
    environmental.stableRelationship = false;
  }

  if (lowerText.includes('married') || lowerText.includes('stable relationship') ||
      lowerText.includes('long-term partner')) {
    environmental.stableRelationship = true;
  }

  // Partner support
  if (lowerText.includes('unsupportive partner') || lowerText.includes('partner opposed') ||
      lowerText.includes('against surrogacy')) {
    environmental.supportivePartner = false;
  }

  if (lowerText.includes('supportive partner') || lowerText.includes('partner supports') ||
      lowerText.includes('husband supports')) {
    environmental.supportivePartner = true;
  }

  // Legal issues
  const legalKeywords = ['custody dispute', 'legal issues', 'criminal record',
                         'bankruptcy', 'restraining order', 'cps', 'child protective'];
  legalKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      environmental.legalIssues = true;
    }
  });

  return environmental;
}

/**
 * Extract all information and create a structured summary
 */
export function extractAndSummarize(text) {
  const data = parseTextInput(text);

  const summary = {
    extractedData: data,
    confidence: calculateConfidence(text, data),
    missingInformation: identifyMissingInfo(data)
  };

  return summary;
}

/**
 * Calculate confidence in the extraction
 */
function calculateConfidence(text, data) {
  let confidence = {
    overall: 0,
    details: {}
  };

  let totalFields = 0;
  let extractedFields = 0;

  // Check each major field
  if (data.age !== undefined) {
    extractedFields++;
    confidence.details.age = 'high';
  }
  totalFields++;

  if (data.pregnancyHistory.hasCompletedPregnancy) {
    extractedFields++;
    confidence.details.pregnancyHistory = 'medium';
  }
  totalFields++;

  if (data.medicalConditions.length > 0 || text.toLowerCase().includes('healthy')) {
    extractedFields++;
    confidence.details.medicalConditions = 'medium';
  }
  totalFields++;

  if (Object.keys(data.infectiousDiseaseTests).length > 0) {
    extractedFields++;
    confidence.details.infectiousDiseaseTests = 'low';
  }
  totalFields++;

  if (data.lifestyle.bmi !== undefined) {
    extractedFields++;
    confidence.details.lifestyle = 'high';
  }
  totalFields++;

  confidence.overall = (extractedFields / totalFields) * 100;

  return confidence;
}

/**
 * Identify what information is missing
 */
function identifyMissingInfo(data) {
  const missing = [];

  if (data.age === undefined) {
    missing.push('Age');
  }

  if (!data.pregnancyHistory.hasCompletedPregnancy) {
    missing.push('Pregnancy history details');
  }

  if (Object.keys(data.infectiousDiseaseTests).length === 0) {
    missing.push('Infectious disease test results');
  }

  if (!data.psychological.hasCompletedEvaluation) {
    missing.push('Psychological evaluation status');
  }

  if (data.lifestyle.bmi === undefined) {
    missing.push('BMI or height/weight');
  }

  return missing;
}
