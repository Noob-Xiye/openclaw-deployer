// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::sync::Mutex as AsyncMutex;

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System};
use tauri::{Emitter, State};
use tokio::process::Command;
use tokio::time::sleep;
use tokio::io::AsyncBufReadExt;

// ─────────────────────────────────────────────────────────────────────────────
// 进程状态管理（全局）
// ─────────────────────────────────────────────────────────────────────────────

struct GatewayProcess {
    child: AsyncMutex<Option<tokio::process::Child>>,
    pid: std::sync::Mutex<Option<u32>>,
}

struct AppState {
    gateway: GatewayProcess,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            gateway: GatewayProcess {
                child: AsyncMutex::new(None),
                pid: std::sync::Mutex::new(None),
            },
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub platform: String,
    pub arch: String,
    pub hostname: String,
    pub os_version: String,
    pub total_memory_gb: f64,
    pub free_memory_gb: f64,
    pub cpu_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCheck {
    pub name: String,
    pub found: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvDiagnostics {
    pub system: SystemInfo,
    pub tools: Vec<ToolCheck>,
    pub openclaw_found: bool,
    pub openclaw_version: Option<String>,
    pub openclaw_home: String,
    pub openclaw_config_exists: bool,
    pub node_major_version: Option<u32>,
    pub rust_installed: bool,
    pub rust_version: Option<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub port_open: Option<bool>,
    pub uptime_seconds: Option<u64>,
    pub memory_mb: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallResult {
    pub success: bool,
    pub message: String,
    pub openclaw_version: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartResult {
    pub success: bool,
    pub message: String,
    pub pid: Option<u32>,
}
// ─────────────────────────────────────────────────────────────────────────────
// Variant (OpenClaw 变体) 类型定义
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariantDef {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    pub npm_package: String,
    pub cli_command: String,
    pub config_dir_name: String,
    pub default_port: u16,
    pub category: String,
    pub features: Vec<String>,
    pub source_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariantStatus {
    #[serde(flatten)]
    pub variant: VariantDef,
    pub installed: bool,
    pub running: bool,
    pub version: Option<String>,
    pub config_exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeployPaths {
    pub install_prefix: Option<String>,
    pub config_dir: Option<String>,
    pub data_dir: Option<String>,
}

fn get_variant_catalog() -> Vec<VariantDef> {
    vec![
        VariantDef {
            id: "openclaw".into(),
            name: "OpenClaw".into(),
            icon: "\u{1F99E}".into(),
            description: "核心网关服务，提供 API 接口和基础 Agent 能力".into(),
            npm_package: "openclaw".into(),
            cli_command: "openclaw".into(),
            config_dir_name: ".openclaw".into(),
            default_port: 18789,
            category: "core".into(),
            features: vec!["Gateway API".into(), "Agent 运行时".into(), "工具调用".into(), "会话管理".into()],
            source_url: "https://www.npmjs.com/package/openclaw".into(),
        },
        VariantDef {
            id: "kimiclaw".into(),
            name: "KimiClaw".into(),
            icon: "\u{1F319}".into(),
            description: "Kimi (Moonshot AI) 定制版，深度集成 Kimi 大模型能力".into(),
            npm_package: "kimiclaw".into(),
            cli_command: "kimiclaw".into(),
            config_dir_name: ".kimiclaw".into(),
            default_port: 18790,
            category: "variant".into(),
            features: vec!["Kimi 大模型".into(), "Moonshot API".into(), "长上下文".into(), "代码助手".into()],
            source_url: "https://www.npmjs.com/package/kimiclaw".into(),
        },
        VariantDef {
            id: "easyclaw".into(),
            name: "EasyClaw".into(),
            icon: "\u{26A1}".into(),
            description: "轻量简化版，开箱即用，适合快速上手".into(),
            npm_package: "easyclaw".into(),
            cli_command: "easyclaw".into(),
            config_dir_name: ".easyclaw".into(),
            default_port: 18791,
            category: "variant".into(),
            features: vec!["开箱即用".into(), "简化配置".into(), "低资源占用".into(), "快速部署".into()],
            source_url: "https://www.npmjs.com/package/easyclaw".into(),
        },
        VariantDef {
            id: "clawx".into(),
            name: "ClawX".into(),
            icon: "\u{1F980}".into(),
            description: "扩展增强版，支持多模型并行和高级工作流".into(),
            npm_package: "clawx".into(),
            cli_command: "clawx".into(),
            config_dir_name: ".clawx".into(),
            default_port: 18792,
            category: "variant".into(),
            features: vec!["多模型并行".into(), "高级工作流".into(), "插件市场".into(), "企业级".into()],
            source_url: "https://www.npmjs.com/package/clawx".into(),
        },
    ]
}

fn deployer_config_dir() -> PathBuf {
    home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openclaw-deployer")
}

fn paths_config_file(variant_id: &str) -> PathBuf {
    deployer_config_dir().join(format!("paths-{}.json", variant_id))
}


// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

fn home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                let drive = std::env::var("HOMEDRIVE").ok()?;
                let path = std::env::var("HOMEPATH").ok()?;
                Some(PathBuf::from(format!("{}{}", drive, path)))
            })
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}

/// Get OpenClaw home directory - prefer QClaw install, then exe dir, then user home
fn openclaw_home() -> String {
    // 1. Check QClaw bundled OpenClaw installation
    #[cfg(target_os = "windows")]
    {
        let qclaw_paths = [
            r"D:\Program Files\QClaw\resources\openclaw",
            r"C:\Program Files\QClaw\resources\openclaw",
        ];
        for p in &qclaw_paths {
            if PathBuf::from(p).join("openclaw.cmd").exists() {
                return p.to_string();
            }
        }
        // Also check via environment variable or registry-like detection
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            let qclaw = format!("{}\\QClaw\\resources\\openclaw", program_files);
            if PathBuf::from(&qclaw).join("openclaw.cmd").exists() {
                return qclaw;
            }
        }
        if let Ok(d_drive) = std::env::var("SystemDrive") {
            let qclaw = format!("{}\\Program Files\\QClaw\\resources\\openclaw", d_drive);
            if PathBuf::from(&qclaw).join("openclaw.cmd").exists() {
                return qclaw;
            }
        }
    }

    // 2. Try executable's directory (for portable installs)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // Check if we're in a development environment
            let is_dev = exe_dir.to_string_lossy().contains("target") 
                || exe_dir.to_string_lossy().contains("debug")
                || exe_dir.to_string_lossy().contains("release");
            
            if !is_dev {
                // Use the executable's parent directory as the install directory
                let install_dir = exe_dir.parent().unwrap_or(exe_dir);
                let openclaw_dir = install_dir.join("openclaw");
                if openclaw_dir.join("openclaw.cmd").exists() || openclaw_dir.join("openclaw").exists() {
                    return openclaw_dir.to_string_lossy().to_string();
                }
            }
        }
    }
    
