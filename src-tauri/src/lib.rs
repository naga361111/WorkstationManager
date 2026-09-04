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
            list_dir,
            list_workstations,
            add_workstation,
            list_components,
            save_components,
            import_memory,
            memory_local_enabled,
            set_memory_local,
            claude_home,
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
}
