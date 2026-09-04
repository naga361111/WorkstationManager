// 편집(중앙)·디테일(우측) 패널 렌더링. 메인 창과 글로벌 창이 공유한다.
// createPanels(editBody, detailBody, opts) → { render, onComponentsChanged, openAddMenu }
//   render(ws, item): 활성 탭(item) 하나가 두 패널을 소유한다. ws는 { name, path }.
//   opts.memoryDetail(ws, refreshList): 메모리 목록 화면의 디테일 패널(선택). 없으면 비운다.
const { invoke } = window.__TAURI__.core;

export function createPanels(editBody, detailBody, opts = {}) {
  let refreshPicker = null; // 컴포넌트 창 변경 시 삽입 목록 갱신용. 해당 화면일 때만 세팅.

  // 편집기(textarea)에 마크다운 미리보기 토글을 붙인다. marked로 렌더링.
  function attachPreview(ta) {
    const pv = document.createElement("div");
    pv.className = "preview markdown";
    pv.hidden = true;
    const toggle = document.createElement("button");
    toggle.className = "btn editor-preview";
    toggle.textContent = "미리보기";
    toggle.onclick = () => {
      if (pv.hidden) { pv.innerHTML = marked.parse(ta.value); pv.hidden = false; ta.hidden = true; toggle.textContent = "편집"; }
      else { pv.hidden = true; ta.hidden = false; toggle.textContent = "미리보기"; }
    };
    return { pv, toggle };
  }

  // 편집기 하단 버튼 줄(미리보기 + 저장)을 한 행에 담는다.
  function editorActions(...btns) {
    const row = document.createElement("div");
    row.className = "editor-actions";
    row.append(...btns);
    return row;
  }

  // 활성 탭 하나가 편집 패널(중앙)과 디테일 패널(우측)을 소유한다.
  async function render(ws, item) {
    editBody.innerHTML = "";
    detailBody.innerHTML = "";
    refreshPicker = null; // 탭이 바뀌면 초기화; 아래에서 CLAUDE.md일 때만 다시 세팅
    if (!ws || !item) return;
    const path = ws.path + "/" + item.rel;

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

      const { pv, toggle } = attachPreview(ta);
      editBody.append(ta, pv, editorActions(toggle, save));
      refreshDetail();
    } else {
      // 폴더 탭(메모리·스킬): 목록 → 클릭하면 편집 모드로 전환. 편집 화면 디테일=컴포넌트 삽입.
      //   메모리=파일 직접, 스킬=<스킬 폴더>/SKILL.md 를 연다.
      const fileOf = item.key === "skills"
        ? (name) => path + "/" + name + "/SKILL.md"
        : (name) => path + "/" + name;
      const openFile = (name) => openEditor(fileOf(name), showList);
      const refreshEdit = () => renderDirList(path, openFile); // 편집 패널(목록)만 갱신
      async function showList() {
        refreshPicker = null; // 목록 화면에선 컴포넌트 창 변경 무시
        detailBody.innerHTML = "";
        // 메모리 목록 화면 디테일(위치 토글+가져오기)은 메인 창 워크스테이션에서만.
        if (item.key === "memory" && opts.memoryDetail) await opts.memoryDetail(ws, refreshEdit);
        await refreshEdit();
      }
      await showList();
    }
  }

  // 폴더의 파일 목록을 편집 패널에 그린다. onPick이 있으면 행을 클릭 가능한 버튼으로. 항목 수 반환.
  async function renderDirList(path, onPick) {
    editBody.innerHTML = "";
    const names = await invoke("list_dir", { path }).catch(() => []);
    if (names.length === 0) {
      editBody.innerHTML = '<p class="empty">비어 있음</p>';
      return 0;
    }
    const ul = document.createElement("div");
    ul.className = "dirlist";
    names.forEach((n) => {
      const row = document.createElement(onPick ? "button" : "div");
      row.className = "dirrow" + (onPick ? " pick" : "");
      row.textContent = n;
      if (onPick) row.onclick = () => onPick(n);
      ul.appendChild(row);
    });
    editBody.appendChild(ul);
    return names.length;
  }

  // 파일 하나를 편집 패널에서 열어 내용을 수정/저장한다. back으로 목록 복귀. (메모리·스킬 공용)
  async function openEditor(path, back) {
    editBody.innerHTML = "";

    const backBtn = document.createElement("button");
    backBtn.className = "btn editor-back";
    backBtn.textContent = "← 목록";
    backBtn.onclick = back;

    const contents = await invoke("read_file", { path }).catch(() => "");
    const ta = document.createElement("textarea");
    ta.className = "editor";
    ta.value = contents;

    const save = document.createElement("button");
    save.className = "btn primary editor-save";
    save.textContent = "저장";
    let saved = contents;
    const syncSave = () => { save.disabled = ta.value === saved; };
    ta.oninput = syncSave;
    syncSave();
    save.onclick = async () => {
      await invoke("write_file", { path, contents: ta.value });
      saved = ta.value;
      syncSave();
    };

    const { pv, toggle } = attachPreview(ta);
    editBody.append(backBtn, ta, pv, editorActions(toggle, save));

    // 디테일 패널: 컴포넌트 삽입(현재 textarea 커서에 내용 삽입). 컴포넌트 창 변경 시 갱신.
    renderCompPicker(ta, syncSave);
    refreshPicker = () => renderCompPicker(ta, syncSave);
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

  // CLAUDE.md/메모리 편집 시: 디테일 패널에서 컴포넌트를 조회하고, 고른 컴포넌트의 '내용'만
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

  // 없는 항목을 만드는 드롭다운. 생성 후 onCreated(key)로 호출 측이 탭 갱신.
  function openAddMenu(anchor, missing, ws, onCreated) {
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
        const path = ws.path + "/" + it.rel;
        if (it.type === "file") await invoke("write_file", { path, contents: "" });
        else await invoke("create_dir", { path });
        onCreated(it.key);
      };
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
  }

  return {
    render,
    openAddMenu,
    onComponentsChanged: () => refreshPicker?.(),
  };
}
