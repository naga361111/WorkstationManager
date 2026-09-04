// 훅 하나를 편집하는 입력 필드(event/matcher/command/timeout, 선택적 title)를 만든다.
// 저장소 창(hooks.js)과 워크스테이션 훅 탭(main.js)이 공유해 matcher 안내 로직 중복을 막는다.
// hookFields(el, h, onChange, {showTitle}) — h를 제자리 수정하고, 편집마다 onChange() 호출.

// 이벤트별 matcher 비교 대상. kind=null 이면 matcher를 쓰지 않는다(입력 비활성).
export const EVENTS = [
  { name: "PreToolUse",       kind: "tool",    hint: "도구 이름 정규식 — 예: Bash, Edit|Write, mcp__.*, * (전체)" },
  { name: "PostToolUse",      kind: "tool",    hint: "도구 이름 정규식 — 예: Bash, Edit|Write, mcp__.*, * (전체)" },
  { name: "UserPromptSubmit", kind: null,      hint: "이 이벤트는 매처를 쓰지 않습니다." },
  { name: "Notification",     kind: null,      hint: "이 이벤트는 매처를 쓰지 않습니다." },
  { name: "Stop",             kind: null,      hint: "이 이벤트는 매처를 쓰지 않습니다." },
  { name: "SubagentStop",     kind: null,      hint: "이 이벤트는 매처를 쓰지 않습니다." },
  { name: "SessionStart",     kind: "source",  hint: "시작 소스 — startup | resume | clear | compact" },
  { name: "SessionEnd",       kind: null,      hint: "이 이벤트는 매처를 쓰지 않습니다." },
  { name: "PreCompact",       kind: "trigger", hint: "압축 종류 — manual | auto" },
];
export const eventOf = (name) => EVENTS.find((e) => e.name === name) || EVENTS[0];

function field(label, node) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.className = "field-label";
  span.textContent = label;
  wrap.append(span, node);
  return wrap;
}

export function hookFields(el, h, onChange, opts = {}) {
  if (opts.showTitle) {
    const title = document.createElement("input");
    title.className = "field-input";
    title.value = h.title || "";
    title.placeholder = "예: 편집 후 포맷";
    title.oninput = () => { h.title = title.value; onChange(); };
    el.appendChild(field("제목 (저장소 구분용)", title));
  }

  const event = document.createElement("select");
  event.className = "field-input";
  EVENTS.forEach((e) => {
    const o = document.createElement("option");
    o.value = e.name;
    o.textContent = e.name;
    event.appendChild(o);
  });
  event.value = h.event;

  const matcher = document.createElement("input");
  matcher.className = "field-input";
  const hint = document.createElement("span");
  hint.className = "field-label";
  const matcherField = field("매처 (matcher)", matcher);
  matcherField.appendChild(hint);

  const applyKind = () => {
    const kind = eventOf(event.value).kind;
    hint.textContent = eventOf(event.value).hint;
    matcher.disabled = kind === null;
    matcher.placeholder = kind === null ? "" : "비우면 전체";
    if (kind === null) { matcher.value = ""; h.matcher = ""; }
  };
  matcher.value = h.matcher || "";
  applyKind();

  event.onchange = () => { h.event = event.value; applyKind(); h.matcher = matcher.value; onChange(); };
  matcher.oninput = () => { h.matcher = matcher.value; onChange(); };

  const command = document.createElement("textarea");
  command.className = "editor comp-content";
  command.value = h.command || "";
  command.oninput = () => { h.command = command.value; onChange(); };

  const timeout = document.createElement("input");
  timeout.type = "number";
  timeout.min = "1";
  timeout.className = "field-input";
  timeout.placeholder = "기본 60";
  timeout.value = h.timeout ?? "";
  timeout.oninput = () => { h.timeout = timeout.value ? Number(timeout.value) : null; onChange(); };

  el.append(
    field("이벤트 (event)", event),
    matcherField,
    field("명령 (command)", command),
    field("타임아웃 (초, 선택)", timeout)
  );
}
