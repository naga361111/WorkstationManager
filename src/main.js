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

// 플러그인 탭 key. CLAUDE_ITEMS와 달리 파일 존재와 무관하게 항상 뜬다(플러그인은 전역 설치).
const PLUGINS_TAB = "plugins";

let workstations = [];
let selected = 0;
let activeTab = null; // 현재 선택된 탭 key

// 편집/디테일 패널은 공유 모듈이 담당. 메모리 목록 디테일은 워크스테이션 전용(위치 토글+가져오기).
const panels = createPanels(editBody, detailBody, { memoryDetail: renderMemoryDetail });

// 컴포넌트 창에서 저장/삭제하면 디테일 패널의 컴포넌트 목록을 에디터 유지한 채 갱신한다.
listen("components-changed", () => panels.onComponentsChanged());
listen("skills-changed", () => panels.onSkillsChanged());

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

    // 시작: 이 폴더에서 Claude CLI를 새 터미널 창으로 연다.
    const start = document.createElement("button");
    start.className = "btn primary dirrow-del";
    start.textContent = "시작";
    start.onclick = async (e) => {
      e.stopPropagation();
      try {
        await invoke("start_session", { workstation: ws.path });
      } catch (err) {
        alert("시작 실패: " + err);
      }
    };

    // 삭제: 목록(등록)에서만 제거하고 실제 폴더는 그대로 둔다.
    const del = document.createElement("button");
    del.className = "btn dirrow-del";
    del.textContent = "삭제";
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm("‘" + ws.name + "’을(를) 목록에서 제거할까요? (폴더는 삭제되지 않습니다)")) return;
      workstations = await invoke("remove_workstation", { index: i });
      // 선택 위치 보정: 지운 게 선택보다 앞이면 한 칸 당기고, 범위를 넘으면 마지막으로.
      if (selected >= workstations.length) selected = workstations.length - 1;
      else if (i < selected) selected -= 1;
      activeTab = null;
      render();
      renderBar2();
    };

    const wrap = document.createElement("div");
    wrap.className = "dirrow-row" + (i === selected ? " selected" : "");
    wrap.append(row, start, del);
    listEl.appendChild(wrap);
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

  // 활성 탭이 없거나 사라졌으면 첫 탭으로(플러그인 탭도 유효한 선택으로 인정).
  const validKeys = items.map((it) => it.key).concat(PLUGINS_TAB);
  if (!validKeys.includes(activeTab)) activeTab = items[0]?.key ?? PLUGINS_TAB;

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

  // 플러그인 탭: 항상 표시.
  const ptab = document.createElement("button");
  ptab.className = "tab" + (activeTab === PLUGINS_TAB ? " active" : "");
  ptab.textContent = "플러그인";
  ptab.onclick = () => { activeTab = PLUGINS_TAB; renderBar2(); };
  bar2.appendChild(ptab);

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
  if (activeTab === PLUGINS_TAB) return renderPlugins(ws);
  const item = CLAUDE_ITEMS.find((it) => it.key === activeTab);
  await panels.render(ws, item);
}

// 플러그인 탭: 전역 설치된 모든 플러그인을 목록으로. 토글은 이 워크스테이션의
// .claude/settings.local.json(로컬 전용)에만 enabledPlugins로 쓴다.
async function renderPlugins(ws) {
  editBody.innerHTML = "";
  detailBody.innerHTML = "";
  if (!ws) {
    editBody.innerHTML = '<p class="empty">워크스테이션을 선택하세요.</p>';
    return;
  }
  const plugins = await invoke("list_plugins", { workstation: ws.path }).catch(() => []);
  if (plugins.length === 0) {
    editBody.innerHTML = '<p class="empty">설치된 플러그인이 없습니다.</p>';
  } else {
    const list = document.createElement("div");
    list.className = "dirlist";
    plugins.forEach((p) => {
      const row = document.createElement("div");
      row.className = "dirrow-row";
      const name = document.createElement("div");
      name.className = "dirrow";
      name.textContent = p.id;
      const tog = document.createElement("button");
      const paint = () => {
        tog.className = "btn dirrow-del" + (p.enabled ? " primary" : "");
        tog.textContent = p.enabled ? "켜짐" : "꺼짐";
      };
      paint();
      tog.onclick = async () => {
        p.enabled = !p.enabled;
        await invoke("set_plugin_local", { workstation: ws.path, id: p.id, enabled: p.enabled });
        paint();
      };
      row.append(name, tog);
      list.appendChild(row);
    });
    editBody.appendChild(list);
  }
  detailBody.innerHTML =
    '<div style="padding:12px"><div class="wsm-label" style="margin-bottom:6px">플러그인</div>' +
    '<p class="empty" style="margin:0">이 워크스테이션의 .claude/settings.local.json에만 반영됩니다. 다음 세션부터 적용됩니다.</p></div>';
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

  const hr2 = document.createElement("div");
  hr2.style.cssText = "height:1px;background:var(--wsm-border,#333);margin:16px 0";

  const rcLabel = document.createElement("div");
  rcLabel.className = "wsm-label";
  rcLabel.style.marginBottom = "6px";
  rcLabel.textContent = "메모리 인덱스 정리";

  const rcDesc = document.createElement("p");
  rcDesc.className = "empty";
  rcDesc.style.margin = "0 0 10px";
  rcDesc.textContent = "백그라운드로 Claude를 실행해 MEMORY.md를 실제 메모리 파일에 맞게 수정합니다.";

  const rcBtn = document.createElement("button");
  rcBtn.className = "btn primary";
  rcBtn.textContent = "메모리 인덱스 파일 수정";

  const rcStatus = document.createElement("p");
  rcStatus.className = "empty";
  rcStatus.style.margin = "10px 0 0";

  rcBtn.onclick = async () => {
    rcBtn.disabled = true;
    rcStatus.textContent = "정리 중… (Claude 실행)";
    try {
      await invoke("reconcile_memory", { dir: ws.path + "/memory" });
      await refreshList(); // MEMORY.md가 새로 생겼을 수 있으니 목록 갱신
      rcStatus.textContent = "완료했습니다.";
    } catch (e) {
      rcStatus.textContent = "오류: " + e;
    }
    rcBtn.disabled = false;
  };

  wrap.append(locLabel, seg, note, hr, label, desc, btn, status, hr2, rcLabel, rcDesc, rcBtn, rcStatus);
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

// ── 스킬 저장소 ──────────────────────────────────────
// 이 앱이 가진 스킬(클로드 스킬 아님)을 컴포넌트처럼 관리하는 독립 창.
document.getElementById("skill-toggle").onclick = async () => {
  const existing = await WebviewWindow.getByLabel("skills");
  if (existing) {
    await existing.setFocus();
    return;
  }
  new WebviewWindow("skills", {
    url: "skills.html",
    title: "스킬 저장소",
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
