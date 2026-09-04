// 편집(중앙)·디테일(우측) 패널 렌더링. 메인 창과 글로벌 창이 공유한다.
// createPanels(editBody, detailBody, opts) → { render, onComponentsChanged, openAddMenu }
//   render(ws, item): 활성 탭(item) 하나가 두 패널을 소유한다. ws는 { name, path }.
//   opts.memoryDetail(ws, refreshList): 메모리 목록 화면의 디테일 패널(선택). 없으면 비운다.
const { invoke } = window.__TAURI__.core;

// SKILL.md 등: 최상단 --- … --- 를 프론트매터(순서 보존 key/value)와 본문으로 분리한다.
// value = 콜론 뒤 원문. 한 줄이면 inline(입력창), 여러 줄(folded/list)이면 원문 그대로 textarea로 왕복 보존.
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fields: [], body: text };
  const fields = [];
  let cur = null;
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z0-9_-]+):(.*)$/); // 들여쓴 연속 라인은 매치 안 됨
    if (km) { cur = { key: km[1], raw: km[2] }; fields.push(cur); }
    else if (cur) cur.raw += "\n" + line;
  }
  for (const f of fields) {
    f.inline = !f.raw.includes("\n");
    f.value = f.inline ? f.raw.replace(/^ /, "") : f.raw;
  }
  return { fields, body: text.slice(m[0].length).replace(/^[\r\n]+/, "") };
}

// 필드(키 고정, 값 편집)와 본문을 다시 SKILL.md 문자열로 조립. 프론트매터 없으면 본문만.
function buildDoc(fields, body) {
  if (fields.length === 0) return body;
  const fm = fields.map(({ key, value, inline }) => {
    if (!inline) return `${key}:${value}`;          // folded/list 등 여러 줄 값은 원문 보존
    const v = value.replace(/\r?\n+/g, " ").trim(); // 한 줄 값: 편집 중 생긴 줄바꿈은 공백으로 접어 YAML 한 줄 유지
    return v ? `${key}: ${v}` : `${key}:`;
  }).join("\n");
  return `---\n${fm}\n---\n\n${body}`;
}

