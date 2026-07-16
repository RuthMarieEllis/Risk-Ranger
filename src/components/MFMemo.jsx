import { useState } from 'react';
import { parseDocument } from '../utils/simplePdfParser.js';
import { parseWithClaude } from '../utils/claudeParser.js';

function MFMemo() {
  const [candidateName, setCandidateName] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mfmReport, setMfmReport] = useState(null);
  const [error, setError] = useState('');

  // Brand colors - matching Risk Ranger
  const rubyRed = '#7d2431';
  const darkGreen = '#217045';
  const mustardYellow = '#e1b321';
  const goldBrown = '#a5630b';
  const darkTeal = '#005567';

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setUploadedFile(file);
      setError('');
    }
  };

  const handleAnalyze = async () => {
    if (!uploadedFile) {
      setError('Please upload an MFM report first');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setMfmReport(null);

    try {
      console.log('📄 Parsing MFM document:', uploadedFile.name);

      // Parse the PDF
      let extractedText = '';
      if (uploadedFile.type === 'application/pdf') {
        extractedText = await parseDocument(uploadedFile);
      } else if (uploadedFile.type === 'text/plain') {
        extractedText = await uploadedFile.text();
      } else {
        throw new Error('Please upload a PDF or TXT file');
      }

      console.log('✅ Document parsed, analyzing with Claude...');

      // Create MFMemo-specific prompt
      const mfmPrompt = `You are analyzing a Maternal-Fetal Medicine (MFM) consultation report for a gestational carrier candidate.

IMPORTANT INSTRUCTIONS:
1. Extract ALL red flags (risk factors) and green flags (positive factors)
2. Provide a comprehensive overview
3. Assess clinic clearance likelihood (Lax, Moderate, Strict)
4. Include specific medical details, numbers, and measurements

Medical Record:
${extractedText}

Generate a detailed MFM analysis in this EXACT JSON format:
{
  "overview": "Detailed overview paragraph describing the candidate, key risk factors, and MFM conclusion",
  "redFlags": [
    "Specific risk factor with details (e.g., BMI of 33.3, which exceeds strict clinic cutoffs)",
    "Another risk factor with medical details"
  ],
  "greenFlags": [
    "Positive factor with details",
    "Another positive factor"
  ],
  "notes": "Additional important notes, recommendations, or clarifications from the MFM",
  "clinicClearance": {
    "lax": {
      "likelihood": "High Likelihood|Medium Likelihood|Low Likelihood|Very Low Likelihood",
      "assessment": "Detailed explanation of why lax clinics would accept or decline"
    },
    "moderate": {
      "likelihood": "High Likelihood|Medium Likelihood|Low Likelihood|Very Low Likelihood",
      "assessment": "Detailed explanation for moderate clinics"
    },
    "strict": {
      "likelihood": "High Likelihood|Medium Likelihood|Low Likelihood|Very Low Likelihood",
      "assessment": "Detailed explanation for strict clinics, mention specific thresholds (e.g., BMI >32)"
    }
  }
}

Be thorough and specific. Include actual numbers, measurements, and medical terminology from the report.`;

      const analysisResult = await parseWithClaude(extractedText, mfmPrompt);

      if (analysisResult.error) {
        throw new Error(analysisResult.error);
      }

      console.log('✅ Analysis complete');

      // Parse the JSON response
      let reportData;
      try {
        reportData = JSON.parse(analysisResult.parsedData || analysisResult);
      } catch (parseError) {
        console.error('Failed to parse JSON:', parseError);
        throw new Error('Failed to parse analysis results');
      }

      setMfmReport({
        ...reportData,
        candidateName: candidateName || 'Unknown Candidate',
        originalFile: uploadedFile.name,
        dateGenerated: new Date().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      });

    } catch (err) {
      console.error('❌ Error:', err);
      setError(err.message || 'Failed to analyze document');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setMfmReport(null);
    setCandidateName('');
    setUploadedFile(null);
    setError('');
  };

  const getLikelihoodColor = (likelihood) => {
    if (likelihood.includes('High')) return darkGreen;
    if (likelihood.includes('Medium')) return mustardYellow;
    if (likelihood.includes('Low')) return rubyRed;
    return '#666';
  };

  const printReport = () => {
    window.print();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#b8c5c9',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      <div style={{
        maxWidth: '700px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        {/* Header */}
        <div style={{
          background: darkTeal,
          color: 'white',
          padding: '20px',
          textAlign: 'center'
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '28px',
            fontWeight: '400',
            letterSpacing: '1px'
          }}>
            MFMemo
          </h1>
        </div>

        {/* Content */}
        <div style={{ padding: '30px' }}>
          {!mfmReport ? (
            <>
              {/* Logo/Branding */}
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{
                  display: 'inline-block',
                  background: `linear-gradient(135deg, ${darkTeal} 0%, ${rubyRed} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  fontSize: '48px',
                  fontWeight: '700',
                  marginBottom: '5px'
                }}>
                  MFM
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '30px'
              }}>
                <button
                  onClick={() => alert('Upload an MFM consultation report and click Analyze to generate a detailed assessment with red/green flags and clinic clearance likelihood.')}
                  style={{
                    flex: 1,
                    background: goldBrown,
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '14px',
                    fontSize: '15px',
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
                  onClick={() => alert('MFMemo uses Claude AI to analyze MFM consultation reports based on ASRM 2022 guidelines for gestational carriers.')}
                  style={{
                    flex: 1,
                    background: mustardYellow,
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '14px',
                    fontSize: '15px',
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

              {/* Analyze Section */}
              <div style={{
                background: rubyRed,
                color: 'white',
                padding: '16px',
                borderRadius: '8px 8px 0 0',
                fontSize: '18px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span>🏥</span>
                <span>Analyze MFM Report</span>
              </div>

              <div style={{
                border: '2px solid #e5e7eb',
                borderTop: 'none',
                borderRadius: '0 0 8px 8px',
                padding: '24px'
              }}>
                {/* Candidate Name */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Candidate Name <span style={{ color: '#9ca3af' }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Full name"
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '15px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '6px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* File Upload */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Upload MFM Report
                  </label>
                  <div style={{
                    background: rubyRed,
                    color: 'white',
                    padding: '14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontSize: '15px',
                    fontWeight: '600',
                    position: 'relative'
                  }}>
                    <input
                      type="file"
                      accept=".pdf,.txt"
                      onChange={handleFileSelect}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        opacity: 0,
                        cursor: 'pointer'
                      }}
                    />
                    <span>📄 Upload MFM Records (Auto-Analyzes)</span>
                  </div>
                  {uploadedFile && (
                    <div style={{
                      marginTop: '10px',
                      padding: '10px',
                      background: '#f0fdf4',
                      border: '1px solid #86efac',
                      borderRadius: '4px',
                      fontSize: '14px',
                      color: '#166534'
                    }}>
                      ✓ {uploadedFile.name}
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div style={{
                    marginBottom: '20px',
                    padding: '12px',
                    background: '#fef2f2',
                    border: '2px solid #fecaca',
                    borderRadius: '6px',
                    color: rubyRed,
                    fontSize: '14px'
                  }}>
                    ⚠️ {error}
                  </div>
                )}

                {/* Analyze Button */}
                <div style={{
                  display: 'flex',
                  gap: '12px'
                }}>
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    style={{
                      flex: 2,
                      background: isAnalyzing ? '#9ca3af' : rubyRed,
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '16px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: isAnalyzing ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isAnalyzing ? '⏳ Analyzing...' : 'Analyze'}
                  </button>
                  <button
                    onClick={handleReset}
                    style={{
                      flex: 1,
                      background: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '16px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Report View */
            <div className="mfmemo-report">
              {/* Report Header */}
              <div style={{
                borderBottom: '4px solid ' + mustardYellow,
                paddingBottom: '20px',
                marginBottom: '30px'
              }}>
                <h2 style={{
                  fontSize: '28px',
                  fontWeight: '600',
                  color: '#000',
                  margin: '0 0 15px 0'
                }}>
                  MFMemo AI Report
                </h2>
                <div style={{ fontSize: '14px', color: '#666', lineHeight: '1.8' }}>
                  <div><strong>Surrogate:</strong> {mfmReport.candidateName}</div>
                  <div><strong>Original File:</strong> {mfmReport.originalFile}</div>
                  <div><strong>Date Generated:</strong> {mfmReport.dateGenerated}</div>
                </div>
              </div>

              {/* Overview */}
              <div style={{ marginBottom: '30px' }}>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: '600',
                  color: darkTeal,
                  marginBottom: '12px'
                }}>
                  Overview
                </h3>
                <p style={{
                  fontSize: '15px',
                  lineHeight: '1.7',
                  color: '#333',
                  margin: 0
                }}>
                  {mfmReport.overview}
                </p>
              </div>

              {/* Red Flags and Green Flags */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '25px',
                marginBottom: '30px'
              }}>
                {/* Red Flags */}
                <div>
                  <h3 style={{
                    fontSize: '20px',
                    fontWeight: '600',
                    color: rubyRed,
                    marginBottom: '12px'
                  }}>
                    Red Flags
                  </h3>
                  <ul style={{
                    fontSize: '14px',
                    lineHeight: '1.7',
                    color: '#333',
                    margin: 0,
                    paddingLeft: '20px'
                  }}>
                    {mfmReport.redFlags && mfmReport.redFlags.map((flag, idx) => (
                      <li key={idx} style={{ marginBottom: '10px' }}>{flag}</li>
                    ))}
                  </ul>
                </div>

                {/* Green Flags */}
                <div>
                  <h3 style={{
                    fontSize: '20px',
                    fontWeight: '600',
                    color: darkGreen,
                    marginBottom: '12px'
                  }}>
                    Green Flags
                  </h3>
                  <ul style={{
                    fontSize: '14px',
                    lineHeight: '1.7',
                    color: '#333',
                    margin: 0,
                    paddingLeft: '20px'
                  }}>
                    {mfmReport.greenFlags && mfmReport.greenFlags.map((flag, idx) => (
                      <li key={idx} style={{ marginBottom: '10px' }}>{flag}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Notes */}
              {mfmReport.notes && (
                <div style={{ marginBottom: '30px' }}>
                  <h3 style={{
                    fontSize: '20px',
                    fontWeight: '600',
                    color: darkTeal,
                    marginBottom: '12px'
                  }}>
                    Notes
                  </h3>
                  <p style={{
                    fontSize: '14px',
                    lineHeight: '1.7',
                    color: '#333',
                    margin: 0
                  }}>
                    {mfmReport.notes}
                  </p>
                </div>
              )}

              {/* Clinic Clearance Assessment */}
              <div style={{ marginBottom: '30px' }}>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: '600',
                  color: darkTeal,
                  marginBottom: '15px'
                }}>
                  Clinic Clearance Assessment
                </h3>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '15px'
                }}>
                  {/* Lax Clinic */}
                  <div style={{
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px',
                    background: '#f9fafb'
                  }}>
                    <h4 style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#4A90E2',
                      margin: '0 0 8px 0'
                    }}>
                      Lax Clinic
                    </h4>
                    <div style={{
                      fontSize: '15px',
                      fontWeight: '600',
                      color: getLikelihoodColor(mfmReport.clinicClearance?.lax?.likelihood || ''),
                      marginBottom: '10px'
                    }}>
                      {mfmReport.clinicClearance?.lax?.likelihood || 'Not assessed'}
                    </div>
                    <p style={{
                      fontSize: '13px',
                      lineHeight: '1.5',
                      color: '#555',
                      margin: 0
                    }}>
                      {mfmReport.clinicClearance?.lax?.assessment || ''}
                    </p>
                  </div>

                  {/* Moderate Clinic */}
                  <div style={{
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px',
                    background: '#f9fafb'
                  }}>
                    <h4 style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#E89C31',
                      margin: '0 0 8px 0'
                    }}>
                      Moderate Clinic
                    </h4>
                    <div style={{
                      fontSize: '15px',
                      fontWeight: '600',
                      color: getLikelihoodColor(mfmReport.clinicClearance?.moderate?.likelihood || ''),
                      marginBottom: '10px'
                    }}>
                      {mfmReport.clinicClearance?.moderate?.likelihood || 'Not assessed'}
                    </div>
                    <p style={{
                      fontSize: '13px',
                      lineHeight: '1.5',
                      color: '#555',
                      margin: 0
                    }}>
                      {mfmReport.clinicClearance?.moderate?.assessment || ''}
                    </p>
                  </div>

                  {/* Strict Clinic */}
                  <div style={{
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px',
                    background: '#f9fafb'
                  }}>
                    <h4 style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: rubyRed,
                      margin: '0 0 8px 0'
                    }}>
                      Strict Clinic
                    </h4>
                    <div style={{
                      fontSize: '15px',
                      fontWeight: '600',
                      color: getLikelihoodColor(mfmReport.clinicClearance?.strict?.likelihood || ''),
                      marginBottom: '10px'
                    }}>
                      {mfmReport.clinicClearance?.strict?.likelihood || 'Not assessed'}
                    </div>
                    <p style={{
                      fontSize: '13px',
                      lineHeight: '1.5',
                      color: '#555',
                      margin: 0
                    }}>
                      {mfmReport.clinicClearance?.strict?.assessment || ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                paddingTop: '20px',
                borderTop: '2px solid #e5e7eb'
              }}>
                <button
                  onClick={printReport}
                  style={{
                    flex: 1,
                    padding: '14px',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: 'white',
                    background: darkGreen,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  🖨️ Print Report
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    flex: 1,
                    padding: '14px',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: 'white',
                    background: '#6b7280',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  ➕ New Analysis
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            background: white;
          }
          .mfmemo-report {
            box-shadow: none;
          }
          button {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default MFMemo;
