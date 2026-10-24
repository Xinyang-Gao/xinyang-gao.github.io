#!/usr/bin/env python3
"""程序化山脉轮廓生成。

脊状分形噪声 + 域扭曲 + 非平稳包络 + 沟谷扣除 + 水力侵蚀 + 热力侵蚀。
输出三层 SVG 山脊路径，并打印 ASCII 轮廓与地形统计指标用于人工校验。

x 始终归一化到 [0,1]，最后再映射到 viewBox 的 y 区间。
"""

import json
import numpy as np

# ==================== 噪声 ====================


def hash1(i, seed):
    return np.mod(np.sin(np.asarray(i, dtype=float) * 127.1 + float(seed) * 311.7) * 43758.5453, 1.0)


def vnoise(x, seed=0):
    """一维平滑值噪声（smoothstep 插值）"""
    x = np.asarray(x, dtype=float)
    xi = np.floor(x)
    xf = x - xi
    u = xf * xf * (3.0 - 2.0 * xf)
    return hash1(xi, seed) * (1.0 - u) + hash1(xi + 1.0, seed) * u


def ridge(x, seed=0, p=2.0):
    """脊状基元：在噪声中值附近形成尖锐山脊"""
    v = vnoise(x, seed)
    return (1.0 - np.abs(2.0 * v - 1.0)) ** p


# ==================== 生成 ====================


def fbm(x, seed, octaves, H, q=2.0, lam0=0.5):
    """常规 fBm：平缓的谷底地形（山麓、河漫滩）"""
    out = np.zeros_like(x)
    amp = 1.0
    lam = lam0
    norm = 0.0
    for i in range(octaves):
        out = out + amp * vnoise(x / lam + i * 13.7, seed + 300 + i)
        norm += amp
        amp *= q ** (-H)
        lam /= q
    return out / (norm + 1e-12)


def ridged_mf(x, seed, cfg):
    """Musgrave 脊状多重分形。

    关键：每个八度的细节乘上"上一层山脊的权重"，
    于是细部只长在山脊上、山谷保持平滑 —— 形成连通的山脊网络，
    而不是各处孤立的尖峰（朴素叠加脊状噪声的通病）。
    """
    N, H, q, p, gain = cfg["N"], cfg["H"], cfg["q"], cfg["p"], cfg["gain"]
    lam = cfg["lam0"]
    out = np.zeros_like(x)
    weight = np.ones_like(x)
    norm = 0.0
    for i in range(N):
        r = ridge(x / lam + i * 17.3, seed + 100 + i, p)
        r = r * weight
        weight = np.clip(r * gain, 0.0, 1.0)
        amp = q ** (-H * i)
        out = out + amp * r
        norm += amp
        lam /= q
    return out / (norm + 1e-12)


def build_field(seed, cfg, n):
    x = np.linspace(0.0, 1.0, n)

    # 1. 域扭曲：让山脊线弯曲，不再是等距的呆板排列
    W = x.copy()
    for j in range(cfg["warp_octaves"]):
        W = W + (cfg["warp"] / (j + 1)) * (
            2.0 * vnoise(x * (2.0**j) / cfg["warp_freq_scale"] + 10.0 * j, seed + 20 + j) - 1.0
        )

    # 2. 非平稳包络：多峰高斯 + 低频调制 → 山脉群非均匀分布
    E = np.zeros_like(x)
    for c, sig in cfg["lobes"]:
        E = E + np.exp(-(((x - c) / sig) ** 2))
    E = E * (cfg["e0"] + cfg["e1"] * vnoise(x / cfg["env_mu"], seed + 7))
    E = E / (E.max() + 1e-12)
    # 底噪：让山脉横向连续（真实山脉不会在两端凭空消失），
    # 只是高度随包络起伏 —— 高山群与低矮段落连成一体。
    f = cfg.get("env_floor", 0.0)
    E = f + (1.0 - f) * E

    # 3. 谷底地形 + 脊状山脊网络
    base = fbm(W * 0.9, seed + 500, cfg["base_N"], cfg["H"], cfg["q"], cfg["base_lam0"])
    rid = ridged_mf(W, seed, cfg)

    h = (
        cfg["base"]
        + cfg["tilt"] * x
        + cfg["base_amp"] * base
        + cfg["ridge_amp"] * E * rid
    )
    return x, h, E


