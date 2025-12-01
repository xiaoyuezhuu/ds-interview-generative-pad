// @ts-nocheck
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Play, Database, CheckCircle, AlertCircle, Loader2, Sparkles, Terminal, BookOpen, Table, Copy, Zap, PenTool, Target, Tag, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import confetti from 'canvas-confetti';

const App = () => {
  // --- State Management ---
  const [apiKey, setApiKey] = useState('');
  
  // Generator Mode State
  const [mode, setMode] = useState('manual'); // 'manual' | 'auto' | 'company'
  const [topic, setTopic] = useState('');
  const [companyName, setCompanyName] = useState(''); 
  const [difficulty, setDifficulty] = useState('Medium');

  const [isLoading, setIsLoading] = useState(false);
  const [isSqlReady, setIsSqlReady] = useState(false);
  
  // Database Reference (SQLite)
  const dbRef = useRef(null);
  const sqlJsRef = useRef(null);

  // Challenge State 
  const [challenge, setChallenge] = useState(null);
  const [currentQIndex, setCurrentQIndex] = useState(0); 
  
  const [tablePreviews, setTablePreviews] = useState({}); 
  const [expectedResult, setExpectedResult] = useState(null); 
  const [expectedError, setExpectedError] = useState(null);

  const [userQuery, setUserQuery] = useState('');
  const [queryResult, setQueryResult] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [activeTab, setActiveTab] = useState('editor'); 
  const [showApiKey, setShowApiKey] = useState(true);

  // --- Load SQLite Engine (sql.js) ---
  useEffect(() => {
    const loadSqlJs = async () => {
      try {
        // Load the script dynamically
        if (!window.initSqlJs) {
          const script = document.createElement('script');
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js";
          script.async = true;
          script.onload = initEngine;
          document.body.appendChild(script);
        } else {
          initEngine();
        }
      } catch (e) {
        console.error("Failed to load SQL.js", e);
      }
    };

    const initEngine = async () => {
      try {
        const SQL = await window.initSqlJs({
          locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        sqlJsRef.current = SQL;
        dbRef.current = new SQL.Database(); // Initialize empty DB
        console.log("SQLite Engine Loaded");
        setIsSqlReady(true);
      } catch (err) {
        console.error("Failed to initialize SQLite:", err);
      }
    };

    loadSqlJs();
  }, []);

  // --- Helpers ---
  const cleanJson = (text) => {
    let cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
    cleaned = cleaned.replace(/\\'/g, "'");
    return cleaned;
  };

  const parseSqlResult = (res) => {
    // SQLite returns [{columns: [], values: []}], we need array of objects
    if (!res || res.length === 0) return [];
    const { columns, values } = res[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  };

  const executeSql = (query) => {
    if (!dbRef.current) return { error: "SQL Engine not loaded yet." };
    try {
      const res = dbRef.current.exec(query);
      const parsedData = parseSqlResult(res);
      return { data: parsedData };
    } catch (e) {
      return { error: e.message };
    }
  };

  // --- Core Logic: Generate Challenge ---
  const generateChallenge = async () => {
    if (mode === 'manual' && !topic) {
      setFeedback({ type: 'error', message: 'Please enter a topic.' });
      return;
    }
    if (mode === 'company' && !companyName) {
      setFeedback({ type: 'error', message: 'Please enter a company name.' });
      return;
    }

    setIsLoading(true);
    setChallenge(null);
    setCurrentQIndex(0);
    setTablePreviews({});
    setExpectedResult(null);
    setExpectedError(null);
    setQueryResult(null);
    setFeedback(null);
    setUserQuery('');

    try {
      let promptContext = "";
      let jsonStructureInstruction = "";

      if (mode === 'company') {
        promptContext = `
          Context: The user is preparing for a Data Science interview at "${companyName}".
          Task: 
          1. Generate a realistic, relational database schema relevant to ${companyName}'s core business.
          2. Generate a series of 5 SQL interview questions based on this schema.
          3. The questions must be progressive: Question 1 is Easy, Question 5 is Hard.
        `;
        jsonStructureInstruction = `
          The JSON must have this exact structure:
          {
            "schema_sql": "Standard SQLite CREATE TABLE statements...",
            "data_sql": "INSERT INTO statements... Ensure primary keys are unique.",
            "questions": [
              {
                "title": "Short title",
                "difficulty": "Easy", 
                "tags": ["Tag1", "Tag2"],
                "question": "The question text...",
                "solution_sql": "The SQL solution...",
                "explanation": "Explanation..."
              },
              ... (4 more questions)
            ]
          }
        `;
      } else {
        let topicText = mode === 'manual' ? `Topic: "${topic}"` : `Topic: Random realistic business scenario. Difficulty: ${difficulty}.`;
        promptContext = `Task: Create a single SQL coding challenge. ${topicText}`;
        jsonStructureInstruction = `
          The JSON must have this exact structure:
          {
            "schema_sql": "Standard SQLite CREATE TABLE statements...",
            "data_sql": "INSERT INTO statements...",
            "questions": [
              {
                "title": "Short title",
                "difficulty": "${difficulty}",
                "tags": ["Tag1", "Tag2"],
                "question": "The question text...",
                "solution_sql": "The SQL solution...",
                "explanation": "Explanation..."
              }
            ]
          }
        `;
      }

      const prompt = `
        You are an expert Technical Interviewer for Senior Data Science roles.
        ${promptContext}
        
        You MUST return a STRICT JSON object. Do not include any text outside the JSON.
        ${jsonStructureInstruction}
        
        IMPORTANT RULES:
        - Use snake_case for column names.
        - Escape single quotes with double single-quotes ('') in SQL.
        
        COMPLEXITY:
        - Easy: Max 2 tables, basic joins/aggs.
        - Medium: Max 3 tables, subqueries, basic window functions.
        - Hard: Max 4 tables, CTEs, advanced window functions, self-joins.
      `;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          apiKey // Optional: will use server env var if empty
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      
      const text = data.candidates[0].content.parts[0].text;
      let challengeData = JSON.parse(cleanJson(text));

      if (!challengeData.questions && challengeData.question) {
        challengeData.questions = [{
          title: challengeData.title,
          difficulty: challengeData.difficulty,
          tags: challengeData.tags || [],
          question: challengeData.question,
          solution_sql: challengeData.solution_sql,
          explanation: challengeData.explanation
        }];
      }

      // --- Re-Initialize Database ---
      if (sqlJsRef.current) {
        dbRef.current = new sqlJsRef.current.Database(); // Fresh DB
      }
      
      // Execute Schema
      dbRef.current.run(challengeData.schema_sql);
      
      // Execute Data (Split carefully)
      const insertStmts = challengeData.data_sql.split(';').filter(s => s.trim().length > 0);
      insertStmts.forEach(stmt => {
        try { dbRef.current.run(stmt); } catch (e) { console.warn("Insert Error:", e); }
      });

      // --- Fetch Previews ---
      const tablesResult = dbRef.current.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const previews = {};
      
      if (tablesResult.length > 0) {
        const tables = tablesResult[0].values;
        tables.forEach(row => {
          const tableName = row[0];
          // Don't show internal sqlite tables
          if (tableName !== 'sqlite_sequence') {
             const res = dbRef.current.exec(`SELECT * FROM ${tableName} LIMIT 5`);
             previews[tableName] = parseSqlResult(res);
          }
        });
      }

      setTablePreviews(previews);
      setChallenge(challengeData);
      
      // Expected Result for Q1
      if (challengeData.questions.length > 0) {
        try {
          const firstQ = challengeData.questions[0];
          const res = dbRef.current.exec(firstQ.solution_sql);
          setExpectedResult(parseSqlResult(res));
          setExpectedError(null);
        } catch (err) { 
          setExpectedResult(null);
          setExpectedError(err.message);
        }
      }

      setUserQuery('SELECT * FROM ...'); 
      setFeedback({ type: 'success', message: mode === 'company' ? 'Interview Loop Ready!' : 'Challenge generated!' });

    } catch (e) {
      console.error(e);
      setFeedback({ type: 'error', message: `Generation failed: ${e.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuestionChange = (newIndex) => {
    if (!challenge || newIndex < 0 || newIndex >= challenge.questions.length) return;
    
    setCurrentQIndex(newIndex);
    setUserQuery('SELECT * FROM ...');
    setQueryResult(null);
    setFeedback(null);
    setActiveTab('editor');

    try {
      const newQ = challenge.questions[newIndex];
      const res = dbRef.current.exec(newQ.solution_sql);
      setExpectedResult(parseSqlResult(res));
      setExpectedError(null);
    } catch (err) {
      setExpectedResult(null);
      setExpectedError(err.message);
    }
  };

  const handleRunQuery = () => {
    if (!challenge) return;
    const currentQ = challenge.questions[currentQIndex];

    const result = executeSql(userQuery);
    
    if (result.error) {
      setFeedback({ type: 'error', message: `SQL Error: ${result.error}` });
      setQueryResult(null);
      return;
    }

    setQueryResult(result.data);

    try {
      const solutionRes = dbRef.current.exec(currentQ.solution_sql);
      const solutionData = parseSqlResult(solutionRes);
      
      const userStr = JSON.stringify(result.data);
      const solStr = JSON.stringify(solutionData);

      if (userStr === solStr) {
        setFeedback({ type: 'success', message: '🎉 Correct! Your output matches the solution.' });
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#4F46E5', '#10B981', '#F59E0B'] });
      } else {
        setFeedback({ type: 'error', message: '❌ Incorrect. Output differs from the expected solution.' });
      }
    } catch (e) {
      setFeedback({ type: 'error', message: 'Could not validate. Check logic manually.' });
    }
  };

  // UI Helper
  const SimpleTable = ({ data, compact = false }) => {
    if (!data || data.length === 0) return <div className="text-gray-400 italic text-xs">Empty table (0 rows)</div>;
    const headers = Object.keys(data[0]);
    return (
      <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {headers.map(h => (
                <th key={h} className={`px-4 py-2 text-left text-xs font-semibold text-gray-500 tracking-wider ${compact ? 'py-1' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((row, i) => (
              <tr key={i}>
                {headers.map(h => (
                  <td key={`${i}-${h}`} className={`px-4 py-2 whitespace-nowrap text-xs text-gray-700 font-mono ${compact ? 'py-1' : ''}`}>{String(row[h])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const currentQuestion = challenge ? challenge.questions[currentQIndex] : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">SQL Interview AI</h1>
            <p className="text-xs text-slate-500">Powered by React, SQLite & Gemini</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {showApiKey ? (
             <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
               <span className="text-xs font-semibold text-slate-500">API KEY</span>
               <input 
                 type="password" 
                 value={apiKey}
                 onChange={(e) => setApiKey(e.target.value)}
                 placeholder="Optional if configured..."
                 className="bg-transparent border-none text-sm w-36 focus:ring-0"
               />
               <button onClick={() => setShowApiKey(false)} className="text-xs text-indigo-600 hover:underline">Hide</button>
             </div>
           ) : (
             <button onClick={() => setShowApiKey(true)} className="text-xs text-slate-500 hover:text-indigo-600">Config API</button>
           )}
           <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-xs text-indigo-600 font-medium hover:underline">Get Key &rarr;</a>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col: Setup & Data Visualization */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Generator Card */}
          <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200">
            {/* Mode Switcher */}
            <div className="grid grid-cols-3 p-1 gap-1 bg-slate-50 rounded-t-xl border-b border-gray-100">
              <button onClick={() => setMode('manual')} className={`flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-lg transition-all ${mode === 'manual' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : 'text-slate-500 hover:bg-slate-100'}`}>
                <PenTool className="w-3.5 h-3.5" /> Custom
              </button>
              <button onClick={() => setMode('auto')} className={`flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-lg transition-all ${mode === 'auto' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : 'text-slate-500 hover:bg-slate-100'}`}>
                <Zap className="w-3.5 h-3.5" /> Random
              </button>
              <button onClick={() => setMode('company')} className={`flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-lg transition-all ${mode === 'company' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : 'text-slate-500 hover:bg-slate-100'}`}>
                <Building2 className="w-3.5 h-3.5" /> Company
              </button>
            </div>

            <div className="p-5">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                {mode === 'manual' ? 'Define Scenario' : mode === 'company' ? 'Simulate Interview' : 'Quick Challenge'}
              </h2>
              
              <div className="space-y-4">
                {mode === 'manual' && (
                  <textarea 
                    className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                    rows="3"
                    placeholder="e.g. Identifying churned users in a SaaS model..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                )}
                
                {mode === 'company' && (
                  <div className="space-y-3">
                    <input 
                      className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Company Name (e.g. Airbnb, Uber)"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                    <p className="text-xs text-slate-500 italic">Generates 5 progressive questions specifically for this company.</p>
                  </div>
                )}

                {/* Difficulty Selector (Shared for Auto & Company) */}
                {mode !== 'manual' && (
                   <div className="grid grid-cols-3 gap-2">
                     {['Easy', 'Medium', 'Hard'].map((lvl) => (
                       <button
                         key={lvl}
                         onClick={() => setDifficulty(lvl)}
                         className={`py-2 text-sm font-medium rounded-lg border transition-all ${difficulty === lvl 
                           ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-1 ring-indigo-200' 
                           : 'bg-white border-gray-200 text-slate-600 hover:border-gray-300'}`}
                       >
                         {lvl}
                       </button>
                     ))}
                  </div>
                )}

                <button 
                  onClick={generateChallenge}
                  disabled={isLoading || !isSqlReady}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium text-white transition-all shadow-md
                    ${isLoading 
                      ? 'bg-indigo-400 cursor-not-allowed' 
                      : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg active:transform active:scale-[0.98]'}`}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isLoading ? 'Generating...' : 'Start Challenge'}
                </button>
              </div>
            </div>
          </div>

          {/* New Table Visualizer */}
          {challenge && currentQuestion && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
               <div className="bg-slate-50 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                 <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                   <Table className="w-4 h-4" /> Data Preview
                 </h3>
                 <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${currentQuestion.difficulty === 'Hard' ? 'bg-red-100 text-red-700' : currentQuestion.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                   {currentQuestion.difficulty}
                 </span>
               </div>
               
               <div className="p-5 space-y-6 max-h-[600px] overflow-y-auto">
                 
                 {/* Question Header & Navigation */}
                 <div className="space-y-3">
                   {challenge.questions.length > 1 && (
                     <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wide">
                        <span>Question {currentQIndex + 1} of {challenge.questions.length}</span>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleQuestionChange(currentQIndex - 1)}
                            disabled={currentQIndex === 0}
                            className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleQuestionChange(currentQIndex + 1)}
                            disabled={currentQIndex === challenge.questions.length - 1}
                            className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                     </div>
                   )}
                   
                   <p className="font-bold text-slate-900 text-base">{currentQuestion.title}</p>
                   
                   {/* Tags */}
                   {currentQuestion.tags && currentQuestion.tags.length > 0 && (
                     <div className="flex flex-wrap gap-2">
                        {currentQuestion.tags.map((tag, i) => (
                           <span key={i} className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wide">
                             <Tag className="w-3 h-3" />
                             {tag}
                           </span>
                        ))}
                     </div>
                   )}

                   <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg text-indigo-900 text-sm leading-relaxed">
                     <strong>Question:</strong> {currentQuestion.question}
                   </div>
                 </div>

                 {/* Render Tables */}
                 <div className="space-y-4">
                   {Object.keys(tablePreviews).length > 0 ? (
                     Object.entries(tablePreviews).map(([tableName, data]) => (
                       <div key={tableName}>
                         <h4 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
                           <Database className="w-3 h-3" /> Table: <span className="text-indigo-600 font-mono">{tableName}</span>
                         </h4>
                         <SimpleTable data={data} compact={true} />
                       </div>
                     ))
                   ) : (
                     <p className="text-sm text-gray-500 italic">No tables found.</p>
                   )}
                 </div>

                 {/* Expected Output */}
                 <div className="pt-4 border-t border-dashed border-gray-200">
                   <h4 className="text-xs font-bold text-green-600 uppercase mb-2 flex items-center gap-1">
                     <Target className="w-3 h-3" /> Expected Output
                   </h4>
                   {expectedError ? (
                     <div className="text-xs text-red-500 bg-red-50 p-2 rounded border border-red-100 font-mono">
                       Calculation Error: {expectedError}
                     </div>
                   ) : expectedResult ? (
                     <SimpleTable data={expectedResult} compact={true} />
                   ) : (
                     <div className="text-xs text-gray-400 italic">No expected data available.</div>
                   )}
                 </div>
               </div>
            </div>
          )}
        </div>

        {/* Right Col: Editor & Solution */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col flex-1 min-h-[600px]">
            {/* Tabs */}
            <div className="flex items-center border-b border-gray-200">
               <button 
                 onClick={() => setActiveTab('editor')}
                 className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'editor' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
               >
                 <div className="flex items-center gap-2">
                   <Terminal className="w-4 h-4" /> SQL Editor
                 </div>
               </button>
               <button 
                 onClick={() => setActiveTab('solution')}
                 className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'solution' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
               >
                 <div className="flex items-center gap-2">
                   <BookOpen className="w-4 h-4" /> Educational Solution
                 </div>
               </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-0 relative">
              {activeTab === 'editor' ? (
                <textarea 
                  className="w-full h-full p-6 font-mono text-sm text-slate-800 bg-white outline-none resize-none leading-relaxed"
                  placeholder={challenge ? "-- Write your SQL query here..." : "-- Generate a challenge to start coding..."}
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  disabled={!challenge}
                />
              ) : (
                <div className="p-8 h-full bg-slate-50 overflow-y-auto">
                   {currentQuestion ? (
                     <div className="space-y-8 max-w-3xl mx-auto">
                       
                       <div className="space-y-3">
                         <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-600" /> 
                                The Query
                            </h4>
                            <button 
                              onClick={() => { setUserQuery(currentQuestion.solution_sql); setActiveTab('editor'); }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                            >
                                <Copy className="w-3 h-3" /> Copy to Editor
                            </button>
                         </div>
                         <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-sm overflow-x-auto relative group">
                           <pre className="font-mono text-sm text-green-400 leading-relaxed whitespace-pre-wrap">
                             {currentQuestion.solution_sql}
                           </pre>
                         </div>
                       </div>

                       <div className="space-y-3">
                         <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-indigo-600" /> 
                            Step-by-Step Logic
                         </h4>
                         <div className="bg-white border border-gray-200 p-6 rounded-xl shadow-sm text-slate-600 text-sm leading-7 space-y-4">
                           {currentQuestion.explanation.split('\n').map((paragraph, idx) => (
                             <p key={idx} className={paragraph.trim().startsWith('-') || paragraph.trim().match(/^\d\./) ? "pl-4" : ""}>
                               {paragraph}
                             </p>
                           ))}
                         </div>
                       </div>
                     </div>
                   ) : (
                     <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                       <BookOpen className="w-8 h-8 opacity-20" />
                       <p className="italic">Generate a challenge to view the solution</p>
                     </div>
                   )}
                </div>
              )}
              
              {/* Floating Run Button */}
              {activeTab === 'editor' && (
                <div className="absolute bottom-6 right-6">
                  <button 
                    onClick={handleRunQuery}
                    disabled={!challenge}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-full shadow-lg font-medium transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-indigo-200"
                  >
                    <Play className="w-4 h-4 fill-current" /> Run Query
                  </button>
                </div>
              )}
            </div>
            
            {/* Console / Output */}
            <div className="border-t border-gray-200 bg-gray-50 min-h-[200px] max-h-[300px] flex flex-col">
              <div className="px-4 py-2 border-b border-gray-200 flex justify-between items-center bg-white">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Query Results</span>
                {feedback && (
                  <span className={`text-xs flex items-center gap-1.5 font-medium px-2 py-1 rounded ${feedback.type === 'error' ? 'bg-red-50 text-red-600' : feedback.type === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                    {feedback.type === 'error' ? <AlertCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                    {feedback.message}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-auto p-4">
                {queryResult ? (
                  <SimpleTable data={queryResult} />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <Terminal className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-sm">Run a query to see results</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
