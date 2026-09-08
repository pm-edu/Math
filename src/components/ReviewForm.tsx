"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

export default function ReviewForm({
  courseId,
  userId,
  existing,
  onSaved,
}: {
  courseId: string;
  userId: string;
  existing: { id: string; rating: number | null; content: string } | null;
  onSaved: (saved: { id: string; rating: number | null; content: string }) => void;
}) {
  const { t } = useLang();
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [content, setContent] = useState(existing?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const result = existing
      ? await supabase
          .from("reviews")
          .update({ rating, content: trimmed })
          .eq("id", existing.id)
          .select("id, rating, content")
          .single()
      : await supabase
          .from("reviews")
          .insert({ user_id: userId, course_id: courseId, rating, content: trimmed })
          .select("id, rating, content")
          .single();

    setSaving(false);
    if (result.error || !result.data) {
      setError(t("reviewFailed"));
      return;
    }
    onSaved(result.data);
  }

  return (
    <div className="mt-3 rounded-xl border border-en-line bg-en-gold-soft/40 p-4">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={`text-xl ${n <= rating ? "text-en-gold" : "text-en-line"}`}
            aria-label={`${n}점`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t("reviewPlaceholder")}
        rows={3}
        maxLength={500}
        className="mt-2 w-full rounded-[10px] border border-en-line bg-white px-3 py-2 text-sm outline-none focus:border-en-gold"
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={saving || !content.trim()}
          className="rounded-[11px] bg-en-gold px-5 py-2 text-xs font-bold text-en-ink transition-colors hover:bg-en-gold-deep disabled:opacity-60"
        >
          {saving ? t("reviewSaving") : t("reviewSubmit")}
        </button>
      </div>
    </div>
  );
}