    // 3. Fallback to user home directory
    home_dir()
        .map(|p| p.join(".openclaw").to_string_lossy().to_string())
        .unwrap_or_else(|| "~/.openclaw".to_string())
}

fn detect_platform() -> String {
    if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else {
        "linux".to_string()
    }
}

/// 运行命令并捕获 stdout（处理 Windows GBK 编码）
async fn run_command_output(
    program: &str,
    args: &[&str],
    timeout_secs: u64,
) -> Result<(String, String, i32), String> {
    let child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动命令失败: {}", e))?;

    let timeout = Duration::from_secs(timeout_secs);
    match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(Ok(output)) => {
            let status = output.status.code().unwrap_or(-1);
            let stdout = decode_output(&output.stdout);
            let stderr = decode_output(&output.stderr);
            Ok((stdout, stderr, status))
        }
        Ok(Err(e)) => Err(format!("命令执行失败: {}", e)),
        Err(_) => Err(format!("命令超时 ({} 秒)", timeout_secs)),
    }
}

/// 尝试将字节流解码为字符串
fn decode_output(bytes: &[u8]) -> String {
    // 先尝试 UTF-8
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_string();
    }
    // Windows: 尝试 GBK/CP936
    #[cfg(target_os = "windows")]
    {
        decode_cp936(bytes)
    }
    #[cfg(not(target_os = "windows"))]
    {
        String::from_utf8_lossy(bytes).to_string()
    }
}

#[cfg(target_os = "windows")]
fn decode_cp936(bytes: &[u8]) -> String {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    extern "system" {
        fn MultiByteToWideChar(
            code_page: u32, dw_flags: u32,
            lp_multi_byte_str: *const u8, cb_multi_byte: i32,
            lp_wide_char_str: *mut u16, cch_wide_char: i32,
        ) -> i32;
    }

    const CP_ACP: u32 = 0;
    if bytes.is_empty() {
        return String::new();
    }
    unsafe {
        let needed = MultiByteToWideChar(CP_ACP, 0, bytes.as_ptr(), bytes.len() as i32, std::ptr::null_mut(), 0);
        if needed <= 0 {
            return String::from_utf8_lossy(bytes).to_string();
        }
        let mut wide: Vec<u16> = vec![0u16; needed as usize];
        let written = MultiByteToWideChar(CP_ACP, 0, bytes.as_ptr(), bytes.len() as i32, wide.as_mut_ptr(), needed);
        if written <= 0 {
            return String::from_utf8_lossy(bytes).to_string();
        }
        OsString::from_wide(&wide[..written as usize])
            .to_string_lossy()
            .to_string()
    }
}

#[cfg(not(target_os = "windows"))]
fn decode_cp936(_bytes: &[u8]) -> String {
    String::new()
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri Commands
// ─────────────────────────────────────────────────────────────────────────────

/// 获取系统信息
#[tauri::command]
fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total = sys.total_memory() as f64 / 1_073_741_824.0;
    let free = sys.available_memory() as f64 / 1_073_741_824.0;

    SystemInfo {
        platform: detect_platform(),
        arch: std::env::consts::ARCH.to_string(),
        hostname: System::host_name().unwrap_or_else(|| "unknown".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "unknown".to_string()),
        total_memory_gb: (total * 100.0).round() / 100.0,
        free_memory_gb: (free * 100.0).round() / 100.0,
        cpu_count: sys.cpus().len(),
    }
}

/// 检测某个工具是否安装
async fn check_tool(name: &str, _args: &[&str], version_arg: Option<&str>) -> ToolCheck {
    let mut tc = ToolCheck {
        name: name.to_string(),
        found: false,
        version: None,
        path: None,
        error: None,
    };

    // 查找可执行文件路径
    #[cfg(target_os = "windows")]
    let candidates: Vec<String> = {
        let mut c = Vec::new();
        // 尝试 which equivalent
        if let Ok((out, _, _)) = run_command_output("where", &[name], 5).await {
            for line in out.lines() {
                let line = line.trim();
                if !line.is_empty() && !line.contains("INFO:") {
                    c.push(line.to_string());
                }
            }
        }
        // npm global
        if let Ok(npm_prefix) = std::env::var("APPDATA") {
            let npm_path = format!("{}\\npm\\{}.cmd", npm_prefix, name);
            if PathBuf::from(&npm_path).exists() {
                c.push(npm_path);
            }
        }
        c
    };

    #[cfg(not(target_os = "windows"))]
    let candidates: Vec<String> = {
        let mut c = Vec::new();
        for p in [
            "/usr/local/bin",
            "/usr/bin",
            "/opt/homebrew/bin",
        ] {
            let path = format!("{}/{}", p, name);
            if PathBuf::from(&path).exists() {
                c.push(path);
            }
        }
        if let Ok(home) = std::env::var("HOME") {
            for p in &["", ".npm-global/bin", ".local/bin", ".cargo/bin"] {
                let path = format!("{}/{}/{}", home, p, name);
                if PathBuf::from(&path).exists() {
                    c.push(path);
                }
            }
        }
        c
    };

    if candidates.is_empty() {
        tc.found = false;
        return tc;
    }

    tc.path = candidates.first().cloned();
    tc.found = true;

    // 获取版本
    let version_arg = version_arg.unwrap_or("--version");
    match run_command_output(&candidates[0], &[version_arg], 10).await {
        Ok((stdout, _, _)) => {
            let v = stdout.trim().to_string();
            if !v.is_empty() {
                // 只取第一行 / 前50字符
                tc.version = Some(v.lines().next().unwrap_or(&v).chars().take(50).collect());
            }
        }
        Err(e) => {
            tc.error = Some(e);
        }
    }

    tc
}

/// 检测某个工具是否在 PATH 中（同步，阻塞版）
#[tauri::command]
fn find_tool_in_path(name: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let exts = ["", ".exe", ".cmd", ".bat", ".ps1"];
        if let Ok(path_var) = std::env::var("PATH") {
            for dir in path_var.split(';') {
                for ext in &exts {
                    let candidate = format!("{}\\{}{}", dir.trim_end_matches('\\'), name, ext);
                    if PathBuf::from(&candidate).exists() {
                        return Some(candidate);
                    }
                }
            }
        }
        None
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(path_var) = std::env::var("PATH") {
            for dir in path_var.split(':') {
                let candidate = format!("{}/{}", dir.trim_end_matches('/'), name);
                if PathBuf::from(&candidate).exists() {
                    return Some(candidate);
                }
            }
        }
        None
    }
}

