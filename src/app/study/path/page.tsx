"use client";

// 수학 학습 진행 구조 PG6: 커리큘럼 맵 (RUN_MATH_PROGRESSION.md PG6 6-1).
// 동기부여용 화면이지 진입점이 아니다 — 대시보드(/study)보다 하위 링크로만 연결된다.
// 그래프는 선수관계(math_unit_prereqs) DAG를 위상 정렬해 계층 배치한다. 외부 그래프
// 라이브러리를 쓰지 않고 SVG로 직접 그린다(지시서 명시).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

type UnitStatus = "locked" | "available" | "in_progress" | "mastered";

interface UnitStatusRow {
  unit_id: string;
  unit_name: string;
  sort_order: number;
  status: UnitStatus;
}

interface PrereqEdge {
  unit_id: string;
  requires_unit_id: string;
}

const STATUS_COLOR: Record<UnitStatus, { fill: string; stroke: string }> = {
  locked: { fill: "var(--background)", stroke: "var(--border-c)" },
  available: { fill: "var(--pink-light)", stroke: "var(--pink)" },
  in_progress: { fill: "var(--pink)", stroke: "var(--pink-dark)" },
  mastered: { fill: "var(--mint-dark)", stroke: "var(--mint-dark)" },
};

const NODE_R = 10;
const COL_WIDTH = 120;
const ROW_HEIGHT = 64;
const MARGIN = 40;

export default function StudyPathPage() {
  const router = useRouter();
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<UnitStatusRow[]>([]);
  const [edges, setEdges] = useState<PrereqEdge[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const { data: statusRows } = await supabase
        .from("v_math_unit_status")
        .select("unit_id, unit_name, sort_order, status")
        .order("sort_order");
      const unitIds = (statusRows ?? []).map((r) => r.unit_id);
      const { data: edgeRows } =
        unitIds.length > 0
          ? await supabase.from("math_unit_prereqs").select("unit_id, requires_unit_id").in("unit_id", unitIds)
          : { data: [] as PrereqEdge[] };

      setUnits((statusRows ?? []) as UnitStatusRow[]);
      setEdges((edgeRows ?? []) as PrereqEdge[]);
      setLoading(false);
    }
    load();
  }, [router]);

  // 최장경로 레이어링 — 선수가 없는 unit이 layer 0, 그 외엔 "직접 선수 중 가장 깊은
  // layer + 1". sort_order가 이미 대체로 위상순이라(선형 체인 기준) 그 순서로 계산하면
  // 선수의 layer가 항상 먼저 계산돼 있다. 사이클은 DB 트리거(math_unit_prereqs_cycle_guard,
  // PG0)가 애초에 막으므로 여기서 따로 처리하지 않는다.
  const layerByUnit = new Map<string, number>();
  const prereqsByUnit = new Map<string, string[]>();
  for (const e of edges) {
    const list = prereqsByUnit.get(e.unit_id) ?? [];
    list.push(e.requires_unit_id);
    prereqsByUnit.set(e.unit_id, list);
  }
  for (const u of [...units].sort((a, b) => a.sort_order - b.sort_order)) {
    const prereqs = prereqsByUnit.get(u.unit_id) ?? [];
    const layer = prereqs.length === 0 ? 0 : Math.max(...prereqs.map((p) => (layerByUnit.get(p) ?? 0) + 1));
    layerByUnit.set(u.unit_id, layer);
  }

  const unitsByLayer = new Map<number, UnitStatusRow[]>();
  for (const u of units) {
    const layer = layerByUnit.get(u.unit_id) ?? 0;
    const list = unitsByLayer.get(layer) ?? [];
    list.push(u);
    unitsByLayer.set(layer, list);
  }
  const layerValues = Array.from(layerByUnit.values());
  const maxLayer = layerValues.length > 0 ? Math.max(...layerValues) : 0;
  const maxRows = unitsByLayer.size > 0 ? Math.max(...Array.from(unitsByLayer.values()).map((l) => l.length)) : 0;

  const svgWidth = (maxLayer + 1) * COL_WIDTH + MARGIN;
  const svgHeight = Math.max(1, maxRows) * ROW_HEIGHT + MARGIN + 40;

  const positionByUnit = new Map(
    units.map((u) => {
      const layer = layerByUnit.get(u.unit_id) ?? 0;
      const siblings = unitsByLayer.get(layer) ?? [];
      const index = siblings.findIndex((s) => s.unit_id === u.unit_id);
      return [u.unit_id, { x: layer * COL_WIDTH + MARGIN, y: index * ROW_HEIGHT + 40 }];
    })
  );

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">{t("path_title")}</h1>

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--secondary)]">
          <Legend color={STATUS_COLOR.locked} label={t("path_legendLocked")} />
          <Legend color={STATUS_COLOR.available} label={t("path_legendAvailable")} />
          <Legend color={STATUS_COLOR.in_progress} label={t("path_legendInProgress")} />
          <Legend color={STATUS_COLOR.mastered} label={t("path_legendMastered")} />
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-[var(--secondary)]">{t("study_loading")}</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--border-c)] bg-white p-4">
            <svg width={svgWidth} height={svgHeight}>
              {edges.map((e, i) => {
                const from = positionByUnit.get(e.requires_unit_id);
                const to = positionByUnit.get(e.unit_id);
                if (!from || !to) return null;
                return <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--border-c)" strokeWidth={2} />;
              })}
              {units.map((u) => {
                const pos = positionByUnit.get(u.unit_id);
                if (!pos) return null;
                const color = STATUS_COLOR[u.status] ?? STATUS_COLOR.locked;
                const clickable = u.status !== "locked";
                return (
                  <g
                    key={u.unit_id}
                    style={{ cursor: clickable ? "pointer" : "default" }}
                    onClick={() => clickable && router.push(`/study/${u.unit_id}?kind=practice`)}
                  >
                    <circle cx={pos.x} cy={pos.y} r={NODE_R} fill={color.fill} stroke={color.stroke} strokeWidth={2} />
                    <foreignObject x={pos.x - 45} y={pos.y + NODE_R + 2} width={90} height={40}>
                      <div style={{ fontSize: 9, lineHeight: 1.2, textAlign: "center", color: "var(--foreground)" }}>
                        {u.unit_name}
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

function Legend({ color, label }: { color: { fill: string; stroke: string }; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-full border-2" style={{ backgroundColor: color.fill, borderColor: color.stroke }} />
      {label}
    </span>
  );
}
