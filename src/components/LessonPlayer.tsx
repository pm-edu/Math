"use client";

import { useEffect, useState } from "react";
import { parseVideo, type Lesson } from "@/lib/lessons";
import { useLang } from "@/lib/i18n";

export default function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const { t } = useLang();
  const video = lesson.video_url ? parseVideo(lesson.video_url) : null;

  // 재생 버튼을 누르기 전에는 영상을 얹지 않는다.
  // 그래야 페이지를 벗어나거나 다른 강의로 옮기면 소리가 즉시 멈춘다.
  const [playing, setPlaying] = useState(false);

  // 다른 강의로 바뀌면 다시 처음 상태로 돌아간다.
  useEffect(() => {
    setPlaying(false);
  }, [lesson.id]);

  return (
    <div className="rounded-2xl border border-[var(--border-c)] bg-white p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-medium text-[var(--foreground)]">{lesson.title}</h2>
        {lesson.is_free && (
          <span className="rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-medium text-[var(--mint-dark)]">
            {t("freeBadge")}
          </span>
        )}
      </div>

      {lesson.description && (
        <p className="mt-2 text-sm leading-relaxed text-[var(--secondary)]">
          {lesson.description}
        </p>
      )}

      {video ? (
        <div className="mt-5 aspect-video w-full overflow-hidden rounded-xl bg-black">
          {playing ? (
            <>
              <iframe
                src={`${video.embedUrl}?autoplay=1`}
                title={lesson.title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={`${lesson.title} 재생`}
              className="group relative h-full w-full"
            >
              {video.thumbnailUrl && (
                // 유튜브 썸네일. next/image 를 쓰면 도메인 설정이 필요해 기본 img 를 쓴다.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-60"
                />
              )}
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-105">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </span>
            </button>
          )}
        </div>
      ) : lesson.video_url ? (
        <a
          href={lesson.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-block rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]"
        >
          {t("watchVideo")}
        </a>
      ) : (
        <p className="mt-5 text-sm text-[var(--secondary)]">{t("noVideo")}</p>
      )}

      {playing && (
        <button
          type="button"
          onClick={() => setPlaying(false)}
          className="mt-3 text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          {t("closeVideo")}
        </button>
      )}

      {lesson.material_url && (
        <a
          href={lesson.material_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block text-sm text-[var(--foreground)] underline"
        >
          {t("downloadMaterial")}
        </a>
      )}
    </div>
  );
}
