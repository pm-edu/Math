"use client";

import { toEmbedUrl, type Lesson } from "@/lib/lessons";

export default function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const embed = lesson.video_url ? toEmbedUrl(lesson.video_url) : null;

  return (
    <div className="rounded-2xl border border-[var(--border-c)] bg-white p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-medium text-[var(--foreground)]">{lesson.title}</h2>
        {lesson.is_free && (
          <span className="rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-medium text-[var(--mint-dark)]">
            무료 샘플
          </span>
        )}
      </div>

      {lesson.description && (
        <p className="mt-2 text-sm leading-relaxed text-[var(--secondary)]">
          {lesson.description}
        </p>
      )}

      {embed ? (
        <div className="mt-5 aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            src={embed}
            title={lesson.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : lesson.video_url ? (
        <a
          href={lesson.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-block rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]"
        >
          영상 보러 가기
        </a>
      ) : (
        <p className="mt-5 text-sm text-[var(--secondary)]">아직 영상이 등록되지 않았습니다.</p>
      )}

      {lesson.material_url && (
        <a
          href={lesson.material_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm text-[var(--foreground)] underline"
        >
          학습자료 내려받기
        </a>
      )}
    </div>
  );
}
