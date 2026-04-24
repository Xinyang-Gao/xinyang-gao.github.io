#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

# 脚本列表（按依赖顺序）
SCRIPTS = ["ArticleManager.py", "WorkManager.py", "Statistic.py", "RssGenerator.py"]

# ========== 统一日志函数 ==========
def log_info(msg: str) -> None:
    print(f"[INFO] {msg}")

def log_error(msg: str) -> None:
    print(f"[ERROR] {msg}")

def main():
    # 切换到项目根目录（保证所有相对路径基于根目录）
    project_root = Path(__file__).parent.parent
    python_dir = Path(__file__).parent
    if not project_root.exists():
        log_error(f"项目根目录不存在: {project_root}")
        sys.exit(1)

    # 确保 json 目录存在
    (project_root / "json").mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    log_info("批量运行自动化脚本")
    print("=" * 60)

    for script in SCRIPTS:
        script_path = python_dir / script
        if not script_path.exists():
            log_error(f"脚本不存在: {script_path}")
            sys.exit(1)

        print(f"\n--- 正在执行: {script} ---")
        try:
            # 在项目根目录下运行，确保子脚本能正确解析路径
            result = subprocess.run(
                [sys.executable, str(script_path)],
                cwd=str(project_root),
                check=True,
                capture_output=False,
                text=True
            )
            if result.returncode != 0:
                log_error(f"脚本 {script} 返回非零退出码")
                sys.exit(result.returncode)
        except subprocess.CalledProcessError as e:
            log_error(f"脚本 {script} 运行失败，返回码: {e.returncode}")
            sys.exit(e.returncode)
        except Exception as e:
            log_error(f"执行 {script} 时发生异常: {e}")
            sys.exit(1)

    print("\n" + "=" * 60)
    log_info("所有脚本执行完毕")
    print("=" * 60)

if __name__ == "__main__":
    main()