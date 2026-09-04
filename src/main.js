// 워크스테이션 = 이름 + 실제 폴더 경로.
// 목록은 앱 실행 파일 옆의 workstations.json에 저장(Rust)하고, 여기서 순회해 렌더링한다.
import { createPanels } from "./panels.js";
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const listEl = document.getElementById("ws-list");
const addBtn = document.getElementById("ws-add");
const modal = document.getElementById("ws-modal");
const nameInput = document.getElementById("ws-name");
const pathInput = document.getElementById("ws-path");
const bar2 = document.getElementById("bar2");
const editBody = document.getElementById("edit-body");
const detailBody = document.getElementById("detail-body");

// 상단바에서 관리하는 Claude 파일/폴더 종류(enum). 추가 버튼은 이 목록에서 없는 것만 생성한다.
// 종류를 늘리려면 여기 항목만 추가한다(type: file|dir).
const CLAUDE_ITEMS = [
  { key: "claude_md", label: "CLAUDE.md", rel: "CLAUDE.md", type: "file" },
  { key: "skills", label: "Skills", rel: ".claude/skills", type: "dir" },
  { key: "memory", label: "메모리", rel: "memory", type: "dir" },
];

let workstations = [];
let selected = 0;
let activeTab = null; // 현재 선택된 탭 key

// 편집/디테일 패널은 공유 모듈이 담당. 메모리 목록 디테일은 워크스테이션 전용(위치 토글+가져오기).
const panels = createPanels(editBody, detailBody, { memoryDetail: renderMemoryDetail });

// 컴포넌트 창에서 저장/삭제하면 디테일 패널의 컴포넌트 목록을 에디터 유지한 채 갱신한다.
listen("components-changed", () => panels.onComponentsChanged());

function render() {
  listEl.innerHTML = "";
  workstations.forEach((ws, i) => {
    const row = document.createElement("button");
    row.className = "listrow" + (i === selected ? " selected" : "");
    row.title = ws.path;
    row.innerHTML =
      '<svg class="ico" viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v10H3z"/></svg>' +
      '<span class="lr-text"><span class="lr-name"></span><span class="lr-sub"></span></span>';
    row.querySelector(".lr-name").textContent = ws.name;
    row.querySelector(".lr-sub").textContent = ws.path;
    row.onclick = () => {
      selected = i;
      activeTab = null; // 워크스테이션이 바뀌면 탭 선택 초기화
      render();
      renderBar2();
    };
    listEl.appendChild(row);
  });
}

const itemPath = (ws, it) => ws.path + "/" + it.rel;

async function renderBar2() {
  bar2.innerHTML = "";
  const ws = workstations[selected];
  if (!ws) {
    renderPanels();
    return;
  }

  const present = await Promise.all(
    CLAUDE_ITEMS.map((it) => invoke("path_exists", { path: itemPath(ws, it) }))
  );
  const items = CLAUDE_ITEMS.filter((_, i) => present[i]);

  // 활성 탭이 없거나 사라졌으면 첫 탭으로.
  if (!items.some((it) => it.key === activeTab)) activeTab = items[0]?.key ?? null;

  items.forEach((it) => {
    const tab = document.createElement("button");
    tab.className = "tab" + (it.key === activeTab ? " active" : "");
    tab.textContent = it.label;
    tab.onclick = () => {
      activeTab = it.key;
      renderBar2();
    };
    bar2.appendChild(tab);
  });

  const missing = CLAUDE_ITEMS.filter((_, i) => !present[i]);
  if (missing.length > 0) {
    const add = document.createElement("button");
    add.className = "tab add";
    add.title = "추가";
    add.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
    add.onclick = () => panels.openAddMenu(add, missing, ws, (key) => { activeTab = key; renderBar2(); });
    bar2.appendChild(add);
  }

  renderPanels();
}

// 활성 탭 하나가 편집 패널(중앙)과 디테일 패널(우측)을 소유한다. 렌더링은 공유 모듈에 위임.
async function renderPanels() {
  const ws = workstations[selected];
  const item = CLAUDE_ITEMS.find((it) => it.key === activeTab);
  await panels.render(ws, item);
}

