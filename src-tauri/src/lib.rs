use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
fn read_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: &str, contents: &str) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(path: &str) -> bool {
    std::path::Path::new(path).exists()
}

#[tauri::command]
fn create_dir(path: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

/// 경로 삭제(파일이면 파일, 폴더면 통째로). 프로젝트 스킬 폴더 삭제 등에 쓴다.
#[tauri::command]
fn delete_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

/// 폴더의 하위 항목 이름 목록(폴더/파일). 편집 패널의 스킬 목록 등에 쓴다.
#[tauri::command]
fn list_dir(path: &str) -> Result<Vec<String>, String> {
    let mut names = vec![];
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        names.push(entry.file_name().to_string_lossy().into_owned());
    }
    names.sort();
    Ok(names)
}

/// A workstation = a display name + a real folder path.
#[derive(Serialize, Deserialize, Clone)]
struct Workstation {
    name: String,
    path: String,
}

/// 프로젝트 루트의 data/ 폴더에 있는 저장 파일 경로.
// ponytail: 개발 기준 경로(CARGO_MANIFEST_DIR). 배포 앱으로 옮길 땐 app_data_dir로 교체.
fn store_path(name: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("no project root")?
        .to_path_buf();
    let dir = root.join("data");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

#[tauri::command]
fn list_workstations() -> Result<Vec<Workstation>, String> {
    match fs::read_to_string(store_path("workstations.json")?) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(vec![]), // no file yet = empty list
    }
}

#[tauri::command]
fn add_workstation(name: String, path: String) -> Result<Vec<Workstation>, String> {
    let mut list = list_workstations()?;
    list.push(Workstation { name, path });
    let json = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(store_path("workstations.json")?, json).map_err(|e| e.to_string())?;
    Ok(list)
}

/// 목록에서 index 위치의 워크스테이션을 제거한다. 실제 폴더는 건드리지 않고 등록만 지운다.
#[tauri::command]
fn remove_workstation(index: usize) -> Result<Vec<Workstation>, String> {
    let mut list = list_workstations()?;
    if index >= list.len() {
        return Err("index out of range".into());
    }
    list.remove(index);
    let json = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(store_path("workstations.json")?, json).map_err(|e| e.to_string())?;
    Ok(list)
}

/// 컴포넌트 = 제목 + 설명 + 내용. 저장소는 이 목록 전체를 components.json에 담는다.
#[derive(Serialize, Deserialize, Clone)]
struct Component {
    title: String,
    description: String,
    content: String,
}

#[tauri::command]
fn list_components() -> Result<Vec<Component>, String> {
    match fs::read_to_string(store_path("components.json")?) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(vec![]),
    }
}

/// 목록 전체를 통째로 저장한다(추가/편집/삭제를 프론트에서 관리 후 한 번에 반영).
#[tauri::command]
fn save_components(components: Vec<Component>) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&components).map_err(|e| e.to_string())?;
    fs::write(store_path("components.json")?, json).map_err(|e| e.to_string())
}

/// 스킬 = 이 앱이 가진 스킬 저장소(클로드 스킬 아님). 컴포넌트와 형태가 같아 Component를 재사용한다.
#[tauri::command]
fn list_skills() -> Result<Vec<Component>, String> {
    match fs::read_to_string(store_path("skills.json")?) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(vec![]),
    }
}

#[tauri::command]
fn save_skills(skills: Vec<Component>) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&skills).map_err(|e| e.to_string())?;
    fs::write(store_path("skills.json")?, json).map_err(|e| e.to_string())
}

/// 훅 하나(편집용 평면 표현). 저장 파일은 이걸 Claude 훅 양식으로 조립해 담는다.
/// matcher="" 는 매처 없음(=전체). timeout=None 이면 저장 시 생략.
/// title 은 저장소에서 구분용 라벨(Claude 스펙 아님). 실제 프로젝트로 가져갈 땐 떼어낸다.
#[derive(Serialize, Deserialize, Clone)]
struct HookEntry {
    #[serde(default)]
    title: String,
    event: String,
    matcher: String,
    command: String,
    #[serde(default)]
    timeout: Option<u64>,
}

