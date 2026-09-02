import { CURRICULUM_CHIPS } from "./data";

export default function CurriculumChips() {
  return (
    <section className="py-[clamp(58px,7vw,92px)]" id="curriculum">
      <div className="mx-auto max-w-[1160px] px-[clamp(20px,5vw,56px)]">
        <div className="max-w-[52ch] mb-[clamp(30px,4vw,42px)]">
          <h2 className="text-[clamp(1.75rem,1.2rem+2.2vw,2.4rem)] font-extrabold tracking-[-.032em] text-en-ink">다루는 과정</h2>
          <p className="mt-3.5 text-[1.0625rem] leading-[1.7] text-en-ink-soft">
            국제학교와 국내 학교 과정을 함께 봅니다. 전학이나 커리큘럼 변경도 이어서 준비할 수 있습니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {CURRICULUM_CHIPS.map((chip, i) => (
            <div
              key={`${chip.name}-${i}`}
              className="inline-flex items-center gap-2.5 px-[17px] py-3 rounded-xl bg-en-card border border-en-line text-[.9375rem] font-semibold text-en-ink"
            >
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-en-gold" />
              {chip.name}
              {chip.note && (
                <em className="not-italic font-[family-name:var(--font-en-num)] font-semibold text-en-ink-soft" style={{ fontFeatureSettings: '"tnum" 1' }}>
                  {chip.note}
                </em>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
