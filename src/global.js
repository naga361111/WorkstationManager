// 글로벌 Claude 설정 창. 워크스테이션과 무관한 전역 ~/.claude의 CLAUDE.md·메모리를 편집한다.
// 편집/디테일 패널은 메인 창과 동일한 공유 모듈(panels.js)을 그대로 쓴다.
import { createPanels } from "./panels.js";
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const bar = document.getElementById("g-bar");
const editBody = document.getElementById("g-edit");
const detailBody = document.getElementById("g-detail");

// 전역엔 메모리 '위치 토글'·'가져오기'가 무의미하므로 memoryDetail은 넘기지 않는다(디테일 비움).
const panels = createPanels(editBody, detailBody);

// 컴포넌트 창에서 저장/삭제 시 삽입 목록 갱신(메인과 동일).
listen("components-changed", () => panels.onComponentsChanged());
listen("skills-changed", () => panels.onSkillsChanged());

// 전역(개인) 스킬은 ~/.claude/skills. ws.path가 이미 ~/.claude이므로 rel은 "skills".
const ITEMS = [
  { key: "claude_md", label: "CLAUDE.md", rel: "CLAUDE.md", type: "file" },
  { key: "skills", label: "Skills", rel: "skills", type: "dir" },
  { key: "memory", label: "메모리", rel: "memory", type: "dir" },
];

let ws = null; // { name, path: ~/.claude }
let activeTab = null;

// 존재하는 항목만 탭으로, 없는 항목은 추가 버튼으로(메인 renderBar2와 동일한 규칙).
async function renderBar() {
  bar.innerHTML = "";
  if (!ws) return;
  const present = await Promise.all(
    ITEMS.map((it) => invoke("path_exists", { path: ws.path + "/" + it.rel }))
  );
  const items = ITEMS.filter((_, i) => present[i]);
  if (!items.some((it) => it.key === activeTab)) activeTab = items[0]?.key ?? null;

  items.forEach((it) => {
    const tab = document.createElement("button");
    tab.className = "tab" + (it.key === activeTab ? " active" : "");
    tab.textContent = it.label;
    tab.onclick = () => { activeTab = it.key; renderBar(); };
    bar.appendChild(tab);
  });

  const missing = ITEMS.filter((_, i) => !present[i]);
  if (missing.length > 0) {
    const add = document.createElement("button");
    add.className = "tab add";
    add.title = "추가";
    add.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
    add.onclick = () => panels.openAddMenu(add, missing, ws, (key) => { activeTab = key; renderBar(); });
    bar.appendChild(add);
  }

  await panels.render(ws, ITEMS.find((it) => it.key === activeTab));
}

async function load() {
  ws = { name: "글로벌", path: await invoke("claude_home") };
  await renderBar();
}

load();
