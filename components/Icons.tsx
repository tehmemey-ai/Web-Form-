import React from 'react';
import { Loader2, Wand2, CheckCircle2, AlertCircle, Send, FileText, LayoutDashboard } from 'lucide-react';

export const Spinner = ({ className }: { className?: string }) => (
  <Loader2 className={`animate-spin ${className}`} />
);

export const MagicIcon = ({ className }: { className?: string }) => (
  <Wand2 className={className} />
);

export const SuccessIcon = ({ className }: { className?: string }) => (
  <CheckCircle2 className={className} />
);

export const ErrorIcon = ({ className }: { className?: string }) => (
  <AlertCircle className={className} />
);

export const SendIcon = ({ className }: { className?: string }) => (
  <Send className={className} />
);

export const FormIcon = ({ className }: { className?: string }) => (
    <FileText className={className} />
);

export const DashboardIcon = ({ className }: { className?: string }) => (
    <LayoutDashboard className={className} />
);