/// 평면 목록 → Claude 훅 양식(이벤트 → [{matcher?, hooks:[{type,command,timeout?}]}]).
/// 같은 이벤트+matcher는 한 그룹으로 합쳐 hooks 배열에 명령을 쌓는다.
fn compose_hooks(entries: &[HookEntry]) -> serde_json::Value {
    use serde_json::{json, Map, Value};
    let mut root = Map::new();
    for e in entries {
        let cmd = {
            let mut m = Map::new();
            m.insert("type".into(), json!("command"));
            m.insert("command".into(), json!(e.command));
            if let Some(t) = e.timeout {
                m.insert("timeout".into(), json!(t));
            }
            // 저장소 구분용 라벨. Claude 스펙 아님 → 프로젝트로 가져갈 때 제거한다.
            if !e.title.is_empty() {
                m.insert("title".into(), json!(e.title));
            }
            Value::Object(m)
        };
        let arr = root
            .entry(e.event.clone())
            .or_insert_with(|| json!([]))
            .as_array_mut()
            .unwrap();
        // 같은 matcher 그룹이 있으면 그 hooks에 추가, 없으면 새 그룹.
        match arr
            .iter_mut()
            .find(|g| g.get("matcher").and_then(|x| x.as_str()).unwrap_or("") == e.matcher)
        {
            Some(g) => g.get_mut("hooks").and_then(|h| h.as_array_mut()).unwrap().push(cmd),
            None => {
                let mut g = Map::new();
                if !e.matcher.is_empty() {
                    g.insert("matcher".into(), json!(e.matcher));
                }
                g.insert("hooks".into(), json!([cmd]));
                arr.push(Value::Object(g));
            }
        }
    }
    Value::Object(root)
}

/// Claude 훅 양식 → 평면 목록(편집용). compose의 역변환.
fn decompose_hooks(v: &serde_json::Value) -> Vec<HookEntry> {
    let mut out = vec![];
    let Some(obj) = v.as_object() else { return out };
    for (event, groups) in obj {
        let Some(arr) = groups.as_array() else { continue };
        for g in arr {
            let matcher = g.get("matcher").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let Some(hooks) = g.get("hooks").and_then(|h| h.as_array()) else { continue };
            for h in hooks {
                out.push(HookEntry {
                    title: h.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    event: event.clone(),
                    matcher: matcher.clone(),
                    command: h.get("command").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    timeout: h.get("timeout").and_then(|x| x.as_u64()),
                });
            }
        }
    }
    out
}

/// 훅 저장소(hooks.json)를 편집용 평면 목록으로 읽는다. 파일은 실제 훅 양식으로 저장돼 있다.
#[tauri::command]
fn list_hooks() -> Result<Vec<HookEntry>, String> {
    match fs::read_to_string(store_path("hooks.json")?) {
        Ok(s) => {
            let v: serde_json::Value = serde_json::from_str(&s).map_err(|e| e.to_string())?;
            Ok(decompose_hooks(&v))
        }
        Err(_) => Ok(vec![]),
    }
}

/// 평면 목록을 Claude 훅 양식으로 조립해 hooks.json에 저장한다.
#[tauri::command]
fn save_hooks(hooks: Vec<HookEntry>) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&compose_hooks(&hooks)).map_err(|e| e.to_string())?;
    fs::write(store_path("hooks.json")?, json).map_err(|e| e.to_string())
}

