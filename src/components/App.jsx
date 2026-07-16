// Risk Ranger v2.0.1 - Claude AI serverless functions
import { useState } from 'react';
import './App.css';
import { parseTextInput, extractAndSummarize } from '../utils/textParser.js';
import { parseMedicalText } from '../utils/cascadingParser.js';
import { performComprehensiveAssessment, RISK_LEVELS } from '../assessments/riskAssessment.js';
import { getAcceptanceProbabilityDescription, getClearanceBadgeText, getClearanceBadgeColor, ACCEPTANCE_LEVELS } from '../assessments/clinicTypeAssessment.js';
import { getMFMReviewDescription, getMFMLikelihoodDescription, MFM_LIKELIHOOD } from '../assessments/mfmAssessment.js';
import { MEDICAL_GLOSSARY, getGlossaryByCategory } from '../utils/medicalGlossary.js';
import { parseDocument } from '../utils/simplePdfParser.js';
import { parseWithClaude, shouldUseClaude } from '../utils/claudeParser.js';
import { generatePDFReport } from '../utils/pdfGenerator.js';
import { generateClinicalNarratives, generateFallbackNarratives } from '../utils/narrativeGenerator.js';
import { getRiskFactorInfo, getRiskLevelBadge } from '../data/riskFactorDatabase.js';
import MFMemo from './MFMemo.jsx';