/// Find QClaw-bundled openclaw binary (not on PATH)
fn find_qclaw_openclaw() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            r"D:\Program Files\QClaw\resources\openclaw\openclaw.cmd",
            r"C:\Program Files\QClaw\resources\openclaw\openclaw.cmd",
        ];
        for p in &candidates {
            if PathBuf::from(p).exists() {
                return Some(p.to_string());
            }
        }
        // Also check via ProgramFiles env var
        if let Ok(pf) = std::env::var("ProgramFiles") {
            let p = format!("{}\\QClaw\\resources\\openclaw\\openclaw.cmd", pf);
            if PathBuf::from(&p).exists() {
                return Some(p);
            }
        }
    }
    None
}

/// 综合环境诊断
#[tauri::command]
async fn diagnose_environment() -> EnvDiagnostics {
    let mut errors = Vec::new();

    // 系统信息
    let system = get_system_info();

    // 检测工具
    let tools = vec![
        check_tool("node", &["--version"], Some("--version")).await,
        check_tool("npm", &["--version"], Some("--version")).await,
        check_tool("git", &["--version"], Some("--version")).await,
        check_tool("rustc", &["--version"], Some("--version")).await,
        check_tool("cargo", &["--version"], Some("--version")).await,
    ];

    // Node 版本
    let node_major_version = tools
        .iter()
        .find(|t| t.name == "node" && t.found)
        .and_then(|t| t.version.as_ref())
        .and_then(|v| {
            v.split('.')
                .next()
                .and_then(|s| s.trim_start_matches('v').parse().ok())
        });

    if let Some(v) = node_major_version {
        if v < 18 {
            errors.push(format!(
                "Node.js 版本 {} < 18，OpenClaw 需要 Node.js 18+",
                v
            ));
        }
    } else {
        errors.push("未找到 Node.js，请先安装 Node.js 18+".to_string());
    }

    // Rust
    let rust_installed = tools.iter().any(|t| t.name == "rustc" && t.found);
    let rust_version = tools
        .iter()
        .find(|t| t.name == "rustc" && t.found)
        .and_then(|t| t.version.clone());

    // OpenClaw — also check QClaw bundled path
    let qclaw_openclaw = find_qclaw_openclaw();
    let openclaw_found = find_tool_in_path("openclaw").is_some() 
        || find_tool_in_path("openclaw.cmd").is_some()
        || qclaw_openclaw.is_some();
    let openclaw_bin = find_tool_in_path("openclaw")
        .or_else(|| find_tool_in_path("openclaw.cmd"))
        .or_else(|| qclaw_openclaw.clone());
    let openclaw_version = if let Some(bin) = &openclaw_bin {
        match run_command_output(bin, &["--version"], 10).await {
            Ok((out, _, _)) => Some(out.trim().to_string()),
            Err(e) => {
                errors.push(format!("获取 openclaw 版本失败: {}", e));
                None
            }
        }
    } else {
        errors.push("未在 PATH 中找到 openclaw 命令".to_string());
        None
    };

    let openclaw_home = openclaw_home();
    let openclaw_config_exists = get_config_path()
        .map(|p| PathBuf::from(&p).exists())
        .unwrap_or(false);

    EnvDiagnostics {
        system,
        tools,
        openclaw_found,
        openclaw_version,
        openclaw_home,
        openclaw_config_exists,
        node_major_version,
        rust_installed,
        rust_version,
        errors,
    }
}

/// 检查 Gateway 端口是否开放
#[tauri::command]
fn check_gateway_port(port: u16) -> bool {
    use std::net::TcpStream;
    use std::time::Duration;

    match format!("127.0.0.1:{}", port).parse::<std::net::SocketAddr>() {
        Ok(addr) => TcpStream::connect_timeout(&addr, Duration::from_millis(1500)).is_ok(),
        Err(_) => false,
    }
}

/// 检查 Gateway 进程状态
#[tauri::command]
async fn get_gateway_status(port: u16, state: State<'_, AppState>) -> Result<GatewayStatus, String> {
    // 先拿 pid（同步锁，跨 await 前释放）
    let pid = {
        let guard = state.gateway.pid.lock().unwrap();
        *guard
    };

    let running = state.gateway.child.lock().await.is_some();

    if running {
        let port_open = Some(check_gateway_port(port));
        let memory_mb = pid.and_then(|p| {
            let mut sys = System::new_all();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            sys.process(Pid::from_u32(p))
                .map(|proc| proc.memory() as f64 / 1_048_576.0)
        });
        Ok(GatewayStatus {
            running: true,
            pid,
            port_open,
            uptime_seconds: None,
            memory_mb,
        })
    } else {
        let port_open = check_gateway_port(port);
        Ok(GatewayStatus {
            running: port_open,
            pid: None,
            port_open: Some(port_open),
            uptime_seconds: None,
            memory_mb: None,
        })
    }
}

/// 启动 OpenClaw Gateway
#[tauri::command]
async fn start_gateway(
    port: u16,
    state: State<'_, AppState>,
) -> Result<StartResult, String> {
    // 检查是否已经在运行
    {
        let child_guard = state.gateway.child.lock().await;
        if child_guard.is_some() {
            return Ok(StartResult {
                success: true,
                message: "Gateway 已在运行".to_string(),
                pid: *state.gateway.pid.lock().unwrap(),
            });
        }
    }

    // 找 openclaw 命令
    let openclaw_bin = find_tool_in_path("openclaw")
        .or_else(|| find_tool_in_path("openclaw.cmd"))
        .or_else(|| find_qclaw_openclaw())
        .unwrap_or_else(|| "openclaw".to_string());

    // 在后台启动 gateway
    #[cfg(target_os = "windows")]
    let child = {
        Command::new("cmd")
            .args(["/C", "start", "cmd", "/C", &format!("{} gateway run --port {}", openclaw_bin, port)])
            .spawn()
    };

    #[cfg(not(target_os = "windows"))]
    let child = {
        Command::new(&openclaw_bin)
            .args(["gateway", "run", "--port", &port.to_string()])
            .spawn()
    };

    match child {
        Ok(c) => {
            let pid = c.id().unwrap_or(0);
            *state.gateway.pid.lock().unwrap() = Some(pid);
            *state.gateway.child.lock().await = Some(c);

            // 等待端口开启
            for _ in 0..30 {
                sleep(Duration::from_millis(500)).await;
                if check_gateway_port(port) {
                    return Ok(StartResult {
                        success: true,
                        message: format!("Gateway 启动成功 (PID: {})", pid),
                        pid: Some(pid),
                    });
                }
            }

            Ok(StartResult {
                success: true,
                message: format!("Gateway 已启动 (PID: {})，请等待几秒后连接", pid),
                pid: Some(pid),
            })
        }
        Err(e) => Err(format!("启动 Gateway 失败: {}", e)),
    }
}