export function createPanels(editBody, detailBody, opts = {}) {
  let refreshPicker = null; // 컴포넌트 창 변경 시 삽입 목록 갱신용. 해당 화면일 때만 세팅.
  let refreshSkills = null; // 스킬 창 변경 시 스킬 목록 디테일 갱신용. 스킬 목록 화면일 때만 세팅.

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
    refreshSkills = null; // 탭이 바뀌면 초기화; 스킬 목록 화면일 때만 다시 세팅
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
      const isSkills = item.key === "skills";
      const fileOf = isSkills
        ? (name) => path + "/" + name + "/SKILL.md"
        : (name) => path + "/" + name;
      // 스킬/메모리 파일은 프론트매터 필드 에디터. 단 메모리 인덱스(MEMORY.md)는 형식이 달라 일반 편집.
      // 메모리 파일은 저장 시 프론트매터 name에 맞춰 <name>.md로 리네임한다(스킬은 항상 SKILL.md라 제외).
      const openFile = (name) =>
        name === "MEMORY.md"
          ? openEditor(fileOf(name), showList)
          : openFmEditor(fileOf(name), showList, item.key === "memory" ? ws.path : null);
      // 목록에서 삭제: 스킬=폴더 통째로, 메모리=파일(단 MEMORY.md 제외 — 버튼은 renderDirList가 가림).
      // 메모리 삭제 후엔 인덱스 링크가 깨지므로 재정리 지시문을 남긴다.
      const onDelete = isSkills
        ? async (name) => {
            if (!confirm("‘" + name + "’ 스킬을 삭제할까요?")) return;
            await invoke("delete_path", { path: path + "/" + name });
            await refreshEdit();
          }
        : item.key === "memory"
        ? async (name) => {
            if (!confirm("‘" + name + "’ 메모리를 삭제할까요?")) return;
            await invoke("delete_path", { path: path + "/" + name });
            await refreshEdit();
          }
        : null;
      // 메모리 추가: 표준 프론트매터 템플릿으로 새 파일을 만들고 바로 편집기로 연다(저장 시 name.md로 리네임).
      const onAdd = item.key === "memory" ? async () => {
        const existing = await invoke("list_dir", { path }).catch(() => []);
        let name = "new-memory.md";
        for (let i = 2; existing.includes(name); i++) name = "new-memory-" + i + ".md";
        const slug = name.replace(/\.md$/, "");
        await invoke("write_file", {
          path: path + "/" + name,
          contents: `---\nname: ${slug}\ndescription: \nmetadata:\n  type: project\n---\n\n`,
        });
        openFile(name);
      } : null;
      const refreshEdit = () => renderDirList(path, openFile, onDelete, onAdd); // 편집 패널(목록)만 갱신
      async function showList() {
        refreshPicker = null; // 목록 화면에선 컴포넌트 창 변경 무시
        refreshSkills = null;
        detailBody.innerHTML = "";
        // 목록 화면 디테일은 메인 창 워크스테이션에서만. 메모리=위치 토글+가져오기, 스킬=앱 스킬 복사.
        if (item.key === "memory" && opts.memoryDetail) await opts.memoryDetail(ws, refreshEdit);
        if (item.key === "skills") {
          await renderSkillsDetail(path, refreshEdit);
          refreshSkills = () => renderSkillsDetail(path, refreshEdit); // 스킬 창 변경 시 목록 갱신용
        }
        await refreshEdit();
      }
      await showList();
    }
  }

  // 폴더의 파일 목록을 편집 패널에 그린다. onPick이 있으면 행을 클릭 가능한 버튼으로,
  // onDelete가 있으면 행마다 삭제 버튼을 붙인다. 항목 수 반환.
  async function renderDirList(path, onPick, onDelete, onAdd) {
    editBody.innerHTML = "";
    const names = await invoke("list_dir", { path }).catch(() => []);
    if (names.length === 0) {
      editBody.innerHTML = '<p class="empty">비어 있음</p>';
    } else {
    const ul = document.createElement("div");
    ul.className = "dirlist";
    names.forEach((n) => {
      const pick = document.createElement(onPick ? "button" : "div");
      pick.className = "dirrow" + (onPick ? " pick" : "");
      pick.textContent = n;
      if (onPick) pick.onclick = () => onPick(n);
      // 인덱스 파일(MEMORY.md)은 삭제 대상이 아니라 삭제 버튼을 붙이지 않는다.
      if (onDelete && n !== "MEMORY.md") {
        const del = document.createElement("button");
        del.className = "btn dirrow-del";
        del.textContent = "삭제";
        del.onclick = () => onDelete(n);
        const wrap = document.createElement("div");
        wrap.className = "dirrow-row";
        wrap.append(pick, del);
        ul.appendChild(wrap);
      } else {
        ul.appendChild(pick);
      }
    });
    editBody.appendChild(ul);
    }
    if (onAdd) {
      const add = document.createElement("button");
      add.className = "addrow";
      add.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>메모리 추가';
      add.onclick = onAdd;
      editBody.appendChild(add);
    }
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

  // 프론트매터가 있는 문서(SKILL.md·메모리 파일): 프론트매터를 키(고정)/값(편집) 필드로,
  // 본문은 textarea로 나눠 편집. 존재하는 키만 순회. 저장 시 원문 형식으로 재조립. 미리보기=본문.
  async function openFmEditor(path, back, memoryWs) {
    editBody.innerHTML = "";

    const backBtn = document.createElement("button");
    backBtn.className = "btn editor-back";
    backBtn.textContent = "← 목록";
    backBtn.onclick = back;

    const raw = await invoke("read_file", { path }).catch(() => "");
    const { fields, body } = parseFrontmatter(raw);

    // 프론트매터 필드: 키 라벨 고정 + 값 편집(한 줄=input, 여러 줄=textarea). 접을 수 있게 <details>.
    const inputs = [];
    let fmEl = null;
    if (fields.length) {
      fmEl = document.createElement("details");
      fmEl.className = "fm-fields";
      fmEl.open = true;
      const summary = document.createElement("summary");
      summary.className = "fm-summary";
      summary.textContent = "프론트매터";
      fmEl.appendChild(summary);
    }
    fields.forEach((f) => {
      const row = document.createElement("div");
      row.className = "fm-field";
      const k = document.createElement("span");
      k.className = "fm-key";
      k.textContent = f.key;
      // 값이 여러 줄이거나 길면(예: description) textarea로 줄바꿈해 보여주고, 짧은 한 줄만 input.
      const multiline = !f.inline || f.value.length > 60;
      let el;
      if (multiline) {
        el = document.createElement("textarea");
        el.value = f.value;
        el.rows = f.inline ? 3 : Math.min(8, f.value.split("\n").length);
      } else {
        el = document.createElement("input");
        el.type = "text";
        el.value = f.value;
      }
      el.className = "fm-val";
      row.append(k, el);
      fmEl.appendChild(row);
      inputs.push({ key: f.key, el, inline: f.inline });
    });

    const ta = document.createElement("textarea");
    ta.className = "editor";
    ta.value = body;

    const save = document.createElement("button");
    save.className = "btn primary editor-save";
    save.textContent = "저장";
    const rebuild = () =>
      buildDoc(inputs.map((i) => ({ key: i.key, value: i.el.value, inline: i.inline })), ta.value);
    let saved = rebuild(); // 파싱→재조립 기준. 왕복 정규화(빈 줄 등) 반영해 초기엔 비활성화.
    const syncSave = () => { save.disabled = rebuild() === saved; };
    ta.oninput = syncSave;
    inputs.forEach((i) => (i.el.oninput = syncSave));
    syncSave();
    save.onclick = async () => {
      const out = rebuild();
      // 메모리: 프론트매터 name이 바뀌면 <name>.md로 리네임(새 파일 쓰고 옛 파일 삭제).
      let target = path;
      if (memoryWs) {
        const nm = (inputs.find((i) => i.key === "name")?.el.value || "")
          .replace(/[\\/:*?"<>|]/g, "-").trim();
        if (nm) {
          const np = path.slice(0, path.lastIndexOf("/") + 1) + nm + ".md";
          if (np !== path) target = np;
        }
      }
      await invoke("write_file", { path: target, contents: out });
      if (target !== path) {
        await invoke("delete_path", { path });
        path = target;
      }
      saved = out;
      syncSave();
    };

    const { pv, toggle } = attachPreview(ta); // 미리보기는 본문 기준(기존과 동일)
    editBody.append(backBtn, ...(fmEl ? [fmEl] : []), ta, pv, editorActions(toggle, save));

    // 디테일 패널: 컴포넌트 삽입(본문 커서에). 컴포넌트 창 변경 시 갱신.
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

  // 스킬 목록 화면 디테일: 앱에 정의된 스킬(list_skills)을 이 스킬 폴더(dir)로 복사한다.
  // SKILL.md 규격(name/description 프론트매터 + content 본문)으로 만든다. 복사본은 독립본(원본 변경 미반영).
  // 프로젝트(.claude/skills)·글로벌(~/.claude/skills) 공통이라 dir만 다르게 받아 처리한다.
  async function renderSkillsDetail(dir, refreshList) {
    detailBody.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.padding = "12px";

    const label = document.createElement("div");
    label.className = "wsm-label";
    label.style.marginBottom = "6px";
    label.textContent = "스킬 추가";

    const desc = document.createElement("p");
    desc.className = "empty";
    desc.style.margin = "0 0 10px";
    desc.textContent = "앱에 정의된 스킬을 여기로 복사합니다.";

    const status = document.createElement("p");
    status.className = "empty";
    status.style.margin = "10px 0 0";

    wrap.append(label, desc);

    const skills = await invoke("list_skills").catch(() => []);
    if (skills.length === 0) {
      const none = document.createElement("p");
      none.className = "empty";
      none.style.margin = "0";
      none.textContent = "정의된 스킬이 없습니다. 상단바 ‘스킬’에서 추가하세요.";
      wrap.appendChild(none);
    }
    skills.forEach((s) => {
      const row = document.createElement("button");
      row.className = "listrow";
      row.title = s.description;
      row.innerHTML =
        '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L4.5 12.5H11l-1 9.5 8.5-11H12z"/></svg>' +
        '<span class="lr-text"><span class="lr-name"></span><span class="lr-sub"></span></span>';
      row.querySelector(".lr-name").textContent = s.title || "(제목 없음)";
      row.querySelector(".lr-sub").textContent = s.description;
      row.onclick = async () => {
        // 폴더 이름 = 스킬 제목(파일명 금지문자만 치환). 이미 있으면 -2, -3… 붙여 기존 복사본 보존.
        const base = (s.title || "").replace(/[\\/:*?"<>|]/g, "-").trim() || "skill";
        const existing = await invoke("list_dir", { path: dir }).catch(() => []);
        let name = base;
        for (let i = 2; existing.includes(name); i++) name = base + "-" + i;
        const skillDir = dir + "/" + name;
        // SKILL.md 규격: 프론트매터(name=폴더명, description) + 본문(content). 본문은 그대로 복사.
        const fm = `---\nname: ${name}\ndescription: ${(s.description || "").replace(/\r?\n+/g, " ").trim()}\n---\n\n`;
        await invoke("create_dir", { path: skillDir });
        await invoke("write_file", { path: skillDir + "/SKILL.md", contents: fm + s.content });
        await refreshList();
        status.textContent = "‘" + name + "’ 추가됨.";
      };
      wrap.appendChild(row);
    });

    wrap.appendChild(status);
    detailBody.appendChild(wrap);
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
    onSkillsChanged: () => refreshSkills?.(),
  };
}
