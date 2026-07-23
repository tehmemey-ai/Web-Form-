import React from 'react';
import { Loader2, Wand2, CheckCircle2, AlertCircle, Send, FileText, LayoutDashboard, LogOut, User, Clock, CheckCircle, XCircle, Download, Trash2, Paperclip, Eye, FileUp, X, Lock, Key, ExternalLink, FileCheck, Tag } from 'lucide-react';

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

export const LogOutIcon = ({ className }: { className?: string }) => (
    <LogOut className={className} />
);

export const UserIcon = ({ className }: { className?: string }) => (
    <User className={className} />
);

export const ClockIcon = ({ className }: { className?: string }) => (
    <Clock className={className} />
);

export const DoneIcon = ({ className }: { className?: string }) => (
    <CheckCircle className={className} />
);

export const XIcon = ({ className }: { className?: string }) => (
    <XCircle className={className} />
);

export const DownloadIcon = ({ className }: { className?: string }) => (
    <Download className={className} />
);

export const TrashIcon = ({ className }: { className?: string }) => (
    <Trash2 className={className} />
);

export const PaperclipIcon = ({ className }: { className?: string }) => (
    <Paperclip className={className} />
);

export const EyeIcon = ({ className }: { className?: string }) => (
    <Eye className={className} />
);

export const UploadIcon = ({ className }: { className?: string }) => (
    <FileUp className={className} />
);

export const CloseIcon = ({ className }: { className?: string }) => (
    <X className={className} />
);

export const LockIcon = ({ className }: { className?: string }) => (
    <Lock className={className} />
);

export const KeyIcon = ({ className }: { className?: string }) => (
    <Key className={className} />
);

export const ExternalLinkIcon = ({ className }: { className?: string }) => (
    <ExternalLink className={className} />
);

export const FileCheckIcon = ({ className }: { className?: string }) => (
    <FileCheck className={className} />
);

export const TagIcon = ({ className }: { className?: string }) => (
    <Tag className={className} />
);


