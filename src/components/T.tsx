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
