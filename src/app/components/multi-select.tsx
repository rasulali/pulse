"use client";
import { IoChevronDown } from "react-icons/io5";

interface MultiSelectProps {
  label: string;
  open: boolean;
  setOpen: (value: boolean) => void;
}

export default function MultiSelect({
  label,
  open,
  setOpen,
}: MultiSelectProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-black">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full bg-white rounded-lg py-2.5 px-4 text-left text-black shadow-[inset_4px_4px_8px_#e6e6e6,inset_-4px_-4px_8px_#ffffff] flex items-center justify-between"
        >
          <span className="text-gray-500">Select...</span>
          <IoChevronDown
            className={`w-5 h-5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="absolute mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            <ul className="py-2 text-sm text-black">
              <li>
                <label className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-black" />
                  <span>Option 1</span>
                </label>
              </li>
              <li>
                <label className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-black" />
                  <span>Option 2</span>
                </label>
              </li>
            </ul>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500">Helper text here.</p>
    </div>
  );
}
