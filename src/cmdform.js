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

// 서브 에이전트 프론트매터로 나갈 선택 필드(tools/model)를 [라벨, 요소] 쌍 배열로.
// store.js가 설명과 본문 사이에 끼운다. name=title, description=description은 store가 담당.
export function subagentFields(c, onChange) {
  const inp = (key, ph) => {
    const el = document.createElement("input");
    el.className = "field-input";
    el.placeholder = ph;
    el.value = c[key] || "";
    el.oninput = () => { c[key] = el.value; onChange(); };
    return el;
  };
  return [
    ["도구 (tools)", inp("tools", "비우면 전체 상속. 예: Read, Grep, Bash")],
    ["모델 (model)", inp("model", "비우면 기본 모델. 예: sonnet / opus / haiku")],
  ];
}

// MCP 서버 프론트매터로 나갈 선택 필드(전송 방식/명령/URL/env)를 [라벨, 요소] 쌍 배열로.
// store.js가 설명과 본문(=args) 사이에 끼운다. stdio는 command+args+env, http/sse는 url을 채운다.
export function mcpFields(c, onChange) {
  const inp = (key, ph) => {
    const el = document.createElement("input");
    el.className = "field-input";
    el.placeholder = ph;
    el.value = c[key] || "";
    el.oninput = () => { c[key] = el.value; onChange(); };
    return el;
  };

  const transport = document.createElement("select");
  transport.className = "field-input";
  ["stdio", "http", "sse"].forEach((t) => {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = t;
    transport.appendChild(o);
  });
  transport.value = c.transport || "stdio";
  transport.onchange = () => { c.transport = transport.value; onChange(); };

  const env = document.createElement("textarea");
  env.className = "editor comp-content";
  env.placeholder = "KEY=VALUE (한 줄에 하나)";
  env.value = c.env || "";
  env.oninput = () => { c.env = env.value; onChange(); };

  return [
    ["전송 방식 (transport)", transport],
    ["실행 명령 (command · stdio)", inp("command", "예: node")],
    ["URL (http/sse)", inp("url", "예: https://example.com/mcp")],
    ["환경 변수 (env)", env],
  ];
}

// MCP 서버 하나의 전체 편집 폼(이름/전송/명령/URL/env/args)을 el에 붙인다.
// 프로젝트 MCP 탭(main.js)이 쓴다. .mcp.json엔 description이 없어 이름부터 시작한다.
export function mcpFormFields(el, c, onChange) {
  const name = document.createElement("input");
  name.className = "field-input";
  name.value = c.title || "";
  name.placeholder = "예: test (→ 서버 이름 = .mcp.json 키)";
  name.oninput = () => { c.title = name.value; onChange(); };

  el.append(field("이름 (서버 이름)", name));
  mcpFields(c, onChange).forEach(([label, node]) => el.append(field(label, node)));

  const args = document.createElement("textarea");
  args.className = "editor comp-content";
  args.placeholder = "인자 (한 줄에 하나). 예: -y ⏎ @modelcontextprotocol/server-everything";
  args.value = c.content || "";
  args.oninput = () => { c.content = args.value; onChange(); };
  el.append(field("인자 (args · 한 줄에 하나)", args));
}

// 서브 에이전트 하나의 전체 편집 폼(이름/설명/도구/모델/시스템 프롬프트)을 el에 붙인다.
// 프로젝트 서브 에이전트 탭(main.js)이 쓴다. cmdFields 와 같은 패턴.
export function subagentFormFields(el, c, onChange) {
  const name = document.createElement("input");
  name.className = "field-input";
  name.value = c.title || "";
  name.placeholder = "예: code-reviewer (→ 파일명)";
  name.oninput = () => { c.title = name.value; onChange(); };

  const desc = document.createElement("input");
  desc.className = "field-input";
  desc.value = c.description || "";
  desc.placeholder = "언제 이 에이전트를 쓸지 (자동 위임 근거)";
  desc.oninput = () => { c.description = desc.value; onChange(); };

  el.append(field("이름 (name)", name), field("설명 (description)", desc));
  subagentFields(c, onChange).forEach(([label, node]) => el.append(field(label, node)));

  const content = document.createElement("textarea");
  content.className = "editor comp-content";
  content.value = c.content || "";
  content.placeholder = "이 서브 에이전트의 시스템 프롬프트.";
  content.oninput = () => { c.content = content.value; onChange(); };
  el.append(field("시스템 프롬프트", content));
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
