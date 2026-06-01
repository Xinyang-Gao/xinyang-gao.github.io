#!/usr/bin/env python3
import subprocess
import sys
import threading
import queue
import time
from pathlib import Path

# 尝试导入 GUI 所需模块（仅在非 NOGUI 模式下需要）
try:
    import tkinter as tk
    from tkinter import ttk, scrolledtext
    GUI_AVAILABLE = True
except ImportError:
    GUI_AVAILABLE = False

# 脚本列表（按依赖顺序）
SCRIPTS = ["ArticleManager.py", "WorkManager.py", "Statistic.py", "RssGenerator.py", "SitemapGenerator.py","FriendLinkGenerator.py", "StaticListGenerator.py", "CodeAnalyzer.py"]

# ========== 统一路径常量 ==========
PROJECT_ROOT = Path(__file__).parent.parent
PYTHON_DIR = Path(__file__).parent

# ========== 统一日志函数（命令行模式用） ==========
def log_info(msg: str) -> None:
    print(f"[INFO] {msg}")

def log_error(msg: str) -> None:
    print(f"[ERROR] {msg}")

# ========== 初始化环境（创建 json 目录） ==========
def init_environment() -> None:
    """确保项目根目录下的 json 目录存在"""
    (PROJECT_ROOT / "json").mkdir(parents=True, exist_ok=True)

# ========== 命令行模式（原始行为） ==========
def run_scripts_sync(scripts: list) -> bool:
    """
    同步按顺序执行脚本，输出到控制台
    返回 True 表示全部成功，False 表示有失败
    """
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
    """原始命令行入口"""
    init_environment()
    print("=" * 60)
    log_info("批量运行自动化脚本 (命令行模式)")
    print("=" * 60)

    success = run_scripts_sync(SCRIPTS)
    if not success:
        sys.exit(1)

    print("\n" + "=" * 60)
    log_info("所有脚本执行完毕")
    print("=" * 60)

