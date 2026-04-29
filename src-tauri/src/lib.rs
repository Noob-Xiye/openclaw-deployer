// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::sync::Mutex as AsyncMutex;

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System};
use tauri::State;
use tokio::process::Command;
use tokio::time::sleep;

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

fn openclaw_home() -> String {
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

    // OpenClaw
    let openclaw_found = find_tool_in_path("openclaw").is_some() || find_tool_in_path("openclaw.cmd").is_some();
    let openclaw_version = if openclaw_found {
        match run_command_output("openclaw", &["--version"], 10).await {
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
    let openclaw_config_exists = PathBuf::from(&openclaw_home)
        .join("openclaw.json")
        .exists();

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
            || find_tool_in_path(&format!("{}.cmd", cli)).is_some();

        let version = if installed {
            match run_command_output(cli, &["--version"], 10).await {
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
// 保留原有命令（来自 tddt 的蓝本）
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_config_path() -> Result<String, String> {
    Ok(home_dir()
        .map(|p| p.join(".openclaw").join("openclaw.json").to_string_lossy().to_string())
        .unwrap_or_else(|| "~/.openclaw/openclaw.json".to_string()))
}

#[tauri::command]
fn get_openclaw_home_cmd() -> String {
    openclaw_home()
}

#[tauri::command]
fn read_config_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取配置文件失败: {}", e))
}

#[tauri::command]
fn write_config_file(path: String, content: String) -> Result<(), String> {
    // 写前备份
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
            // 保留的蓝本命令
            get_config_path,
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
