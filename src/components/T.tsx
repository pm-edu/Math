"use client";

// 서버가 그리는 페이지 안에서 한/영 전환이 필요한 글자를 감싸는 부품.
// 데이터는 서버에서 가져오고, 문구만 화면에서 언어에 맞춰 바뀐다.

import { useLang, categoryLabel, type DictKey } from "@/lib/i18n";

export function T({ k }: { k: DictKey }) {
  const { t } = useLang();
  return <>{t(k)}</>;
}

export function CategoryLabel({ value }: { value: string }) {
  const { lang } = useLang();
  return <>{categoryLabel(value, lang)}</>;
}

/** DB에 저장된 내용의 한/영 선택. 영어가 비어 있으면 한국어를 보여준다. */
export function L({ ko, en }: { ko: string; en?: string | null }) {
  const { lang } = useLang();
  return <>{lang === "en" && en ? en : ko}</>;
}

/** 강좌 구성 목록의 한/영 선택 */
export function LocalizedList({
  ko,
  en,
  className,
}: {
  ko: string[];
  en?: string[] | null;
  className?: string;
}) {
  const { lang } = useLang();
  const items = lang === "en" && en && en.length > 0 ? en : ko;
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item}>· {item}</li>
      ))}
    </ul>
  );
}
