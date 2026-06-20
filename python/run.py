#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
自动化脚本批量运行工具
支持命令行模式和图形界面模式，可顺序执行多个脚本，并支持为每个脚本传递自定义参数。
"""

import argparse
import json
import queue
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Callable, Any, Tuple

# 尝试导入 tkinter，如果不可用则禁用 GUI 模式
try:
    import tkinter as tk
    from tkinter import ttk, scrolledtext, filedialog, simpledialog
    GUI_AVAILABLE = True
except ImportError:
    GUI_AVAILABLE = False

# 导入公共模块
from common import PROJECT_ROOT, log_info, log_error, ensure_dir

# ========== 常量定义 ==========
PYTHON_DIR = Path(__file__).parent
DEFAULT_SCRIPTS = [
    "ArticleManager.py",
    "WorkManager.py",
    "Statistic.py",
    "RssGenerator.py",
    "SitemapGenerator.py",
    "FriendLinkGenerator.py",
    "StaticListGenerator.py",
    "GenerateNoJsIndex.py",
    "CodeAnalyzer.py"
]
LOG_TAG_INFO = "INFO"
LOG_TAG_ERROR = "ERROR"
LOG_TAG_SUCCESS = "SUCCESS"
LOG_TAG_STOP = "STOP"

# ========== 配置文件支持 ==========
def load_run_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    """加载运行配置文件，返回包含 scripts、default_enabled 和 script_args 的字典"""
    if config_path is None:
        config_path = PYTHON_DIR / "run_config.json"
    default_config = {
        "scripts": DEFAULT_SCRIPTS,
        "default_enabled": [True] * len(DEFAULT_SCRIPTS),
        "script_args": {}  # 格式: {"ScriptName.py": ["--arg1", "value1", "--flag"]}
    }
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                user_config = json.load(f)
            if "scripts" in user_config:
                default_config["scripts"] = user_config["scripts"]
            if "default_enabled" in user_config:
                default_config["default_enabled"] = user_config["default_enabled"]
            if "script_args" in user_config:
                default_config["script_args"].update(user_config["script_args"])
        except Exception as e:
            print(f"[警告] 读取配置文件失败: {e}，使用默认配置")
    return default_config

# ========== 统一的脚本执行函数 ==========
def run_single_script(
    script: str,
    stop_event: threading.Event,
    log_callback: Callable[[str, str], None],
    cwd: Path = PROJECT_ROOT,
    extra_args: Optional[List[str]] = None
) -> bool:
    """
    执行单个脚本，支持实时输出和停止信号。
    extra_args: 传递给脚本的额外参数列表（如 ["--type", "articles"]）
    返回 True 表示成功，False 表示失败或被停止。
    """
    script_path = PYTHON_DIR / script
    if not script_path.exists():
        log_callback(f"脚本不存在: {script_path}", LOG_TAG_ERROR)
        return False

    # 构建命令
    cmd = [sys.executable, str(script_path)]
    if extra_args:
        cmd.extend(extra_args)

    log_callback(f">>> 开始执行: {script} {' '.join(extra_args) if extra_args else ''}", LOG_TAG_INFO)

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
    except Exception as e:
        log_callback(f"启动脚本失败: {e}", LOG_TAG_ERROR)
        return False

    def enqueue(pipe, prefix, tag):
        for line in iter(pipe.readline, ''):
            if stop_event.is_set():
                # 停止信号已发出，尝试读完剩余内容但不阻塞太久
                remaining = pipe.read()
                if remaining:
                    log_callback(f"{prefix}{remaining.rstrip()}", tag)
                break
            if line.strip():
                log_callback(f"{prefix}{line.rstrip()}", tag)
        pipe.close()

    t_out = threading.Thread(target=enqueue, args=(proc.stdout, f"[{script}] ", LOG_TAG_INFO))
    t_err = threading.Thread(target=enqueue, args=(proc.stderr, f"[{script}] ", LOG_TAG_ERROR))
    t_out.daemon = True
    t_err.daemon = True
    t_out.start()
    t_err.start()

    try:
        while True:
            if stop_event.is_set():
                # 用户请求停止，终止子进程
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                log_callback(f"脚本 {script} 已被用户停止", LOG_TAG_STOP)
                return False
            ret = proc.poll()
            if ret is not None:
                if ret != 0:
                    log_callback(f"脚本 {script} 返回非零退出码 {ret}", LOG_TAG_ERROR)
                    return False
                log_callback(f"脚本 {script} 执行成功", LOG_TAG_SUCCESS)
                return True
            time.sleep(0.1)
    finally:
        # 确保输出线程结束
        t_out.join(timeout=1.0)
        t_err.join(timeout=1.0)

def run_scripts_sequential(
    scripts_with_args: List[Tuple[str, Optional[List[str]]]],
    stop_event: Optional[threading.Event] = None,
    log_callback: Optional[Callable[[str, str], None]] = None
) -> bool:
    """
    顺序执行多个脚本，每个脚本可带参数。
    scripts_with_args: [(script_name, extra_args), ...]
    返回是否全部成功
    """
    if stop_event is None:
        stop_event = threading.Event()
    if log_callback is None:
        # 默认回调打印到控制台
        def log_callback(msg: str, tag: str) -> None:
            print(f"[{tag}] {msg}")

    for script, args in scripts_with_args:
        if stop_event.is_set():
            log_callback("检测到停止信号，终止后续脚本", LOG_TAG_STOP)
            return False
        if not run_single_script(script, stop_event, log_callback, extra_args=args):
            return False
    return True

# ========== 命令行模式 ==========
def setup_argparse() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="自动化脚本批量运行工具")
    parser.add_argument(
        "--nogui", action="store_true",
        help="强制使用命令行模式（不启动图形界面）"
    )
    parser.add_argument(
        "--scripts", nargs="+", help="指定要运行的脚本名称（空格分隔）"
    )
    parser.add_argument(
        "--script-args", type=str,
        help="为脚本传递参数，JSON格式，如 '{\"ArticleManager.py\": [\"--category\", \"tech\"], \"RssGenerator.py\": [\"-v\"]}'"
    )
    parser.add_argument(
        "--log-file", type=Path, help="将日志输出到指定文件"
    )
    parser.add_argument(
        "--config", type=Path, help="配置文件路径（JSON格式）"
    )
    return parser

def parse_script_args(script_args_str: Optional[str]) -> Dict[str, List[str]]:
    """解析 --script-args 参数，返回 {脚本名: 参数列表}"""
    if not script_args_str:
        return {}
    try:
        return json.loads(script_args_str)
    except json.JSONDecodeError as e:
        print(f"[错误] --script-args 参数格式错误，应为 JSON 对象: {e}")
        sys.exit(1)

def console_main(args: argparse.Namespace) -> None:
    """命令行模式主函数"""
    ensure_dir(PROJECT_ROOT / "json")
    print("=" * 60)
    log_info("批量运行自动化脚本 (命令行模式)")
    print("=" * 60)

    # 加载配置
    config = load_run_config(args.config)
    scripts_list = args.scripts if args.scripts else config["scripts"]
    script_args_from_config = config.get("script_args", {})
    script_args_from_cli = parse_script_args(args.script_args)

    # 合并参数：命令行参数覆盖配置文件
    final_script_args = {**script_args_from_config, **script_args_from_cli}

    # 构建 (脚本, 参数) 列表
    scripts_with_args = []
    for script in scripts_list:
        extra_args = final_script_args.get(script, [])
        scripts_with_args.append((script, extra_args))

    # 日志回调：同时输出到控制台和文件（如果指定）
    log_file_handle = None
    if args.log_file:
        try:
            args.log_file.parent.mkdir(parents=True, exist_ok=True)
            log_file_handle = open(args.log_file, "w", encoding="utf-8")
        except Exception as e:
            log_error(f"无法打开日志文件: {e}")

    def log_callback(msg: str, tag: str) -> None:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{timestamp}] [{tag}] {msg}"
        print(line)
        if log_file_handle:
            log_file_handle.write(line + "\n")
            log_file_handle.flush()

    # 执行脚本
    stop_event = threading.Event()  # 命令行模式暂无停止信号
    success = run_scripts_sequential(scripts_with_args, stop_event, log_callback)

    if log_file_handle:
        log_file_handle.close()

    if not success:
        sys.exit(1)
    log_info("所有脚本执行完毕")

# ========== GUI 模式 ==========
if GUI_AVAILABLE:
    class ScriptRunnerGUI:
        def __init__(self, master: tk.Tk, config: Dict[str, Any]):
            self.master = master
            self.config = config
            self.running = False
            self.stop_event = threading.Event()
            self.run_thread: Optional[threading.Thread] = None
            self.log_queue: queue.Queue = queue.Queue()
            self.script_vars: List[tk.IntVar] = []
            self.script_args: Dict[str, List[str]] = config.get("script_args", {}).copy()
            self.script_status: List[str] = []  # 每个脚本的状态文字
            self.status_labels: List[tk.Label] = []  # 状态图标标签
            self.arg_labels: List[tk.Label] = []  # 参数显示标签

            master.title("自动化脚本批量运行工具")
            master.geometry("900x700")
            master.protocol("WM_DELETE_WINDOW", self.on_closing)

            self.create_widgets()
            self.process_log_queue()

        def create_widgets(self):
            # 顶部选择区域
            top_frame = ttk.LabelFrame(self.master, text="选择要运行的脚本（按顺序执行）", padding=10)
            top_frame.pack(fill=tk.X, padx=10, pady=5)

            btn_frame = ttk.Frame(top_frame)
            btn_frame.pack(fill=tk.X, pady=(0, 5))
            ttk.Button(btn_frame, text="全选", command=self.select_all).pack(side=tk.LEFT, padx=2)
            ttk.Button(btn_frame, text="取消全选", command=self.deselect_all).pack(side=tk.LEFT, padx=2)
            ttk.Button(btn_frame, text="保存日志", command=self.save_log).pack(side=tk.LEFT, padx=2)
            ttk.Button(btn_frame, text="清空日志", command=self.clear_log).pack(side=tk.LEFT, padx=2)

            # 脚本列表（带状态图标和参数编辑）
            self.scripts_frame = ttk.Frame(top_frame)
            self.scripts_frame.pack(fill=tk.X, pady=5)

            # 表头
            header_frame = ttk.Frame(self.scripts_frame)
            header_frame.pack(fill=tk.X, pady=(0, 5))
            ttk.Label(header_frame, text="状态", width=4).pack(side=tk.LEFT)
            ttk.Label(header_frame, text="脚本名称", width=30, anchor=tk.W).pack(side=tk.LEFT, padx=5)
            ttk.Label(header_frame, text="参数（双击编辑）", anchor=tk.W).pack(side=tk.LEFT, fill=tk.X, expand=True)

            scripts = self.config["scripts"]
            default_enabled = self.config["default_enabled"]
            if len(default_enabled) < len(scripts):
                default_enabled.extend([True] * (len(scripts) - len(default_enabled)))

            for i, script in enumerate(scripts):
                var = tk.IntVar(value=1 if default_enabled[i] else 0)
                self.script_vars.append(var)

                row_frame = ttk.Frame(self.scripts_frame)
                row_frame.pack(anchor=tk.W, pady=2, fill=tk.X)

                # 状态标签
                status_label = tk.Label(row_frame, text="⏳", width=2, font=("Segoe UI", 10))
                status_label.pack(side=tk.LEFT)
                self.status_labels.append(status_label)

                # 复选框 + 脚本名
                cb = ttk.Checkbutton(row_frame, text=script, variable=var)
                cb.pack(side=tk.LEFT, padx=5)
                self.script_status.append("等待")

                # 参数显示标签，双击可编辑
                args_display = " ".join(self.script_args.get(script, []))
                arg_label = tk.Label(row_frame, text=args_display, fg="gray", anchor=tk.W, cursor="hand2")
                arg_label.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
                arg_label.bind("<Double-Button-1>", lambda e, s=script: self.edit_script_args(s))
                self.arg_labels.append(arg_label)

            # 提示文字
            hint = ttk.Label(top_frame, text="提示：双击脚本参数区域可编辑传递的参数", foreground="gray")
            hint.pack(anchor=tk.W, pady=(5, 0))

            # 控制按钮
            ctrl_frame = ttk.Frame(self.master)
            ctrl_frame.pack(fill=tk.X, padx=10, pady=5)
            self.run_btn = ttk.Button(ctrl_frame, text="运行选中脚本", command=self.start_run)
            self.run_btn.pack(side=tk.LEFT, padx=5)
            self.stop_btn = ttk.Button(ctrl_frame, text="停止", command=self.stop_run, state=tk.DISABLED)
            self.stop_btn.pack(side=tk.LEFT, padx=5)

            # 日志区域
            log_frame = ttk.LabelFrame(self.master, text="执行日志", padding=5)
            log_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
            self.log_text = scrolledtext.ScrolledText(log_frame, wrap=tk.WORD, font=("Consolas", 9))
            self.log_text.pack(fill=tk.BOTH, expand=True)
            # 配置颜色
            self.log_text.tag_config(LOG_TAG_INFO, foreground="blue")
            self.log_text.tag_config(LOG_TAG_ERROR, foreground="red")
            self.log_text.tag_config(LOG_TAG_SUCCESS, foreground="green")
            self.log_text.tag_config(LOG_TAG_STOP, foreground="orange")

        def edit_script_args(self, script_name: str):
            """弹出对话框编辑脚本参数"""
            current_args = " ".join(self.script_args.get(script_name, []))
            new_args_str = simpledialog.askstring(
                "编辑参数",
                f"为脚本 {script_name} 设置参数（空格分隔）：",
                initialvalue=current_args,
                parent=self.master
            )
            if new_args_str is not None:
                # 解析参数：支持引号包裹的包含空格的参数？简化处理，按空格分割
                import shlex
                try:
                    new_args = shlex.split(new_args_str.strip())
                except ValueError:
                    # 如果 shlex 失败，退化为简单 split
                    new_args = new_args_str.strip().split()
                if new_args:
                    self.script_args[script_name] = new_args
                else:
                    self.script_args.pop(script_name, None)
                # 更新显示
                for i, script in enumerate(self.config["scripts"]):
                    if script == script_name:
                        display = " ".join(self.script_args.get(script_name, []))
                        self.arg_labels[i].config(text=display)
                        break

        def log(self, msg: str, tag: str = LOG_TAG_INFO):
            self.log_queue.put((msg, tag))

        def process_log_queue(self):
            try:
                while True:
                    msg, tag = self.log_queue.get_nowait()
                    self.log_text.insert(tk.END, msg + "\n", tag)
                    self.log_text.see(tk.END)
            except queue.Empty:
                pass
            finally:
                self.master.after(100, self.process_log_queue)

        def select_all(self):
            for v in self.script_vars:
                v.set(1)

        def deselect_all(self):
            for v in self.script_vars:
                v.set(0)

        def save_log(self):
            """保存日志内容到文件"""
            file_path = filedialog.asksaveasfilename(
                defaultextension=".log",
                filetypes=[("Log files", "*.log"), ("Text files", "*.txt"), ("All files", "*.*")]
            )
            if file_path:
                try:
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(self.log_text.get(1.0, tk.END))
                    self.log(f"日志已保存至 {file_path}", LOG_TAG_INFO)
                except Exception as e:
                    self.log(f"保存日志失败: {e}", LOG_TAG_ERROR)

        def clear_log(self):
            self.log_text.delete(1.0, tk.END)
            self.log("日志已清空", LOG_TAG_INFO)

        def get_selected_scripts_with_args(self) -> List[Tuple[str, Optional[List[str]]]]:
            result = []
            for i, v in enumerate(self.script_vars):
                if v.get() == 1:
                    script = self.config["scripts"][i]
                    args = self.script_args.get(script, [])
                    result.append((script, args))
            return result

        def start_run(self):
            if self.running:
                self.log("已有任务在运行", LOG_TAG_ERROR)
                return
            selected = self.get_selected_scripts_with_args()
            if not selected:
                self.log("未选中任何脚本", LOG_TAG_ERROR)
                return

            # 清空日志，重置状态
            self.clear_log()
            self.log("开始执行选中的脚本...", LOG_TAG_INFO)
            for script, args in selected:
                self.log(f"  - {script} {' '.join(args) if args else ''}", LOG_TAG_INFO)

            # 重置所有状态图标为等待
            for i, label in enumerate(self.status_labels):
                label.config(text="⏳")
                self.script_status[i] = "等待"

            self.running = True
            self.stop_event.clear()
            self.run_btn.config(state=tk.DISABLED)
            self.stop_btn.config(state=tk.NORMAL)
            # 禁用复选框和参数编辑
            for child in self.scripts_frame.winfo_children():
                if isinstance(child, ttk.Frame):
                    for subchild in child.winfo_children():
                        if isinstance(subchild, ttk.Checkbutton):
                            subchild.config(state=tk.DISABLED)
                        elif isinstance(subchild, tk.Label) and subchild.cget("cursor") == "hand2":
                            subchild.config(cursor="arrow", state=tk.DISABLED)

            self.run_thread = threading.Thread(target=self._run_thread, args=(selected,), daemon=True)
            self.run_thread.start()

        def stop_run(self):
            if not self.running:
                return
            self.log("用户请求停止，正在终止当前脚本...", LOG_TAG_STOP)
            self.stop_event.set()
            self.stop_btn.config(state=tk.DISABLED)

        def _run_thread(self, scripts_with_args: List[Tuple[str, Optional[List[str]]]]):
            # 映射脚本名称到索引
            script_to_index = {name: i for i, name in enumerate(self.config["scripts"])}
            for script, args in scripts_with_args:
                if self.stop_event.is_set():
                    self.log("检测到停止信号，终止后续脚本", LOG_TAG_STOP)
                    break
                # 更新状态为运行中
                if script in script_to_index:
                    si = script_to_index[script]
                    self.master.after(0, lambda i=si: self.status_labels[i].config(text="▶️"))
                    self.master.after(0, lambda i=si: setattr(self, 'script_status', 
                        self.script_status[:i] + ["运行中"] + self.script_status[i+1:]))
                # 执行脚本
                success = run_single_script(script, self.stop_event, self.log, extra_args=args)
                # 更新状态
                if script in script_to_index:
                    si = script_to_index[script]
                    if success:
                        self.master.after(0, lambda i=si: self.status_labels[i].config(text="✅"))
                        self.master.after(0, lambda i=si: setattr(self, 'script_status', 
                            self.script_status[:i] + ["成功"] + self.script_status[i+1:]))
                    else:
                        self.master.after(0, lambda i=si: self.status_labels[i].config(text="❌"))
                        self.master.after(0, lambda i=si: setattr(self, 'script_status', 
                            self.script_status[:i] + ["失败"] + self.script_status[i+1:]))
                if not success:
                    self.log(f"脚本 {script} 执行失败，终止后续任务", LOG_TAG_ERROR)
                    break
            self.master.after(0, self._on_finished)

        def _on_finished(self):
            self.running = False
            self.run_btn.config(state=tk.NORMAL)
            self.stop_btn.config(state=tk.DISABLED)
            # 恢复复选框和参数编辑
            for child in self.scripts_frame.winfo_children():
                if isinstance(child, ttk.Frame):
                    for subchild in child.winfo_children():
                        if isinstance(subchild, ttk.Checkbutton):
                            subchild.config(state=tk.NORMAL)
                        elif isinstance(subchild, tk.Label) and subchild.cget("cursor") == "arrow":
                            subchild.config(cursor="hand2", state=tk.NORMAL)
            if self.stop_event.is_set():
                self.log("任务已由用户停止。", LOG_TAG_STOP)
            else:
                self.log("所有选中的脚本执行完毕。", LOG_TAG_SUCCESS)
            self.stop_event.clear()

        def on_closing(self):
            if self.running:
                self.log("正在关闭窗口，尝试终止运行中的脚本...", LOG_TAG_STOP)
                self.stop_event.set()
                if self.run_thread and self.run_thread.is_alive():
                    self.run_thread.join(timeout=3.0)
            self.master.destroy()

def gui_main():
    if not GUI_AVAILABLE:
        print("[错误] Tkinter 不可用，请安装 python3-tk 或以 --nogui 模式运行。")
        sys.exit(1)
    ensure_dir(PROJECT_ROOT / "json")
    config = load_run_config()
    root = tk.Tk()
    app = ScriptRunnerGUI(root, config)
    root.mainloop()

# ========== 依赖预检 ==========
def check_dependencies() -> bool:
    """检查关键依赖是否可用，返回是否全部满足"""
    missing = []
    try:
        import markdown
    except ImportError:
        missing.append("markdown")
    try:
        import yaml
    except ImportError:
        missing.append("yaml (PyYAML)")
    try:
        from dateutil import parser
    except ImportError:
        missing.append("python-dateutil")
    if missing:
        print("[警告] 缺少以下依赖库，可能影响部分脚本的运行：")
        for m in missing:
            print(f"  - {m}")
        print("可通过 pip install markdown PyYAML python-dateutil 安装。")
        return False
    return True

# ========== 主入口 ==========
def main():
    parser = setup_argparse()
    args = parser.parse_args()

    # 依赖预检（仅警告，不强制退出）
    check_dependencies()

    if args.nogui or not GUI_AVAILABLE:
        console_main(args)
    else:
        gui_main()

if __name__ == "__main__":
    main()