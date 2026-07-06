import React, { useState, useEffect } from 'react';
import { RequestCategory, UrgencyLevel, DataRequestForm, DataRequest } from './types';
import { refineDescription, suggestCategory } from './services/geminiService';
import Input from './components/Input';
import Select from './components/Select';
import TextArea from './components/TextArea';
import Button from './components/Button';
import { 
  MagicIcon, SuccessIcon, SendIcon, FormIcon, DashboardIcon, Spinner, 
  LogOutIcon, UserIcon, ClockIcon, DoneIcon, XIcon, DownloadIcon, TrashIcon,
  PaperclipIcon, EyeIcon, UploadIcon, CloseIcon
} from './components/Icons';
import { auth, db, signInWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import * as XLSX from 'xlsx';
import { 
  collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, 
  where, updateDoc, doc, deleteDoc, getDocFromServer 
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestore-utils';

const ADMIN_EMAIL = 'tehmemey@gmail.com';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<'form' | 'dashboard'>('form');

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  const [formData, setFormData] = useState<DataRequestForm>({
    fullName: '',
    email: '',
    handphone: '',
    department: '',
    category: RequestCategory.UNSPECIFIED,
    urgency: UrgencyLevel.MEDIUM,
    description: '',
    dateRangeStart: '',
    dateRangeEnd: '',
    otherCategoryReason: '',
    supportingDocName: '',
    supportingDocSize: undefined,
    supportingDocType: '',
    supportingDocUrl: ''
  });

  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [isRefining, setIsRefining] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);

  // Client-side search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Filter requests client-side (no data is lost, database remains intact!)
  const filteredRequests = requests.filter(req => {
    // 1. Status Filter
    if (filterStatus !== 'ALL' && req.status !== filterStatus) {
      return false;
    }

    // 2. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = req.fullName?.toLowerCase().includes(q) || false;
      const matchDesc = req.description?.toLowerCase().includes(q) || false;
      const matchDept = req.department?.toLowerCase().includes(q) || false;
      const matchCat = req.category?.toLowerCase().includes(q) || false;
      if (!matchName && !matchDesc && !matchDept && !matchCat) {
        return false;
      }
    }

    // 3. Date Filter (createdAt)
    if (req.createdAt) {
      const reqDate = req.createdAt.toDate ? req.createdAt.toDate() : new Date();
      const reqDateStr = reqDate.toISOString().split('T')[0]; // YYYY-MM-DD

      if (filterStartDate && reqDateStr < filterStartDate) {
        return false;
      }
      if (filterEndDate && reqDateStr > filterEndDate) {
        return false;
      }
    } else {
      if (filterStartDate || filterEndDate) {
        return false;
      }
    }

    return true;
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
      if (currentUser) {
        setIsAdmin(currentUser.email === ADMIN_EMAIL);
        setFormData(prev => ({
          ...prev,
          fullName: currentUser.displayName || '',
          email: currentUser.email || ''
        }));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const requestsRef = collection(db, 'requests');
    let q;
    if (user.email === ADMIN_EMAIL) {
      q = query(requestsRef, orderBy('createdAt', 'desc'));
    } else {
      q = query(requestsRef, where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedRequests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DataRequest[];
      setRequests(fetchedRequests);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
    });

    return () => unsubscribe();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    if (!file) return;

    // Check file size (limit to 800KB)
    const MAX_SIZE = 800 * 1024; // 819200 bytes
    if (file.size > MAX_SIZE) {
      setFileError('File terlalu besar! Batas maksimal ukuran file adalah 800KB agar aman saat dikirim.');
      e.target.value = ''; // Reset input
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({
        ...prev,
        supportingDocName: file.name,
        supportingDocSize: file.size,
        supportingDocType: file.type,
        supportingDocUrl: reader.result as string
      }));
    };
    reader.onerror = () => {
      setFileError('Gagal membaca file. Silakan coba lagi.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setFormData(prev => ({
      ...prev,
      supportingDocName: '',
      supportingDocSize: undefined,
      supportingDocType: '',
      supportingDocUrl: ''
    }));
    setFileError(null);
  };

  const handleMagicRefine = async () => {
    if (!formData.description.trim()) return;

    setIsRefining(true);
    setAiReasoning(null);
    try {
      const refined = await refineDescription(formData.description);
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
    if (!user) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'requests'), {
        ...formData,
        uid: user.uid,
        createdAt: serverTimestamp(),
        status: 'PENDING'
      });
      setSubmitted(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'requests');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (requestId: string, newStatus: string) => {
    try {
      const requestRef = doc(db, 'requests', requestId);
      await updateDoc(requestRef, { status: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!window.confirm('Are you sure you want to delete this request?')) return;
    try {
      await deleteDoc(doc(db, 'requests', requestId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `requests/${requestId}`);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setFormData({
      fullName: user?.displayName || '',
      email: user?.email || '',
      handphone: '',
      department: '',
      category: RequestCategory.UNSPECIFIED,
      urgency: UrgencyLevel.MEDIUM,
      description: '',
      dateRangeStart: '',
      dateRangeEnd: '',
      otherCategoryReason: '',
      supportingDocName: '',
      supportingDocSize: undefined,
      supportingDocType: '',
      supportingDocUrl: ''
    });
    setAiReasoning(null);
  };

  const handleExportExcel = () => {
    const targets = filteredRequests.length > 0 ? filteredRequests : requests;
    if (targets.length === 0) return;

    const exportData = targets.map(req => ({
      'Request ID': req.id,
      'Status': req.status,
      'Urgency': req.urgency,
      'Full Name': req.fullName,
      'Email': req.email,
      'Handphone': req.handphone,
      'Department': req.department,
      'Category': req.category,
      'Other Category Reason': req.otherCategoryReason || '',
      'Supporting Document': req.supportingDocName || '',
      'Has Document?': req.supportingDocUrl ? 'Yes' : 'No',
      'Description': req.description,
      'Start Date': req.dateRangeStart,
      'End Date': req.dateRangeEnd,
      'Created At': req.createdAt?.toDate ? req.createdAt.toDate().toLocaleString() : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Requests');
    XLSX.writeFile(workbook, `Data_Requests_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Spinner className="w-12 h-12 text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-blue-200">
            <DashboardIcon className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">DataRequest.ai</h1>
          <p className="text-slate-500 mb-10 leading-relaxed">
            Welcome to the internal data requisition portal. Please sign in with your corporate account to continue.
          </p>
          <Button onClick={signInWithGoogle} className="w-full py-4 text-lg">
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-slate-100">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <SuccessIcon className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Request Sent!</h2>
          <p className="text-slate-600 mb-8">
            Your data request has been successfully submitted. You can track its progress in your dashboard.
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={handleReset} className="w-full">Submit Another Request</Button>
            <Button onClick={() => { setSubmitted(false); setView('dashboard'); }} variant="outline" className="w-full">Go to Dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navbar */}
      <nav className="bg-white/80 border-b border-slate-200 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setView('form')}>
              <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 group-hover:scale-105 transition-transform">
                <DashboardIcon className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-extrabold text-slate-900 tracking-tight">DataRequest<span className="text-blue-600">.ai</span></span>
            </div>
            
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => setView('form')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 flex items-center gap-2 ${
                  view === 'form' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FormIcon className="w-4 h-4" />
                <span className="hidden sm:inline">New Request</span>
              </button>
              
              <button 
                onClick={() => setView('dashboard')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 flex items-center gap-2 ${
                  view === 'dashboard' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <DashboardIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
              
              <div className="h-6 w-px bg-slate-200 mx-2"></div>
              
              <div className="flex items-center space-x-3 pl-2">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-slate-900 leading-none">{user.displayName}</p>
                  <p className="text-[10px] text-blue-600 font-semibold">{isAdmin ? 'ADMINISTRATOR' : 'EMPLOYEE'}</p>
                </div>
                <div className="relative group">
                  <img src={user.photoURL || ''} alt="" className="w-9 h-9 rounded-xl border-2 border-white shadow-sm ring-1 ring-slate-100" />
                  <button 
                    onClick={logout} 
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Logout"
                  >
                    <LogOutIcon className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {view === 'form' ? (
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col md:flex-row">
            {/* Left Panel */}
            <div className="bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-8 md:w-1/3 text-white flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-blue-600/20 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/30">
                   <FormIcon className="w-6 h-6 text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold mb-4 tracking-tight">
                  Request Form
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed mb-8">
                  Get the data you need efficiently. Fill out the details and let our AI assistant help you refine your request.
                </p>
                
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                    <div className="flex items-center text-blue-400 mb-2">
                       <MagicIcon className="w-4 h-4 mr-2" />
                       <h3 className="text-xs font-bold uppercase tracking-wider">AI Assistant</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-tight">
                      Use "Refine" to polish your description and auto-categorize.
                    </p>
                  </div>
                  
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                    <div className="flex items-center text-emerald-400 mb-2">
                       <SuccessIcon className="w-4 h-4 mr-2" />
                       <h3 className="text-xs font-bold uppercase tracking-wider">Tracking</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-tight">
                      Monitor your request status from "Pending" to "Approved".
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-12 md:mt-0 pt-6 border-t border-white/10">
                <p className="text-[10px] text-slate-500 font-medium">
                  &copy; 2026 Data & Information Center
                </p>
              </div>
            </div>

            {/* Right Panel - Form */}
            <div className="p-8 md:w-2/3 bg-white">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input
                    label="Full Name"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    placeholder="Enter full name"
                    required
                  />
                  <Input
                    label="Handphone"
                    name="handphone"
                    value={formData.handphone}
                    onChange={handleChange}
                    placeholder="Enter phone number"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input
                    label="Unit Kerja"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    placeholder="Enter department"
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
                        >
                        {isRefining ? <Spinner className="w-3 h-3 mr-1" /> : <MagicIcon className="w-3 h-3 mr-1" />}
                        AI Refine
                        </button>
                    }
                    />
                     {aiReasoning && (
                        <div className="text-xs text-indigo-600 bg-indigo-50 p-2 rounded-md flex items-start">
                            <div className="mr-2 mt-0.5"><MagicIcon className="w-3 h-3" /></div>
                            <span><strong>AI Categorized:</strong> {aiReasoning}</span>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-4">
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

                    {formData.category === RequestCategory.OTHER && (
                      <Input
                        label="Alasan / Tujuan Lainnya"
                        name="otherCategoryReason"
                        value={formData.otherCategoryReason || ''}
                        onChange={handleChange}
                        placeholder="Ketik alasan atau tujuan data lainnya..."
                        required
                      />
                    )}
                   </div>
                   <div className="flex gap-2">
                      <div className="w-1/2">
                          <Input
                              label="Start Date"
                              type="date"
                              name="dateRangeStart"
                              value={formData.dateRangeStart}
                              onChange={handleChange}
                          />
                      </div>
                      <div className="w-1/2">
                          <Input
                              label="End Date"
                              type="date"
                              name="dateRangeEnd"
                              value={formData.dateRangeEnd}
                              onChange={handleChange}
                          />
                      </div>
                   </div>
                </div>

                {/* Supporting Document Upload Component */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Supporting Document / Dokumen Pendukung (Optional)
                  </label>
                  <div className={`border-2 border-dashed rounded-xl p-4 transition-all duration-300 ${
                    formData.supportingDocName 
                      ? 'border-emerald-300 bg-emerald-50/30' 
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                  }`}>
                    {!formData.supportingDocName ? (
                      <div className="flex flex-col items-center justify-center space-y-2 text-center py-2">
                        <UploadIcon className="w-8 h-8 text-slate-400" />
                        <div className="text-sm text-slate-600">
                          <label className="relative cursor-pointer bg-white rounded-md font-semibold text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500 px-2 py-1 border border-slate-200 shadow-sm transition-all inline-block">
                            <span>Pilih File</span>
                            <input 
                              type="file" 
                              className="sr-only" 
                              onChange={handleFileChange}
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                            />
                          </label>
                          <span className="pl-1 text-slate-500">atau seret file ke sini</span>
                        </div>
                        <p className="text-xs text-slate-400">
                          PDF, Word, Excel, atau Gambar (Maksimal 800KB)
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-white rounded-lg border border-emerald-100 p-3 shadow-sm">
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 flex-shrink-0">
                            <PaperclipIcon className="w-5 h-5" />
                          </div>
                          <div className="text-left overflow-hidden">
                            <p className="text-sm font-medium text-slate-700 truncate max-w-[200px] md:max-w-xs">
                              {formData.supportingDocName}
                            </p>
                            <p className="text-xs text-slate-400">
                              {(formData.supportingDocSize ? (formData.supportingDocSize / 1024).toFixed(1) : 0)} KB
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {formData.supportingDocUrl && (
                            <a 
                              href={formData.supportingDocUrl} 
                              download={formData.supportingDocName}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
                              title="Download File"
                            >
                              <DownloadIcon className="w-4 h-4" />
                            </a>
                          )}
                          <button 
                            type="button" 
                            onClick={handleRemoveFile}
                            className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-500 hover:text-rose-700 transition-colors"
                            title="Hapus File"
                          >
                            <CloseIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                    {fileError && (
                      <p className="text-xs text-rose-500 font-medium mt-2 flex items-center">
                        <span className="mr-1">⚠️</span> {fileError}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <Button type="submit" isLoading={isSubmitting} className="w-full md:w-auto">
                    <SendIcon className="w-4 h-4 mr-2" />
                    Submit Request
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Request Dashboard</h2>
                <p className="text-slate-500 text-sm">Monitor and manage all data requisition tasks</p>
              </div>
              <div className="flex items-center gap-3">
                {requests.length > 0 && (
                  <Button 
                    onClick={handleExportExcel} 
                    variant="outline" 
                    className="text-xs py-2 px-4 h-auto shadow-sm border-slate-200"
                  >
                    <DownloadIcon className="w-4 h-4 mr-2 text-slate-500" />
                    Export to Excel
                  </Button>
                )}
                {isAdmin && (
                  <div className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 flex items-center">
                    <UserIcon className="w-3.5 h-3.5 mr-1.5" />
                    Admin View
                  </div>
                )}
              </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button 
                onClick={() => setFilterStatus('ALL')}
                className={`text-left bg-white p-4 rounded-xl border transition-all ${
                  filterStatus === 'ALL' 
                    ? 'border-blue-500 ring-2 ring-blue-100 shadow-md scale-[1.02]' 
                    : 'border-slate-100 shadow-sm hover:border-slate-300'
                }`}
              >
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total</p>
                <p className="text-2xl font-bold text-slate-900">{requests.length}</p>
              </button>
              <button 
                onClick={() => setFilterStatus('PENDING')}
                className={`text-left bg-amber-50/50 p-4 rounded-xl border transition-all ${
                  filterStatus === 'PENDING' 
                    ? 'border-amber-500 ring-2 ring-amber-100 shadow-md scale-[1.02]' 
                    : 'border-amber-100 shadow-sm hover:border-amber-200'
                }`}
              >
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">Pending</p>
                <p className="text-2xl font-bold text-amber-700">
                  {requests.filter(r => r.status === 'PENDING').length}
                </p>
              </button>
              <button 
                onClick={() => setFilterStatus('COMPLETED')}
                className={`text-left bg-emerald-50/50 p-4 rounded-xl border transition-all ${
                  filterStatus === 'COMPLETED' 
                    ? 'border-emerald-500 ring-2 ring-emerald-100 shadow-md scale-[1.02]' 
                    : 'border-emerald-100 shadow-sm hover:border-emerald-200'
                }`}
              >
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Approved</p>
                <p className="text-2xl font-bold text-emerald-700">
                  {requests.filter(r => r.status === 'COMPLETED').length}
                </p>
              </button>
              <button 
                onClick={() => setFilterStatus('REJECTED')}
                className={`text-left bg-rose-50/50 p-4 rounded-xl border transition-all ${
                  filterStatus === 'REJECTED' 
                    ? 'border-rose-500 ring-2 ring-rose-100 shadow-md scale-[1.02]' 
                    : 'border-rose-100 shadow-sm hover:border-rose-200'
                }`}
              >
                <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-1">Rejected</p>
                <p className="text-2xl font-bold text-rose-700">
                  {requests.filter(r => r.status === 'REJECTED').length}
                </p>
              </button>
            </div>

            {/* Search and Filters Bar */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Search Input */}
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Pencarian Data</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari nama, deskripsi, unit kerja, atau kategori..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-850 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold bg-slate-200/60 hover:bg-slate-200 px-1.5 py-0.5 rounded-full"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Start Date Filter */}
                <div className="w-full md:w-48">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Mulai Tanggal</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                {/* End Date Filter */}
                <div className="w-full md:w-48">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Sampai Tanggal</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Reset Filters & Active Indicators */}
              {(searchQuery || filterStartDate || filterEndDate || filterStatus !== 'ALL') && (
                <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-100 gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-500 font-medium">Filter aktif:</span>
                    {filterStatus !== 'ALL' && (
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 border border-blue-100">
                        Status: {filterStatus}
                        <button onClick={() => setFilterStatus('ALL')} className="hover:text-blue-900 font-extrabold ml-1">✕</button>
                      </span>
                    )}
                    {searchQuery && (
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 border border-blue-100 max-w-xs truncate">
                        Cari: "{searchQuery}"
                        <button onClick={() => setSearchQuery('')} className="hover:text-blue-900 font-extrabold ml-1">✕</button>
                      </span>
                    )}
                    {(filterStartDate || filterEndDate) && (
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 border border-blue-100">
                        Tanggal: {filterStartDate || 'Awal'} s.d {filterEndDate || 'Akhir'}
                        <button 
                          onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} 
                          className="hover:text-blue-900 font-extrabold ml-1"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                    <span className="text-slate-400">({filteredRequests.length} ditemukan)</span>
                  </div>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterStartDate('');
                      setFilterEndDate('');
                      setFilterStatus('ALL');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center hover:underline transition-all"
                  >
                    Hapus Semua Filter
                  </button>
                </div>
              )}
            </div>

            {requests.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClockIcon className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">No requests found</h3>
                <p className="text-slate-500">You haven't submitted any data requests yet.</p>
                <Button onClick={() => setView('form')} variant="outline" className="mt-6">
                  Create New Request
                </Button>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClockIcon className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Tidak ada data yang cocok</h3>
                <p className="text-slate-500 text-sm">Tidak ditemukan permohonan data yang sesuai dengan pencarian atau filter Anda.</p>
                <Button 
                  onClick={() => {
                    setSearchQuery('');
                    setFilterStartDate('');
                    setFilterEndDate('');
                    setFilterStatus('ALL');
                  }} 
                  variant="outline" 
                  className="mt-6"
                >
                  Reset Pencarian & Filter
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredRequests.map((req) => (
                  <div key={req.id} className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all duration-300 border-l-4 overflow-hidden" 
                    style={{ borderLeftColor: 
                      req.status === 'PENDING' ? '#f59e0b' : 
                      req.status === 'PROCESSING' ? '#3b82f6' : 
                      req.status === 'COMPLETED' ? '#10b981' : '#f43f5e' 
                    }}>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center ${
                            req.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                            req.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700' :
                            req.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {req.status === 'COMPLETED' ? 'APPROVED' : req.status}
                          </span>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            req.urgency === UrgencyLevel.CRITICAL ? 'bg-red-600 text-white shadow-sm' :
                            req.urgency === UrgencyLevel.HIGH ? 'bg-red-50 text-red-600 border border-red-100' :
                            'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {req.urgency}
                          </span>
                          <div className="flex items-center text-[11px] text-slate-400 font-medium">
                            <ClockIcon className="w-3 h-3 mr-1" />
                            {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                          </div>
                        </div>
                        
                        <h3 className="text-lg font-bold text-slate-900 leading-tight mb-2">
                          {req.description}
                        </h3>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-4">
                          <div className="flex items-center text-xs text-slate-500 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                            <UserIcon className="w-3.5 h-3.5 mr-2 text-slate-400" />
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-700">{req.fullName}</span>
                              <span className="text-[10px] opacity-75">{req.department}</span>
                            </div>
                          </div>
                          <div className="flex items-center text-xs text-slate-500 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                            <FormIcon className="w-3.5 h-3.5 mr-2 text-slate-400" />
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-700">Category</span>
                              <span className="text-[10px] opacity-75">
                                {req.category}
                                {req.category === 'Other' && req.otherCategoryReason && ` (${req.otherCategoryReason})`}
                              </span>
                            </div>
                          </div>
                          {(req.dateRangeStart || req.dateRangeEnd) && (
                            <div className="flex items-center text-xs text-slate-500 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                              <ClockIcon className="w-3.5 h-3.5 mr-2 text-slate-400" />
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-700">Periode</span>
                                <span className="text-[10px] opacity-75">{req.dateRangeStart || '?'} to {req.dateRangeEnd || '?'}</span>
                              </div>
                            </div>
                          )}
                          {req.supportingDocName && (
                            <div className="flex items-center text-xs text-slate-500 bg-emerald-50/50 border border-emerald-100 px-2 py-1.5 rounded-lg">
                              <PaperclipIcon className="w-3.5 h-3.5 mr-2 text-emerald-500 flex-shrink-0" />
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="font-semibold text-emerald-800 truncate" title={req.supportingDocName}>
                                  {req.supportingDocName}
                                </span>
                                {req.supportingDocUrl ? (
                                  <a 
                                    href={req.supportingDocUrl} 
                                    download={req.supportingDocName}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold underline flex items-center mt-0.5"
                                  >
                                    <DownloadIcon className="w-2.5 h-2.5 mr-1" />
                                    Download Dokumen
                                  </a>
                                ) : (
                                  <span className="text-[10px] opacity-75">No download available</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center md:items-start justify-end gap-1 mt-2 md:mt-0">
                        {isAdmin && (
                          <div className="flex flex-row md:flex-col gap-1">
                            <button 
                              onClick={() => handleUpdateStatus(req.id, 'PROCESSING')}
                              className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all flex items-center justify-center border border-transparent hover:border-blue-200"
                              title="Set to Processing"
                            >
                              <ClockIcon className="w-5 h-5" />
                              <span className="sr-only">Process</span>
                            </button>
                            <button 
                              onClick={() => handleUpdateStatus(req.id, 'COMPLETED')}
                              className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-all flex items-center justify-center border border-transparent hover:border-emerald-200"
                              title="Set to Approved"
                            >
                              <DoneIcon className="w-5 h-5" />
                              <span className="sr-only">Approve</span>
                            </button>
                            <button 
                              onClick={() => handleUpdateStatus(req.id, 'REJECTED')}
                              className="p-2 text-rose-600 hover:bg-rose-100 rounded-lg transition-all flex items-center justify-center border border-transparent hover:border-rose-200"
                              title="Reject Request"
                            >
                              <XIcon className="w-5 h-5" />
                              <span className="sr-only">Reject</span>
                            </button>
                            <div className="h-px w-full bg-slate-100 my-1 hidden md:block"></div>
                            <button 
                              onClick={() => handleDeleteRequest(req.id)}
                              className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all flex items-center justify-center border border-transparent"
                              title="Delete Request Permanently"
                            >
                              <TrashIcon className="w-5 h-5" />
                              <span className="sr-only">Delete Permanently</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