# ========== GUI 模式 ==========
class ScriptRunnerGUI:
    def __init__(self, master):
        self.master = master
        master.title("自动化脚本批量运行工具")
        master.geometry("800x600")
        master.protocol("WM_DELETE_WINDOW", self.on_closing)

        # 运行控制标志
        self.running = False
        self.stop_event = threading.Event()
        self.run_thread = None
        self.log_queue = queue.Queue()

        # 存储每个脚本的选中状态 (IntVar)
        self.script_vars = []

        self.create_widgets()
        self.init_log_processor()

    def create_widgets(self):
        # 顶部框架：脚本选择区
        top_frame = ttk.LabelFrame(self.master, text="选择要运行的脚本（按依赖顺序执行）", padding=10)
        top_frame.pack(fill=tk.X, padx=10, pady=5)

        # 全选/取消全选按钮行
        btn_frame = ttk.Frame(top_frame)
        btn_frame.pack(fill=tk.X, pady=(0, 5))
        ttk.Button(btn_frame, text="全选", command=self.select_all).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="取消全选", command=self.deselect_all).pack(side=tk.LEFT, padx=2)

        # 脚本复选框列表（按 SCRIPTS 顺序）
        self.checkbox_frame = ttk.Frame(top_frame)
        self.checkbox_frame.pack(fill=tk.X)
        for script in SCRIPTS:
            var = tk.IntVar(value=1)  # 默认全选
            cb = ttk.Checkbutton(self.checkbox_frame, text=script, variable=var)
            cb.pack(anchor=tk.W)
            self.script_vars.append(var)

        # 控制按钮区
        control_frame = ttk.Frame(self.master)
        control_frame.pack(fill=tk.X, padx=10, pady=5)

        self.run_btn = ttk.Button(control_frame, text="运行选中脚本", command=self.start_run)
        self.run_btn.pack(side=tk.LEFT, padx=5)

        self.stop_btn = ttk.Button(control_frame, text="停止", command=self.stop_run, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=5)

        # 日志输出区域
        log_frame = ttk.LabelFrame(self.master, text="执行日志", padding=5)
        log_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        self.log_text = scrolledtext.ScrolledText(log_frame, wrap=tk.WORD, font=("Consolas", 9))
        self.log_text.pack(fill=tk.BOTH, expand=True)
        # 配置颜色标签
        self.log_text.tag_config("INFO", foreground="blue")
        self.log_text.tag_config("ERROR", foreground="red")
        self.log_text.tag_config("SUCCESS", foreground="green")
        self.log_text.tag_config("STOP", foreground="orange")

    def init_log_processor(self):
        """启动定时器处理日志队列"""
        self.process_log_queue()
        # 每隔 100ms 处理一次队列
        self.master.after(100, self.process_log_queue)

    def process_log_queue(self):
        """从队列中取出日志并显示到文本框（主线程执行）"""
        try:
            while True:
                msg, tag = self.log_queue.get_nowait()
                self.log_text.insert(tk.END, msg + "\n", tag)
                self.log_text.see(tk.END)  # 自动滚动到底部
        except queue.Empty:
            pass
        finally:
            self.master.after(100, self.process_log_queue)

    def log(self, msg: str, tag: str = "INFO"):
        """线程安全地添加日志"""
        self.log_queue.put((msg, tag))

    def select_all(self):
        for var in self.script_vars:
            var.set(1)

    def deselect_all(self):
        for var in self.script_vars:
            var.set(0)

    def get_selected_scripts(self):
        """按原顺序返回被选中的脚本列表"""
        selected = []
        for i, var in enumerate(self.script_vars):
            if var.get() == 1:
                selected.append(SCRIPTS[i])
        return selected

    def start_run(self):
        if self.running:
            self.log("已有任务在运行，请勿重复点击", "ERROR")
            return

        selected = self.get_selected_scripts()
        if not selected:
            self.log("未选中任何脚本，请先选择", "ERROR")
            return

        # 清空日志区域
        self.log_text.delete(1.0, tk.END)
        self.log("开始执行选中的脚本...", "INFO")
        self.log(f"脚本列表: {', '.join(selected)}", "INFO")

        # 切换控件状态
        self.running = True
        self.stop_event.clear()
        self.run_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.NORMAL)
        # 禁用脚本复选框（不可中途修改选择）
        for child in self.checkbox_frame.winfo_children():
            if isinstance(child, ttk.Checkbutton):
                child.config(state=tk.DISABLED)

        # 启动后台线程执行脚本
        self.run_thread = threading.Thread(target=self._run_scripts_thread, args=(selected,), daemon=True)
        self.run_thread.start()

    def stop_run(self):
        if not self.running:
            return
        self.log("用户请求停止，正在终止当前脚本...", "STOP")
        self.stop_event.set()
        # 禁用停止按钮，防止重复点击
        self.stop_btn.config(state=tk.DISABLED)

    def _run_single_script(self, script: str) -> bool:
        """
        在子线程中运行单个脚本，实时输出日志。
        返回 True 表示成功，False 表示失败或被停止。
        """
        script_path = PYTHON_DIR / script
        if not script_path.exists():
            self.log(f"脚本不存在: {script_path}", "ERROR")
            return False

        self.log(f">>> 开始执行: {script}", "INFO")
        cmd = [sys.executable, str(script_path)]

        try:
            # 启动子进程，管道捕获 stdout/stderr
            process = subprocess.Popen(
                cmd,
                cwd=str(PROJECT_ROOT),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1  # 行缓冲
            )
        except Exception as e:
            self.log(f"启动脚本 {script} 时发生异常: {e}", "ERROR")
            return False

        # 定义读取管道的函数
        def enqueue_output(pipe, prefix, tag):
            try:
                for line in iter(pipe.readline, ''):
                    if self.stop_event.is_set():
                        break
                    if line.strip():
                        self.log(f"{prefix}{line.rstrip()}", tag)
                pipe.close()
            except Exception:
                pass

        # 启动两个读取线程
        t_out = threading.Thread(target=enqueue_output, args=(process.stdout, f"[{script}] ", "INFO"))
        t_err = threading.Thread(target=enqueue_output, args=(process.stderr, f"[{script}] ", "ERROR"))
        t_out.daemon = True
        t_err.daemon = True
        t_out.start()
        t_err.start()

        # 轮询进程结束或停止信号
        while True:
            if self.stop_event.is_set():
                # 用户停止：终止子进程
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                self.log(f"脚本 {script} 已被用户停止", "STOP")
                return False

            ret = process.poll()
            if ret is not None:
                # 进程结束
                if ret != 0:
                    self.log(f"脚本 {script} 返回非零退出码 {ret}", "ERROR")
                    return False
                else:
                    self.log(f"脚本 {script} 执行成功", "SUCCESS")
                    return True
            time.sleep(0.1)

    def _run_scripts_thread(self, selected_scripts):
        """后台线程：按顺序执行选中脚本"""
        success_all = True
        for script in selected_scripts:
            if self.stop_event.is_set():
                self.log("检测到停止信号，终止后续脚本执行", "STOP")
                success_all = False
                break
            ok = self._run_single_script(script)
            if not ok:
                success_all = False
                break

        # 执行完毕，回到主线程恢复界面
        self.master.after(0, self._on_run_finished, success_all)

    def _on_run_finished(self, success_all):
        """运行结束后的清理工作（主线程）"""
        self.running = False
        self.run_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
        # 恢复脚本复选框状态
        for child in self.checkbox_frame.winfo_children():
            if isinstance(child, ttk.Checkbutton):
                child.config(state=tk.NORMAL)

        if success_all:
            self.log("所有选中的脚本执行完毕。", "SUCCESS")
        else:
            if self.stop_event.is_set():
                self.log("任务已由用户停止。", "STOP")
            else:
                self.log("任务因错误而中断，请检查上方日志。", "ERROR")
        self.stop_event.clear()

    def on_closing(self):
        """窗口关闭时的处理：如果正在运行则尝试停止并等待线程结束"""
        if self.running:
            self.log("正在关闭窗口，尝试终止运行中的脚本...", "STOP")
            self.stop_event.set()
            if self.run_thread and self.run_thread.is_alive():
                self.run_thread.join(timeout=3.0)
        self.master.destroy()


def gui_main():
    """启动 GUI 模式"""
    if not GUI_AVAILABLE:
        print("[ERROR] Tkinter 不可用，无法启动 GUI 模式。请安装 python3-tk 或以 NOGUI 模式运行。")
        sys.exit(1)
    init_environment()
    root = tk.Tk()
    app = ScriptRunnerGUI(root)
    root.mainloop()


# ========== 入口：根据参数决定模式 ==========
if __name__ == "__main__":
    # 检测命令行参数：如果包含 "NOGUI"（不区分大小写）则使用原始命令行模式
    if len(sys.argv) > 1 and "NOGUI" in sys.argv[1].upper():
        nogui_main()
    else:
        gui_main()