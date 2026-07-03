import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

const Input: React.FC<InputProps> = ({ label, error, helperText, className = '', ...props }) => {
  return (
    <div className="w-full text-left">
      <label className="block text-sm font-medium text-slate-700 mb-0.5">
        {label}
      </label>
      <input
        className={`w-full px-3 py-2 border rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
          error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:border-blue-500'
        } ${className}`}
        {...props}
      />
      {helperText && !error && <p className="mt-0.5 text-[10px] text-slate-400 font-medium">e.g. {helperText}</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
};

export default Input;