/// 이 워크스테이션에 등록된 훅을 편집용 평면 목록으로 읽는다.
/// Claude가 읽는 로컬 레벨(.claude/settings.local.json)의 hooks 키를 본다.
#[tauri::command]
fn list_project_hooks(workstation: &str) -> Result<Vec<HookEntry>, String> {
    let v: serde_json::Value = fs::read_to_string(settings_local_path(workstation))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    Ok(decompose_hooks(v.get("hooks").unwrap_or(&serde_json::Value::Null)))
}

/// 평면 목록을 Claude 훅 양식으로 조립해 settings.local.json의 hooks에 쓴다(다른 키 보존).
/// title은 Claude 스펙 아니므로 실제 파일엔 남기지 않는다. 목록이 비면 hooks 키를 지운다.
#[tauri::command]
fn save_project_hooks(workstation: &str, mut hooks: Vec<HookEntry>) -> Result<(), String> {
    let path = settings_local_path(workstation);
    let mut v: serde_json::Value = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if !v.is_object() {
        v = serde_json::json!({});
    }
    let obj = v.as_object_mut().unwrap();
    if hooks.is_empty() {
        obj.remove("hooks");
    } else {
        for h in &mut hooks {
            h.title.clear(); // 실제 파일엔 저장소 라벨을 남기지 않는다
        }
        obj.insert("hooks".into(), compose_hooks(&hooks));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

// ── 메모리 가져오기 ──────────────────────────────────
// Claude 기본 메모리 폴더(~/.claude/projects/<인코딩>/memory)의 파일을 <워크스테이션>/memory로 복사.

fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| "no home dir".into())
}

// Claude가 프로젝트별 폴더명을 만드는 방식: 영숫자가 아닌 문자를 각각 '-'로.
// 예) C:\Projects\Tool\Workstation → C--Projects-Tool-Workstation
// ponytail: ASCII 영숫자만 유지하는 근사치. Claude 인코딩이 바뀌면 여기만 손보면 됨.
fn default_memory_dir(workstation: &str) -> Result<PathBuf, String> {
    let encoded: String = workstation
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    Ok(home_dir()?.join(".claude").join("projects").join(encoded).join("memory"))
}

/// src의 최상위 '파일'들을 dst로 복사(덮어쓰기). 하위 폴더는 제외. 복사한 개수 반환.
// ponytail: 평면 복사. 메모리가 폴더 구조를 갖게 되면 재귀 추가.
fn copy_files(src: &Path, dst: &Path) -> Result<usize, String> {
    if !src.exists() {
        return Ok(0);
    }
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    let mut n = 0;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_file() {
            fs::copy(entry.path(), dst.join(entry.file_name())).map_err(|e| e.to_string())?;
            n += 1;
        }
    }
    Ok(n)
}

#[tauri::command]
fn import_memory(workstation: &str) -> Result<usize, String> {
    let src = default_memory_dir(workstation)?;
    let dst = PathBuf::from(workstation).join("memory");
    copy_files(&src, &dst)
}

// ── 자동 메모리 위치 토글 ──────────────────────────────
// Claude Code가 실제로 읽는 레벨은 .claude/settings.local.json(로컬). 프로젝트 settings.json은
// autoMemoryDirectory를 무시하므로 여기에 쓴다. 키가 있으면 '여기'(<workstation>/memory), 없으면 '기존'.

fn settings_local_path(workstation: &str) -> PathBuf {
    PathBuf::from(workstation).join(".claude").join("settings.local.json")
}

#[tauri::command]
fn memory_local_enabled(workstation: &str) -> bool {
    fs::read_to_string(settings_local_path(workstation))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("autoMemoryDirectory").and_then(|x| x.as_str()).map(|s| !s.is_empty()))
        .unwrap_or(false)
}

