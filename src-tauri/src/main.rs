#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
};
use tauri::{Emitter, Manager, State};

struct BuildState(Arc<AtomicBool>);

#[derive(Clone, Serialize)]
struct BuildError {
    message: String,
    details: String,
}

fn helper_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let name = if cfg!(target_os = "windows") {
        "Vortex.Engine.Poc.exe"
    } else {
        "vortex-engine"
    };
    app.path()
        .resolve(
            format!("resources/engine/{name}"),
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| format!("Could not locate the bundled packaging engine: {e}"))
}

fn emit_line(app: &tauri::AppHandle, line: &str) {
    if let Ok(value) = serde_json::from_str::<Value>(line) {
        let _ = app.emit("builder-event", value);
    }
}

#[tauri::command]
fn get_default_output(app: tauri::AppHandle) -> Result<String, String> {
    let mut path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    path.push("fPKGs");
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Could not prepare the default output folder: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn discover_dumps(app: tauri::AppHandle, settings_path: Option<String>) -> Result<(), String> {
    let helper = helper_path(&app)?;
    let mut command = Command::new(helper);
    command
        .arg("discover")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(path) = settings_path.filter(|s| !s.trim().is_empty()) {
        command.arg(path);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start the packaging engine: {e}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Could not read dump discovery results")?;
    let stderr = child.stderr.take();
    let err_thread = stderr.map(|s| {
        thread::spawn(move || {
            let mut text = String::new();
            let _ = BufReader::new(s).read_to_string(&mut text);
            text
        })
    });
    for line in BufReader::new(stdout).lines().flatten() {
        emit_line(&app, &line);
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let details = err_thread.and_then(|h| h.join().ok()).unwrap_or_default();
    if !status.success() {
        return Err(if details.trim().is_empty() {
            format!("Dump discovery exited with {status}.")
        } else {
            details
        });
    }
    Ok(())
}

#[tauri::command]
fn start_build(
    app: tauri::AppHandle,
    state: State<'_, BuildState>,
    input_path: String,
    output_folder: String,
) -> Result<(), String> {
    let input = input_path.trim().to_owned();
    let output = output_folder.trim().to_owned();
    if input.is_empty() || output.is_empty() {
        return Err("Choose a game dump and output folder first.".into());
    }
    if state
        .0
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("A package build is already running.".into());
    }
    let helper = match helper_path(&app) {
        Ok(path) => path,
        Err(error) => {
            state.0.store(false, Ordering::Release);
            return Err(error);
        }
    };
    let busy = Arc::clone(&state.0);
    thread::spawn(move || {
        let outcome = run_build(&app, &helper, &input, &output);
        if let Err((message, details)) = outcome {
            let _ = app.emit("builder-error", BuildError { message, details });
        }
        busy.store(false, Ordering::Release);
    });
    Ok(())
}

fn run_build(
    app: &tauri::AppHandle,
    helper: &Path,
    input: &str,
    output: &str,
) -> Result<(), (String, String)> {
    let mut child = Command::new(helper)
        .arg("process")
        .arg(input)
        .arg(output)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            (
                "Could not start the packaging engine.".into(),
                e.to_string(),
            )
        })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        (
            "Could not receive build progress.".into(),
            "Helper stdout was unavailable.".into(),
        )
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        (
            "Could not receive diagnostics.".into(),
            "Helper stderr was unavailable.".into(),
        )
    })?;
    let error_thread = thread::spawn(move || {
        let mut text = String::new();
        let _ = BufReader::new(stderr).read_to_string(&mut text);
        text
    });
    let mut completion = None;
    for line in BufReader::new(stdout).lines() {
        match line {
            Ok(line) => {
                if let Ok(value) = serde_json::from_str::<Value>(&line) {
                    if value.get("event").and_then(Value::as_str) == Some("completed") {
                        completion = Some(value);
                    } else {
                        let _ = app.emit("builder-event", value);
                    }
                } else if !line.trim().is_empty() {
                    let _ = app.emit(
                        "builder-event",
                        serde_json::json!({"event":"engine-message","message":line}),
                    );
                }
            }
            Err(error) => {
                return Err((
                    "The packaging engine stopped sending progress.".into(),
                    error.to_string(),
                ))
            }
        }
    }
    let status = child.wait().map_err(|e| {
        (
            "Could not finish the packaging engine process.".into(),
            e.to_string(),
        )
    })?;
    let details = error_thread
        .join()
        .unwrap_or_else(|_| "Could not read engine diagnostics.".into());
    let validated_completion = completion
        .as_ref()
        .is_some_and(|value| value.get("validation").and_then(Value::as_str) == Some("passed"));
    if !status.success() || !validated_completion {
        let message = if details.trim().is_empty() {
            if completion.is_some() {
                format!("Packaging engine exited with {status}.")
            } else {
                "The package was not confirmed as complete and validated.".into()
            }
        } else {
            details
                .lines()
                .last()
                .unwrap_or("Package build failed.")
                .to_owned()
        };
        return Err((message, details));
    }
    if let Some(completion) = completion {
        let _ = app.emit("builder-event", completion);
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(BuildState(Arc::new(AtomicBool::new(false))))
        .invoke_handler(tauri::generate_handler![
            get_default_output,
            discover_dumps,
            start_build
        ])
        .run(tauri::generate_context!())
        .expect("error while running FPKG Builder");
}