// 메모리 탭 디테일: 자동 메모리 위치 토글(기존 ↔ 여기) + 기존 메모리 복사.
async function renderMemoryDetail(ws, refreshList) {
  detailBody.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.style.padding = "12px";

  // ── 위치 토글: 기존(기본) ↔ 여기(<프로젝트>/memory). settings.local.json에 반영. ──
  const locLabel = document.createElement("div");
  locLabel.className = "wsm-label";
  locLabel.style.marginBottom = "6px";
  locLabel.textContent = "자동 메모리 위치";

  const seg = document.createElement("div");
  seg.className = "field-row";
  const bDefault = document.createElement("button");
  bDefault.className = "btn";
  bDefault.textContent = "기존";
  const bHere = document.createElement("button");
  bHere.className = "btn";
  bHere.textContent = "여기";
  seg.append(bDefault, bHere);

  const note = document.createElement("p");
  note.className = "empty";
  note.style.margin = "8px 0 0";
  note.textContent = "다음 세션부터 적용됩니다.";

  const applyState = (enabled) => {
    bHere.classList.toggle("primary", enabled);
    bDefault.classList.toggle("primary", !enabled);
  };
  const setLoc = async (enabled) => {
    await invoke("set_memory_local", { workstation: ws.path, enabled });
    applyState(enabled);
  };
  bDefault.onclick = () => setLoc(false);
  bHere.onclick = () => setLoc(true);
  applyState(await invoke("memory_local_enabled", { workstation: ws.path }));

  const hr = document.createElement("div");
  hr.style.cssText = "height:1px;background:var(--wsm-border,#333);margin:16px 0";

  const label = document.createElement("div");
  label.className = "wsm-label";
  label.style.marginBottom = "6px";
  label.textContent = "메모리 가져오기";

  const desc = document.createElement("p");
  desc.className = "empty";
  desc.style.margin = "0 0 10px";
  desc.textContent = "기존 메모리 경로의 모든 파일을 이 폴더로 복사합니다.";

  const btn = document.createElement("button");
  btn.className = "btn primary";
  btn.textContent = "기존 메모리 복사";

  const status = document.createElement("p");
  status.className = "empty";
  status.style.margin = "10px 0 0";

  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const n = await invoke("import_memory", { workstation: ws.path });
      await refreshList(); // 편집 패널의 (클릭 가능한) 파일 목록 갱신
      status.textContent = n > 0 ? n + "개 파일을 복사했습니다." : "복사할 파일이 없습니다.";
    } catch (e) {
      status.textContent = "오류: " + e;
    }
    btn.disabled = false;
  };

  wrap.append(locLabel, seg, note, hr, label, desc, btn, status);
  detailBody.appendChild(wrap);
}

async function load() {
  workstations = await invoke("list_workstations");
  render();
  renderBar2();
}

// ── 컴포넌트 저장소 ──────────────────────────────────
// 독립된 창(components.html)으로 연다. 메인 창과 분리되어 화면 어디로든 이동 가능하고,
// 닫아도 메인 창에 영향을 주지 않는다. 이미 열려 있으면 포커스만 준다.
const { WebviewWindow } = window.__TAURI__.webviewWindow;

document.getElementById("comp-toggle").onclick = async () => {
  const existing = await WebviewWindow.getByLabel("components");
  if (existing) {
    await existing.setFocus();
    return;
  }
  new WebviewWindow("components", {
    url: "components.html",
    title: "컴포넌트 저장소",
    width: 900,
    height: 640,
    minWidth: 560,
    minHeight: 400,
  });
};

// ── 글로벌 Claude 설정 ──────────────────────────────
// 워크스테이션과 무관한 전역(~/.claude) CLAUDE.md·메모리·스킬 관리용 독립 창. 내용은 추후 채운다.
document.getElementById("global-toggle").onclick = async () => {
  const existing = await WebviewWindow.getByLabel("global");
  if (existing) {
    await existing.setFocus();
    return;
  }
  new WebviewWindow("global", {
    url: "global.html",
    title: "글로벌 Claude 설정",
    width: 900,
    height: 640,
    minWidth: 560,
    minHeight: 400,
  });
};

addBtn.onclick = () => {
  nameInput.value = "";
  pathInput.value = "";
  modal.hidden = false;
  nameInput.focus();
};

document.getElementById("ws-pick").onclick = async () => {
  const p = await invoke("pick_folder");
  if (!p) return;
  pathInput.value = p;
  if (!nameInput.value.trim()) nameInput.value = p.split(/[\\/]/).pop(); // 폴더명을 기본 이름으로
};

document.getElementById("ws-cancel").onclick = () => {
  modal.hidden = true;
};

document.getElementById("ws-save").onclick = async () => {
  const name = nameInput.value.trim();
  const path = pathInput.value.trim();
  if (!name || !path) return; // 이름과 경로 둘 다 필요
  workstations = await invoke("add_workstation", { name, path });
  selected = workstations.length - 1;
  modal.hidden = true;
  render();
  renderBar2();
};

load();
