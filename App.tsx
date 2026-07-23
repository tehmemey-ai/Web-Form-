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
  PaperclipIcon, EyeIcon, UploadIcon, CloseIcon, LockIcon, KeyIcon, ExternalLinkIcon, FileCheckIcon, TagIcon
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
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);

  // Client-side search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [expandedRequests, setExpandedRequests] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedRequests(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Download PIN Protection & Unlocking States
  const [unlockedDownloads, setUnlockedDownloads] = useState<Record<string, boolean>>({});
  const [downloadModalReq, setDownloadModalReq] = useState<DataRequest | null>(null);
  const [inputDownloadPin, setInputDownloadPin] = useState('');
  const [downloadPinError, setDownloadPinError] = useState<string | null>(null);

  // Upload Result Modal States
  const [uploadModalReq, setUploadModalReq] = useState<DataRequest | null>(null);
  const [customDownloadPinInput, setCustomDownloadPinInput] = useState('');
  const [resultFileName, setResultFileName] = useState('');
  const [resultFileUrl, setResultFileUrl] = useState('');
  const [resultDriveUrl, setResultDriveUrl] = useState('');
  const [resultNotes, setResultNotes] = useState('');
  const [resultStatus, setResultStatus] = useState<'COMPLETED' | 'PROCESSING'>('COMPLETED');
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [resultFileError, setResultFileError] = useState<string | null>(null);

  const handleOpenUploadModal = (req: DataRequest) => {
    setUploadModalReq(req);
    
    // Auto-generate a unique 6-digit PIN if no PIN has been assigned yet
    const initialPin = req.downloadPin || Math.floor(100000 + Math.random() * 900000).toString();
    setCustomDownloadPinInput(initialPin);

    setResultFileName(req.resultFileName || '');
    setResultFileUrl(req.resultFileUrl || '');
    setResultDriveUrl(req.resultDriveUrl || '');
    setResultNotes(req.resultNotes || '');
    setResultStatus(req.status === 'REJECTED' || req.status === 'PENDING' ? 'COMPLETED' : (req.status as 'COMPLETED' | 'PROCESSING'));
    setResultFileError(null);
  };

  const handleOpenDownloadModal = (req: DataRequest) => {
    setDownloadModalReq(req);
    setInputDownloadPin(isAdmin ? (req.downloadPin || '123456') : '');
    setDownloadPinError(null);
  };

  const handleVerifyDownloadPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!downloadModalReq) return;

    const targetPin = downloadModalReq.downloadPin || localStorage.getItem('UPLOAD_RESULT_PASSCODE') || '123456';
    if (inputDownloadPin.trim() === targetPin.trim()) {
      setUnlockedDownloads(prev => ({ ...prev, [downloadModalReq.id]: true }));
      setDownloadModalReq(null);
    } else {
      setDownloadPinError('PIN Akses salah! Silakan hubungi Admin / Petugas untuk mengonfirmasi dan mendapatkan PIN Akses yang benar.');
    }
  };

  const handleResultFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setResultFileError(null);
    if (!file) return;

    const MAX_SIZE = 800 * 1024; // 800KB
    if (file.size > MAX_SIZE) {
      setResultFileError('File terlalu besar (> 800KB). Untuk file besar, gunakan Tautan Drive / Cloud Storage di bawah.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setResultFileName(file.name);
      setResultFileUrl(reader.result as string);
    };
    reader.onerror = () => {
      setResultFileError('Gagal membaca file. Silakan coba lagi.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveResultFile = () => {
    setResultFileName('');
    setResultFileUrl('');
    setResultFileError(null);
  };

  const handleSaveResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadModalReq) return;

    if (!resultFileName && !resultDriveUrl && !resultNotes.trim()) {
      setResultFileError('Harap lampirkan file hasil data, tautan drive, atau isi catatan hasil.');
      return;
    }

    setIsSavingResult(true);
    try {
      const requestRef = doc(db, 'requests', uploadModalReq.id);
      await updateDoc(requestRef, {
        status: resultStatus,
        resultFileName: resultFileName || null,
        resultFileUrl: resultFileUrl || null,
        resultDriveUrl: resultDriveUrl.trim() || null,
        resultNotes: resultNotes.trim() || null,
        downloadPin: customDownloadPinInput.trim() || '123456',
        resultUploadedAt: serverTimestamp()
      });

      setUploadModalReq(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${uploadModalReq.id}`);
    } finally {
      setIsSavingResult(false);
    }
  };

  // Filter requests client-side (no data is lost, database remains intact!)
  const filteredRequests = requests.filter(req => {
    // 1. Status Filter
    if (filterStatus !== 'ALL' && req.status !== filterStatus) {
      return false;
    }

    // 2. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim().replace('#', '');
      const matchId = req.id?.toLowerCase().includes(q) || false;
      const matchName = req.fullName?.toLowerCase().includes(q) || false;
      const matchDesc = req.description?.toLowerCase().includes(q) || false;
      const matchDept = req.department?.toLowerCase().includes(q) || false;
      const matchCat = req.category?.toLowerCase().includes(q) || false;
      if (!matchId && !matchName && !matchDesc && !matchDept && !matchCat) {
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
      // Clean undefined values from the payload to prevent Firestore write errors
      const cleanedData = Object.entries(formData).reduce((acc, [key, val]) => {
        if (val !== undefined) {
          acc[key] = val;
        }
        return acc;
      }, {} as Record<string, any>);

      const docRef = await addDoc(collection(db, 'requests'), {
        ...cleanedData,
        uid: user.uid,
        createdAt: serverTimestamp(),
        status: 'PENDING'
      });
      setCreatedRequestId(docRef.id);
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
    setCreatedRequestId(null);
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
      'Has Result?': (req.resultFileName || req.resultDriveUrl || req.resultNotes) ? 'Yes' : 'No',
      'Result File Name': req.resultFileName || '',
      'Result Drive Link': req.resultDriveUrl || '',
      'Result Notes': req.resultNotes || '',
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
          <h1 className="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight">InternalDataRequest<span className="text-blue-600">.Portal</span></h1>
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
    const formattedReqId = createdRequestId ? `#${createdRequestId.slice(0, 8).toUpperCase()}` : '';
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8 max-w-md w-full text-center border border-slate-100 relative overflow-hidden">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-200">
            <SuccessIcon className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 mb-2 tracking-tight">Request Sent!</h2>
          <p className="text-slate-600 text-xs sm:text-sm mb-5 leading-relaxed">
            Your data request has been successfully submitted. You can track its progress in your dashboard.
          </p>

          {/* Request ID Display Box */}
          {createdRequestId && (
            <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-4 mb-6 text-left space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                  <TagIcon className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Your Request ID</span>
                </span>
                <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200 shadow-2xs animate-pulse">
                  📸 Save / Screenshot
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 bg-white border border-indigo-200/90 rounded-xl px-3.5 py-2.5">
                <code className="text-base sm:text-lg font-mono font-black text-indigo-950 tracking-wider select-all">
                  {formattedReqId}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(formattedReqId);
                    alert(`Request ID (${formattedReqId}) copied to clipboard!`);
                  }}
                  className="text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1.5 rounded-lg border border-indigo-200 transition-all flex-shrink-0"
                >
                  Copy ID
                </button>
              </div>

              <p className="text-[11px] text-indigo-900/90 leading-relaxed font-normal pt-1">
                💡 <strong>Important:</strong> Please <strong>Save or Screenshot</strong> your Request ID above. Provide this ID when contacting the Admin to request your access PIN for data download.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <Button onClick={() => { setSubmitted(false); setView('dashboard'); }} className="w-full bg-blue-600 hover:bg-blue-700 py-2.5 text-xs sm:text-sm font-bold">
              Go to Dashboard
            </Button>
            <Button onClick={handleReset} variant="outline" className="w-full py-2.5 text-xs sm:text-sm font-semibold border-slate-200 text-slate-700">
              Submit Another Request
            </Button>
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
              <span className="text-xl font-extrabold text-slate-900 tracking-tight">InternalDataRequest<span className="text-blue-600">.Portal</span></span>
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
                    maxLength={1500}
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
                    <div className="flex justify-between text-[11px] text-slate-400 font-medium px-1 mt-1">
                      <span>Deskripsikan detail permohonan data Anda agar mempermudah verifikasi.</span>
                      <span className={formData.description.length >= 1400 ? 'text-amber-600 font-semibold' : ''}>
                        {formData.description.length}/1500
                      </span>
                    </div>
                     {aiReasoning && (
                        <div className="text-xs text-indigo-600 bg-indigo-50 p-2 rounded-md flex items-start mt-2">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <button 
                onClick={() => setFilterStatus('ALL')}
                className={`text-left bg-white p-4 rounded-xl border transition-all ${
                  filterStatus === 'ALL' 
                    ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-md scale-[1.02]' 
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
                onClick={() => setFilterStatus('PROCESSING')}
                className={`text-left bg-blue-50/50 p-4 rounded-xl border transition-all ${
                  filterStatus === 'PROCESSING' 
                    ? 'border-blue-500 ring-2 ring-blue-100 shadow-md scale-[1.02]' 
                    : 'border-blue-100 shadow-sm hover:border-blue-200'
                }`}
              >
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Processing</p>
                <p className="text-2xl font-bold text-blue-700">
                  {requests.filter(r => r.status === 'PROCESSING').length}
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
                      placeholder="Cari Request ID, nama, deskripsi, unit kerja, atau kategori..."
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
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 shadow-2xs" title={`Request ID: ${req.id}`}>
                            <TagIcon className="w-3 h-3 text-slate-500" />
                            <span>Request ID: #{req.id.slice(0, 8).toUpperCase()}</span>
                          </span>
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
                        
                        {/* Elegant Structured Header based on category */}
                        <h3 className="text-base md:text-lg font-bold text-slate-900 leading-snug flex items-center gap-2 mb-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                          <span>
                            {req.category === 'Other' && req.otherCategoryReason
                              ? req.otherCategoryReason 
                              : req.category.replace(/_/g, ' ')}
                          </span>
                        </h3>

                        {/* Description block styled as an elegant inset panel */}
                        <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-100/50 rounded-xl p-4 transition-colors duration-200 mt-2 mb-3.5">
                          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                            <FormIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span>Detail Deskripsi Permohonan</span>
                          </div>
                          <div className="text-slate-600 text-sm leading-relaxed font-normal whitespace-pre-wrap break-words">
                            {req.description.length > 180 && !expandedRequests[req.id] ? (
                              <>
                                {req.description.slice(0, 180)}...
                                <div className="mt-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(req.id)}
                                    className="text-blue-600 hover:text-blue-800 font-semibold text-xs hover:underline inline-flex items-center"
                                  >
                                    Selengkapnya &darr;
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                {req.description}
                                {req.description.length > 180 && (
                                  <div className="mt-2 border-t border-slate-100/50 pt-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleExpand(req.id)}
                                      className="text-blue-600 hover:text-blue-800 font-semibold text-xs hover:underline inline-flex items-center"
                                    >
                                      Sembunyikan &uarr;
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        
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

                        {/* Hasil Data Section */}
                        {(req.resultFileName || req.resultFileUrl || req.resultDriveUrl || req.resultNotes) ? (
                          unlockedDownloads[req.id] ? (
                            <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-xl p-3.5 mt-3 shadow-2xs animate-in fade-in duration-200">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs uppercase tracking-wider">
                                  <FileCheckIcon className="w-4 h-4 text-emerald-600" />
                                  <span>Hasil Data Terbuka</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {isAdmin && (
                                    <button
                                      onClick={() => handleOpenUploadModal(req)}
                                      className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 bg-white border border-indigo-200 px-2.5 py-1 rounded-lg shadow-2xs hover:bg-indigo-50 flex items-center gap-1 transition-all"
                                    >
                                      <span>Edit Results</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setUnlockedDownloads(prev => ({ ...prev, [req.id]: false }))}
                                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs hover:bg-slate-50 flex items-center gap-1 transition-all"
                                    title="Kunci kembali hasil data"
                                  >
                                    <LockIcon className="w-3 h-3 text-slate-500" />
                                    <span>Kunci</span>
                                  </button>
                                </div>
                              </div>

                              {req.resultNotes && (
                                <p className="text-xs text-emerald-950 font-normal mb-2.5 bg-white/80 p-2.5 rounded-lg border border-emerald-100/90 whitespace-pre-wrap">
                                  {req.resultNotes}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-2">
                                {req.resultFileUrl && req.resultFileName && (
                                  <a
                                    href={req.resultFileUrl}
                                    download={req.resultFileName}
                                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-2xs transition-all"
                                  >
                                    <DownloadIcon className="w-3.5 h-3.5" />
                                    <span>Unduh File: {req.resultFileName}</span>
                                  </a>
                                )}

                                {req.resultDriveUrl && (
                                  <a
                                    href={req.resultDriveUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-emerald-800 border border-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-2xs transition-all"
                                  >
                                    <ExternalLinkIcon className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Buka Tautan Cloud / Drive</span>
                                  </a>
                                )}
                              </div>

                              {isAdmin && (
                                <div className="mt-2 text-xs font-mono bg-emerald-100/70 border border-emerald-300 text-emerald-950 rounded-lg p-2.5 flex items-center justify-between gap-2 shadow-2xs">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <KeyIcon className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                                    <span className="truncate">
                                      <strong className="font-sans font-bold text-emerald-950">PIN Akses (Admin View):</strong>{' '}
                                      <code className="bg-white px-2 py-0.5 rounded border border-emerald-300 font-bold text-emerald-900 select-all">
                                        {req.downloadPin || '123456'}
                                      </code>
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(req.downloadPin || '123456');
                                      alert(`PIN Akses (${req.downloadPin || '123456'}) berhasil disalin ke clipboard!`);
                                    }}
                                    className="text-[10px] font-sans font-bold bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-300 px-2.5 py-1 rounded-md transition-all flex-shrink-0"
                                  >
                                    Salin PIN
                                  </button>
                                </div>
                              )}

                              {req.resultUploadedAt && (
                                <div className="text-[10px] text-emerald-700/80 mt-2 font-medium">
                                  Diunggah: {req.resultUploadedAt?.toDate ? req.resultUploadedAt.toDate().toLocaleString('id-ID') : 'Baru saja'}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-3.5 mt-3 shadow-2xs">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs uppercase tracking-wider">
                                    <LockIcon className="w-4 h-4 text-amber-600" />
                                    <span>Hasil Data Siap (Memerlukan PIN Akses)</span>
                                  </div>
                                  <p className="text-xs text-amber-900/80 leading-relaxed font-normal">
                                    {isAdmin 
                                      ? "Hasil data telah diunggah dan terkunci PIN. Anda dapat memberikan PIN berikut ke Pemohon via WA atau membukanya langsung."
                                      : "Petugas telah mengunggah hasil data. Silakan hubungi Admin terlebih dahulu untuk mengonfirmasi & mendapatkan PIN Akses untuk mengunduh."
                                    }
                                  </p>

                                  {/* Admin View PIN Option (jaga-jaga kalau admin lupa PIN) */}
                                  {isAdmin && (
                                    <div className="pt-1.5 flex items-center gap-2">
                                      <span className="text-xs font-mono bg-white border border-amber-300 text-amber-950 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 shadow-2xs">
                                        <KeyIcon className="w-3.5 h-3.5 text-amber-600" />
                                        <span>PIN (Admin): <code className="text-indigo-700">{req.downloadPin || '123456'}</code></span>
                                      </span>
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(req.downloadPin || '123456');
                                          alert(`PIN Akses (${req.downloadPin || '123456'}) disalin ke clipboard!`);
                                        }}
                                        className="text-[10px] font-bold bg-white hover:bg-amber-100/80 text-amber-900 border border-amber-300 px-2 py-1 rounded-lg transition-all"
                                      >
                                        Salin
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {isAdmin ? (
                                    <a
                                      href={req.handphone ? `https://wa.me/${req.handphone.replace(/[^0-9]/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(`Halo ${req.fullName}, permohonan data Anda (Request ID: #${req.id.slice(0, 8).toUpperCase()}) telah selesai diproses. PIN Akses Anda adalah: ${req.downloadPin || '123456'}.`)}` : `https://wa.me/?text=${encodeURIComponent(`Halo ${req.fullName}, permohonan data Anda (Request ID: #${req.id.slice(0, 8).toUpperCase()}) telah selesai diproses. PIN Akses Anda adalah: ${req.downloadPin || '123456'}.`)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 bg-white hover:bg-amber-100/50 text-amber-900 border border-amber-300 font-semibold text-xs px-3 py-2 rounded-xl transition-all shadow-2xs"
                                      title={req.handphone ? `Kirim PIN ke WA Pemohon (${req.handphone})` : 'Kirim PIN ke WA Pemohon'}
                                    >
                                      <span>💬 Japri Pemohon</span>
                                    </a>
                                  ) : (
                                    <a
                                      href={`https://wa.me/?text=${encodeURIComponent(`Halo Admin, saya ingin meminta PIN Akses untuk mengunduh hasil data permohonan Request ID: #${req.id.slice(0, 8).toUpperCase()} atas nama ${req.fullName} (${req.category}).`)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 bg-white hover:bg-amber-100/50 text-amber-900 border border-amber-300 font-semibold text-xs px-3 py-2 rounded-xl transition-all shadow-2xs"
                                    >
                                      <span>💬 Japri Admin</span>
                                    </a>
                                  )}
                                  <button
                                    onClick={() => handleOpenDownloadModal(req)}
                                    className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-2xs transition-all"
                                  >
                                    <KeyIcon className="w-3.5 h-3.5" />
                                    <span>Buka &amp; Unduh</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        ) : (
                          isAdmin && (
                            <div className="mt-3">
                              <button
                                onClick={() => handleOpenUploadModal(req)}
                                className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-2xs"
                              >
                                <UploadIcon className="w-3.5 h-3.5 text-slate-500 hover:text-indigo-600" />
                                <span>Upload Hasil Data</span>
                              </button>
                            </div>
                          )
                        )}
                      </div>

                      <div className="flex items-center md:items-start justify-end gap-1 mt-2 md:mt-0">
                        {isAdmin && (
                          <div className="flex flex-row md:flex-col gap-1">
                            <button 
                              onClick={() => handleOpenUploadModal(req)}
                              className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all flex items-center justify-center border border-transparent hover:border-indigo-200"
                              title="Upload Hasil Data (PIN Protected)"
                            >
                              <UploadIcon className="w-5 h-5" />
                              <span className="sr-only">Upload Result</span>
                            </button>
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

      {/* Download PIN Unlock Modal */}
      {downloadModalReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 relative">
            <button
              onClick={() => setDownloadModalReq(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
                <LockIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Masukkan PIN Akses Unduh Data</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className="font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                    Request ID: #{downloadModalReq.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span>Pemohon: <span className="font-semibold text-slate-800">{downloadModalReq.fullName}</span> ({downloadModalReq.department})</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleVerifyDownloadPin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>PIN Akses Unduh <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-slate-400">{isAdmin ? 'Mode Admin (PIN Terisi Otomatis)' : 'Dapatkan dari Admin'}</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    required
                    autoFocus
                    placeholder={isAdmin ? "PIN Akses (Admin)" : "Masukkan PIN Akses dari Admin"}
                    value={inputDownloadPin}
                    onChange={(e) => {
                      setInputDownloadPin(e.target.value);
                      setDownloadPinError(null);
                    }}
                    className="w-full text-base bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono tracking-wider"
                  />
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setInputDownloadPin(downloadModalReq.downloadPin || '123456')}
                      className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-xs px-3 py-2 rounded-xl flex-shrink-0 transition-all"
                      title="Isi otomatis dengan PIN Akses milik Admin"
                    >
                      Isi PIN (Admin)
                    </button>
                  )}
                </div>
                {downloadPinError ? (
                  <p className="text-xs font-semibold text-rose-600 mt-1.5">{downloadPinError}</p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {isAdmin ? 'Sebagai Admin, Anda dapat langsung mengunduh/membuka file atau membagikan PIN ke Pemohon.' : 'Silakan hubungi Admin untuk konfirmasi & mendapatkan PIN Akses.'}
                  </p>
                )}
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-950 flex items-center justify-between gap-2">
                <span className="leading-tight font-medium">
                  {isAdmin ? 'Ingin kirim PIN Akses ke Pemohon via WA?' : 'Belum miliki PIN Akses? Hubungi admin via WA:'}
                </span>
                <a
                  href={isAdmin 
                    ? (downloadModalReq.handphone ? `https://wa.me/${downloadModalReq.handphone.replace(/[^0-9]/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(`Halo ${downloadModalReq.fullName}, PIN Akses permohonan data Anda (Request ID: #${downloadModalReq.id.slice(0, 8).toUpperCase()}) adalah: ${downloadModalReq.downloadPin || '123456'}.`)}` : `https://wa.me/?text=${encodeURIComponent(`Halo ${downloadModalReq.fullName}, PIN Akses permohonan data Anda (Request ID: #${downloadModalReq.id.slice(0, 8).toUpperCase()}) adalah: ${downloadModalReq.downloadPin || '123456'}.`)}`)
                    : `https://wa.me/?text=${encodeURIComponent(`Halo Admin, saya ingin meminta PIN Akses untuk mengunduh hasil data permohonan Request ID: #${downloadModalReq.id.slice(0, 8).toUpperCase()} atas nama ${downloadModalReq.fullName} (${downloadModalReq.category}).`)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] px-2.5 py-1.5 rounded-lg flex-shrink-0 transition-all shadow-2xs"
                >
                  <span>{isAdmin ? 'Japri Pemohon' : 'Japri Admin'}</span>
                  <ExternalLinkIcon className="w-3 h-3" />
                </a>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDownloadModalReq(null)}
                  className="text-xs py-2 px-3.5"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  className="text-xs py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <KeyIcon className="w-3.5 h-3.5 mr-1.5" />
                  Buka &amp; Unduh Data
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Hasil Data Modal */}
      {uploadModalReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 relative my-8">
            <button
              onClick={() => setUploadModalReq(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                <LockIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Upload Hasil Data</h3>
                <p className="text-xs text-slate-500">
                  Untuk Permohonan: <span className="font-semibold text-slate-800">{uploadModalReq.fullName}</span> ({uploadModalReq.department})
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveResult} className="space-y-4">
              {/* PIN Akses Unduh for Requester */}
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5 space-y-2">
                <label className="block text-xs font-bold text-indigo-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <LockIcon className="w-3.5 h-3.5 text-indigo-600" />
                    <span>PIN Akses Unduh Pemohon <span className="text-rose-500">*</span></span>
                  </span>
                  <span className="text-[10px] font-normal text-indigo-700">Diberikan ke pemohon saat Japri</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={customDownloadPinInput}
                    onChange={(e) => setCustomDownloadPinInput(e.target.value)}
                    className="w-full text-sm bg-white border border-indigo-200 rounded-lg px-3 py-2 text-slate-800 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Contoh: 123456"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomDownloadPinInput(Math.floor(100000 + Math.random() * 900000).toString())}
                    className="inline-flex items-center gap-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold px-2.5 py-2 rounded-lg flex-shrink-0 transition-all"
                    title="Buat PIN 6 digit acak baru"
                  >
                    <MagicIcon className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Acak</span>
                  </button>
                  {uploadModalReq.handphone && (
                    <a
                      href={`https://wa.me/${uploadModalReq.handphone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Halo Bpk/Ibu ${uploadModalReq.fullName}, permohonan data Anda (${uploadModalReq.category}) telah selesai disiapkan. PIN Akses untuk mengunduh hasil data Anda adalah: *${customDownloadPinInput}*. Silakan masukkan PIN ini pada dashboard permohonan data. Terima kasih!`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0 transition-all shadow-2xs"
                      title="Kirim PIN Akses langsung ke WA Pemohon"
                    >
                      <span>WA Pemohon</span>
                      <ExternalLinkIcon className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {/* Status Update Choice */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Status Permohonan Setelah Upload
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResultStatus('COMPLETED')}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                      resultStatus === 'COMPLETED'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-2 ring-emerald-200'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <DoneIcon className="w-4 h-4 text-emerald-600" />
                    <span>Selesai (COMPLETED)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultStatus('PROCESSING')}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                      resultStatus === 'PROCESSING'
                        ? 'bg-blue-50 border-blue-300 text-blue-800 ring-2 ring-blue-200'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ClockIcon className="w-4 h-4 text-blue-600" />
                    <span>Proses (PROCESSING)</span>
                  </button>
                </div>
              </div>

              {/* File Attachment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih File Hasil Data (Maks. 800KB)
                </label>
                {resultFileName ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <PaperclipIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-emerald-900 truncate">{resultFileName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveResultFile}
                      className="text-xs text-rose-600 hover:text-rose-800 font-semibold ml-2"
                    >
                      Hapus
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.csv,.png,.jpg,.jpeg"
                    onChange={handleResultFileChange}
                    className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
                )}
              </div>

              {/* Drive / Cloud Link */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tautan Google Drive / Cloud Storage (Opsional)
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/file/d/..."
                  value={resultDriveUrl}
                  onChange={(e) => setResultDriveUrl(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Gunakan tautan ini jika ukuran file lebih besar dari 800KB atau berupa folder.
                </p>
              </div>

              {/* Result Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan / Keterangan Penyelesaian
                </label>
                <textarea
                  rows={3}
                  placeholder="Contoh: Data rekapitulasi usaha pariwisata Jakbar tahun 2026 telah diverifikasi dan dilampirkan."
                  value={resultNotes}
                  onChange={(e) => setResultNotes(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {resultFileError && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                  ⚠️ {resultFileError}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setUploadModalReq(null)}
                  className="text-xs py-2 px-4"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  isLoading={isSavingResult}
                  className="text-xs py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <UploadIcon className="w-3.5 h-3.5 mr-1.5" />
                  Simpan & Unggah Hasil Data
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
