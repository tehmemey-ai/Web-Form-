export enum RequestCategory {
  UNSPECIFIED = '',
  Bahan_Paparan = 'Bahan Paparan',
  Bahan_Perencanaan_dan_Penyusunan_Kebijakan = 'Bahan Perencanaan dan Penyusunan Kebijakan',
  Bahan_Publikasi = 'Bahan Publikasi',
  Bahan_Monitoring_dan_Evaluasi = 'Bahan Monitoring dan Evaluasi',
  Penelitian = 'Penelitian',
  TL_Disposisi = 'TL Disposisi Surat Masuk dll',
  OTHER = 'Other'
}

export enum UrgencyLevel {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical'
}

export interface DataRequestForm {
  fullName: string;
  email: string;
  handphone: string;
  department: string;
  category: RequestCategory;
  urgency: UrgencyLevel;
  description: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  otherCategoryReason?: string;
  supportingDocName?: string;
  supportingDocSize?: number;
  supportingDocType?: string;
  supportingDocUrl?: string;
}

export interface DataRequest extends DataRequestForm {
  id: string;
  uid: string;
  createdAt: any; // Firestore Timestamp
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
}

export interface CategorySuggestionResponse {
  category: RequestCategory;
  confidence: number;
  reasoning: string;
}