/// 停止 Gateway（tokio AsyncMutex 可跨 await Send）
#[tauri::command]
async fn stop_gateway(state: State<'_, AppState>) -> Result<String, String> {
    let mut child_guard = state.gateway.child.lock().await;
    if let Some(mut child) = child_guard.take() {
        let _pid = { *state.gateway.pid.lock().unwrap() };
        drop(child_guard);
        child.kill().await.map_err(|e| format!("终止进程失败: {}", e))?;
        *state.gateway.pid.lock().unwrap() = None;
        return Ok("Gateway 已停止".to_string());
    }
    Ok("Gateway 未在管理范围内运行".to_string())
}

/// 重启 Gateway
#[tauri::command]
async fn restart_gateway(
    port: u16,
    state: State<'_, AppState>,
) -> Result<StartResult, String> {
    let _ = stop_gateway(State::clone(&state)).await;
    sleep(Duration::from_secs(1)).await;
    start_gateway(port, State::clone(&state)).await
}

/// 安装 OpenClaw
#[tauri::command]
async fn install_openclaw() -> Result<InstallResult, String> {
    let mut warnings = Vec::new();

    // 先检查 node
    let node_ok = check_tool("node", &[], None).await;
    if !node_ok.found {
        return Err("Node.js 未安装，请先安装 Node.js 18+".to_string());
    }

    let node_ver = node_ok.version.clone().unwrap_or_default();
    let major: u32 = node_ver
        .split('.')
        .next()
        .and_then(|s| s.trim_start_matches('v').parse().ok())
        .unwrap_or(0);

    if major < 18 {
        return Err(format!(
            "Node.js 版本 {} < 18，不满足 OpenClaw 要求",
            node_ver
        ));
    }

    // npm install -g openclaw
    let (stdout, stderr, code) = run_command_output("npm", &["install", "-g", "openclaw"], 300).await?;

    if code == 0 || stdout.contains("added") || stdout.contains("up to date") {
        // 验证安装
        match run_command_output("openclaw", &["--version"], 15).await {
            Ok((version_out, _, _)) => {
                let version = version_out.trim().to_string();
                Ok(InstallResult {
                    success: true,
                    message: format!("OpenClaw {} 安装成功！", version),
                    openclaw_version: Some(version),
                    warnings,
                })
            }
            Err(e) => {
                warnings.push(format!("安装完成但版本验证失败: {}", e));
                Ok(InstallResult {
                    success: true,
                    message: "OpenClaw 安装完成，但版本验证超时".to_string(),
                    openclaw_version: None,
                    warnings,
                })
            }
        }
    } else {
        let err = if stderr.is_empty() { stdout.clone() } else { stderr };
        Err(format!("安装失败 (npm exit {}): {}", code, err))
    }
}

/// 初始化 OpenClaw 配置
#[tauri::command]
async fn init_openclaw_config() -> Result<String, String> {
    let home = openclaw_home();

    // 检查 openclaw 命令
    let found = find_tool_in_path("openclaw").is_some() || find_tool_in_path("openclaw.cmd").is_some();
    if !found {
        return Err("openclaw 命令未找到，请先安装 OpenClaw".to_string());
    }

    let (stdout, stderr, code) = run_command_output("openclaw", &["config", "init"], 30).await?;

    if code == 0 || stdout.contains("openclaw.json") || stdout.contains("success") {
        let config_path = format!("{}/openclaw.json", home);
        Ok(format!("配置初始化成功: {}", config_path))
    } else {
        let err = if stderr.is_empty() { stdout } else { stderr };
        // 如果文件已存在，也算成功
        let config_path = format!("{}/openclaw.json", home);
        if PathBuf::from(&config_path).exists() {
            Ok(format!("配置文件已存在: {}", config_path))
        } else {
            Err(format!("初始化失败: {}", err))
        }
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// Variant Commands (多变体支持)
// ─────────────────────────────────────────────────────────────────────────────

/// 获取所有变体及其状态
#[tauri::command]
async fn get_all_variants() -> Result<Vec<VariantStatus>, String> {
    let catalog = get_variant_catalog();
    let mut results = Vec::new();

    for v in catalog {
        let cli = &v.cli_command;
        let installed = find_tool_in_path(cli).is_some()
            || find_tool_in_path(&format!("{}.cmd", cli)).is_some()
            || (cli == "openclaw" && find_qclaw_openclaw().is_some());

        let cli_path = find_tool_in_path(cli)
            .or_else(|| find_tool_in_path(&format!("{}.cmd", cli)))
            .or_else(|| if cli == "openclaw" { find_qclaw_openclaw() } else { None });
        let version = if installed {
            let bin = cli_path.as_deref().unwrap_or(cli);
            match run_command_output(bin, &["--version"], 10).await {
                Ok((out, _, _)) => Some(out.trim().to_string()),
                Err(_) => None,
            }
        } else {
            None
        };

        let config_dir = home_dir()
            .map(|h| h.join(&v.config_dir_name))
            .unwrap_or_default();
        let config_exists = config_dir.join("openclaw.json").exists()
            || config_dir.join("config.json").exists();

        let running = std::net::TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", v.default_port).parse::<std::net::SocketAddr>().unwrap(),
            Duration::from_millis(500),
        ).is_ok();

        results.push(VariantStatus {
            variant: v,
            installed,
            running,
            version,
            config_exists,
        });
    }

    Ok(results)
}

/// 安装指定变体
#[tauri::command]
async fn install_variant(variant_id: String) -> Result<InstallResult, String> {
    let catalog = get_variant_catalog();
    let variant = catalog.iter().find(|v| v.id == variant_id)
        .ok_or_else(|| format!("未知变体: {}", variant_id))?;

    let node_ok = check_tool("node", &[], None).await;
    if !node_ok.found {
        return Err("Node.js 未安装，请先安装 Node.js 18+".into());
    }

    let pkg = &variant.npm_package;
    let (stdout, stderr, code) = run_command_output("npm", &["install", "-g", pkg], 300).await?;

    if code == 0 || stdout.contains("added") || stdout.contains("up to date") {
        let cli = &variant.cli_command;
        match run_command_output(cli, &["--version"], 15).await {
            Ok((v_out, _, _)) => {
                let version = v_out.trim().to_string();
                Ok(InstallResult {
                    success: true,
                    message: format!("{} {} 安装成功", variant.name, version),
                    openclaw_version: Some(version),
                    warnings: vec![],
                })
            }
            Err(e) => Ok(InstallResult {
                success: true,
                message: format!("{} 安装完成，版本验证超时: {}", variant.name, e),
                openclaw_version: None,
                warnings: vec![e],
            }),
        }
    } else {
        let err = if stderr.is_empty() { stdout } else { stderr };
        Err(format!("安装 {} 失败: {}", variant.name, err))
    }
}

/// 获取变体的自定义路径
#[tauri::command]
fn get_deploy_paths(variant_id: String) -> Result<DeployPaths, String> {
    let path = paths_config_file(&variant_id);
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(DeployPaths::default())
    }
}