/// enabled=true면 autoMemoryDirectory를 <workstation>/memory로 설정, false면 키 삭제(기존 위치로).
/// settings.local.json의 다른 키는 보존한다.
#[tauri::command]
fn set_memory_local(workstation: &str, enabled: bool) -> Result<(), String> {
    let path = settings_local_path(workstation);
    let mut v: serde_json::Value = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if !v.is_object() {
        v = serde_json::json!({});
    }
    let obj = v.as_object_mut().unwrap();
    if enabled {
        // Claude Code는 Windows에서도 '/'를 받아들인다. 슬래시를 통일해 둔다.
        let dir = PathBuf::from(workstation).join("memory").to_string_lossy().replace('\\', "/");
        obj.insert("autoMemoryDirectory".into(), serde_json::Value::String(dir));
    } else {
        obj.remove("autoMemoryDirectory");
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// 전역 Claude 폴더(~/.claude) 절대경로. 글로벌 창이 CLAUDE.md·메모리 경로를 만들 때 쓴다.
#[tauri::command]
fn claude_home() -> Result<String, String> {
    Ok(home_dir()?.join(".claude").to_string_lossy().replace('\\', "/"))
}

// ── 플러그인 로컬 토글 ─────────────────────────────────
// 플러그인은 항상 전역(~/.claude/plugins)에 설치된다. 켜고 끄는 건 settings의 enabledPlugins 맵
// ("plugin@marketplace": bool). 여기선 워크스테이션의 settings.local.json(로컬 전용)에만 쓴다.

/// settings 파일 하나의 enabledPlugins 맵(없으면 빈 맵).
fn enabled_map(path: &Path) -> serde_json::Map<String, serde_json::Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("enabledPlugins").and_then(|m| m.as_object()).cloned())
        .unwrap_or_default()
}

#[derive(Serialize)]
struct PluginInfo {
    id: String,
    enabled: bool,
}

/// 전역에 설치된 모든 플러그인 + 이 워크스테이션 기준 실효 on/off.
/// 우선순위 local > project(공유) > user, 아무 데도 없으면 설치 기본값(켜짐).
#[tauri::command]
fn list_plugins(workstation: &str) -> Result<Vec<PluginInfo>, String> {
    let installed = home_dir()?
        .join(".claude")
        .join("plugins")
        .join("installed_plugins.json");
    let v: serde_json::Value = fs::read_to_string(&installed)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));

    let ws = PathBuf::from(workstation);
    let local = enabled_map(&settings_local_path(workstation));
    let project = enabled_map(&ws.join(".claude").join("settings.json"));
    let user = enabled_map(&home_dir()?.join(".claude").join("settings.json"));
    let effective = |id: &str| -> bool {
        for m in [&local, &project, &user] {
            if let Some(b) = m.get(id).and_then(|x| x.as_bool()) {
                return b;
            }
        }
        true // 설치돼 있고 아무도 끄지 않았으면 켜진 상태가 기본
    };

    let mut out = vec![];
    if let Some(map) = v.get("plugins").and_then(|p| p.as_object()) {
        for id in map.keys() {
            out.push(PluginInfo { id: id.clone(), enabled: effective(id) });
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

/// 이 워크스테이션의 settings.local.json에 enabledPlugins[id]=enabled 를 쓴다(다른 키 보존).
#[tauri::command]
fn set_plugin_local(workstation: &str, id: &str, enabled: bool) -> Result<(), String> {
    let path = settings_local_path(workstation);
    let mut v: serde_json::Value = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if !v.is_object() {
        v = serde_json::json!({});
    }
    let obj = v.as_object_mut().unwrap();
    let ep = obj
        .entry("enabledPlugins")
        .or_insert_with(|| serde_json::json!({}));
    if !ep.is_object() {
        *ep = serde_json::json!({});
    }
    ep.as_object_mut()
        .unwrap()
        .insert(id.to_string(), serde_json::Value::Bool(enabled));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// 메모리 인덱스 정리: 헤드리스 Claude Code를 메모리 폴더 안에서 돌려 MEMORY.md를 실제 파일에 맞춘다.
/// 프롬프트는 stdin으로 넘겨 인용부호 문제를 피한다. Windows는 .cmd 셈을 위해 cmd /C 경유.
// ponytail: claude가 PATH에 있어야 함(폴백 없음, 요청대로).
// (async): 동기 커맨드는 메인 스레드에서 돌아 UI를 얼리므로, 블로킹 실행을 별도 스레드로 보낸다.
#[tauri::command(async)]
fn reconcile_memory(dir: &str) -> Result<String, String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let prompt = "MEMORY.md 인덱스 파일을 이 폴더의 실제 메모리 .md 파일들에 정확히 맞게 수정하세요. \
깨진 링크를 고치고, 인덱스에 없는 새 파일은 항목을 추가하고, 파일이 없어진 항목은 제거하세요. \
오직 MEMORY.md만 편집하고, 다른 파일이나 이 폴더 밖은 절대 건드리지 마세요.";

    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.args(["/C", "claude", "-p", "--permission-mode", "acceptEdits"]);
        c
    } else {
        let mut c = Command::new("claude");
        c.args(["-p", "--permission-mode", "acceptEdits"]);
        c
    };
    let mut child = cmd
        .current_dir(dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("claude 실행 실패: {e}"))?;
    child
        .stdin
        .take()
        .ok_or("no stdin")?
        .write_all(prompt.as_bytes())
        .map_err(|e| e.to_string())?;
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).into_owned())
    }
}

