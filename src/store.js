// 제목+설명+내용 목록을 CRUD하는 독립 저장소 창. 컴포넌트/스킬이 공유한다.
// 어떤 저장소인지는 <body data-store="components|skills"> 로 정한다. 목록 전체를 통째로 저장한다.
import { frontmatterFields } from "./cmdform.js";
const { invoke } = window.__TAURI__.core;
const { emit } = window.__TAURI__.event;

const CONFIG = {
  components: { list: "list_components", save: "save_components", event: "components-changed",
    add: "컴포넌트 추가", empty: "왼쪽에서 컴포넌트를 선택하거나 추가하세요." },
  skills: { list: "list_skills", save: "save_skills", event: "skills-changed",
    add: "스킬 추가", empty: "왼쪽에서 스킬을 선택하거나 추가하세요." },
  slashcommands: { list: "list_slashcommands", save: "save_slashcommands", event: "slashcommands-changed",
    add: "커맨드 추가", empty: "왼쪽에서 슬래시 커맨드를 선택하거나 추가하세요.",
    labels: { title: "커맨드 이름 (파일명 → /이름)", description: "설명 (description)", content: "본문 (프롬프트)" },
    // 프론트매터로 나갈 선택 필드. renderEdit가 설명과 본문 사이에 끼워 넣는다.
    extra: frontmatterFields,
  },
};
const cfg = CONFIG[document.body.dataset.store];

const compListEl = document.getElementById("comp-list");
const compEditEl = document.getElementById("comp-edit");
let items = [];
let sel = -1;
let saved = "[]"; // 마지막 저장 시점의 스냅샷
let saveBtn = null;

// 현재 상태가 저장본과 실제로 다를 때만 저장 버튼 활성화(되돌려서 같아지면 다시 비활성화).
function syncSave() {
  if (saveBtn) saveBtn.disabled = JSON.stringify(items) === saved;
}

function render() {
  compListEl.innerHTML = "";
  items.forEach((c, i) => {
    const row = document.createElement("button");
    row.className = "listrow" + (i === sel ? " selected" : "");
    row.innerHTML =
      '<svg class="ico" viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>' +
      '<span class="lr-text"><span class="lr-name"></span><span class="lr-sub"></span></span>';
    row.querySelector(".lr-name").textContent = c.title || "(제목 없음)";
    row.querySelector(".lr-sub").textContent = c.description;
    row.onclick = () => { sel = i; render(); };
    compListEl.appendChild(row);
  });
  renderEdit();
}

function renderEdit() {
  compEditEl.innerHTML = "";
  const c = items[sel];
  if (!c) {
    compEditEl.innerHTML = '<p class="empty">' + cfg.empty + "</p>";
    saveBtn = null;
    return;
  }
  const field = (label, el) => {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const span = document.createElement("span");
    span.className = "field-label";
    span.textContent = label;
    wrap.append(span, el);
    return wrap;
  };

  const title = document.createElement("input");
  title.className = "field-input";
  title.value = c.title;
  title.oninput = () => { c.title = title.value; renderRow(); syncSave(); };

  const desc = document.createElement("input");
  desc.className = "field-input";
  desc.value = c.description;
  desc.oninput = () => { c.description = desc.value; renderRow(); syncSave(); };

  const L = cfg.labels || {};
  const extraFields = (cfg.extra?.(c, syncSave) || []).map(([label, el]) => field(label, el));

  const content = document.createElement("textarea");
  content.className = "editor comp-content";
  content.value = c.content;
  content.oninput = () => { c.content = content.value; syncSave(); };

  const save = document.createElement("button");
  save.className = "btn primary";
  save.textContent = "저장";
  save.onclick = async () => { await invoke(cfg.save, storeArg()); saved = JSON.stringify(items); syncSave(); emit(cfg.event); };

  const del = document.createElement("button");
  del.className = "btn";
  del.textContent = "삭제";
  del.onclick = async () => {
    items.splice(sel, 1);
    sel = Math.min(sel, items.length - 1);
    await invoke(cfg.save, storeArg());
    saved = JSON.stringify(items);
    render();
    emit(cfg.event);
  };

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  actions.append(del, save);

  compEditEl.append(
    field(L.title || "제목", title),
    field(L.description || "설명", desc),
    ...extraFields,
    field(L.content || "내용", content),
    actions
  );

  saveBtn = save;
  syncSave(); // 새로 만든 버튼에 현재 변경 상태 반영
}

// 저장 커맨드의 인자 이름은 저장소 이름과 같다(components/skills/hooks). Rust 시그니처와 맞춘다.
function storeArg() {
  return { [document.body.dataset.store]: items };
}

// 편집 중 목록의 이름/설명만 갱신(에디터는 다시 그리지 않아 포커스 유지).
function renderRow() {
  const row = compListEl.children[sel];
  if (!row) return;
  const c = items[sel];
  row.querySelector(".lr-name").textContent = c.title || "(제목 없음)";
  row.querySelector(".lr-sub").textContent = c.description;
}

document.getElementById("comp-add").onclick = () => {
  items.push({ title: "", description: "", content: "" });
  sel = items.length - 1;
  render();
  syncSave();
};

async function load() {
  items = await invoke(cfg.list);
  saved = JSON.stringify(items);
  sel = items.length ? 0 : -1;
  render();
}

load();
