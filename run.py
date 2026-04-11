#!/usr/bin/env python3
import subprocess
import sys

SCRIPTS_TO_RUN = [
    "ArticleManager.py",
    "WorkManager.py",
    "Statistic.py",
    "RssGenerator.py"
]

def main():
    for script in SCRIPTS_TO_RUN:
        print(f"正在启动: {script}")
        try:
            # 使用当前 Python 解释器执行子脚本，等待其完成
            subprocess.run([sys.executable, script], check=True)
            print(f"完成: {script}\n")
        except subprocess.CalledProcessError as e:
            print(f"脚本 {script} 运行失败，返回码: {e.returncode}")
            # 运行失败就停止
            break

if __name__ == "__main__":
    main()