/// 保存变体的自定义路径
#[tauri::command]
fn save_deploy_paths(variant_id: String, paths: DeployPaths) -> Result<(), String> {
    let dir = deployer_config_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = paths_config_file(&variant_id);
    let content = serde_json::to_string_pretty(&paths).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// 启动指定变体的 Gateway
#[tauri::command]
async fn start_variant_gateway(
    variant_id: String,
    port: u16,
    state: State<'_, AppState>,
) -> Result<StartResult, String> {
    {
        let child_guard = state.gateway.child.lock().await;
        if child_guard.is_some() {
            return Ok(StartResult {
                success: true,
                message: "Gateway 已在运行".into(),
                pid: *state.gateway.pid.lock().unwrap(),
            });
        }
    }

    let catalog = get_variant_catalog();
    let variant = catalog.iter().find(|v| v.id == variant_id)
        .ok_or_else(|| format!("未知变体: {}", variant_id))?;

    let cli = &variant.cli_command;
    let cli_path = find_tool_in_path(cli)
        .or_else(|| find_tool_in_path(&format!("{}.cmd", cli)))
        .or_else(|| if cli == "openclaw" { find_qclaw_openclaw() } else { None })
        .ok_or_else(|| format!("未找到 {} 命令，请先安装 {}", variant.name, variant.name))?;

    #[cfg(target_os = "windows")]
    let child = {
        Command::new("cmd")
            .args(["/C", "start", "cmd", "/C",
                &format!("{} gateway run --port {}", cli_path, port)])
            .spawn()
    };

    #[cfg(not(target_os = "windows"))]
    let child = {
        Command::new(&cli_path)
            .args(["gateway", "run", "--port", &port.to_string()])
            .spawn()
    };

    match child {
        Ok(c) => {
            let pid = c.id().unwrap_or(0);
            *state.gateway.pid.lock().unwrap() = Some(pid);
            *state.gateway.child.lock().await = Some(c);

            for _ in 0..30 {
                sleep(Duration::from_millis(500)).await;
                if check_gateway_port(port) {
                    return Ok(StartResult {
                        success: true,
                        message: format!("{} Gateway 启动成功 (PID: {})", variant.name, pid),
                        pid: Some(pid),
                    });
                }
            }

            Ok(StartResult {
                success: true,
                message: format!("{} 已启动 (PID: {})", variant.name, pid),
                pid: Some(pid),
            })
        }
        Err(e) => Err(format!("启动 {} Gateway 失败: {}", variant.name, e)),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 本地模型相关类型和命令
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub name: String,
    pub vram_total_mb: u64,
    pub vram_used_mb: u64,
    pub driver_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareProfile {
    pub cpu_name: String,
    pub cpu_cores: usize,
    pub ram_total_gb: f64,
    pub gpus: Vec<GpuInfo>,
    pub max_vram_mb: u64,  // 最大的 GPU VRAM，0 表示无独立显卡
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub tag: String,
    pub size_bytes: u64,
    pub modified_at: String,
    pub digest: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub running: bool,
    pub version: Option<String>,
    pub models: Vec<OllamaModel>,
    pub base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaPullProgress {
    pub status: String,
    pub digest: Option<String>,
    pub total: Option<u64>,
    pub completed: Option<u64>,
}

/// 检测 GPU 信息（nvidia-smi）
fn detect_gpus() -> Vec<GpuInfo> {
    let mut gpus = Vec::new();

    // 尝试 nvidia-smi
    let output = std::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total,memory.used,driver_version",
            "--format=csv,noheader,nounits",
        ])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let stdout = decode_output(&out.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split(',').map(|s: &str| s.trim()).collect();
                if parts.len() >= 4 {
                    let vram_total = parts[1].parse::<u64>().unwrap_or(0);
                    let vram_used = parts[2].parse::<u64>().unwrap_or(0);
                    gpus.push(GpuInfo {
                        name: parts[0].to_string(),
                        vram_total_mb: vram_total,
                        vram_used_mb: vram_used,
                        driver_version: parts[3].to_string(),
                    });
                }
            }
        }
    }

    gpus
}

/// 获取硬件配置档案
#[tauri::command]
fn get_hardware_profile() -> HardwareProfile {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_name = sys.cpus().first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());

    let gpus = detect_gpus();
    let max_vram = gpus.iter().map(|g| g.vram_total_mb).max().unwrap_or(0);

    HardwareProfile {
        cpu_name,
        cpu_cores: sys.cpus().len(),
        ram_total_gb: (sys.total_memory() as f64 / 1_073_741_824.0 * 100.0).round() / 100.0,
        gpus,
        max_vram_mb: max_vram,
    }
}

