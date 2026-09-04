use std::fs;
use std::path::PathBuf;
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

/// 프로젝트 루트의 data/ 폴더에 workstations.json을 저장한다.
// ponytail: 개발 기준 경로(CARGO_MANIFEST_DIR). 배포 앱으로 옮길 땐 app_data_dir로 교체.
fn store_path() -> Result<PathBuf, String> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("no project root")?
        .to_path_buf();
    let dir = root.join("data");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("workstations.json"))
}

#[tauri::command]
fn list_workstations() -> Result<Vec<Workstation>, String> {
    match fs::read_to_string(store_path()?) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(vec![]), // no file yet = empty list
    }
}

#[tauri::command]
fn add_workstation(name: String, path: String) -> Result<Vec<Workstation>, String> {
    let mut list = list_workstations()?;
    list.push(Workstation { name, path });
    let json = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(store_path()?, json).map_err(|e| e.to_string())?;
    Ok(list)
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
}
