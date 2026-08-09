export type Lesson = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  position: number;
  video_url: string | null;
  material_url: string | null;
  is_free: boolean;
};

export const LESSON_COLUMNS =
  "id, course_id, title, description, position, video_url, material_url, is_free";

export type VideoInfo = {
  embedUrl: string;
  /** 미리보기 이미지. 없으면 단색 배경으로 대체한다. */
  thumbnailUrl: string | null;
};

// YouTube / Vimeo 주소를 재생용 주소로 바꾼다.
// 알아보지 못하는 주소는 null 을 돌려주고, 화면에서는 링크로 처리한다.
export function parseVideo(url: string): VideoInfo | null {
  const youtubeId = extractYoutubeId(url);
  if (youtubeId) {
    return {
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  const vimeoId = extractVimeoId(url);
  if (vimeoId) {
    // Vimeo 썸네일은 별도 API가 필요해서 여기서는 생략한다.
    return { embedUrl: `https://player.vimeo.com/video/${vimeoId}`, thumbnailUrl: null };
  }

  return null;
}

function extractYoutubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return parsed.pathname.slice(1) || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.replace("/embed/", "") || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function extractVimeoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "vimeo.com") return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host === "player.vimeo.com") {
      return parsed.pathname.split("/").filter(Boolean).pop() ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
