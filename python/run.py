#!/usr/bin/env python3
import subprocess
import sys
import threading
import queue
import time
from pathlib import Path

try:
    import tkinter as tk
    from tkinter import ttk, scrolledtext
    GUI_AVAILABLE = True
except ImportError:
    GUI_AVAILABLE = False

from common import PROJECT_ROOT, log_info, log_error, ensure_dir

PYTHON_DIR = Path(__file__).parent
SCRIPTS = ["ArticleManager.py", "WorkManager.py", "Statistic.py", "RssGenerator.py",
           "SitemapGenerator.py", "FriendLinkGenerator.py", "StaticListGenerator.py", "CodeAnalyzer.py"]

def run_scripts_sync(scripts: list) -> bool:
    for script in scripts:
        script_path = PYTHON_DIR / script
        if not script_path.exists():
            log_error(f"脚本不存在: {script_path}")
            return False
        print(f"\n--- 正在执行: {script} ---")
        try:
            result = subprocess.run(
                [sys.executable, str(script_path)],
                cwd=str(PROJECT_ROOT),
                check=True,
                capture_output=False,
                text=True
            )
            if result.returncode != 0:
                log_error(f"脚本 {script} 返回非零退出码")
                return False
        except subprocess.CalledProcessError as e:
            log_error(f"脚本 {script} 运行失败，返回码: {e.returncode}")
            return False
        except Exception as e:
            log_error(f"执行 {script} 时发生异常: {e}")
            return False
    return True

def nogui_main():
    ensure_dir(PROJECT_ROOT / "json")
    print("=" * 60)
    log_info("批量运行自动化脚本 (命令行模式)")
    print("=" * 60)
    if run_scripts_sync(SCRIPTS):
        log_info("所有脚本执行完毕")
    else:
        sys.exit(1)