/// 워크스테이션 폴더에서 Claude CLI를 새 터미널 창으로 연다(대화형 세션).
/// Windows: `start`가 호출자의 cwd를 물려받으므로 current_dir만 잡고 새 cmd 창에서 claude를 /K로 띄운다.
// ponytail: Windows 전용. claude가 PATH에 있어야 함(reconcile_memory와 동일 전제).
#[tauri::command]
fn start_session(workstation: &str) -> Result<(), String> {
    use std::process::Command;
    if !Path::new(workstation).is_dir() {
        return Err("폴더가 없습니다".into());
    }
    if cfg!(windows) {
        Command::new("cmd")
            .current_dir(workstation)
            .args(["/C", "start", "", "cmd", "/K", "claude"])
            .spawn()
            .map_err(|e| format!("터미널 실행 실패: {e}"))?;
        Ok(())
    } else {
        Err("Windows에서만 지원됩니다".into())
    }
}

/// Native folder picker. Runs off the main thread (commands do), so blocking is fine.
#[tauri::command]
fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            path_exists,
            create_dir,
            delete_path,
            list_dir,
            list_workstations,
            add_workstation,
            remove_workstation,
            list_components,
            save_components,
            list_skills,
            save_skills,
            list_hooks,
            save_hooks,
            list_project_hooks,
            save_project_hooks,
            import_memory,
            memory_local_enabled,
            set_memory_local,
            claude_home,
            list_plugins,
            set_plugin_local,
            reconcile_memory,
            start_session,
            pick_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let p = std::env::temp_dir().join("ws_rw_test.txt");
        let path = p.to_str().unwrap();
        write_file(path, "hello").unwrap();
        assert_eq!(read_file(path).unwrap(), "hello");
        assert!(read_file("no/such/file/here.txt").is_err());
        fs::remove_file(path).ok();
    }

    #[test]
    fn copies_only_top_level_files() {
        let base = std::env::temp_dir().join("ws_copy_test");
        fs::remove_dir_all(&base).ok();
        let src = base.join("src");
        let dst = base.join("dst");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("a.md"), "a").unwrap();
        fs::write(src.join("b.md"), "b").unwrap();
        fs::create_dir_all(src.join("sub")).unwrap(); // 폴더는 복사 대상 아님

        assert_eq!(copy_files(&src, &dst).unwrap(), 2);
        assert_eq!(fs::read_to_string(dst.join("a.md")).unwrap(), "a");
        assert!(!dst.join("sub").exists());
        // 소스가 없으면 0
        assert_eq!(copy_files(&base.join("nope"), &dst).unwrap(), 0);

        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn memory_local_toggle_roundtrip() {
        let ws = std::env::temp_dir().join("ws_local_toggle_test");
        fs::remove_dir_all(&ws).ok();
        fs::create_dir_all(&ws).unwrap();
        let ws = ws.to_str().unwrap();

        assert!(!memory_local_enabled(ws)); // 파일 없음 → 기존
        set_memory_local(ws, true).unwrap();
        assert!(memory_local_enabled(ws)); // 여기
        let s = fs::read_to_string(settings_local_path(ws)).unwrap();
        assert!(s.contains("/memory"));
        set_memory_local(ws, false).unwrap();
        assert!(!memory_local_enabled(ws)); // 다시 기존(키 삭제)

        fs::remove_dir_all(ws).ok();
    }

    #[test]
    fn hooks_compose_groups_and_formats() {
        let entries = vec![
            HookEntry { title: "포맷터".into(), event: "PreToolUse".into(), matcher: "Bash".into(), command: "a".into(), timeout: Some(30) },
            HookEntry { title: "".into(), event: "PreToolUse".into(), matcher: "Bash".into(), command: "b".into(), timeout: None },
            HookEntry { title: "끝알림".into(), event: "Stop".into(), matcher: "".into(), command: "c".into(), timeout: None },
        ];
        let v = compose_hooks(&entries);
        // 같은 이벤트+matcher는 한 그룹, hooks 배열에 두 명령.
        let bash = &v["PreToolUse"][0];
        assert_eq!(bash["matcher"], "Bash");
        assert_eq!(bash["hooks"].as_array().unwrap().len(), 2);
        assert_eq!(bash["hooks"][0]["type"], "command");
        assert_eq!(bash["hooks"][0]["timeout"], 30);
        assert_eq!(bash["hooks"][0]["title"], "포맷터"); // 라벨은 명령 항목에 실린다
        assert!(bash["hooks"][1].get("timeout").is_none()); // None이면 생략
        assert!(bash["hooks"][1].get("title").is_none()); // 빈 title도 생략
        // matcher 없는 이벤트는 matcher 키 자체가 없어야 한다.
        assert!(v["Stop"][0].get("matcher").is_none());

        // 왕복: 분해하면 원래 항목 수/내용이 보존된다.
        let back = decompose_hooks(&v);
        assert_eq!(back.len(), 3);
        assert_eq!(back[0].title, "포맷터");
        assert_eq!(back[0].event, "PreToolUse");
        assert_eq!(back[0].command, "a");
        assert_eq!(back[0].timeout, Some(30));
        assert_eq!(back[2].matcher, ""); // 없음 → 빈 문자열
    }

    #[test]
    fn plugin_local_toggle_roundtrip() {
        let ws = std::env::temp_dir().join("ws_plugin_toggle_test");
        fs::remove_dir_all(&ws).ok();
        fs::create_dir_all(&ws).unwrap();
        let wss = ws.to_str().unwrap();
        let lp = settings_local_path(wss);

        // 기존에 다른 키가 있어도 보존돼야 한다.
        fs::create_dir_all(lp.parent().unwrap()).unwrap();
        fs::write(&lp, r#"{"outputStyle":"Concise"}"#).unwrap();

        assert!(enabled_map(&lp).get("foo@bar").is_none()); // 아직 없음
        set_plugin_local(wss, "foo@bar", false).unwrap();
        assert_eq!(enabled_map(&lp).get("foo@bar").and_then(|x| x.as_bool()), Some(false));
        set_plugin_local(wss, "foo@bar", true).unwrap();
        assert_eq!(enabled_map(&lp).get("foo@bar").and_then(|x| x.as_bool()), Some(true));

        let s = fs::read_to_string(&lp).unwrap();
        assert!(s.contains("outputStyle")); // 다른 키 보존

        fs::remove_dir_all(&ws).ok();
    }
}
