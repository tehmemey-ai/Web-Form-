export enum RequestCategory {
  UNSPECIFIED = '',
  FINANCIAL = 'Financial Data',
  USER_ANALYTICS = 'User Analytics',
  OPERATIONAL = 'Operational Metrics',
  MARKETING = 'Marketing Performance',
  SECURITY = 'Security Logs',
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
  department: string;
  category: RequestCategory;
  urgency: UrgencyLevel;
  description: string;
  dateRangeStart: string;
  dateRangeEnd: string;
}

export interface CategorySuggestionResponse {
  category: RequestCategory;
  confidence: number;
  reasoning: string;
}