# -------------------- GUI --------------------
class ScriptRunnerGUI:
    def __init__(self, master):
        self.master = master
        master.title("自动化脚本批量运行工具")
        master.geometry("800x600")
        master.protocol("WM_DELETE_WINDOW", self.on_closing)

        self.running = False
        self.stop_event = threading.Event()
        self.run_thread = None
        self.log_queue = queue.Queue()
        self.script_vars = []

        self.create_widgets()
        self.process_log_queue()

    def create_widgets(self):
        top = ttk.LabelFrame(self.master, text="选择要运行的脚本（按依赖顺序执行）", padding=10)
        top.pack(fill=tk.X, padx=10, pady=5)
        btn_frame = ttk.Frame(top)
        btn_frame.pack(fill=tk.X, pady=(0, 5))
        ttk.Button(btn_frame, text="全选", command=self.select_all).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="取消全选", command=self.deselect_all).pack(side=tk.LEFT, padx=2)

        self.checkbox_frame = ttk.Frame(top)
        self.checkbox_frame.pack(fill=tk.X)
        for script in SCRIPTS:
            var = tk.IntVar(value=1)
            cb = ttk.Checkbutton(self.checkbox_frame, text=script, variable=var)
            cb.pack(anchor=tk.W)
            self.script_vars.append(var)

        ctrl = ttk.Frame(self.master)
        ctrl.pack(fill=tk.X, padx=10, pady=5)
        self.run_btn = ttk.Button(ctrl, text="运行选中脚本", command=self.start_run)
        self.run_btn.pack(side=tk.LEFT, padx=5)
        self.stop_btn = ttk.Button(ctrl, text="停止", command=self.stop_run, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=5)

        log_frame = ttk.LabelFrame(self.master, text="执行日志", padding=5)
        log_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        self.log_text = scrolledtext.ScrolledText(log_frame, wrap=tk.WORD, font=("Consolas", 9))
        self.log_text.pack(fill=tk.BOTH, expand=True)
        for tag, color in [("INFO", "blue"), ("ERROR", "red"), ("SUCCESS", "green"), ("STOP", "orange")]:
            self.log_text.tag_config(tag, foreground=color)

    def log(self, msg: str, tag: str = "INFO"):
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

    def get_selected(self):
        return [SCRIPTS[i] for i, v in enumerate(self.script_vars) if v.get() == 1]

    def start_run(self):
        if self.running:
            self.log("已有任务在运行", "ERROR")
            return
        selected = self.get_selected()
        if not selected:
            self.log("未选中任何脚本", "ERROR")
            return

        self.log_text.delete(1.0, tk.END)
        self.log("开始执行选中的脚本...", "INFO")
        self.log(f"脚本列表: {', '.join(selected)}", "INFO")

        self.running = True
        self.stop_event.clear()
        self.run_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.NORMAL)
        for child in self.checkbox_frame.winfo_children():
            if isinstance(child, ttk.Checkbutton):
                child.config(state=tk.DISABLED)

        self.run_thread = threading.Thread(target=self._run_thread, args=(selected,), daemon=True)
        self.run_thread.start()

    def stop_run(self):
        if not self.running:
            return
        self.log("用户请求停止，正在终止当前脚本...", "STOP")
        self.stop_event.set()
        self.stop_btn.config(state=tk.DISABLED)

    def _run_single(self, script: str) -> bool:
        script_path = PYTHON_DIR / script
        if not script_path.exists():
            self.log(f"脚本不存在: {script_path}", "ERROR")
            return False
        self.log(f">>> 开始执行: {script}", "INFO")
        cmd = [sys.executable, str(script_path)]
        try:
            proc = subprocess.Popen(
                cmd, cwd=str(PROJECT_ROOT),
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, bufsize=1
            )
        except Exception as e:
            self.log(f"启动脚本失败: {e}", "ERROR")
            return False

        def enqueue(pipe, prefix, tag):
            for line in iter(pipe.readline, ''):
                if self.stop_event.is_set():
                    break
                if line.strip():
                    self.log(f"{prefix}{line.rstrip()}", tag)
            pipe.close()

        t_out = threading.Thread(target=enqueue, args=(proc.stdout, f"[{script}] ", "INFO"))
        t_err = threading.Thread(target=enqueue, args=(proc.stderr, f"[{script}] ", "ERROR"))
        t_out.daemon = True
        t_err.daemon = True
        t_out.start()
        t_err.start()

        while True:
            if self.stop_event.is_set():
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                self.log(f"脚本 {script} 已被用户停止", "STOP")
                return False
            ret = proc.poll()
            if ret is not None:
                if ret != 0:
                    self.log(f"脚本 {script} 返回非零退出码 {ret}", "ERROR")
                    return False
                else:
                    self.log(f"脚本 {script} 执行成功", "SUCCESS")
                    return True
            time.sleep(0.1)

    def _run_thread(self, scripts):
        success = True
        for script in scripts:
            if self.stop_event.is_set():
                self.log("检测到停止信号，终止后续脚本", "STOP")
                success = False
                break
            if not self._run_single(script):
                success = False
                break
        self.master.after(0, self._on_finished, success)

    def _on_finished(self, success):
        self.running = False
        self.run_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
        for child in self.checkbox_frame.winfo_children():
            if isinstance(child, ttk.Checkbutton):
                child.config(state=tk.NORMAL)
        if success:
            self.log("所有选中的脚本执行完毕。", "SUCCESS")
        else:
            if self.stop_event.is_set():
                self.log("任务已由用户停止。", "STOP")
            else:
                self.log("任务因错误而中断，请检查上方日志。", "ERROR")
        self.stop_event.clear()

    def on_closing(self):
        if self.running:
            self.log("正在关闭窗口，尝试终止运行中的脚本...", "STOP")
            self.stop_event.set()
            if self.run_thread and self.run_thread.is_alive():
                self.run_thread.join(timeout=3.0)
        self.master.destroy()

def gui_main():
    if not GUI_AVAILABLE:
        print("[ERROR] Tkinter 不可用，请安装 python3-tk 或以 NOGUI 模式运行。")
        sys.exit(1)
    ensure_dir(PROJECT_ROOT / "json")
    root = tk.Tk()
    app = ScriptRunnerGUI(root)
    root.mainloop()

if __name__ == "__main__":
    if len(sys.argv) > 1 and "NOGUI" in sys.argv[1].upper():
        nogui_main()
    else:
        gui_main()