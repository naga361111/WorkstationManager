// 슬래시 커맨드 하나를 편집하는 입력 필드. 저장소 창(store.js)과 메인 창 슬래시 커맨드 탭(main.js)이 공유.
// c를 제자리 수정하고, 편집마다 onChange() 호출. (hookform.js 와 같은 패턴)

function field(label, node) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.className = "field-label";
  span.textContent = label;
  wrap.append(span, node);
  return wrap;
}

// 프론트매터로 나갈 선택 필드 3종을 [라벨, 요소] 쌍 배열로. store.js가 설명과 본문 사이에 끼운다.
export function frontmatterFields(c, onChange) {
  const inp = (key, ph) => {
    const el = document.createElement("input");
    el.className = "field-input";
    el.placeholder = ph;
    el.value = c[key] || "";
    el.oninput = () => { c[key] = el.value; onChange(); };
    return el;
  };
  return [
    ["인자 힌트 (argument-hint)", inp("argumentHint", "예: [PR번호] — 사용자에게 보여줄 안내")],
    ["허용 도구 (allowed-tools)", inp("allowedTools", "예: Bash(git diff:*), Read")],
    ["모델 (model)", inp("model", "비우면 기본 모델")],
  ];
}

// 커맨드 하나의 전체 편집 폼(이름/설명/프론트매터/본문)을 el에 붙인다.
export function cmdFields(el, c, onChange) {
  const name = document.createElement("input");
  name.className = "field-input";
  name.value = c.title || "";
  name.placeholder = "예: review (→ /review)";
  name.oninput = () => { c.title = name.value; onChange(); };

  const desc = document.createElement("input");
  desc.className = "field-input";
  desc.value = c.description || "";
  desc.placeholder = "예: PR을 리뷰한다";
  desc.oninput = () => { c.description = desc.value; onChange(); };

  el.append(field("커맨드 이름 (파일명 → /이름)", name), field("설명 (description)", desc));
  frontmatterFields(c, onChange).forEach(([label, node]) => el.append(field(label, node)));

  const content = document.createElement("textarea");
  content.className = "editor comp-content";
  content.value = c.content || "";
  content.placeholder = "본문. 인자는 $ARGUMENTS 또는 $1, $2 로 받습니다.";
  content.oninput = () => { c.content = content.value; onChange(); };
  el.append(field("본문 (프롬프트)", content));
}
