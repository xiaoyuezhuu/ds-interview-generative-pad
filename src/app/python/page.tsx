// @ts-nocheck
"use client";

import React, { useState, useEffect } from 'react';
import { Play, CheckCircle, AlertCircle, Loader2, Sparkles, Terminal, BarChart2, Layers, BookOpen, Image as ImageIcon } from 'lucide-react';
import ModeSwitcher from '@/components/ModeSwitcher';
import ReactMarkdown from 'react-markdown';

// We load Pyodide from CDN. In a real app, this might be handled via a worker.
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js";

// Pre-defined Datasets (Hosted on reliable CDNs)
const DATASETS = [
  {
    id: 'titanic',
    name: 'Titanic Survival',
    url: 'https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv',
    description: 'Predict survival on the Titanic based on passenger demographics.'
  },
  {
    id: 'housing',
    name: 'California Housing',
    url: 'https://raw.githubusercontent.com/ageron/handson-ml/master/datasets/housing/housing.csv',
    description: 'Predict median house values in California districts.'
  },
  {
    id: 'iris',
    name: 'Iris Flowers',
    url: 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv',
    description: 'Classify iris flowers into three species.'
  }
];

const STAGES = [
  "Exploratory Data Analysis (EDA)",
  "Data Preprocessing",
  "Feature Engineering",
  "Model Building",
  "Model Evaluation"
];

