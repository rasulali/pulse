import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  labelHelper?: string;
}

export default function Input({ label, labelHelper, ...props }: InputProps) {
  return (
    <div>
      <label className="block text-sm font-semibold text-black mb-2">
        {label}
        {labelHelper && (
          <span className="text-xs font-normal text-gray-500 ml-2">
            {labelHelper}
          </span>
        )}
      </label>
      <input
        {...props}
        className="w-full bg-white rounded-lg py-2.5 px-4 text-black shadow-[inset_4px_4px_8px_#e6e6e6,inset_-4px_-4px_8px_#ffffff] focus:shadow-[inset_2px_2px_4px_#e6e6e6,inset_-2px_-2px_4px_#ffffff] outline-none transition-shadow duration-300"
      />
    </div>
  );
}