function App() {
  const [inputMode, setInputMode] = useState('text'); // 'text' or 'structured'
  const [candidateName, setCandidateName] = useState('');
  const [textInput, setTextInput] = useState('');
  const [structuredInput, setStructuredInput] = useState('');
  const [candidateAge, setCandidateAge] = useState('');
  const [candidateBMI, setCandidateBMI] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [results, setResults] = useState(null);
  const [extractionSummary, setExtractionSummary] = useState(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showHowToUse, setShowHowToUse] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const [showMFMemo, setShowMFMemo] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [clinicalNarratives, setClinicalNarratives] = useState(null);

  // Brand colors - Alcea Surrogacy Branding
  const rubyRed = '#7d2431';
  const darkGreen = '#217045';
  const mustardYellow = '#e1b321';
  const goldBrown = '#a5630b';
  const darkTeal = '#005567';

  const handleFileUpload = async (event) => {
    console.log('handleFileUpload called');
    const files = Array.from(event.target.files);
    console.log('Files selected:', files.length);

    if (files.length === 0) return;

    if (files.length === 1) {
      // Single file - process normally
      const file = files[0];
      setUploadedFileName(file.name);

      try {
        // Show loading state
        setResults({ loading: true, fileName: file.name });

        // Use the PDF parser for all file types
        const result = await parseDocument(file);

        if (result.success) {
          // Successfully parsed - analyze directly without showing raw text
          console.log(`Successfully parsed ${result.fileType.toUpperCase()} file:`, result.fileName);
          console.log('Parsed text length:', result.text.length);

          let candidateData;

          // Use cascading parser (Layers 1-3) - same as text analysis
          console.log('Using cascading parser for file upload...');
          setResults({ loading: true, fileName: file.name, usingClaude: true });

          candidateData = await parseMedicalText(result.text, {
            useClaudeParser: true, // Always use Claude (API key on server)
            candidateName: candidateName,
            userProvidedData: {
              age: candidateAge,
              bmi: candidateBMI,
              additionalInfo: additionalInfo
            }
          });
          console.log('Cascading parser result:', candidateData);

          // Extract and analyze the data
          const summary = extractAndSummarize(result.text);
          console.log('Summary:', summary);

          const assessment = performComprehensiveAssessment(candidateData);
          console.log('Assessment:', assessment);

          // Show results
          setExtractionSummary(summary);
          // Add candidate data to the assessment results so PDF can access it
          candidateData.name = candidateName || 'The candidate';
          assessment.candidateData = candidateData;
          setResults(assessment);
          console.log('Results set successfully');
          console.log('Assessment results:', assessment);
          console.log('Candidate data:', candidateData);

          // Generate clinical narratives using Claude
          console.log('Generating clinical narratives with Claude...');
          try {
            const narratives = await generateClinicalNarratives(candidateData, assessment);
            setClinicalNarratives(narratives);
            console.log('Clinical narratives generated:', narratives);
          } catch (narrativeError) {
            console.error('Failed to generate narratives with Claude, using fallback:', narrativeError);
            const fallbackNarratives = generateFallbackNarratives(candidateData, assessment);
            setClinicalNarratives(fallbackNarratives);
          }

          // Scroll to results after a brief delay to allow rendering
          setTimeout(() => {
            const resultsSection = document.querySelector('.results-section-full-width');
            if (resultsSection) {
              resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);

          // Don't put the text in the text box - just analyzed in background
        } else {
          // Failed to parse
          alert(`Failed to parse ${file.name}:\n${result.error}\n\nPlease try:\n1. Converting to TXT format\n2. Or copy/paste the text manually`);
          setUploadedFileName('');
          setResults(null);
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        alert(`Error processing file: ${error.message}\n\nPlease try converting to TXT format or copy/paste the text manually.`);
        setUploadedFileName('');
        setResults(null);
      }
    } else {
      // Multiple files - combine all text and analyze together
      setUploadedFileName(`${files.length} files`);
      setResults({ loading: true, fileName: `${files.length} files` });

      try {
        let combinedText = '';
        let successCount = 0;
        let failedFiles = [];

        for (const file of files) {
          const result = await parseDocument(file);
          if (result.success) {
            combinedText += `\n\n=== FILE: ${file.name} ===\n${result.text}\n`;
            successCount++;
            console.log(`Successfully parsed ${result.fileType.toUpperCase()} file:`, result.fileName);
          } else {
            failedFiles.push(`${file.name}: ${result.error}`);
          }
        }

        if (successCount > 0) {
          let candidateData;

          // Use cascading parser (Layers 1-3) - same as text analysis
          console.log('Using cascading parser for combined files...');
          setResults({ loading: true, fileName: `${files.length} files`, usingClaude: true });

          candidateData = await parseMedicalText(combinedText, {
            useClaudeParser: true, // Always use Claude (API key on server)
            candidateName: candidateName,
            userProvidedData: {
              age: candidateAge,
              bmi: candidateBMI,
              additionalInfo: additionalInfo
            }
          });
          console.log('Cascading parser result:', candidateData);

          // Analyze combined text from all files
          const summary = extractAndSummarize(combinedText);
          const assessment = performComprehensiveAssessment(candidateData);

          // Show results
          setExtractionSummary(summary);
          // Add candidate data to the assessment results so PDF can access it
          candidateData.name = candidateName || 'The candidate';
          assessment.candidateData = candidateData;
          setResults(assessment);

          // Generate clinical narratives
          try {
            const narratives = await generateClinicalNarratives(candidateData, assessment);
            setClinicalNarratives(narratives);
          } catch (narrativeError) {
            console.error('Failed to generate narratives, using fallback:', narrativeError);
            setClinicalNarratives(generateFallbackNarratives(candidateData, assessment));
          }

          // Scroll to results after a brief delay to allow rendering
          setTimeout(() => {
            const resultsSection = document.querySelector('.results-section-full-width');
            if (resultsSection) {
              resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);

          // Show summary of what was processed
          let message = `Successfully analyzed ${successCount} of ${files.length} files.`;
          if (failedFiles.length > 0) {
            message += `\n\nFailed to parse:\n${failedFiles.join('\n')}`;
            alert(message);
          }
        } else {
          alert(`Failed to parse any files:\n${failedFiles.join('\n')}`);
          setUploadedFileName('');
          setResults(null);
        }
      } catch (error) {
        console.error('Error processing files:', error);
        alert(`Error processing files: ${error.message}`);
        setUploadedFileName('');
        setResults(null);
      }
    }
  };

  const handleTextAnalysis = async () => {
    console.log('handleTextAnalysis called');
    console.log('textInput:', textInput);

    // Validate input before analyzing
    if (!textInput || textInput.trim() === '') {
      // Only show alert if there are no results already displayed from file upload
      if (!results || results.loading) {
        alert('Please enter candidate information in the text box or upload a medical record file.');
      }
      return;
    }

    try {
      console.log('Starting analysis with cascading parser...');

      // Show loading state
      setResults({ loading: true });

      // Use cascading parser (Layers 1-3)
      const candidateData = await parseMedicalText(textInput, {
        candidateName: candidateName,
        userProvidedData: {
          age: candidateAge,
          bmi: candidateBMI
        },
        useClaudeParser: true // Always use Claude (API key on server)
      });

      candidateData.name = candidateName || 'The candidate';

      // Create summary from cascading parser results (after parsing completes)
      const summary = {
        extractedData: candidateData,
        confidence: candidateData.parsingMetadata?.finalConfidence || 70,
        missingInformation: identifyMissingInfo(candidateData)
      };
      setExtractionSummary(summary);

      // Helper function to identify missing information
      function identifyMissingInfo(data) {
        const missing = [];
        if (!data.age) missing.push('age');
        if (!data.pregnancyHistory?.hasCompletedPregnancy) missing.push('pregnancy history');
        if (!data.lifestyle?.bmi) missing.push('BMI');
        if (!data.medicalConditions || data.medicalConditions.length === 0) missing.push('medical conditions');
        return missing;
      }

      // Perform risk assessment
      const assessment = performComprehensiveAssessment(candidateData);

      // Add candidate data to the assessment results so PDF can access it
      assessment.candidateData = candidateData;
      setResults(assessment);

      // Generate clinical narratives
      try {
        const narratives = await generateClinicalNarratives(candidateData, assessment);
        setClinicalNarratives(narratives);
      } catch (narrativeError) {
        console.error('Failed to generate narratives, using fallback:', narrativeError);
        setClinicalNarratives(generateFallbackNarratives(candidateData, assessment));
      }

      // Scroll to results after a brief delay to allow rendering
      setTimeout(() => {
        const resultsSection = document.querySelector('.results-section-full-width');
        if (resultsSection) {
          resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (error) {
      console.error('Error analyzing input:', error);
      alert('Error analyzing input: ' + error.message);
      setResults(null);
    }
  };

  const handleStructuredAnalysis = () => {
    try {
      const candidateData = JSON.parse(structuredInput);
      const assessment = performComprehensiveAssessment(candidateData);
      setResults(assessment);
      setExtractionSummary(null);
    } catch (error) {
      alert('Error parsing JSON: ' + error.message);
    }
  };

  const handleReset = () => {
    setTextInput('');
    setStructuredInput('');
    setResults(null);
    setExtractionSummary(null);
    setUploadedFileName('');
  };

  const getRiskColor = (riskLevel) => {
    switch (riskLevel) {
      case RISK_LEVELS.ELIGIBLE:
        return '#10b981'; // green
      case RISK_LEVELS.REQUIRES_COUNSELING:
        return '#f59e0b'; // yellow/orange
      case RISK_LEVELS.HIGH_RISK:
        return '#ef4444'; // red
      case RISK_LEVELS.DISQUALIFIED:
        return '#7f1d1d'; // dark red
      default:
        return '#6b7280'; // gray
    }
  };

  const getAcceptanceColor = (acceptanceLevel) => {
    switch (acceptanceLevel) {
      case ACCEPTANCE_LEVELS.HIGHLY_LIKELY:
        return '#10b981'; // green
      case ACCEPTANCE_LEVELS.LIKELY:
        return '#84cc16'; // light green
      case ACCEPTANCE_LEVELS.POSSIBLE:
        return '#f59e0b'; // orange
      case ACCEPTANCE_LEVELS.UNLIKELY:
        return '#ef4444'; // red
      case ACCEPTANCE_LEVELS.VERY_UNLIKELY:
        return '#7f1d1d'; // dark red
      default:
        return '#6b7280'; // gray
    }
  };

  const getMFMColor = (likelihood) => {
    switch (likelihood) {
      case MFM_LIKELIHOOD.LIKELY_APPROVE:
        return '#10b981'; // green
      case MFM_LIKELIHOOD.POSSIBLY_APPROVE:
        return '#f59e0b'; // orange
      case MFM_LIKELIHOOD.UNLIKELY_APPROVE:
        return '#ef4444'; // red
      case MFM_LIKELIHOOD.LIKELY_DENY:
        return '#7f1d1d'; // dark red
      default:
        return '#6b7280'; // gray
    }
  };

  const generateLaymansOverview = (candidateData, assessmentResults) => {
    const overview = [];

    // Basic demographics
    if (candidateData.age) {
      overview.push(`${candidateData.age} years old`);
    }

    if (candidateData.height && candidateData.weight) {
      overview.push(`${candidateData.height}, ${candidateData.weight} lbs`);
      if (candidateData.bmi) {
        overview.push(`BMI ${candidateData.bmi.toFixed(1)}`);
      }
    }

    // Pregnancy history
    if (candidateData.pregnancyHistory?.numberOfTermPregnancies) {
      const numPreg = candidateData.pregnancyHistory.numberOfTermPregnancies;
      overview.push(`${numPreg} previous pregnanc${numPreg > 1 ? 'ies' : 'y'}`);

      if (candidateData.pregnancyHistory.numberOfCesareans > 0) {
        const numCS = candidateData.pregnancyHistory.numberOfCesareans;
        overview.push(`${numCS} C-section${numCS > 1 ? 's' : ''}`);
      }

      if (candidateData.pregnancyHistory.numberOfComplications > 0) {
        const numComp = candidateData.pregnancyHistory.numberOfComplications;

        // Build complications list if available
        let compText = `${numComp} pregnancy complication${numComp > 1 ? 's' : ''}`;
        if (candidateData.pregnancyHistory.complications && candidateData.pregnancyHistory.complications.length > 0) {
          const compNames = candidateData.pregnancyHistory.complications.map(comp => {
            const category = comp.category.replace(/_/g, ' ');
            return category.charAt(0).toUpperCase() + category.slice(1);
          });
          compText += ` (${compNames.join(', ')})`;
        }

        overview.push(compText);
      }
    }

    // Medical conditions found - combine general conditions and pregnancy-specific complications
    const allConditions = [];

    // Add general medical conditions
    if (candidateData.medicalConditions && candidateData.medicalConditions.length > 0) {
      candidateData.medicalConditions.forEach(c => {
        if (c === 'pregnancy_hypertension') allConditions.push('pregnancy-induced hypertension (PIH)');
        else if (c === 'gestational_diabetes') allConditions.push('gestational diabetes');
        else if (c === 'preeclampsia') allConditions.push('preeclampsia');
        else if (c === 'hypertension') allConditions.push('chronic hypertension');
        else allConditions.push(c.replace(/_/g, ' '));
      });
    }

    // Add pregnancy-specific complications from cascading parser
    if (candidateData.pregnancySpecificComplications) {
      const complications = candidateData.pregnancySpecificComplications;

      // Map abbreviations to full readable names
      const abbreviationMap = {
        'GDM': 'gestational diabetes',
        'GD': 'gestational diabetes',
        'PIH': 'pregnancy-induced hypertension',
        'PE': 'preeclampsia',
        'HELLP': 'HELLP syndrome',
        'IUGR': 'intrauterine growth restriction',
        'PPROM': 'preterm premature rupture of membranes',
        'PROM': 'premature rupture of membranes',
        'PTL': 'preterm labor',
        'PTB': 'preterm birth',
        'ICP': 'intrahepatic cholestasis of pregnancy',
        'PPH': 'postpartum hemorrhage'
      };

      Object.entries(complications).forEach(([category, data]) => {
        if (data.found && data.mentions && data.mentions.length > 0) {
          const mention = data.mentions[0];
          // Expand abbreviation to full name, or use as-is if not in map
          const conditionName = abbreviationMap[mention.toUpperCase()] || mention;
          // Don't duplicate if already in allConditions
          if (!allConditions.some(c => c.toLowerCase().includes(conditionName.toLowerCase()))) {
            allConditions.push(conditionName);
          }
        }
      });
    }

    if (allConditions.length > 0) {
      overview.push(`Medical history: ${allConditions.join(', ')}`);
    }

    // Lifestyle
    if (candidateData.lifestyle?.currentSmoker) {
      overview.push('Current smoker');
    }
    if (candidateData.lifestyle?.currentDrugUse) {
      overview.push('Current drug use');
    }

    return overview;
  };

  const exampleText = `Sarah is a 28-year-old woman interested in becoming a gestational carrier. She has had 2 previous uncomplicated pregnancies, both vaginal deliveries. She's 5'6" and weighs 145 lbs. She's a non-smoker and doesn't use drugs. She's married with a supportive husband and has a stable job as a teacher. She completed her STI screening and all tests came back negative. She has no significant medical history and is generally healthy.`;

  const exampleJSON = {
    age: 28,
    pregnancyHistory: {
      hasCompletedPregnancy: true,
      numberOfTermPregnancies: 2,
      numberOfComplications: 0,
      totalDeliveries: 2,
      numberOfCesareans: 0
    },
    medicalConditions: [],
    infectiousDiseaseTests: {
      'HIV-1': 'negative',
      'HIV-2': 'negative',
      'Hepatitis-B-surface-antigen': 'negative',
      'Hepatitis-C-antibody': 'negative',
      'syphilis': 'negative',
      'gonorrhea': 'negative',
      'chlamydia': 'negative'
    },
    psychological: {
      hasCompletedEvaluation: true,
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
      bmi: 23.4,
      currentSmoker: false,
      currentAlcoholUse: 'social',
      currentDrugUse: false,
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

  return (
    <>
      <div className="app">
        <div className="app-container-single">
        {/* Single Column Layout - matches NeoNearBy */}
        <div className="main-content-full">
        <div className="main-card">
          <div className="app-header">
            <img src="/riskrangerlogo.png" alt="Risk Ranger" className="header-logo" />
          </div>

          {/* Action Buttons Row - matches NeoNearBy */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', padding: '0 12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowHowToUse(true)}
              style={{
                flex: 1,
                backgroundColor: goldBrown,
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>❓</span>
              <span>How To Use</span>
            </button>

            <button
              onClick={() => {
                setShowMFMemo(!showMFMemo);
                setShowMethod(false);
                setShowHowToUse(false);
              }}
              style={{
                flex: 1,
                backgroundColor: showMFMemo ? rubyRed : darkTeal,
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>🏥</span>
              <span>MFMemo</span>
            </button>

            <button
              onClick={() => setShowMethod(true)}
              style={{
                flex: 1,
                backgroundColor: mustardYellow,
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>📋</span>
              <span>Method</span>
            </button>
          </div>

          <div className="input-section">
            <div className="text-input-section">
              {/* Section Header - matches NeoNearBy style */}
              <div style={{
                background: '#7d2431',
                color: 'white',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '16px',
                fontWeight: '600'
              }}>
                <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Analyze Pregnancy Risks
              </div>

              {/* Demographics Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <label htmlFor="candidate-name" style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
                    Candidate Name <span style={{ fontWeight: 'normal', color: '#d97706', fontSize: '12px' }}>(required)</span>
                  </label>
                  <input
                    type="text"
                    id="candidate-name"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Full name"
                    style={{ width: '100%', padding: '8px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label htmlFor="candidate-age" style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
                    Age <span style={{ fontWeight: 'normal', color: '#9ca3af', fontSize: '12px' }}>(optional)</span>
                  </label>
                  <input
                    type="number"
                    id="candidate-age"
                    value={candidateAge}
                    onChange={(e) => setCandidateAge(e.target.value)}
                    placeholder="e.g., 32"
                    style={{ width: '100%', padding: '8px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label htmlFor="candidate-bmi" style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
                    BMI <span style={{ fontWeight: 'normal', color: '#9ca3af', fontSize: '12px' }}>(optional)</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    id="candidate-bmi"
                    value={candidateBMI}
                    onChange={(e) => setCandidateBMI(e.target.value)}
                    placeholder="e.g., 24.5"
                    style={{ width: '100%', padding: '8px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              </div>

              {/* Ask Question Section */}
              <div style={{ marginTop: '20px' }}>
                <label htmlFor="text-input" style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
                  Ask Question <span style={{ fontWeight: 'normal', color: '#9ca3af', fontSize: '12px' }}>(optional)</span>
                </label>
                <textarea
                  id="text-input"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Enter candidate information. Example:&#10;2 previous healthy pregnancies, vaginal deliveries, GD in last pregnancy, diet-controlled.&#10;Or paste medical records, lab results, etc. here."
                  rows={4}
                  style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '4px', fontFamily: 'inherit' }}
                />
              </div>

              {/* "and/or" separator */}
              <div style={{ textAlign: 'center', margin: '15px 0', fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
                and/or
              </div>

              {/* Medical Records Upload */}
              <div className="upload-section">
                <input
                  type="file"
                  id="file-upload"
                  accept=".txt,.pdf,.doc,.docx"
                  multiple
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <label htmlFor="file-upload" className="btn-upload">
                  📄 Upload Pregnancy Records (Auto-Analyzes)
                </label>
                {uploadedFileName && (
                  <span className="uploaded-file-name">
                    ✓ {uploadedFileName}
                  </span>
                )}
              </div>

              {/* Analyze and Reset Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button
                  onClick={handleTextAnalysis}
                  style={{
                    flex: 1,
                    backgroundColor: rubyRed,
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '14px 24px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Analyze
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    flex: 1,
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '14px 24px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Reset
                </button>
              </div>

              {/* MFM Alert */}
              {results && results.candidateData && results.candidateData.pregnancyHistory?.numberOfComplications > 1 && (
                <div style={{
                  marginTop: '16px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                }}>
                  <span style={{ fontSize: '24px' }}>🏥</span>
                  <span>MFM Suggested</span>
                </div>
              )}
            </div>
          </div>
        </div>
        </div> {/* End main-content-full */}
        </div> {/* End app-container-single */}
      </div> {/* End app */}

      {/* Results Section - Full Width Below */}
      {results && (
        <div className="results-section-full-width">
          {results.loading ? (
            <div className="loading-state">
              <h2>Analyzing {results.fileName}...</h2>
              {results.usingClaude ? (
                <p>🤖 Using AI-powered medical record parser to extract pregnancy history, complications, and conditions...</p>
              ) : (
                <p>Extracting medical information and performing risk assessment...</p>
              )}
              <div className="loading-spinner">⏳</div>
            </div>
          ) : results.clinicTypeAnalysis && (
            <>
              {/* Download PDF Button */}
              <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <button
                  onClick={() => {
                    console.log('PDF button clicked');
                    console.log('Candidate data:', results.candidateData);
                    console.log('Assessment results:', results);
                    console.log('Candidate name:', candidateName);
                    try {
                      generatePDFReport(results.candidateData, results, candidateName);
                      alert('PDF generated! Check your Downloads folder.');
                    } catch (error) {
                      console.error('PDF generation error:', error);
                      alert(`Error generating PDF: ${error.message}`);
                    }
                  }}
                  style={{
                    backgroundColor: rubyRed,
                    color: 'white',
                    padding: '15px 30px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#9d2d3d'}
                  onMouseOut={(e) => e.target.style.backgroundColor = rubyRed}
                >
                  📄 Download PDF Report
                </button>
              </div>

              {/* Layman's Overview Section */}
              {results.candidateData && (
                <div className="laymanssummary-section">
                  <h2>Medical Records Summary</h2>
                  <p className="section-description">
                    Here's what was found in the medical records:
                  </p>
                  <div className="overview-items">
                    {generateLaymansOverview(results.candidateData, results).map((item, idx) => (
                      <div key={idx} className="overview-item">
                        {item}
                      </div>
                    ))}
                  </div>

                  {/* Documentation Gaps Warning */}
                  {results.candidateData.documentationGaps && results.candidateData.documentationGaps.length > 0 && (
                    <div style={{ marginTop: '20px', padding: '15px 20px', backgroundColor: '#fef2f2', borderRadius: '8px', borderLeft: `4px solid #ef4444` }}>
                      <h3 style={{ color: '#dc2626', marginTop: 0, fontSize: '16px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        ⚠️ Incomplete Documentation
                      </h3>
                      <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.6', color: '#991b1b' }}>
                        {results.candidateData.documentationGaps.map((gap, idx) => (
                          <li key={idx}>{gap}</li>
                        ))}
                      </ul>
                      <p style={{ marginTop: '10px', marginBottom: 0, fontSize: '14px', color: '#7f1d1d' }}>
                        <strong>Note:</strong> Missing delivery records may reduce approval likelihood even with no documented complications. Complete documentation is required for thorough screening.
                      </p>
                    </div>
                  )}

                  {/* Pregnancy-by-Pregnancy Summary from Claude */}
                  {results.candidateData.pregnancySummary && (
                    <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f0f9ff', borderRadius: '8px', borderLeft: `4px solid ${darkTeal}` }}>
                      <h3 style={{ color: darkTeal, marginTop: 0, fontSize: '18px', marginBottom: '12px' }}>
                        📋 Pregnancy History Summary
                      </h3>
                      <p style={{ margin: 0, lineHeight: '1.8', color: '#374151', whiteSpace: 'pre-wrap' }}>
                        {results.candidateData.pregnancySummary}
                      </p>
                    </div>
                  )}

                  {/* Detailed Parsing Results */}
                  <details style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: darkTeal }}>
                      📋 View Detailed Parsing Results (Debug Info)
                    </summary>
                    <pre style={{ marginTop: '10px', fontSize: '12px', overflow: 'auto', maxHeight: '400px' }}>
                      {JSON.stringify(results.candidateData, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              <div className="clinic-type-analysis">
                <h2>Acceptance Odds by Clinic Type</h2>
                <p className="section-description">
                  Different clinics have varying standards. Here's how this candidate would likely be viewed by different clinic types:
                </p>

                <div className="clinic-cards">
                <div className="clinic-card">
                  <h3 className="clinic-type-name">
                    <span className="clinic-icon">⭐</span> Strict/Premium Clinics
                  </h3>
                  <p className="clinic-description">
                    Strictest standards - BMI under 30, max 1-2 C-sections, age ideally under 35,
                    no gestational diabetes history, minimal risk factor combinations
                  </p>
                  <div
                    className="clearance-badge"
                    style={{
                      backgroundColor: getClearanceBadgeColor(results.clinicTypeAnalysis.strict.acceptanceLevel).bg,
                      color: getClearanceBadgeColor(results.clinicTypeAnalysis.strict.acceptanceLevel).text,
                      border: `2px solid ${getClearanceBadgeColor(results.clinicTypeAnalysis.strict.acceptanceLevel).border}`,
                      padding: '12px 20px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      fontSize: '16px',
                      textAlign: 'center',
                      margin: '15px 0'
                    }}
                  >
                    {getClearanceBadgeText(results.clinicTypeAnalysis.strict.acceptanceLevel)}
                  </div>
                  <div className="depending-on-clinic" style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', fontStyle: 'italic' }}>depending on clinic</div>
                  {results.clinicTypeAnalysis.strict.issues.length > 0 && (
                    <div className="clinic-issues">
                      <h4>Concerns for Strict Clinics:</h4>
                      <ul>
                        {results.clinicTypeAnalysis.strict.issues.map((issue, idx) => (
                          <li key={idx} className={`issue-${issue.severity}`}>
                            <strong>{issue.severity.toUpperCase()}:</strong> {issue.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="clinic-card">
                  <h3 className="clinic-type-name">
                    <span className="clinic-icon">✓</span> Moderate/Average Clinics
                  </h3>
                  <p className="clinic-description">
                    Real-world moderate clinic standards - <strong>BMI max 32</strong> (physician approval to proceed),
                    max 3 C-sections (4+ typically declined), age 21-45, <strong>GDM history requires physician approval</strong> (NOT auto-decline). <strong>SOME case-by-case physician approval</strong> for specific factors.
                  </p>
                  <div
                    className="clearance-badge"
                    style={{
                      backgroundColor: getClearanceBadgeColor(results.clinicTypeAnalysis.moderate.acceptanceLevel).bg,
                      color: getClearanceBadgeColor(results.clinicTypeAnalysis.moderate.acceptanceLevel).text,
                      border: `2px solid ${getClearanceBadgeColor(results.clinicTypeAnalysis.moderate.acceptanceLevel).border}`,
                      padding: '12px 20px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      fontSize: '16px',
                      textAlign: 'center',
                      margin: '15px 0'
                    }}
                  >
                    {getClearanceBadgeText(results.clinicTypeAnalysis.moderate.acceptanceLevel)}
                  </div>
                  <div className="depending-on-clinic" style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', fontStyle: 'italic' }}>depending on clinic</div>
                  {results.clinicTypeAnalysis.moderate.issues.length > 0 && (
                    <div className="clinic-issues">
                      <h4>Concerns for Moderate Clinics:</h4>
                      <ul>
                        {results.clinicTypeAnalysis.moderate.issues.map((issue, idx) => (
                          <li key={idx} className={`issue-${issue.severity}`}>
                            <strong>{issue.severity.toUpperCase()}:</strong> {issue.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="clinic-card">
                  <h3 className="clinic-type-name">
                    <span className="clinic-icon">→</span> Lenient Clinics
                  </h3>
                  <p className="clinic-description">
                    More flexible standards - BMI up to 32-35, age up to 45,
                    controlled conditions often acceptable. <strong>Lenient clinics often use case-by-case review</strong> -
                    common sense approach evaluating overall health picture even outside ASRM guidelines.
                  </p>
                  <div
                    className="clearance-badge"
                    style={{
                      backgroundColor: getClearanceBadgeColor(results.clinicTypeAnalysis.lenient.acceptanceLevel).bg,
                      color: getClearanceBadgeColor(results.clinicTypeAnalysis.lenient.acceptanceLevel).text,
                      border: `2px solid ${getClearanceBadgeColor(results.clinicTypeAnalysis.lenient.acceptanceLevel).border}`,
                      padding: '12px 20px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      fontSize: '16px',
                      textAlign: 'center',
                      margin: '15px 0'
                    }}
                  >
                    {getClearanceBadgeText(results.clinicTypeAnalysis.lenient.acceptanceLevel)}
                  </div>
                  <div className="depending-on-clinic" style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', fontStyle: 'italic' }}>depending on clinic</div>
                  {results.clinicTypeAnalysis.lenient.issues.length > 0 && (
                    <div className="clinic-issues">
                      <h4>Concerns for Lenient Clinics:</h4>
                      <ul>
                        {results.clinicTypeAnalysis.lenient.issues.map((issue, idx) => (
                          <li key={idx} className={`issue-${issue.severity}`}>
                            <strong>{issue.severity.toUpperCase()}:</strong> {issue.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
            </>
          )}

          {/* Medical Glossary Section */}
          <div className="glossary-section">
          <button
            onClick={() => setShowGlossary(!showGlossary)}
            className="glossary-toggle"
          >
            {showGlossary ? '▼' : '▶'} Medical Abbreviations Glossary
          </button>

          {showGlossary && (
            <div className="glossary-content">
              <p className="glossary-intro">
                Common medical abbreviations and terminology for pregnancy, delivery, and obstetric history:
              </p>

              {Object.entries(getGlossaryByCategory()).map(([category, terms]) => (
                <div key={category} className="glossary-category">
                  <h3>{category}</h3>
                  <div className="glossary-terms">
                    {terms.map(term => (
                      <div key={term} className="glossary-term">
                        <strong>{term}:</strong> {MEDICAL_GLOSSARY[term]}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="glossary-category">
                <h3>Additional Common Terms</h3>
                <div className="glossary-terms">
                  <div className="glossary-term">
                    <strong>Placenta previa:</strong> {MEDICAL_GLOSSARY["Placenta previa"]}
                  </div>
                  <div className="glossary-term">
                    <strong>Placental abruption:</strong> {MEDICAL_GLOSSARY["Placental abruption"]}
                  </div>
                  <div className="glossary-term">
                    <strong>Cerclage:</strong> {MEDICAL_GLOSSARY["Cerclage"]}
                  </div>
                  <div className="glossary-term">
                    <strong>SAB:</strong> {MEDICAL_GLOSSARY["SAB"]}
                  </div>
                  <div className="glossary-term">
                    <strong>TAB:</strong> {MEDICAL_GLOSSARY["TAB"]}
                  </div>
                  <div className="glossary-term">
                    <strong>Ectopic:</strong> {MEDICAL_GLOSSARY["Ectopic"]}
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Method & Reliability Section */}
          <div className="method-reliability-section" style={{ backgroundColor: '#f9fafb', padding: '25px', borderRadius: '8px', marginTop: '30px', marginBottom: '20px', border: '1px solid #e5e7eb' }}>
            <h3 style={{ color: darkTeal, marginTop: 0, marginBottom: '15px', fontSize: '20px' }}>📊 Method & Reliability</h3>

            <div style={{ marginBottom: '15px' }}>
              <h4 style={{ color: '#374151', fontSize: '16px', marginBottom: '8px' }}>How This Analysis Works</h4>
              <p style={{ color: '#6b7280', lineHeight: '1.6', margin: 0 }}>
                This tool uses an <strong>AI-Assisted, Rule-Guided</strong> approach combining two technologies:
              </p>
              <ul style={{ color: '#6b7280', lineHeight: '1.8', marginTop: '8px' }}>
                <li><strong>AI for Understanding:</strong> Advanced language models specialized in medical text parse complex discharge summaries, clinical notes, and medical records to accurately extract pregnancy histories, complications, and pre-existing conditions</li>
                <li><strong>Rules for Decisions:</strong> Deterministic scoring algorithms based on ASRM 2022 guidelines ensure consistent, unbiased risk assessment</li>
              </ul>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <h4 style={{ color: '#374151', fontSize: '16px', marginBottom: '8px' }}>What AI Does (Educational Content)</h4>
              <ul style={{ color: '#6b7280', lineHeight: '1.8', margin: 0 }}>
                <li>Extracts structured data from medical records (dates, conditions, measurements)</li>
                <li>Generates pregnancy-by-pregnancy narrative summaries</li>
              </ul>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <h4 style={{ color: '#374151', fontSize: '16px', marginBottom: '8px' }}>What AI Does NOT Do (Scoring)</h4>
              <ul style={{ color: '#6b7280', lineHeight: '1.8', margin: 0 }}>
                <li>Risk levels are calculated using fixed rules (not AI predictions)</li>
                <li>Acceptance odds are based on expert-defined penalty thresholds</li>
                <li>All scoring logic is transparent and auditable</li>
              </ul>
            </div>

            <div style={{ backgroundColor: '#fef3c7', padding: '15px', borderRadius: '6px', borderLeft: '4px solid ' + mustardYellow }}>
              <h4 style={{ color: goldBrown, fontSize: '16px', marginTop: 0, marginBottom: '8px' }}>Conservative Bias</h4>
              <p style={{ color: '#92400e', lineHeight: '1.6', margin: 0, fontSize: '14px' }}>
                This tool is intentionally <strong>cautious</strong> and may flag cases for review that could be acceptable at some clinics.
                It's designed to err on the side of thoroughness rather than miss potential concerns. Many "Requires Review"
                candidates proceed successfully after detailed medical evaluation.
              </p>
            </div>
          </div>

          {/* Medical Disclaimer at bottom */}
          <div className="disclaimer disclaimer-bottom">
          <h3>⚠️ Medical Disclaimer</h3>
          <p>
            <strong>IMPORTANT:</strong> This tool provides risk analysis based on medical history and ASRM guidelines
            for informational purposes. All surrogacy decisions must be made in consultation with qualified medical
            professionals, reproductive endocrinologists, and mental health specialists who will conduct comprehensive
            medical evaluation including physical examination, laboratory testing, and psychological screening.
          </p>
          <p>
            This assessment analyzes pregnancy history, medical conditions, and clinic acceptance patterns based on
            ASRM (American Society for Reproductive Medicine) 2022 guidelines for gestational carriers.
          </p>
          </div>

          <footer className="app-footer">
          <p>
            Based on: American Society for Reproductive Medicine (ASRM) Committee Opinion 2022 -
            "Recommendations for practices using gestational carriers"
          </p>
          <p>
            This tool is not affiliated with or endorsed by ASRM. For official guidelines,
            visit <a href="https://www.asrm.org" target="_blank" rel="noopener noreferrer">www.asrm.org</a>
          </p>
          </footer>
        </div>
      )}

      {/* How To Use Modal */}
      {showHowToUse && (
        <div className="modal-overlay" onClick={() => setShowHowToUse(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: goldBrown }}>How To Use</h2>
              <button onClick={() => setShowHowToUse(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p className="modal-intro">This tool helps assess surrogate candidates for edge cases and complex combinations of risk factors.</p>

              <div className="modal-section">
                <h3 style={{ color: darkTeal }}>Getting Started</h3>
                <p>Enter medical records or a narrative description of the surrogate candidate using standard medical abbreviations and terminology.</p>
                <p>The tool will automatically parse the text and extract relevant medical information.</p>
              </div>

              <div className="modal-section">
                <h3 style={{ color: darkTeal }}>What You'll Get</h3>
                <p>The tool analyzes candidates across multiple dimensions:</p>
                <ul>
                  <li><strong>ASRM Guidelines Assessment:</strong> Compliance with 2022 gestational carrier standards</li>
                  <li><strong>Clinic Type Odds:</strong> Acceptance probability at strict, moderate, and lenient clinics</li>
                  <li><strong>MFM Review:</strong> Whether maternal-fetal medicine consultation is needed</li>
                </ul>
              </div>

              <div className="modal-section">
                <h3 style={{ color: darkTeal }}>Important Notes</h3>
                <ul>
                  <li>This tool is for <strong>edge cases only</strong> - candidates with combinations of "iffy" factors</li>
                  <li>Assumes candidate has at least one healthy term birth</li>
                  <li>Not for catching obvious disqualifiers</li>
                  <li>All decisions must be made with qualified medical professionals</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Method & Reliability Modal */}
      {showMethod && (
        <div className="modal-overlay" onClick={() => setShowMethod(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: mustardYellow }}>Method & Reliability</h2>
              <button onClick={() => setShowMethod(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p className="modal-intro">Risk Ranger employs a sophisticated, multi-layered assessment system that combines evidence-based clinical guidelines, custom-built medical text parsing, and deterministic scoring algorithms. Our approach prioritizes accuracy and clinical validity over simplistic AI-generated answers.</p>

              <div className="modal-section">
                <h3 style={{ color: darkTeal }}>Assessment Methodology</h3>
                <p>Our algorithm evaluates candidates using a multi-tiered approach:</p>
                <ul>
                  <li><strong>ASRM Guidelines:</strong> Baseline assessment against 2022 standards for age, pregnancy history, medical conditions, BMI</li>
                  <li><strong>Clinic Type Differentiation:</strong> Strict clinics (rigid ASRM adherence), moderate clinics (some case-by-case review), lenient clinics (common sense review)</li>
                  <li><strong>Combination Penalties:</strong> Multiple risk factors compound exponentially, especially at strict clinics</li>
                  <li><strong>Condition-Specific Scoring:</strong> Individual medical conditions weighted by severity and recurrence risk</li>
                </ul>
              </div>

              <div className="modal-section">
                <h3 style={{ color: darkTeal }}>Text Parsing - Multi-Layered Approach</h3>
                <p>Our system employs a <strong>cascading three-tier extraction process</strong> designed specifically for medical record analysis:</p>
                <ul>
                  <li><strong>Primary Layer - Structured Pattern Recognition:</strong> Custom-built regex patterns recognize 400+ medical terms, standard abbreviations (G3P2, SVD, C/S, VBAC), and pregnancy history notation. This deterministic parser handles the majority of medical records efficiently and accurately.</li>
                  <li><strong>Secondary Layer - Medical Glossary Mapping:</strong> When structured patterns don't match, the system cross-references a curated medical glossary built from CDC, ASRM, March of Dimes, and clinical sources. This layer maps natural language descriptions to standardized medical conditions.</li>
                  <li><strong>Tertiary Layer - Specialized Medical AI (Optional):</strong> For complex narrative medical records that resist structured parsing, users can opt into AI analysis. This layer uses language models with medical domain fine-tuning to extract conditions from discharge summaries and clinical notes. The AI intelligently groups related symptoms (e.g., "hyperemesis + PICC line + TPN + hospitalization" = 1 severe hyperemesis episode) and distinguishes pregnancy-induced vs chronic conditions.</li>
                  <li><strong>Scoring Engine - 100% Deterministic:</strong> Regardless of extraction method, all risk scoring uses hard-coded clinical rules. AI is never used for decision-making—only for text extraction when simpler methods fail.</li>
                </ul>
                <p><strong>Why this architecture?</strong> Most medical records can be parsed with fast, reliable pattern matching. The medical glossary handles edge cases with natural language descriptions. AI is reserved as a final option for truly complex narrative records, ensuring specialized medical language understanding without relying on general-purpose chatbots. This approach combines speed, accuracy, and clinical specificity.</p>
              </div>

              <div className="modal-section">
                <h3 style={{ color: darkTeal }}>MFM Assessment for Surrogacy</h3>
                <p><strong>Critical distinction:</strong> MFM evaluation for surrogacy differs from evaluation of women carrying their own pregnancies.</p>
                <p>MFMs apply a <strong>HIGHER standard for surrogates</strong> because:</p>
                <ul>
                  <li><strong>Duty to protect surrogate:</strong> Elective pregnancy for someone else - must not exploit vulnerable women or expose them to unreasonable risks</li>
                  <li><strong>Duty to intended parents:</strong> Must minimize pregnancy complications that could harm the intended child</li>
                  <li><strong>Higher ethical bar:</strong> A woman's reproductive autonomy allows accepting risks for her own pregnancy. In surrogacy, MFM must protect BOTH parties</li>
                </ul>
                <p><strong>Result:</strong> Conditions MFM might approve for a woman wanting her own baby ("as long as she understands the risks") are often <strong>declined for surrogacy</strong>. MFMs are MORE conservative when evaluating surrogate candidates.</p>
              </div>

              <div className="modal-section">
                <h3 style={{ color: darkTeal }}>Data Sources</h3>
                <ul>
                  <li><strong>ASRM (American Society for Reproductive Medicine):</strong> 2022 Guidelines for Gestational Carriers - standard obstetric terminology and surrogacy-specific criteria</li>
                  <li><strong>CDC (Centers for Disease Control and Prevention):</strong> Maternal health conditions, chronic conditions (anemia, anxiety, depression, diabetes, hypertension), infectious diseases (UTI, HIV, STI/STD, COVID-19), pregnancy outcomes</li>
                  <li><strong>March of Dimes:</strong> Chronic health conditions affecting pregnancy including autoimmune diseases (lupus, MS, RA, IBD), cardiovascular/pulmonary conditions, endocrine disorders, mental health conditions</li>
                  <li><strong>Blue Cross Blue Shield:</strong> Preterm labor signs and symptoms, gestational diabetes management, pregnancy-induced hypertension, placental complications</li>
                  <li><strong>Stanford Children's Health:</strong> Prenatal testing terminology, fetal development and monitoring, pregnancy complications (HELLP syndrome, IUGR), blood/lab testing, Rh disease</li>
                  <li><strong>Johns Hopkins Medicine:</strong> Amniotic fluid complications, bleeding complications, ectopic pregnancy, miscarriage and fetal loss, placental complications, preeclampsia/eclampsia</li>
                  <li><strong>Real Clinic Standards:</strong> San Diego Fertility Center (SDFC) and industry-standard IVF clinic acceptance criteria</li>
                </ul>
              </div>

              <div className="modal-section">
                <h3 style={{ color: darkTeal }}>Limitations</h3>
                <ul>
                  <li>This tool is for informational purposes only and does not constitute medical advice</li>
                  <li>Designed for edge cases, not for screening obvious disqualifiers</li>
                  <li>Scores are estimates based on general standards - each clinic has unique criteria</li>
                  <li>All surrogacy decisions must be made with qualified medical professionals</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MFMemo Modal */}
      {showMFMemo && (
        <div className="modal-overlay" onClick={() => setShowMFMemo(false)}>
          <div className="modal-content" style={{ maxWidth: '1000px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: darkTeal }}>🏥 MFMemo - MFM Report Analyzer</h2>
              <button onClick={() => setShowMFMemo(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <MFMemo />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
