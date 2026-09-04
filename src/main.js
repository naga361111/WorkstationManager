// 워크스테이션 = 이름 + 실제 폴더 경로.
// 목록은 앱 실행 파일 옆의 workstations.json에 저장(Rust)하고, 여기서 순회해 렌더링한다.
const { invoke } = window.__TAURI__.core;

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
];

let workstations = [];
let selected = 0;
let activeTab = null; // 현재 선택된 탭 key

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
    save.onclick = async () => {
      await invoke("write_file", { path, contents: ta.value });
      detailInfo(item, path, [["종류", "파일"], ["경로", path], ["크기", ta.value.length + "자"]]);
    };

    editBody.append(ta, save);
    detailInfo(item, path, [["종류", "파일"], ["경로", path], ["크기", contents.length + "자"]]);
  } else {
    const names = await invoke("list_dir", { path }).catch(() => []);
    if (names.length === 0) {
      editBody.innerHTML = '<p class="empty">비어 있음</p>';
    } else {
      const ul = document.createElement("div");
      ul.className = "dirlist";
      names.forEach((n) => {
        const row = document.createElement("div");
        row.className = "dirrow";
        row.textContent = n;
        ul.appendChild(row);
      });
      editBody.appendChild(ul);
    }
    detailInfo(item, path, [["종류", "폴더"], ["경로", path], ["항목", names.length + "개"]]);
  }
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
