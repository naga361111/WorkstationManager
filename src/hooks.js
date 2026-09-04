// 훅 저장소 창. 훅을 event/matcher/command 구조 필드로 편집한다(제목=저장소 구분용 라벨).
// 목록은 평면 [{title, event, matcher, command, timeout}]. 저장 시 Rust가 Claude 훅 양식으로
// 조립해 hooks.json에 담는다(양식 변환은 Rust 담당). 편집 필드는 공용 모듈(hookform.js)과 공유.
import { eventOf, hookFields } from "./hookform.js";
const { invoke } = window.__TAURI__.core;

const listEl = document.getElementById("comp-list");
const editEl = document.getElementById("comp-edit");
let items = [];
let sel = -1;
let saved = "[]";
let saveBtn = null;

const snapshot = () => JSON.stringify(items);
function syncSave() {
  if (saveBtn) saveBtn.disabled = snapshot() === saved;
}

// matcher 없는 이벤트는 빈 문자열로 정규화(저장 양식에서 matcher 키가 빠지도록).
async function persist() {
  items.forEach((h) => { if (eventOf(h.event).kind === null) h.matcher = ""; });
  await invoke("save_hooks", { hooks: items });
  saved = snapshot();
}

function label(h) {
  const sub = h.event + (h.matcher ? " · " + h.matcher : "");
  return { name: h.title || "(제목 없음)", sub };
}

function render() {
  listEl.innerHTML = "";
  items.forEach((h, i) => {
    const row = document.createElement("button");
    row.className = "listrow" + (i === sel ? " selected" : "");
    row.innerHTML =
      '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>' +
      '<span class="lr-text"><span class="lr-name"></span><span class="lr-sub"></span></span>';
    const l = label(h);
    row.querySelector(".lr-name").textContent = l.name;
    row.querySelector(".lr-sub").textContent = l.sub;
    row.onclick = () => { sel = i; render(); };
    listEl.appendChild(row);
  });
  renderEdit();
}

function renderRow() {
  const row = listEl.children[sel];
  if (!row) return;
  const l = label(items[sel]);
  row.querySelector(".lr-name").textContent = l.name;
  row.querySelector(".lr-sub").textContent = l.sub;
}

function renderEdit() {
  editEl.innerHTML = "";
  const h = items[sel];
  if (!h) {
    editEl.innerHTML = '<p class="empty">왼쪽에서 훅을 선택하거나 추가하세요.</p>';
    saveBtn = null;
    return;
  }

  hookFields(editEl, h, () => { renderRow(); syncSave(); }, { showTitle: true });

  const save = document.createElement("button");
  save.className = "btn primary";
  save.textContent = "저장";
  save.onclick = async () => {
    if (!h.command.trim()) return alert("command를 입력하세요.");
    await persist();
    syncSave();
  };

  const del = document.createElement("button");
  del.className = "btn";
  del.textContent = "삭제";
  del.onclick = async () => {
    items.splice(sel, 1);
    sel = Math.min(sel, items.length - 1);
    await persist();
    render();
  };

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  actions.append(del, save);
  editEl.appendChild(actions);

  saveBtn = save;
  syncSave();
}

document.getElementById("comp-add").onclick = () => {
  items.push({ title: "", event: "PreToolUse", matcher: "", command: "", timeout: null });
  sel = items.length - 1;
  render();
  syncSave();
};

async function load() {
  items = await invoke("list_hooks");
  saved = snapshot();
  sel = items.length ? 0 : -1;
  render();
}

load();