/// 检测 Ollama 运行状态和已安装模型
#[tauri::command]
async fn get_ollama_status() -> OllamaStatus {
    let base_url = "http://127.0.0.1:11434".to_string();
    let mut running = false;
    let mut version: Option<String> = None;
    let mut models: Vec<OllamaModel> = Vec::new();

    // 使用 TCP + 原始 HTTP 请求检测（跨平台，零外部依赖）
    // 先尝试 TCP 连接
    {
        use std::net::TcpStream;
        use std::time::Duration;
        if let Ok(mut stream) = TcpStream::connect_timeout(
            &"127.0.0.1:11434".parse::<std::net::SocketAddr>().unwrap(),
            Duration::from_millis(1500),
        ) {
            stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
            
            // 发送 HTTP GET /api/version
            let request = format!("GET /api/version HTTP/1.1\r\nHost: 127.0.0.1:11434\r\nConnection: close\r\n\r\n");
            if std::io::Write::write_all(&mut stream, request.as_bytes()).is_ok() {
                
                let mut response = String::new();
                if std::io::Read::read_to_string(&mut stream, &mut response).is_ok() {
                    // 检查 HTTP 200
                    if response.contains("HTTP/1.1 200") || response.contains("HTTP/1.0 200") {
                        running = true;
                        // 解析 JSON 响应体
                        if let Some(body_start) = response.find("\r\n\r\n") {
                            let body = &response[body_start + 4..];
                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
                                version = v.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    if running {
        // 获取模型列表
        if let Ok((body, _, _)) = run_command_output(
            "curl", &["-s", &format!("{}/api/tags", base_url)], 10
        ).await {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
                if let Some(arr) = v.get("models").and_then(|v| v.as_array()) {
                    for m in arr {
                        models.push(OllamaModel {
                            name: m.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            tag: m.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            size_bytes: m.get("size").and_then(|v| v.as_u64()).unwrap_or(0),
                            modified_at: m.get("modified_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            digest: m.get("digest").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        });
                    }
                }
            }
        }
    }

    OllamaStatus {
        running,
        version,
        models,
        base_url,
    }
}

/// 安装 Ollama（Windows：winget 或下载安装包）
#[tauri::command]
async fn install_ollama() -> Result<InstallResult, String> {
    // 检查是否已安装
    let ollama_found = find_tool_in_path("ollama").is_some()
        || find_tool_in_path("ollama.exe").is_some();

    if ollama_found {
        return Ok(InstallResult {
            success: true,
            message: "Ollama 已安装".to_string(),
            openclaw_version: None,
            warnings: vec![],
        });
    }

    // 尝试 winget 安装
    let winget_found = find_tool_in_path("winget").is_some()
        || find_tool_in_path("winget.exe").is_some();

    if winget_found {
        let (stdout, stderr, code) = run_command_output(
            "winget", &["install", "Ollama.Ollama", "--accept-source-agreements", "--accept-package-agreements"],
            600,
        ).await?;

        if code == 0 {
            return Ok(InstallResult {
                success: true,
                message: "Ollama 安装成功！请重启应用以刷新 PATH。".to_string(),
                openclaw_version: None,
                warnings: vec![],
            });
        } else {
            let err = if stderr.is_empty() { stdout } else { stderr };
            return Err(format!("winget 安装 Ollama 失败: {}。请手动从 https://ollama.com/download 下载安装。", err));
        }
    }

    // 没有 winget，提示手动安装
    Err("未检测到 winget，请手动从 https://ollama.com/download 下载安装 Ollama".to_string())
}

/// 通过 Ollama 拉取模型
#[tauri::command]
async fn ollama_pull_model(model_name: String) -> Result<String, String> {
    let ollama_bin = find_tool_in_path("ollama")
        .or_else(|| find_tool_in_path("ollama.exe"))
        .ok_or_else(|| "未找到 ollama 命令，请先安装 Ollama".to_string())?;

    // 后台执行 ollama pull，最长等待 10 分钟
    let (stdout, stderr, code) = run_command_output(
        &ollama_bin, &["pull", &model_name], 600
    ).await?;

    if code == 0 || stdout.contains("success") || stdout.contains("pulling") {
        Ok(format!("模型 {} 拉取成功", model_name))
    } else {
        let err = if stderr.is_empty() { stdout } else { stderr };
        Err(format!("拉取模型 {} 失败: {}", model_name, err))
    }
}

/// 删除 Ollama 模型
#[tauri::command]
async fn ollama_delete_model(model_name: String) -> Result<String, String> {
    let ollama_bin = find_tool_in_path("ollama")
        .or_else(|| find_tool_in_path("ollama.exe"))
        .ok_or_else(|| "未找到 ollama 命令".to_string())?;

    let (stdout, stderr, code) = run_command_output(
        &ollama_bin, &["rm", &model_name], 30
    ).await?;

    if code == 0 || stdout.contains("deleted") {
        Ok(format!("模型 {} 已删除", model_name))
    } else {
        let err = if stderr.is_empty() { stdout } else { stderr };
        Err(format!("删除模型 {} 失败: {}", model_name, err))
    }
}

// ── 磁盘分区 ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskPartition {
    pub mount_point: String,
    pub label: String,
    pub fs_type: String,
    pub total_gb: f64,
    pub free_gb: f64,
    pub recommended: bool,
}

/// 获取磁盘分区列表，按可用空间降序排列，最多 6 个
#[tauri::command]
fn get_disk_partitions() -> Vec<DiskPartition> {
    use sysinfo::Disks;
    let mut disks = Disks::new();
    disks.refresh_list();

    let mut partitions: Vec<DiskPartition> = disks.list().iter().map(|d| {
        let total = d.total_space() as f64 / 1_073_741_824.0;
        let free = d.available_space() as f64 / 1_073_741_824.0;
        DiskPartition {
            mount_point: d.mount_point().to_string_lossy().to_string(),
            label: d.name().to_string_lossy().to_string(),
            fs_type: d.file_system().to_string_lossy().to_string(),
            total_gb: (total * 100.0).round() / 100.0,
            free_gb: (free * 100.0).round() / 100.0,
            recommended: false,
        }
    }).collect();

    // 按可用空间降序排列
    partitions.sort_by(|a, b| b.free_gb.partial_cmp(&a.free_gb).unwrap_or(std::cmp::Ordering::Equal));

    // 标记可用空间最大的分区
    if !partitions.is_empty() {
        partitions[0].recommended = true;
    }

    // 最多返回 6 个
    partitions.truncate(6);
    partitions
}

/// 获取当前 Ollama 模型存储路径
#[tauri::command]
fn get_ollama_models_dir() -> String {
    // 优先检查环境变量
    if let Ok(dir) = std::env::var("OLLAMA_MODELS") {
        return dir;
    }
    // 默认路径
    if let Some(home) = dirs::home_dir() {
        return home.join(".ollama").join("models").to_string_lossy().to_string();
    }
    "C:\\Users\\.ollama\\models".to_string()
}

/// 设置 Ollama 模型存储路径（Windows: setx）
#[tauri::command]
async fn set_ollama_models_dir(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        std::fs::create_dir_all(p)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }

    // Windows: setx 设置用户级环境变量
    let (stdout, stderr, code) = run_command_output(
        "setx", &["OLLAMA_MODELS", &path], 10
    ).await?;

    if code != 0 {
        let err = if stderr.is_empty() { stdout } else { stderr };
        return Err(format!("设置环境变量失败: {}", err));
    }

    Ok(format!("已设置 OLLAMA_MODELS={:?}。请重启 Ollama 使其生效。", path))
}

// ── 流式拉取进度 ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullProgressEvent {
    pub model: String,
    pub status: String,
    pub percent: u32,
}

/// 解析 ollama pull 输出中的进度百分比
fn parse_pull_percent(line: &str) -> u32 {
    // 匹配 "48%" 或 "100%" 等百分比
    if let Some(pos) = line.rfind('%') {
        let before = &line[..pos];
        let num_start = before.rfind(|c: char| !c.is_ascii_digit())
            .map(|i| i + 1)
            .unwrap_or(0);
        if let Ok(pct) = before[num_start..].parse::<u32>() {
            return pct.min(99); // 100% 只在最终 success 时设置
        }
    }
    // 匹配 "pulling manifest" / "verifying" 等早期阶段
    let lower = line.to_lowercase();
    if lower.contains("success") || lower.contains("complete") {
        return 100;
    }
    if lower.contains("verifying") || lower.contains("writing") {
        return 95;
    }
    if lower.contains("pulling manifest") {
        return 2;
    }
    0
}

/// 流式拉取模型，通过 Tauri 事件实时推送进度
#[tauri::command]
async fn ollama_pull_model_stream(
    app: tauri::AppHandle,
    model_name: String,
) -> Result<String, String> {
    let ollama_bin = find_tool_in_path("ollama")
        .or_else(|| find_tool_in_path("ollama.exe"))
        .ok_or_else(|| "未找到 ollama 命令，请先安装 Ollama".to_string())?;

    // 发送初始状态
    let _ = app.emit("ollama-pull-progress", PullProgressEvent {
        model: model_name.clone(),
        status: "starting".to_string(),
        percent: 1,
    });

    let mut child = tokio::process::Command::new(&ollama_bin)
        .arg("pull")
        .arg(&model_name)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 ollama pull 失败: {}", e))?;

    // 分别读取 stdout 和 stderr
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_out = app.clone();
    let model_out = model_name.clone();
    let stdout_handle = tokio::spawn(async move {
        if let Some(out) = stdout {
            let reader = tokio::io::BufReader::new(out);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let percent = parse_pull_percent(&line);
                let _ = app_out.emit("ollama-pull-progress", PullProgressEvent {
                    model: model_out.clone(),
                    status: line,
                    percent,
                });
            }
        }
    });

    let app_err = app.clone();
    let model_err = model_name.clone();
    let stderr_handle = tokio::spawn(async move {
        if let Some(err) = stderr {
            let reader = tokio::io::BufReader::new(err);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let percent = parse_pull_percent(&line);
                let _ = app_err.emit("ollama-pull-progress", PullProgressEvent {
                    model: model_err.clone(),
                    status: line,
                    percent,
                });
            }
        }
    });

    // 等待进程结束
    let status = child.wait().await
        .map_err(|e| format!("等待进程结束失败: {}", e))?;

    // 等待读取完成
    let _ = stdout_handle.await;
    let _ = stderr_handle.await;

    if status.success() {
        let _ = app.emit("ollama-pull-progress", PullProgressEvent {
            model: model_name.clone(),
            status: "success".to_string(),
            percent: 100,
        });
        Ok(format!("模型 {} 拉取成功", model_name))
    } else {
        let _ = app.emit("ollama-pull-progress", PullProgressEvent {
            model: model_name.clone(),
            status: "failed".to_string(),
            percent: 0,
        });
        Err(format!("拉取模型 {} 失败", model_name))
    }
}

/// 一键配置 OpenClaw 使用 Ollama 本地模型
#[tauri::command]
async fn configure_ollama_model(model_id: String) -> Result<String, String> {
    let config_path = get_config_path()?;
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置失败: {}", e))?;
    let mut cfg: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))?;

    // 确保 models.providers.ollama 存在
    if cfg.get("models").is_none() {
        cfg["models"] = serde_json::json!({});
    }
    if cfg["models"].get("providers").is_none() {
        cfg["models"]["providers"] = serde_json::json!({});
    }

    // 设置 ollama provider（自动发现模式，不需要手动列模型）
    cfg["models"]["providers"]["ollama"] = serde_json::json!({
        "apiKey": "ollama-local"
    });

    // 设置默认模型
    let full_model_id = format!("ollama/{}", model_id);
    if cfg.get("agents").is_none() {
        cfg["agents"] = serde_json::json!({});
    }
    if cfg["agents"].get("defaults").is_none() {
        cfg["agents"]["defaults"] = serde_json::json!({});
    }
    cfg["agents"]["defaults"]["model"] = serde_json::json!({
        "primary": full_model_id
    });

    // 写回配置
    let updated = serde_json::to_string_pretty(&cfg)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    write_config_file(config_path, updated)?;

    Ok(format!("已将默认模型切换为 {}", full_model_id))
}

// ─────────────────────────────────────────────────────────────────────────────
// 保留原有命令（来自 tddt 的蓝本）
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

#[tauri::command]
async fn check_tool_cmd(name: String) -> ToolCheck {
    check_tool(&name, &[], None).await
}

#[tauri::command]
async fn run_command_output_cmd(program: String, args: Vec<String>, timeout_secs: u64) -> Result<(String, String, i32), String> {
    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_command_output(&program, &args_refs, timeout_secs).await
}

#[tauri::command]
fn get_config_path() -> Result<String, String> {
    // Priority: detect actual config file location
    // 1. ~/.qclaw/openclaw.json (QClaw's config path)
    // 2. ~/.openclaw/openclaw.json (native OpenClaw's config path)  
    // 3. Fallback to ~/.qclaw/openclaw.json (default for new installs)
    if let Some(home) = home_dir() {
        let qclaw_config = home.join(".qclaw").join("openclaw.json");
        if qclaw_config.exists() {
            return Ok(qclaw_config.to_string_lossy().to_string());
        }
        let openclaw_config = home.join(".openclaw").join("openclaw.json");
        if openclaw_config.exists() {
            return Ok(openclaw_config.to_string_lossy().to_string());
        }
        // Neither exists — default to .qclaw path (QClaw is the primary use case)
        return Ok(qclaw_config.to_string_lossy().to_string());
    }
    Err("无法确定用户主目录".to_string())
}

#[tauri::command]
fn get_openclaw_home_cmd() -> String {
    openclaw_home()
}

#[tauri::command]
fn read_config_file(path: String) -> Result<String, String> {
    if !PathBuf::from(&path).exists() {
        // Return default config if file doesn't exist
        return Ok(DEFAULT_CONFIG.to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取配置文件失败: {}", e))
}

/// Default OpenClaw configuration for first-time setup
const DEFAULT_CONFIG: &str = r#"{
  "gateway": {
    "port": 18789,
    "bind": "127.0.0.1",
    "auth": { "mode": "token", "token": "" },
    "reload": { "mode": "hybrid" }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "qclaw/modelroute" },
      "heartbeat": true
    },
    "list": []
  },
  "channels": {},
  "tools": {},
  "skills": {}
}"#;

