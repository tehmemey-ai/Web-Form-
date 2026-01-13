import React, { useState } from 'react';
import { RequestCategory, UrgencyLevel, DataRequestForm } from './types';
import { refineDescription, suggestCategory } from './services/geminiService';
import Input from './components/Input';
import Select from './components/Select';
import TextArea from './components/TextArea';
import Button from './components/Button';
import { MagicIcon, SuccessIcon, SendIcon, FormIcon, DashboardIcon, Spinner } from './components/Icons';

const App: React.FC = () => {
  const [formData, setFormData] = useState<DataRequestForm>({
    fullName: '',
    email: '',
    department: '',
    category: RequestCategory.UNSPECIFIED,
    urgency: UrgencyLevel.MEDIUM,
    description: '',
    dateRangeStart: '',
    dateRangeEnd: ''
  });

  const [isRefining, setIsRefining] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleMagicRefine = async () => {
    if (!formData.description.trim()) return;

    setIsRefining(true);
    setAiReasoning(null); // Clear previous suggestions
    try {
      // 1. Refine the text
      const refined = await refineDescription(formData.description);
      
      // 2. Suggest category based on the refined text
      const suggestion = await suggestCategory(refined);

      setFormData(prev => ({
        ...prev,
        description: refined,
        category: (prev.category === RequestCategory.UNSPECIFIED && suggestion) 
          ? suggestion.category 
          : prev.category
      }));

      if (suggestion) {
        setAiReasoning(suggestion.reasoning);
      }

    } catch (err) {
      console.error("AI assistance failed", err);
    } finally {
      setIsRefining(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    setSubmitted(true);
  };

  const handleReset = () => {
    setSubmitted(false);
    setFormData({
      fullName: '',
      email: '',
      department: '',
      category: RequestCategory.UNSPECIFIED,
      urgency: UrgencyLevel.MEDIUM,
      description: '',
      dateRangeStart: '',
      dateRangeEnd: ''
    });
    setAiReasoning(null);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-slate-100">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <SuccessIcon className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Request Sent!</h2>
          <p className="text-slate-600 mb-8">
            Your data request has been successfully submitted. You will receive a confirmation email at <span className="font-semibold text-slate-800">{formData.email}</span> shortly.
          </p>
          <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left text-sm">
            <p className="text-slate-500 mb-1">Request ID</p>
            <p className="font-mono text-slate-800">REQ-{Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
          </div>
          <Button onClick={handleReset} className="w-full">Submit Another Request</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 sm:p-6 md:p-8">
      <header className="max-w-4xl mx-auto mb-8 flex items-center space-x-3">
         <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <DashboardIcon className="text-white w-6 h-6" />
         </div>
         <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">DataRequest<span className="text-blue-600">.ai</span></h1>
            <p className="text-slate-500 text-sm">Internal data requisition portal</p>
         </div>
      </header>

      <main className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-white overflow-hidden flex flex-col md:flex-row">
        
        {/* Left Panel - Context/Info */}
        <div className="bg-slate-900 p-8 md:w-1/3 text-white flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <FormIcon className="w-5 h-5 mr-2 text-blue-400" /> 
              Internal Data Request Form
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Please fill out the details for the dataset or report you need. 
              Be specific about the fields, time range, and format required.
            </p>
            
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 backdrop-blur-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2">AI Assistant</h3>
              <p className="text-xs text-slate-300">
                Use the "Refine" button to automatically polish your request description and categorize it correctly.
              </p>
            </div>
          </div>

          <div className="mt-8 md:mt-0 text-xs text-slate-500">
            &copy; 2025 Data & Information Center of PMPTSP Team
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="p-8 md:w-2/3 bg-white">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Row 1: Personal Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Full Name"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Rebeca Juliana"
                required
              />
              <Input
                label="Handphone"
                type="handphone"
                name="handphone"
                value={formData.handphone}
                onChange={handleChange}
                placeholder="081312345667"
                required
              />
            </div>

            {/* Row 2: Unit Kerja*/}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Unit Kerja"
                name="department"
                value={formData.department}
                onChange={handleChange}
                placeholder="e.g. Bidang Pengembangan"
                required
              />
              <Select
                label="Urgency"
                name="urgency"
                value={formData.urgency}
                onChange={handleChange}
                options={[
                  { value: UrgencyLevel.LOW, label: 'Low - whenever possible' },
                  { value: UrgencyLevel.MEDIUM, label: 'Medium - within 3 days' },
                  { value: UrgencyLevel.HIGH, label: 'High - within 24 hours' },
                  { value: UrgencyLevel.CRITICAL, label: 'Critical - Immediate' },
                ]}
              />
            </div>

            {/* Row 3: Description with AI Magic */}
            <div className="space-y-1">
                <TextArea
                label="Request Description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe the data you need. Example: Rekap Data Proyek OSS Tahun 2024..."
                required
                action={
                    <button
                    type="button"
                    onClick={handleMagicRefine}
                    disabled={isRefining || !formData.description}
                    className="text-xs flex items-center text-indigo-600 hover:text-indigo-700 font-medium bg-indigo-50 px-2 py-1 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Use AI to improve clarity and auto-categorize"
                    >
                    {isRefining ? <Spinner className="w-3 h-3 mr-1" /> : <MagicIcon className="w-3 h-3 mr-1" />}
                    AI Refine & Categorize
                    </button>
                }
                />
                 {aiReasoning && (
                    <div className="text-xs text-indigo-600 bg-indigo-50 p-2 rounded-md flex items-start animate-fadeIn">
                        <div className="mr-2 mt-0.5"><MagicIcon className="w-3 h-3" /></div>
                        <span><strong>AI Categorized:</strong> {aiReasoning}</span>
                    </div>
                )}
            </div>

            {/* Row 4: Category & Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Select
                label="Category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                options={[
                  { value: RequestCategory.UNSPECIFIED, label: 'Pilih Tujuan Kebutuhan Data...' },
                  { value: RequestCategory.Bahan_Paparan, label: 'Bahan Paparan' },
                  { value: RequestCategory.Bahan_Perencanaan_dan_Penyusunan_Kebijakan, label: 'Bahan Perencanaan dan Penyusunan Kebijakan' },
                  { value: RequestCategory.Bahan_Publikasi, label: 'Bahan Publikasi' },
                  { value: RequestCategory.Bahan_Monitoring_dan_Evaluasi, label: 'Bahan Monitoring dan Evaluasi' },
                  { value: RequestCategory.Penelitian, label: 'Penelitian' },
                  { value: RequestCategory.TL_Disposisi, label: 'TL Disposisi Surat Masuk dll' },
                  { value: RequestCategory.OTHER, label: 'Other' },
                ]}
                required
              />
               <div className="flex gap-2">
                  <div className="w-1/2">
                      <Input
                          label="Start Date Periode"
                          type="date"
                          name="dateRangeStart"
                          value={formData.dateRangeStart}
                          onChange={handleChange}
                      />
                  </div>
                  <div className="w-1/2">
                      <Input
                          label="End Date Periode"
                          type="date"
                          name="dateRangeEnd"
                          value={formData.dateRangeEnd}
                          onChange={handleChange}
                      />
                  </div>
               </div>
            </div>

            {/* Footer Action */}
            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <Button type="submit" isLoading={isSubmitting} className="w-full md:w-auto">
                <SendIcon className="w-4 h-4 mr-2" />
                Submit Request
              </Button>
            </div>

          </form>
        </div>
      </main>
      
      <footer className="max-w-4xl mx-auto mt-8 text-center text-slate-400 text-sm">
        <p>Powered by Gemini models</p>
      </footer>
    </div>
  );
};

export default App;