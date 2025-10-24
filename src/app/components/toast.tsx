import { IoCheckmarkCircle, IoCloseCircle } from "react-icons/io5";

interface ToastProps {
  type: "success" | "error";
  text: string;
  visible: boolean;
}

export default function Toast({ type, text, visible }: ToastProps) {
  if (!visible) return null;

  const isError = type === "error";
  const bg = isError
    ? "bg-red-50 border border-red-200 text-red-900"
    : "bg-green-50 border border-green-200 text-green-900";

  const Icon = isError ? IoCloseCircle : IoCheckmarkCircle;

  return (
    <div
      className={`fixed top-6 right-6 max-w-sm rounded-lg p-4 flex items-center gap-3 shadow-lg transition-all ${bg}`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}