/// Ensure the config allows Tauri WebView to connect via WebSocket.
/// Adds Tauri origins to allowedOrigins and enables allowInsecureAuth if needed.
#[tauri::command]
fn ensure_control_ui_allowed(config_path: String) -> Result<String, String> {
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("read config failed: {}", e))?;
    let mut cfg: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("parse config JSON failed: {}", e))?;

    // Origins that Tauri WebView may use
    let tauri_origins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "tauri://localhost",
        "https://tauri.localhost",
        "null",
    ];

    // Navigate to gateway.controlUi using value mutations
    let control_ui = if let Some(gw) = cfg.get_mut("gateway") {
        if let Some(cui) = gw.get_mut("controlUi") {
            Some(cui)
        } else {
            gw.as_object_mut().unwrap().insert("controlUi".into(), serde_json::json!({}));
            gw.get_mut("controlUi")
        }
    } else {
        None
    };

    if let Some(cui) = control_ui {
        // Update allowedOrigins array
        if let Some(arr) = cui.get_mut("allowedOrigins") {
            if let Some(origins) = arr.as_array_mut() {
                for origin in &tauri_origins {
                    let val = serde_json::Value::String(origin.to_string());
                    if !origins.contains(&val) {
                        origins.push(val);
                    }
                }
            }
        } else {
            let mut origins_vec = Vec::new();
            for origin in &tauri_origins {
                origins_vec.push(serde_json::Value::String(origin.to_string()));
            }
            cui.as_object_mut().unwrap().insert(
                "allowedOrigins".into(),
                serde_json::Value::Array(origins_vec),
            );
        }

        // Set allowInsecureAuth to true
        cui.as_object_mut().unwrap().insert(
            "allowInsecureAuth".into(),
            serde_json::Value::Bool(true),
        );

        // Disable device identity requirement for Tauri WebView
        // (Tauri WebView has no Ed25519 keypair / device.json)
        cui.as_object_mut().unwrap().insert(
            "dangerouslyDisableDeviceAuth".into(),
            serde_json::Value::Bool(true),
        );
    }

    // Write back
    let updated = serde_json::to_string_pretty(&cfg)
        .map_err(|e| format!("serialize config failed: {}", e))?;
    write_config_file(config_path, updated)?;

    Ok("updated allowedOrigins + allowInsecureAuth + dangerouslyDisableDeviceAuth".to_string())
}

