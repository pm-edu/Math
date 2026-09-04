// Gate A9(실존 인물·저작물 검출)용 대조 목록. 완전한 목록일 수 없다 — "보류"(사람 재검토)
// 판정용 1차 필터이지 최종 판정이 아니다. 과학·문학·역사에 걸쳐 LLM이 예시로 자주 끌어오는
// 유명 인물·저작물을 폭넓게 담았다.

export const REAL_ENTITY_BLOCKLIST: readonly string[] = [
  "Charles Darwin",
  "Albert Einstein",
  "Isaac Newton",
  "Marie Curie",
  "Jane Austen",
  "William Shakespeare",
  "Leonardo da Vinci",
  "Nikola Tesla",
  "Abraham Lincoln",
  "Martin Luther King",
  "Rosa Parks",
  "Galileo Galilei",
  "Sigmund Freud",
  "Karl Marx",
  "Adam Smith",
  "Charles Dickens",
  "Mark Twain",
  "Ernest Hemingway",
  "Virginia Woolf",
  "George Orwell",
  "Pride and Prejudice",
  "Moby Dick",
  "The Great Gatsby",
  "Origin of Species",
  "A Brief History of Time",
  "Silent Spring",
  "Rachel Carson",
  "Stephen Hawking",
  "Thomas Edison",
  "Benjamin Franklin",
  "Napoleon Bonaparte",
  "Cleopatra",
  "Julius Caesar",
  "Confucius",
  "Aristotle",
  "Plato",
  "Socrates",
] as const;

/** 텍스트에 실존 인물·저작물이 등장하면 매치된 이름을, 없으면 null을 돌려준다(대소문자 무시). */
export function findRealEntity(text: string): string | null {
  for (const entity of REAL_ENTITY_BLOCKLIST) {
    const pattern = new RegExp(`\\b${entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(text)) return entity;
  }
  return null;
}
