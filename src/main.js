// 워크스테이션 = 이름 + 실제 폴더 경로.
// 목록은 앱 실행 파일 옆의 workstations.json에 저장(Rust)하고, 여기서 순회해 렌더링한다.
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
let refreshPicker = null; // CLAUDE.md 탭이 열려 있을 때만 세팅. 컴포넌트 창 변경 시 호출.

// 컴포넌트 창에서 저장/삭제하면 디테일 패널의 컴포넌트 목록을 에디터 유지한 채 갱신한다.
listen("components-changed", () => refreshPicker?.());

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
    add.onclick = () => openAddMenu(add, missing, ws);
    bar2.appendChild(add);
  }

  renderPanels();
}

// 활성 탭 하나가 편집 패널(중앙)과 디테일 패널(우측)을 소유한다.
async function renderPanels() {
  editBody.innerHTML = "";
  detailBody.innerHTML = "";
  refreshPicker = null; // 탭이 바뀌면 초기화; 아래에서 CLAUDE.md일 때만 다시 세팅
  const ws = workstations[selected];
  const item = CLAUDE_ITEMS.find((it) => it.key === activeTab);
  if (!ws || !item) return;
  const path = itemPath(ws, item);

  if (item.type === "file") {
    const contents = await invoke("read_file", { path }).catch(() => "");
    const ta = document.createElement("textarea");
    ta.className = "editor";
    ta.value = contents;

    const save = document.createElement("button");
    save.className = "btn primary editor-save";
    save.textContent = "저장";
    // 저장본과 실제로 다를 때만 활성화(되돌려서 같아지면 다시 비활성화).
    let saved = contents;
    const syncSave = () => { save.disabled = ta.value === saved; };
    ta.oninput = syncSave;
    // CLAUDE.md는 디테일 패널을 컴포넌트 삽입 도구로 바꾼다. 그 외 파일은 정보 표시.
    const refreshDetail = () => {
      if (item.key === "claude_md") renderCompPicker(ta, syncSave);
      else detailInfo(item, path, [["종류", "파일"], ["경로", path], ["크기", ta.value.length + "자"]]);
    };
    save.onclick = async () => {
      await invoke("write_file", { path, contents: ta.value });
      saved = ta.value;
      syncSave();
      refreshDetail();
    };
    syncSave(); // 초기: 변경 없음 → 비활성화
    if (item.key === "claude_md") refreshPicker = refreshDetail; // 컴포넌트 창 변경 시 갱신용

    editBody.append(ta, save);
    refreshDetail();
  } else {
    const count = await renderDirList(path);
    // 메모리 탭은 디테일 패널에 '기존 메모리 복사' 도구를, 그 외 폴더는 정보를 표시.
    if (item.key === "memory") renderMemoryDetail(ws, path);
    else detailInfo(item, path, [["종류", "폴더"], ["경로", path], ["항목", count + "개"]]);
  }
}

// 폴더의 파일 목록을 편집 패널에 그린다. 항목 수를 돌려준다.
async function renderDirList(path) {
  editBody.innerHTML = "";
  const names = await invoke("list_dir", { path }).catch(() => []);
  if (names.length === 0) {
    editBody.innerHTML = '<p class="empty">비어 있음</p>';
    return 0;
  }
  const ul = document.createElement("div");
  ul.className = "dirlist";
  names.forEach((n) => {
    const row = document.createElement("div");
    row.className = "dirrow";
    row.textContent = n;
    ul.appendChild(row);
  });
  editBody.appendChild(ul);
  return names.length;
}

// 메모리 탭 디테일: 기존(기본) 메모리 경로의 파일을 <프로젝트>/memory로 복사.
function renderMemoryDetail(ws, memDir) {
  const wrap = document.createElement("div");
  wrap.style.padding = "12px";

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
      await renderDirList(memDir); // 편집 패널의 파일 목록 갱신
      status.textContent = n > 0 ? n + "개 파일을 복사했습니다." : "복사할 파일이 없습니다.";
    } catch (e) {
      status.textContent = "오류: " + e;
    }
    btn.disabled = false;
  };

  wrap.append(label, desc, btn, status);
  detailBody.appendChild(wrap);
}

function detailInfo(item, path, rows) {
  detailBody.innerHTML = "";
  rows.forEach(([k, v]) => {
    const r = document.createElement("div");
    r.className = "detailrow";
    r.innerHTML = '<span class="dk"></span><span class="dv"></span>';
    r.querySelector(".dk").textContent = k;
    r.querySelector(".dv").textContent = v;
    detailBody.appendChild(r);
  });
}

// CLAUDE.md 편집 시: 디테일 패널에서 컴포넌트를 조회하고, 고른 컴포넌트의 '내용'만
// 에디터 커서 위치에 삽입한다(제목/설명은 삽입하지 않음).
async function renderCompPicker(ta, syncSave) {
  detailBody.innerHTML = "";
  const label = document.createElement("div");
  label.className = "wsm-label";
  label.style.padding = "12px 12px 6px";
  label.textContent = "컴포넌트 삽입";
  detailBody.appendChild(label);

  const comps = await invoke("list_components").catch(() => []);
  if (comps.length === 0) {
    detailBody.insertAdjacentHTML("beforeend", '<p class="empty">저장된 컴포넌트가 없습니다.</p>');
    return;
  }
  comps.forEach((c) => {
    const row = document.createElement("button");
    row.className = "listrow";
    row.title = c.description;
    row.innerHTML =
      '<svg class="ico" viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>' +
      '<span class="lr-text"><span class="lr-name"></span><span class="lr-sub"></span></span>';
    row.querySelector(".lr-name").textContent = c.title || "(제목 없음)";
    row.querySelector(".lr-sub").textContent = c.description;
    row.onclick = () => {
      const s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + c.content + ta.value.slice(e);
      const pos = s + c.content.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
      syncSave();
    };
    detailBody.appendChild(row);
  });
}

function openAddMenu(anchor, missing, ws) {
  document.querySelector(".addmenu")?.remove();
  const menu = document.createElement("div");
  menu.className = "addmenu";
  const r = anchor.getBoundingClientRect();
  menu.style.left = r.left + "px";
  menu.style.top = r.bottom + "px";
  missing.forEach((it) => {
    const b = document.createElement("button");
    b.className = "addmenu-item";
    b.textContent = it.label;
    b.onclick = async () => {
      menu.remove();
      const path = itemPath(ws, it);
      if (it.type === "file") await invoke("write_file", { path, contents: "" });
      else await invoke("create_dir", { path });
      activeTab = it.key; // 새로 만든 탭을 바로 연다
      renderBar2();
    };
    menu.appendChild(b);
  });
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
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