#[tauri::command]
fn write_config_file(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    // Write backup if file exists
    let backup_path = format!("{}.bak", path);
    if let Ok(existing) = fs::read_to_string(&path) {
        let _ = fs::write(&backup_path, &existing);
    }
    fs::write(&path, content).map_err(|e| format!("写入配置文件失败: {}", e))
}

#[tauri::command]
fn read_cron_jobs(base_dir: String) -> Result<String, String> {
    let path = PathBuf::from(&base_dir).join("cron").join("jobs.json");
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok(r#"{"jobs":[]}"#.to_string())
    }
}

#[tauri::command]
fn write_cron_jobs(base_dir: String, content: String) -> Result<(), String> {
    let dir = PathBuf::from(&base_dir).join("cron");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("jobs.json");
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_skills(base_dir: String) -> Result<Vec<serde_json::Value>, String> {
    let skills_dir = PathBuf::from(&base_dir).join("skills");
    let mut skills = Vec::new();
    if let Ok(entries) = fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let skill_md = path.join("SKILL.md");
                if skill_md.exists() {
                    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let content = fs::read_to_string(&skill_md).unwrap_or_default();
                    skills.push(serde_json::json!({
                        "name": name,
                        "path": path.to_string_lossy().to_string(),
                        "content": content
                    }));
                }
            }
        }
    }
    Ok(skills)
}

#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn write_text_file(path: String, content: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(parent) = std::path::Path::new(&path).parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&path, content).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 通过 TCP 发送 HTTP POST 到 Gateway（绕过 CORS）
#[tauri::command]
async fn gateway_rpc(url: String, token: Option<String>, body: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        http_post_blocking(&url, token.as_deref(), &body)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn http_post_blocking(url: &str, token: Option<&str>, body: &str) -> Result<String, String> {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpStream;
    use std::time::Duration;

    let rest = url.strip_prefix("http://").ok_or("仅支持 http:// 协议")?;
    let (host_port, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };

    let addr: std::net::SocketAddr = host_port
        .parse()
        .map_err(|_| format!("无效地址: {}", host_port))?;

    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(5))
        .map_err(|e| format!("连接 Gateway ({}) 失败: {}", host_port, e))?;
    stream.set_read_timeout(Some(Duration::from_secs(60))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(10))).ok();

    let auth_line = match token {
        Some(t) if !t.is_empty() => format!("Authorization: Bearer {}\r\n", t),
        _ => String::new(),
    };

    let body_bytes = body.as_bytes();
    let req_header = format!(
        "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{}Connection: close\r\n\r\n",
        path, host_port, body_bytes.len(), auth_line
    );

    stream.write_all(req_header.as_bytes()).map_err(|e| e.to_string())?;
    stream.write_all(body_bytes).map_err(|e| e.to_string())?;

    let mut reader = BufReader::new(stream);

    // Status line
    let mut status_line = String::new();
    reader.read_line(&mut status_line).map_err(|e| e.to_string())?;
    let status: u16 = status_line.split_whitespace().nth(1).unwrap_or("0").parse().unwrap_or(0);

    // Headers
    let mut content_length: Option<usize> = None;
    let mut chunked = false;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            break;
        }
        let low = line.to_ascii_lowercase();
        if low.starts_with("content-length:") {
            content_length = low["content-length:".len()..].trim().parse().ok();
        }
        if low.contains("transfer-encoding: chunked") {
            chunked = true;
        }
    }

    // Body
    let resp_body = if chunked {
        let mut out = String::new();
        loop {
            let mut sz = String::new();
            reader.read_line(&mut sz).map_err(|e| e.to_string())?;
            let n = usize::from_str_radix(sz.trim(), 16).unwrap_or(0);
            if n == 0 {
                break;
            }
            let mut buf = vec![0u8; n];
            {
                use std::io::Read;
                reader.read_exact(&mut buf).map_err(|e| e.to_string())?;
            }
            out.push_str(&String::from_utf8_lossy(&buf));
            let mut crlf = String::new();
            reader.read_line(&mut crlf).ok();
        }
        out
    } else if let Some(len) = content_length {
        let mut buf = vec![0u8; len];
        {
            use std::io::Read;
            reader.read_exact(&mut buf).map_err(|e| e.to_string())?;
        }
        String::from_utf8_lossy(&buf).to_string()
    } else {
        let mut s = String::new();
        {
            use std::io::Read;
            reader.read_to_string(&mut s).map_err(|e| e.to_string())?;
        }
        s
    };

    if status >= 400 {
        return Err(format!("HTTP {}: {}", status, resp_body));
    }
    Ok(resp_body)
}

// ─────────────────────────────────────────────────────────────────────────────
// App Entry
// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            // 核心管理命令
            file_exists,
            run_command_output_cmd,
            check_tool_cmd,
            get_system_info,
            find_tool_in_path,
            diagnose_environment,
            check_gateway_port,
            get_gateway_status,
            start_gateway,
            stop_gateway,
            restart_gateway,
            install_openclaw,
            init_openclaw_config,
            get_all_variants,
            install_variant,
            get_deploy_paths,
            save_deploy_paths,
            start_variant_gateway,
            // 本地模型命令
            get_hardware_profile,
            get_ollama_status,
            install_ollama,
            ollama_pull_model,
            ollama_pull_model_stream,
            ollama_delete_model,
            configure_ollama_model,
            get_disk_partitions,
            get_ollama_models_dir,
            set_ollama_models_dir,
            // 保留的蓝本命令
            get_config_path,
            ensure_control_ui_allowed,
            get_openclaw_home_cmd,
            read_config_file,
            write_config_file,
            read_cron_jobs,
            write_cron_jobs,
            list_skills,
            read_text_file,
            write_text_file,
            gateway_rpc,
        ])
        .run(tauri::generate_context!())
        .expect("启动 OpenClaw Deployer 时出错");
}
