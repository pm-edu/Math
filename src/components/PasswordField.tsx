"use client";

import { useState } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minLength?: number;
};

export default function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  minLength,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="text-sm font-medium text-[var(--foreground)]">{label}</label>
      <div className="relative mt-1.5">
        <input
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--border-c)] bg-white py-2.5 pl-4 pr-12 text-sm outline-none focus:border-[var(--pink)]"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[var(--secondary)] transition-colors hover:text-[var(--foreground)]"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.7 5.1A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.2M6.2 6.2A17.7 17.7 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