def carve_valleys(x, h, cfg):
    """沟谷扣除：在最深的若干个局部极小处下切，形成河谷 / 山口"""
    n = len(h)
    # 局部极小（含边界）
    interior = (h[1:-1] <= h[:-2]) & (h[1:-1] <= h[2:])
    idx = np.arange(1, n - 1)[interior]
    if len(idx) == 0:
        return h, []
    # 取最深的几个，且彼此间隔开
    order = idx[np.argsort(h[idx])]
    picked = []
    for i in order:
        if all(abs(x[i] - x[j]) > 0.06 for j in picked):
            picked.append(i)
        if len(picked) >= cfg["n_valleys"]:
            break
    span = h.max() - h.min()
    out = h.copy()
    carved = []
    for i in picked:
        # 谷宽与该处山体尺度相关，深度取峰高的 0.10–0.22
        w = cfg["valley_w"] * (0.7 + 0.6 * float(np.exp(-(((x[i] - 0.5) / 0.35) ** 2))))
        d = cfg["valley_d"] * span
        out = out - d * np.exp(-(((x - x[i]) / w) ** 2))
        carved.append((round(float(x[i]), 3), round(d / span, 3)))
    return out, carved


def hydraulic_erode(h, rounds, rate, m_exp=0.45, n_exp=1.1):
    """一维水流侵蚀（stream power）：A^m · S^n

    A = 汇水面积（按高程降序累加），S = 最陡下降方向的坡度。
    每轮把侵蚀量归一化到"最大下切 = rate × 高度范围"，
    这样参数与网格分辨率解耦，不会因量级失控把地形削成白噪声。
    """
    n = len(h)
    dx = 1.0 / (n - 1)
    ar = np.arange(n)
    for _ in range(rounds):
        left = np.concatenate(([np.inf], h[:-1]))
        right = np.concatenate((h[1:], [np.inf]))
        r = np.where(left < right, ar - 1, ar + 1)
        r = np.where(np.minimum(left, right) < h, r, -1)

        A = np.ones(n)
        for i in np.argsort(-h):
            ri = r[i]
            if ri >= 0:
                A[ri] += A[i]

        slope = np.zeros(n)
        valid = r >= 0
        slope[valid] = np.maximum(h[valid] - h[r[valid]], 0.0) / dx

        er = (A / n) ** m_exp * slope**n_exp
        # 侵蚀场先平滑：否则最大汇流点会被挖成针状凹坑，两侧留下近垂直的壁
        er = smooth(er, 4.0)
        peak = er.max()
        if peak <= 1e-12:
            break
        rng = h.max() - h.min()
        h = h - (er / peak) * rate * rng
    return h


def thermal_erode(h, rounds, max_vb_slope, amp_vb, x_units):
    """热力侵蚀（talus）：超过休止角的坡面滑落 → 碎石坡，山脊不至于尖得不真实"""
    n = len(h)
    # 把"viewBox 里的最大坡度"换算成相邻样本间的最大高差（h 归一化单位）
    dx_vb = x_units / (n - 1)
    maxdiff = max_vb_slope * dx_vb / amp_vb
    for _ in range(rounds):
        d = np.diff(h)  # d[i] = h[i+1] - h[i]
        # 超出休止角的部分，从高的一侧搬到低的一侧。
        # 注意方向：d>0 表示 i+1 更高，物质必须从 i+1 搬到 i（写成反向会变成反扩散，指数发散）。
        transfer = np.sign(d) * np.maximum(np.abs(d) - maxdiff, 0.0) * 0.5
        delta = np.zeros(n)
        delta[:-1] += transfer
        delta[1:] -= transfer
        h = h + delta
    return h


def smooth(h, sigma):
    """高斯平滑（sigma 以样本为单位）"""
    if sigma <= 0:
        return h
    r = int(max(1, np.ceil(3 * sigma)))
    xs = np.arange(-r, r + 1)
    k = np.exp(-0.5 * (xs / sigma) ** 2)
    k = k / k.sum()
    pad = np.pad(h, r, mode="edge")
    return np.convolve(pad, k, mode="valid")


