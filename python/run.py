#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
统一构建入口，支持命令行和 GUI，使用新引擎。
"""

import argparse
import sys
import threading
import queue
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, List

from common import PROJECT_ROOT, log_info, log_error, log_warning
from engine import BuildEngine
from generators.aggregated import AggregatedGenerator

# 尝试导入 GUI
try:
    import tkinter as tk
    from tkinter import ttk, scrolledtext, filedialog
    GUI_AVAILABLE = True
except ImportError:
    GUI_AVAILABLE = False

def console_main(args):
    print("=" * 60)
    log_info("统一构建系统启动 (命令行)")
    print("=" * 60)

    engine = BuildEngine()
    engine.register(AggregatedGenerator())

    # 还可以注册其他生成器，但目前聚合生成器已包含所有功能
    target = args.targets if args.targets else None
    force = args.force
    parallel = not args.no_parallel
    max_workers = args.workers

    def callback(msg, tag):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{tag}] {msg}")

    success = engine.run(force=force, target_names=target,
                         parallel=parallel, max_workers=max_workers,
                         progress_callback=callback)
    if not success:
        sys.exit(1)
    log_info("构建完成")

def setup_argparse():
    parser = argparse.ArgumentParser(description="统一构建系统")
    parser.add_argument("--force", action="store_true", help="强制重新生成所有输出")
    parser.add_argument("--targets", nargs="+", help="指定生成器名称（如 aggregated）")
    parser.add_argument("--no-parallel", action="store_true", help="禁用并行执行")
    parser.add_argument("--workers", type=int, default=4, help="并行线程数")
    parser.add_argument("--nogui", action="store_true", help="强制命令行模式")
    return parser

# ---------- GUI 模式（简化版，基于新引擎） ----------
if GUI_AVAILABLE:
    class BuildGUI:
        def __init__(self, master):
            self.master = master
            master.title("统一构建系统")
            master.geometry("700x500")

            self.force_var = tk.IntVar()
            self.parallel_var = tk.IntVar(value=1)
            self.workers_var = tk.StringVar(value="4")

            top_frame = ttk.LabelFrame(master, text="选项", padding=10)
            top_frame.pack(fill=tk.X, padx=10, pady=5)
            ttk.Checkbutton(top_frame, text="强制重建", variable=self.force_var).pack(anchor=tk.W)
            ttk.Checkbutton(top_frame, text="启用并行", variable=self.parallel_var).pack(anchor=tk.W)
            ttk.Label(top_frame, text="最大并行数:").pack(anchor=tk.W)
            ttk.Spinbox(top_frame, from_=1, to=8, textvariable=self.workers_var, width=5).pack(anchor=tk.W)

            btn_frame = ttk.Frame(master)
            btn_frame.pack(pady=5)
            ttk.Button(btn_frame, text="运行构建", command=self.run_build).pack(side=tk.LEFT, padx=5)
            ttk.Button(btn_frame, text="清空日志", command=self.clear_log).pack(side=tk.LEFT, padx=5)
            ttk.Button(btn_frame, text="保存日志", command=self.save_log).pack(side=tk.LEFT, padx=5)

            log_frame = ttk.LabelFrame(master, text="日志", padding=5)
            log_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
            self.log_text = scrolledtext.ScrolledText(log_frame, wrap=tk.WORD, font=("Consolas", 9))
            self.log_text.pack(fill=tk.BOTH, expand=True)
            self.log_text.tag_config("INFO", foreground="blue")
            self.log_text.tag_config("ERROR", foreground="red")
            self.log_text.tag_config("SUCCESS", foreground="green")

            self.log_queue = queue.Queue()
            self.master.after(100, self.process_log_queue)
            self.running = False

        def log(self, msg, tag="INFO"):
            self.log_queue.put((msg, tag))

        def process_log_queue(self):
            try:
                while True:
                    msg, tag = self.log_queue.get_nowait()
                    self.log_text.insert(tk.END, msg + "\n", tag)
                    self.log_text.see(tk.END)
            except queue.Empty:
                pass
            self.master.after(100, self.process_log_queue)

        def clear_log(self):
            self.log_text.delete(1.0, tk.END)

        def save_log(self):
            path = filedialog.asksaveasfilename(defaultextension=".log")
            if path:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(self.log_text.get(1.0, tk.END))
                self.log(f"日志已保存至 {path}", "INFO")

        def run_build(self):
            if self.running:
                self.log("已有构建运行中", "ERROR")
                return
            self.running = True
            self.log("开始构建...", "INFO")
            threading.Thread(target=self._run, daemon=True).start()

        def _run(self):
            engine = BuildEngine()
            engine.register(AggregatedGenerator())
            force = bool(self.force_var.get())
            parallel = bool(self.parallel_var.get())
            workers = int(self.workers_var.get() or 4)

            def callback(msg, tag):
                self.log(msg, tag)

            success = engine.run(force=force, parallel=parallel,
                                 max_workers=workers, progress_callback=callback)
            self.running = False
            if success:
                self.log("构建完成", "SUCCESS")
            else:
                self.log("构建失败", "ERROR")

    def gui_main():
        root = tk.Tk()
        app = BuildGUI(root)
        root.mainloop()

# ---------- 主入口 ----------
def main():
    parser = setup_argparse()
    args = parser.parse_args()
    if args.nogui or not GUI_AVAILABLE:
        console_main(args)
    else:
        gui_main()

if __name__ == "__main__":
    main()