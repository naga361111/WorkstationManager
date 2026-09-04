// 컴포넌트 저장소 창. 메인 창과 분리된 독립 WebviewWindow에서 동작한다.
// 컴포넌트 = 제목 + 설명 + 내용. 목록 전체를 통째로 components.json에 저장한다.
const { invoke } = window.__TAURI__.core;
const { emit } = window.__TAURI__.event;

const compListEl = document.getElementById("comp-list");
const compEditEl = document.getElementById("comp-edit");
let components = [];
let compSel = -1;
let saved = "[]"; // 마지막 저장 시점의 스냅샷
let saveBtn = null;

// 현재 상태가 저장본과 실제로 다를 때만 저장 버튼 활성화(되돌려서 같아지면 다시 비활성화).
function syncSave() {
  if (saveBtn) saveBtn.disabled = JSON.stringify(components) === saved;
}

function renderComp() {
  compListEl.innerHTML = "";
  components.forEach((c, i) => {
    const row = document.createElement("button");
    row.className = "listrow" + (i === compSel ? " selected" : "");
    row.innerHTML =
      '<svg class="ico" viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>' +
      '<span class="lr-text"><span class="lr-name"></span><span class="lr-sub"></span></span>';
    row.querySelector(".lr-name").textContent = c.title || "(제목 없음)";
    row.querySelector(".lr-sub").textContent = c.description;
    row.onclick = () => { compSel = i; renderComp(); };
    compListEl.appendChild(row);
  });
  renderCompEdit();
}

function renderCompEdit() {
  compEditEl.innerHTML = "";
  const c = components[compSel];
  if (!c) {
    compEditEl.innerHTML = '<p class="empty">왼쪽에서 컴포넌트를 선택하거나 추가하세요.</p>';
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
  title.oninput = () => { c.title = title.value; renderCompRow(); syncSave(); };

  const desc = document.createElement("input");
  desc.className = "field-input";
  desc.value = c.description;
  desc.oninput = () => { c.description = desc.value; renderCompRow(); syncSave(); };

  const content = document.createElement("textarea");
  content.className = "editor comp-content";
  content.value = c.content;
  content.oninput = () => { c.content = content.value; syncSave(); };

  const save = document.createElement("button");
  save.className = "btn primary";
  save.textContent = "저장";
  save.onclick = async () => { await invoke("save_components", { components }); saved = JSON.stringify(components); syncSave(); emit("components-changed"); };

  const del = document.createElement("button");
  del.className = "btn";
  del.textContent = "삭제";
  del.onclick = async () => {
    components.splice(compSel, 1);
    compSel = Math.min(compSel, components.length - 1);
    await invoke("save_components", { components });
    saved = JSON.stringify(components);
    renderComp();
    emit("components-changed");
  };

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  actions.append(del, save);

  compEditEl.append(
    field("제목", title),
    field("설명", desc),
    field("내용", content),
    actions
  );

  saveBtn = save;
  syncSave(); // 새로 만든 버튼에 현재 변경 상태 반영
}

// 편집 중 목록의 이름/설명만 갱신(에디터는 다시 그리지 않아 포커스 유지).
function renderCompRow() {
  const row = compListEl.children[compSel];
  if (!row) return;
  const c = components[compSel];
  row.querySelector(".lr-name").textContent = c.title || "(제목 없음)";
  row.querySelector(".lr-sub").textContent = c.description;
}

document.getElementById("comp-add").onclick = () => {
  components.push({ title: "", description: "", content: "" });
  compSel = components.length - 1;
  renderComp();
  syncSave();
};

async function load() {
  components = await invoke("list_components");
  saved = JSON.stringify(components);
  compSel = components.length ? 0 : -1;
  renderComp();
}

load();