def limit_slope(h, c):
    """把剖面投影到"最大坡度 ≤ c/样本"的 Lipschitz 锥内。

    原理：满足 |h[i+1]-h[i]| ≤ c 的函数里，
    最大的不超过 h 的那个是下包络 U[i] = min_j (h[j] + c|i-j|)，
    最小的不低于 h 的那个是上包络 L[i] = max_j (h[j] - c|i-j|)，
    取两者中值即得一个合法的 c-Lipschitz 剖面。

    比"局部 talus 迭代"快得多：后者在均匀陡坡上净通量为零，
    需要 O(L²) 轮才能松弛，实际跑几千轮都收不住。
    两个包络都可用前缀 min/max 累积在 O(n) 内算出。
    """
    n = len(h)
    if c <= 0:
        return h
    i = np.arange(n, dtype=float)

    up = np.minimum(
        c * i + np.minimum.accumulate(h - c * i),
        -c * i + np.minimum.accumulate((h + c * i)[::-1])[::-1],
    )
    lo = np.maximum(
        -c * i + np.maximum.accumulate(h + c * i),
        c * i + np.maximum.accumulate((h - c * i)[::-1])[::-1],
    )
    return 0.5 * (up + lo)


def normalize(h):
    return (h - h.min()) / (h.max() - h.min() + 1e-12)


def lean(x, h, amount, sigma=40.0):
    """剪切：按高度整体侧倾，模拟岩层各向异性（山坡两侧不对称）。

    位移量取自**平滑后的**高度场：直接用原始高度会让陡坡处的采样坐标
    变成非单调（lean × 坡度 > 1），np.interp 随即给出乱序垃圾。
    各向异性本就是山脉的大尺度属性，用平滑场驱动也更符合物理。
    """
    if abs(amount) < 1e-6:
        return h
    hs = smooth(h, sigma)
    xs = x + amount * hs
    return np.interp(x, xs, h, left=h[0], right=h[-1])