const PythonPad = () => {
  // --- State ---
  const [apiKey, setApiKey] = useState('');
  const [pyodide, setPyodide] = useState(null);
  const [isEnvReady, setIsEnvReady] = useState(false);
  const [envLoadingText, setEnvLoadingText] = useState('Waiting to initialize...');
  
  const [selectedDataset, setSelectedDataset] = useState<string>(DATASETS[0].id);
  const [selectedStage, setSelectedStage] = useState<string>(STAGES[0]);
  
  const [challenge, setChallenge] = useState(null);
  const [userCode, setUserCode] = useState('');
  const [output, setOutput] = useState('');
  const [plotImage, setPlotImage] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('editor'); // 'editor', 'solution'
  const [showApiKey, setShowApiKey] = useState(true);

  // --- 1. Initialize Python Environment ---
  useEffect(() => {
    const initPyodideEnv = async () => {
      setEnvLoadingText('Loading Python Engine...');
      try {
        // Load the script
        if (!window.loadPyodide) {
          const script = document.createElement('script');
          script.src = PYODIDE_URL;
          script.async = true;
          script.onload = () => loadEngine();
          document.body.appendChild(script);
        } else {
          loadEngine();
        }
      } catch (e) {
        setEnvLoadingText(`Error: ${e.message}`);
      }
    };

    const loadEngine = async () => {
      try {
        const py = await window.loadPyodide();
        setEnvLoadingText('Installing Pandas & Scikit-Learn (this may take 30s)...');
        
        // Load Micropip to install packages
        await py.loadPackage("micropip");
        const micropip = py.pyimport("micropip");
        
        // Install core DS libraries
        await micropip.install(["pandas", "numpy", "scikit-learn", "matplotlib"]);
        
        // Setup Plotting Backend (Agg) to render to bytes
        await py.runPythonAsync(`
          import matplotlib
          matplotlib.use("Agg")
          import matplotlib.pyplot as plt
          import pandas as pd
          import numpy as np
          import io
          import base64
        `);

        setPyodide(py);
        setIsEnvReady(true);
        setEnvLoadingText('Ready');
      } catch (e) {
        setEnvLoadingText(`Installation Failed: ${e.message}`);
      }
    };

    initPyodideEnv();
  }, []);

  // --- 2. Load Dataset into Python FS ---
  const loadDatasetToPython = async (dataset) => {
    if (!pyodide) return;
    try {
      const response = await fetch(dataset.url);
      const csvText = await response.text();
      // Write to virtual filesystem
      pyodide.FS.writeFile(`${dataset.id}.csv`, csvText);
      return true;
    } catch (e) {
      setOutput(`Error loading dataset: ${e.message}`);
      return false;
    }
  };

  // --- 3. Generate Challenge (Gemini) ---
  const generateChallenge = async () => {
    // API key check moved to server-side logic in real implementation or handled via .env
    // Here we support user provided key or fallback if configured
    
    setIsGenerating(true);
    setChallenge(null);
    setOutput('');
    setPlotImage(null);
    setActiveTab('editor');

    try {
      // Ensure dataset is loaded in Python
      const dataset = DATASETS.find(d => d.id === selectedDataset);
      if (dataset) {
        await loadDatasetToPython(dataset);
      }

      const prompt = `
        You are a Senior Data Science Interviewer.
        Generate a coding interview question.
        
        Context:
        - Dataset: ${dataset?.name} (Filename: "${dataset?.id}.csv")
        - Interview Stage: ${selectedStage}
        
        Task:
        1. Create a specific, solvable task relevant to this stage (e.g., "Calculate missing values" for EDA, or "Train a Random Forest" for Modeling).
        2. Provide starter code that loads the data.
        3. Provide the solution code.
        
        Return STRICT JSON:
        {
          "title": "Short Title",
          "dataset_description": "Brief description (max 3 sentences)",
          "task_details": "Detailed instructions with bullet points if needed",
          "question": "Summary question text...",
          "starter_code": "import pandas as pd\\ndf = pd.read_csv('${dataset?.id}.csv')\\n# Your code here",
          "solution_code": "Full working solution code...",
          "explanation": "Why this approach is correct..."
        }
      `;

      // Reuse the existing API route
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          apiKey // Optional
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const text = data.candidates[0].content.parts[0].text.replace(/```json\s*|\s*```/g, '').trim();
      const json = JSON.parse(text);
      
      setChallenge(json);
      setUserCode(json.starter_code);

    } catch (e) {
      setOutput(`Generation Error: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- 4. Run Python Code ---
  const handleRunCode = async () => {
    if (!pyodide) return;
    setIsRunning(true);
    setOutput("");
    setPlotImage(null);

    try {
      // Reset stdout capture
      await pyodide.runPythonAsync(`
        import sys
        import io
        sys.stdout = io.StringIO()
        plt.clf() # Clear previous plots
      `);

      // Run User Code
      await pyodide.runPythonAsync(userCode);

      // Get Stdout
      const stdout = await pyodide.runPythonAsync("sys.stdout.getvalue()");
      setOutput(stdout);

      // Check for plots
      // We save the plot to a buffer and converting to base64
      const plotCheck = await pyodide.runPythonAsync(`
        img_str = ""
        if plt.get_fignums():
            buf = io.BytesIO()
            plt.savefig(buf, format='png')
            buf.seek(0)
            img_str = base64.b64encode(buf.read()).decode('utf-8')
        img_str
      `);

      if (plotCheck) {
        setPlotImage(`data:image/png;base64,${plotCheck}`);
      }

    } catch (e) {
      setOutput(`Traceback:\n${e.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Navbar */}
      <nav className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-none">PyDS Interview AI</h1>
            <p className="text-xs text-slate-400 mt-1">Python Data Science Pad</p>
          </div>
        </div>

        <ModeSwitcher />
        
        <div className="flex items-center gap-3">
          {/* Environment Status Indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${isEnvReady ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
            {isEnvReady ? <CheckCircle className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
            {isEnvReady ? "Environment Ready" : envLoadingText}
          </div>

          <div className="h-6 w-px bg-slate-800 mx-2"></div>

          {showApiKey ? (
             <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-md border border-slate-700">
               <span className="text-xs font-semibold text-slate-500">API KEY</span>
               <input 
                 type="password" 
                 value={apiKey}
                 onChange={(e) => setApiKey(e.target.value)}
                 placeholder="Optional..."
                 className="bg-transparent border-none text-sm w-24 focus:ring-0 text-white placeholder-slate-600"
               />
               <button onClick={() => setShowApiKey(false)} className="text-xs text-indigo-400 hover:text-indigo-300">Hide</button>
             </div>
           ) : (
             <button onClick={() => setShowApiKey(true)} className="text-xs text-slate-500 hover:text-indigo-400">Config API</button>
           )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-80px)]">
        
        {/* Left Panel: Configuration & Challenge */}
        <div className="lg:col-span-4 flex flex-col gap-6 h-full overflow-y-auto pr-2">
          
          {/* Config Card */}
          <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700 backdrop-blur-sm">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4" /> Session Setup
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Dataset</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  value={selectedDataset}
                >
                  {DATASETS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <p className="text-[10px] text-slate-500 mt-1.5">{DATASETS.find(d => d.id === selectedDataset)?.description}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Interview Stage</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  onChange={(e) => setSelectedStage(e.target.value)}
                  value={selectedStage}
                >
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <button 
                onClick={generateChallenge}
                disabled={!isEnvReady || isGenerating}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium text-white transition-all
                  ${!isEnvReady || isGenerating 
                    ? 'bg-slate-700 cursor-not-allowed opacity-50' 
                    : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 active:transform active:scale-[0.98]'}`}
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isGenerating ? 'Generating Challenge...' : 'Generate Interview Question'}
              </button>
            </div>
          </div>

          {/* Challenge Card */}
          {challenge ? (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden flex-1 flex flex-col">
              <div className="px-5 py-3 border-b border-slate-700 bg-slate-800/80 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-slate-200">The Challenge</span>
              </div>
              <div className="p-5 overflow-y-auto">
                <h3 className="text-lg font-bold text-white mb-2">{challenge.title}</h3>
                
                {challenge.dataset_description && (
                  <div className="mb-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Dataset</h4>
                    <p className="text-sm text-slate-300">{challenge.dataset_description}</p>
                  </div>
                )}

                {challenge.task_details && (
                  <div className="mb-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Task</h4>
                    <div className="prose prose-invert prose-sm max-w-none text-slate-300">
                      <ReactMarkdown>{challenge.task_details}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {!challenge.task_details && (
                  <div className="prose prose-invert prose-sm max-w-none text-slate-300">
                    <p>{challenge.question}</p>
                  </div>
                )}

                <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded text-xs text-indigo-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Tip: Use <code>print()</code> to see output. Use <code>plt.show()</code> (matplotlib) to render charts.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-600 gap-3">
              <BarChart2 className="w-10 h-10 opacity-20" />
              <p className="text-sm">Configure and generate to start</p>
            </div>
          )}
        </div>

        {/* Right Panel: Editor & Output */}
        <div className="lg:col-span-8 flex flex-col gap-4 h-full">
          
          {/* Editor Area */}
          <div className="flex-1 bg-slate-950 rounded-xl border border-slate-700 flex flex-col overflow-hidden shadow-2xl">
            {/* Tabs */}
            <div className="flex items-center bg-slate-900 border-b border-slate-800">
              <button 
                onClick={() => setActiveTab('editor')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'editor' ? 'border-indigo-500 text-indigo-400 bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
              >
                Python Editor
              </button>
              <button 
                onClick={() => setActiveTab('solution')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'solution' ? 'border-emerald-500 text-emerald-400 bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
              >
                Solution
              </button>
              <div className="flex-1"></div>
              {activeTab === 'editor' && (
                <button 
                  onClick={handleRunCode}
                  disabled={!isEnvReady || isRunning}
                  className={`mr-4 flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all
                    ${isRunning 
                      ? 'bg-slate-700 text-slate-400 cursor-wait' 
                      : 'bg-green-600 hover:bg-green-500 text-white hover:shadow-lg hover:shadow-green-500/20'}`}
                >
                  {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
                  {isRunning ? 'Running...' : 'Run Code'}
                </button>
              )}
            </div>

            {/* Code Content */}
            <div className="flex-1 relative">
              {activeTab === 'editor' ? (
                <textarea 
                  className="w-full h-full p-4 font-mono text-sm text-slate-300 bg-slate-950 outline-none resize-none leading-relaxed"
                  spellCheck="false"
                  value={userCode}
                  onChange={(e) => setUserCode(e.target.value)}
                  placeholder="# Python 3.11 Environment (Pandas, Numpy, Sklearn ready)"
                />
              ) : (
                <div className="h-full overflow-y-auto p-6 bg-slate-900">
                  {challenge ? (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-bold text-emerald-500 uppercase mb-2">Solution Code</h4>
                        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                          <pre className="font-mono text-sm text-emerald-300 whitespace-pre-wrap">{challenge.solution_code}</pre>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-indigo-500 uppercase mb-2">Explanation</h4>
                        <p className="text-sm text-slate-300 leading-relaxed">{challenge.explanation}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-600 italic">No challenge loaded.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Output Console */}
          <div className="h-[35%] bg-slate-900 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
            <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                <Terminal className="w-3 h-3" /> Console Output
              </span>
              {plotImage && (
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide flex items-center gap-2">
                  <ImageIcon className="w-3 h-3" /> Plot Generated
                </span>
              )}
            </div>
            
            <div className="flex-1 overflow-auto p-4 flex gap-4">
              {/* Text Output */}
              <div className="flex-1 font-mono text-xs text-slate-300 whitespace-pre-wrap">
                {output || <span className="text-slate-600 italic"># Output will appear here...</span>}
              </div>
              
              {/* Plot Output */}
              {plotImage && (
                <div className="w-1/2 bg-white rounded-lg p-2 flex items-center justify-center shadow-lg">
                  <img src={plotImage} alt="Generated Plot" className="max-w-full max-h-full object-contain" />
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default PythonPad;

