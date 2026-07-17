// Vercel serverless function to proxy Claude API calls
// Keeps API key secure on server side
// Updated: 2025-01-06 - Using Claude 3 Sonnet

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get API key from environment variable (NOT VITE_ prefixed)
  const apiKey = process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    console.error('CLAUDE_API_KEY environment variable not set');
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { medicalText, candidateName, userProvidedData } = req.body;

    if (!medicalText) {
      return res.status(400).json({ error: 'Medical text is required' });
    }

    // De-identify the text before sending to Claude
    const deidentifiedText = medicalText.replace(new RegExp(candidateName, 'gi'), '[PATIENT]');

    // Build context section with user-provided data
    let contextSection = '';
    if (userProvidedData && (userProvidedData.age || userProvidedData.bmi || userProvidedData.additionalInfo)) {
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

    // Build the prompt for Claude - COMPREHENSIVE VERSION
    const prompt = `You are a medical data extractor for gestational carrier (surrogate) screening. The input may be formal medical records, plain English descriptions, or questions containing medical data (e.g. "is a BMI of 35 ok?" or "she has had 5 pregnancies and GDM"). Extract ALL factual candidate data regardless of how it is phrased.

IMPORTANT RULES:
1. **ONLY extract CONFIRMED ACTIVE diagnoses** - Do NOT include:
   - Family history (e.g., "mother has diabetes" - NOT the candidate's condition)
   - Differential diagnoses or "rule out" conditions (e.g., "r/o cardiac disease" - NOT confirmed)
   - Past resolved conditions (e.g., "history of asthma as child, resolved" - NOT active)
   - Conditions mentioned in background/review of systems without confirmation
   - Example: If record says "denies cardiac disease" or "no history of kidney disease" - DO NOT add these
2. Count complications intelligently - group related issues together
   - Example: "hyperemesis + PICC line + TPN + hospitalization" = 1 complication (severe hyperemesis)
   - Example: "gastroparesis + severe GERD + gallstones in same pregnancy" = 1 complication (GI complications)
3. Distinguish between pregnancy-induced conditions vs chronic conditions
   - PIH, gestational hypertension = pregnancy-related
   - Chronic hypertension, essential hypertension = chronic condition
4. Extract complications PER PREGNANCY, then count total unique complication types
5. Do NOT make recommendations or predictions - just extract facts
6. NOTE: Patient identifiers have been removed for privacy (HIPAA compliance)
7. Extract age and BMI if mentioned anywhere in the input, including in question form (e.g. "is age 42 ok?" → age: 42, "BMI of 35" → bmi: 35)
8. CRITICAL - Preterm labor/birth definition (READ CAREFULLY):
   - Preterm = delivery BEFORE 37 weeks gestational age ONLY
   - 37 weeks or later = FULL TERM (NOT preterm)
   - "Prolonged labor", "prodromal labor", "slow labor" = NOT preterm
9. CRITICAL - Membrane rupture (NOT complications):
   - AROM, amniotomy, rupture of membranes with Pitocin = ROUTINE PROCEDURES (NOT complications)
   - ONLY count as complication if PPROM before 37 weeks
10. CRITICAL - Incomplete documentation:
   - If records only document through a certain week but don't include delivery records, note as documentation gap
${contextSection}
Input:
${deidentifiedText}

Return a JSON object with this EXACT structure (matches frontend expectations):
{
  "age": number or null,
  "pregnancyHistory": {
    "numberOfTermPregnancies": <number - count actual pregnancies/deliveries, NOT years or dates>,
    "numberOfCesareans": <number - count C-sections, NOT years>,
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
    "<ONLY confirmed ACTIVE chronic conditions - NOT pregnancy complications, NOT family history, NOT ruled out, NOT 'denies' statements. CRITICAL: Do NOT include conditions like cardiac_disease, kidney_disease, thyroid_disorder, asthma, cancer if they appear in 'denies' or 'no history of' or 'family history' context. Examples of ACTUAL conditions to include: hypertension (if currently diagnosed), diabetes (if currently diagnosed), hypothyroidism (if currently treated)>"
  ],
  "surgicalHistory": [
    "<procedures like cholecystectomy, tubal ligation, appendectomy, etc - NOT C-sections (those go in pregnancyHistory)>"
  ],
  "documentationGaps": [
    "<list any incomplete documentation issues or empty array if complete>"
  ],
  "pregnancySummary": "A detailed chronological narrative of each pregnancy separated by \\n\\n"
}

Return ONLY the JSON object with this EXACT structure, no other text. If a field has no data, use null or empty array:
{
  "age": <number or null - extract if mentioned anywhere, even in a question>,
  "bmi": <number or null - extract if mentioned anywhere, even in a question>,
  "pregnancyHistory": {
    "numberOfTermPregnancies": <number>,
    "numberOfCesareans": <number>,
    "numberOfComplications": <number>,
    "complications": [{ "pregnancy": <number>, "category": "<hyperemesis|gi_complications|preeclampsia|gestational_diabetes|preterm_labor|placental_issues|hemorrhage|iugr|membrane_rupture|cholestasis|cerclage>", "description": "<brief>", "severity": "<mild|moderate|severe>" }]
  },
  "medicalConditions": ["<confirmed active chronic conditions only>"],
  "surgicalHistory": ["<procedures>"],
  "documentationGaps": ["<incomplete documentation issues>"],
  "pregnancySummary": "<chronological narrative of pregnancies, blank line between each>"
}`;

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Claude API request failed',
        details: errorText
      });
    }

    const data = await response.json();

    // Extract the text content from Claude's response
    const claudeText = data.content[0].text;

    // Parse the JSON from Claude's response
    // Remove markdown code blocks if present
    const jsonMatch = claudeText.match(/```json\n([\s\S]*?)\n```/) || claudeText.match(/```\n([\s\S]*?)\n```/);
    const jsonText = jsonMatch ? jsonMatch[1] : claudeText;

    const parsedData = JSON.parse(jsonText);

    return res.status(200).json({
      success: true,
      data: parsedData,
      claudeUsed: true
    });

  } catch (error) {
    console.error('Error processing Claude request:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