def metrics(x, h):
    """地形统计：用来量化"像不像真山""" ""
    n = len(h)
    d = np.diff(h)
    dx = 1.0 / (n - 1)
    slope = np.abs(d) / dx
    mean = h.mean()

    # 尖脊宽谷：高于均值的面积占比应明显小于 0.5
    above = float((h > mean).mean())

    # Hurst 指数（变差函数拟合）：E[(h(x+lag)-h(x))^2] ∝ lag^(2H)
    lags = np.array([16, 32, 64, 128, 256, 512], dtype=int)
    lags = lags[lags < n // 2]
    vg = np.array([float(np.mean((h[l:] - h[:-l]) ** 2)) for l in lags])
    H = float(np.polyfit(np.log(lags), np.log(vg), 1)[0] / 2.0)

    # 坡度分布的峰度：真实地形重尾，非高斯
    s = slope - slope.mean()
    kurt = float(np.mean(s**4) / (np.mean(s**2) ** 2 + 1e-12))

    # 峰的数量（显著局部极大）
    interior = (h[1:-1] > h[:-2]) & (h[1:-1] > h[2:])
    idx = np.arange(1, n - 1)[interior]
    rng = h.max() - h.min()
    peaks = int(np.sum(h[idx] > h.min() + 0.35 * rng))

    return {
        "Hurst": round(H, 3),
        "ridge_area": round(above, 3),
        "slope_kurtosis": round(kurt, 2),
        "peaks": peaks,
        "max_slope": round(float(slope.max()), 1),
        "mean_slope": round(float(slope.mean()), 1),
    }


# ==================== 输出 ====================


def rdp(pts, eps):
    """Ramer–Douglas–Peucker 简化，保留尖峰与谷底"""
    if len(pts) < 3:
        return pts
    keep = np.zeros(len(pts), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        p1 = pts[i]
        p2 = pts[j]
        seg = p2 - p1
        seg_len = np.hypot(seg[0], seg[1])
        if seg_len < 1e-9:
            d = np.hypot(pts[i + 1 : j, 0] - p1[0], pts[i + 1 : j, 1] - p1[1])
        else:
            d = np.abs(
                (pts[i + 1 : j, 0] - p1[0]) * seg[1] - (pts[i + 1 : j, 1] - p1[1]) * seg[0]
            ) / seg_len
        k = int(np.argmax(d)) + i + 1
        if d.max() > eps:
            keep[k] = True
            stack.append((i, k))
            stack.append((k, j))
    return pts[keep]


def catmull_path(pts, bottom):
    """Catmull-Rom → 三次贝塞尔（C1 连续），收口到 viewBox 底部"""
    n = len(pts)

    def p(i):
        return pts[0] if i < 0 else (pts[-1] if i >= n else pts[i])

    out = [f"M{pts[0][0]:g} {bottom}", f"L{pts[0][0]:g} {pts[0][1]:g}"]
    for i in range(n - 1):
        p0, p1, p2, p3 = p(i - 1), p(i), p(i + 1), p(i + 2)
        c1 = (p1[0] + (p2[0] - p0[0]) / 3.0, p1[1] + (p2[1] - p0[1]) / 3.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 3.0, p2[1] - (p3[1] - p1[1]) / 3.0)
        out.append(
            f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:g} {p2[1]:g}"
        )
    out.append(f"L{pts[-1][0]:g} {bottom}")
    out.append("Z")
    return " ".join(out)


# ==================== 配置 ====================

VB_W, VB_H = 1200, 660

LAYERS = [
    {
        "name": "far",
        "seed": 20261018,
        "y_top": 58,
        "y_base": 330,
        "N": 8,
        "q": 2.0,
        "H": 0.9,
        "p": 1.7,
        "gain": 1.9,
        "lam0": 0.13,
        "base_N": 5,
        "base_lam0": 0.6,
        "base_amp": 0.30,
        "ridge_amp": 1.0,
        "warp": 0.075,
        "warp_octaves": 3,
        "warp_freq_scale": 0.15,
        "lobes": [(0.18, 0.13), (0.45, 0.15), (0.72, 0.14), (0.93, 0.11)],
        "e0": 0.55,
        "e1": 0.45,
        "env_mu": 0.30,
        "env_floor": 0.24,
        "base": 0.05,
        "tilt": 0.05,
        "n_valleys": 3,
        "valley_w": 0.030,
        "valley_d": 0.16,
        "er_rounds": 34,
        "er_rate": 0.005,
        "th_rounds": 55,
        "max_vb_slope": 2.6,
        "final_slope": 2.4,
        "gamma": 1.10,
        "blur": 1.8,
        "lean": 0.05,
        "eps": 0.9,
    },
    {
        "name": "mid",
        "seed": 77311,
        "y_top": 196,
        "y_base": 438,
        "N": 7,
        "q": 2.0,
        "H": 0.86,
        "p": 1.5,
        "gain": 1.8,
        "lam0": 0.11,
        "base_N": 5,
        "base_lam0": 0.5,
        "base_amp": 0.32,
        "ridge_amp": 1.0,
        "warp": 0.065,
        "warp_octaves": 3,
        "warp_freq_scale": 0.15,
        "lobes": [(0.15, 0.12), (0.40, 0.14), (0.65, 0.14), (0.88, 0.11)],
        "e0": 0.58,
        "e1": 0.42,
        "env_mu": 0.30,
        "env_floor": 0.30,
        "base": 0.06,
        "tilt": 0.04,
        "n_valleys": 4,
        "valley_w": 0.026,
        "valley_d": 0.18,
        "er_rounds": 30,
        "er_rate": 0.004,
        "th_rounds": 80,
        "max_vb_slope": 2.1,
        "final_slope": 2.0,
        "gamma": 1.25,
        "blur": 2.2,
        "lean": -0.04,
        "eps": 0.9,
    },
    {
        "name": "near",
        "seed": 4099,
        "y_top": 360,
        "y_base": 566,
        "N": 6,
        "q": 2.0,
        "H": 0.80,
        "p": 1.3,
        "gain": 1.7,
        "lam0": 0.09,
        "base_N": 4,
        "base_lam0": 0.45,
        "base_amp": 0.38,
        "ridge_amp": 1.0,
        "warp": 0.055,
        "warp_octaves": 3,
        "warp_freq_scale": 0.15,
        "lobes": [(0.14, 0.12), (0.42, 0.14), (0.70, 0.14), (0.93, 0.11)],
        "e0": 0.62,
        "e1": 0.38,
        "env_mu": 0.30,
        "env_floor": 0.36,
        "base": 0.07,
        "tilt": 0.03,
        "n_valleys": 4,
        "valley_w": 0.024,
        "valley_d": 0.20,
        "er_rounds": 24,
        "er_rate": 0.004,
        "th_rounds": 110,
        "max_vb_slope": 1.5,
        "final_slope": 1.6,
        "gamma": 1.22,
        "blur": 2.8,
        "lean": 0.03,
        "eps": 0.9,
    },
]


def build_layer(cfg, n=6000):
    x, h, E = build_field(cfg["seed"], cfg, n)
    h, carved = carve_valleys(x, h, cfg)
    h = hydraulic_erode(h, cfg["er_rounds"], cfg["er_rate"])
    h = thermal_erode(
        h,
        cfg["th_rounds"],
        cfg["max_vb_slope"],
        amp_vb=cfg["y_base"] - cfg["y_top"],
        x_units=VB_W,
    )
    h = normalize(h)
    # 幂律提峰：把中间高度压下去 → 脊窄谷宽
    h = h ** cfg.get("gamma", 1.2)
    # 轻度平滑：磨掉脊状噪声的尖点（远处山脊受分辨率限制本就不该那么碎）
    h = smooth(h, cfg.get("blur", 2.0))
    h = normalize(h)
    h = lean(x, h, cfg["lean"])
    h = normalize(h)
    # 收尾：先 talus 松弛（碎石坡的自然形态），再硬性投影保证无近垂直的壁
    h = thermal_erode(h, 90, cfg["final_slope"], cfg["y_base"] - cfg["y_top"], VB_W)
    c = cfg["final_slope"] * (VB_W / (len(h) - 1)) / (cfg["y_base"] - cfg["y_top"])
    h = normalize(limit_slope(h, c))

    y = cfg["y_top"] + (1.0 - h) * (cfg["y_base"] - cfg["y_top"])
    pts = np.column_stack([x * VB_W, y])
    m = metrics(x, h)
    m["carved"] = carved
    m["raw_pts"] = len(pts)
    return pts, m


def ascii_render(profiles, width=150, rows=40):
    """按 z 序（far→mid→near）覆盖填充，得到实际可见的剪影"""
    grid = np.zeros((rows, width), dtype=int)  # 0 天空 / 1 far / 2 mid / 3 near
    for k, name in enumerate(["far", "mid", "near"], start=1):
        xs, ys = profiles[name]
        xi = np.clip((xs / VB_W * width).astype(int), 0, width - 1)
        yi = np.clip((ys / VB_H * rows).astype(int), 0, rows - 1)
        for c in range(width):
            col = yi[xi == c]
            if len(col) == 0:
                continue
            top = int(col.min())
            grid[top:, c] = k
    ch = np.array([" ", ".", "*", "#"])
    return "\n".join("".join(ch[row]) for row in grid)


def main():
    out_paths = {}
    profiles = {}
    for cfg in LAYERS:
        pts, m = build_layer(cfg)
        simplified = rdp(pts, cfg["eps"])
        path = catmull_path(simplified, VB_H)
        out_paths[cfg["name"]] = path
        # 用简化后的点做 ASCII（形态一致，点数少）
        xs = np.array([p[0] for p in simplified])
        ys = np.array([p[1] for p in simplified])
        # 细化到 ASCII 宽度
        xi = np.linspace(0, VB_W, 150)
        profiles[cfg["name"]] = (xi, np.interp(xi, xs, ys))
        print(
            f"[{cfg['name']:4s}] pts {m['raw_pts']}->{len(simplified)}  "
            f"path {len(path)}B  y {ys.min():.0f}..{ys.max():.0f}  "
            f"H={m['Hurst']} ridge_area={m['ridge_area']} kurt={m['slope_kurtosis']} "
            f"peaks={m['peaks']} maxslope={m['max_slope']}"
        )
        print(f"         valleys={m['carved']}")

    print("\n" + "=" * 100)
    print(ascii_render(profiles))
    print("=" * 100)

    with open("/tmp/mtn_paths.json", "w") as f:
        json.dump(out_paths, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
