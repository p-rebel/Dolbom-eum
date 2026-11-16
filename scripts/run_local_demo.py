"""Start a local-only demo with the built frontend and the real API."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
RUNTIME = ROOT / "var" / "local-demo"
HOST = "127.0.0.1"


def create_app():
    from starlette.datastructures import Headers
    from starlette.exceptions import HTTPException
    from starlette.staticfiles import StaticFiles

    from app.main import app

    class Frontend(StaticFiles):
        async def get_response(self, path, scope):
            try:
                response = await super().get_response(path, scope)
            except HTTPException as error:
                accept = Headers(scope=scope).get("accept", "")
                if error.status_code != 404 or Path(path).parts[:1] == ("api",) or "text/html" not in accept:
                    raise
                response = await super().get_response("index.html", scope)
            if response.headers.get("content-type", "").startswith("text/html"):
                response.headers["Cache-Control"] = "no-cache"
            return response

    app.mount("/", Frontend(directory=FRONTEND / "dist", html=True), name="frontend")
    return app


@contextmanager
def demo_lock():
    # The build and package installs use files shared by all runs in this checkout.
    with (RUNTIME / "run.lock").open("ab") as lock:
        try:
            if os.name == "nt":
                import msvcrt

                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise RuntimeError("이 저장소에서 이미 로컬 시연을 실행 중입니다.") from exc
        yield


def install_if_changed(source, version, marker, command, directory):
    digest = hashlib.sha256(version.encode("utf-8"))
    digest.update(source.read_bytes())
    signature = digest.hexdigest()
    if marker.is_file() and marker.read_text(encoding="utf-8") == signature:
        return
    subprocess.run(command, cwd=directory, check=True)
    marker.write_text(signature, encoding="utf-8")


def prepare_frontend(npm, node_version, official):
    install_if_changed(
        FRONTEND / "package-lock.json",
        node_version,
        FRONTEND / "node_modules" / ".dolbomeum-demo-lock",
        [npm, "ci", "--include=dev", "--no-audit", "--no-fund"],
        FRONTEND,
    )
    # 팀장 확정 디자인(공식 누리집 화면)으로 연다. 이 스크립트는 127.0.0.1에서만 열린다. --demo-labels면 '가상 사례 시연' 화면.
    env = {**os.environ, "VITE_USE_MOCK_API": "false", "VITE_OFFICIAL_SITE": "true" if official else "false"}
    subprocess.run([npm, "run", "build"], cwd=FRONTEND, env=env, check=True)


def prepare_backend():
    venv_dir = RUNTIME / "venv"
    python = venv_dir / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.is_file():
        venv.EnvBuilder(with_pip=True).create(venv_dir)
    requirements = BACKEND / "requirements.txt"
    install_if_changed(
        requirements,
        str(sys.version_info[:3]),
        venv_dir / ".dolbomeum-demo-lock",
        [python, "-m", "pip", "install", "--disable-pip-version-check", "-r", requirements],
        ROOT,
    )
    return python


def load_password():
    path = RUNTIME / "password.txt"
    if path.is_file():
        value = path.read_text(encoding="utf-8").strip()
        if len(value) < 8:
            raise RuntimeError(f"시연 비밀번호 파일을 확인해 주세요. {path}")
        return value
    value = secrets.token_urlsafe(12)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as file:
        file.write(value + "\n")
    return value


def run_demo(port, official=True):
    if sys.version_info < (3, 12):
        raise RuntimeError("Python 3.12 이상을 사용해 주세요.")
    node = shutil.which("node")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not node or not npm:
        raise RuntimeError("Node.js 22.12 이상과 npm을 설치한 뒤 다시 실행해 주세요.")
    node_version = subprocess.check_output([node, "--version"], text=True).strip()
    if tuple(int(part) for part in node_version.removeprefix("v").split(".")[:2]) < (22, 12):
        raise RuntimeError(f"Node.js 22.12 이상이 필요합니다. 현재 버전은 {node_version}입니다.")

    with socket.socket() as probe:
        probe.settimeout(0.5)
        if probe.connect_ex((HOST, port)) == 0:
            raise RuntimeError(f"{port} 포트를 사용 중입니다. --port로 다른 번호를 지정해 주세요.")

    RUNTIME.mkdir(parents=True, exist_ok=True)
    with demo_lock():
        python = prepare_backend()
        prepare_frontend(npm, node_version, official)
        password = load_password()
        origin = f"http://{HOST}:{port}"
        env = {
            **os.environ,
            "PYTHONPATH": str(BACKEND),
            "PYTHONUTF8": "1",
            "DOLBOMEUM_DB_PATH": str(RUNTIME / "demo.sqlite3"),
            "DOLBOMEUM_APP_ORIGINS": origin,
            "DOLBOMEUM_COOKIE_SECURE": "false",
        }
        subprocess.run([python, "-m", "app.db", "init"], cwd=ROOT, env=env, check=True)
        subprocess.run(
            [python, "-m", "app.db", "seed"], cwd=ROOT, env={**env, "DOLBOMEUM_DEMO_PASSWORD": password}, check=True,
        )
        subprocess.run([python, "-m", "app.db", "load-nhis"], cwd=ROOT, env=env, check=True)
        env.pop("DOLBOMEUM_DEMO_PASSWORD", None)

        print(f"\n로컬 시연 주소  {origin}/", flush=True)
        print("신청자  demo-applicant-a\n담당자  demo-town-a", flush=True)
        print(f"공통 로컬 비밀번호  {password}\n종료하려면 Ctrl+C를 누르세요.\n", flush=True)
        subprocess.run(
            [
                python, "-m", "uvicorn", "run_local_demo:create_app", "--factory",
                "--app-dir", SCRIPTS, "--host", HOST, "--port", str(port), "--workers", "1", "--no-proxy-headers",
            ],
            cwd=ROOT, env=env, check=True,
        )


def main():
    parser = argparse.ArgumentParser(description="돌봄e음 로컬 시연을 시작합니다.")
    parser.add_argument("--port", type=int, default=8080, help="로컬 접속 포트 (기본값 8080)")
    parser.add_argument("--demo-labels", action="store_true", help="공식 누리집 화면 대신 '가상 사례 시연' 표시로 연다")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port는 1~65535 사이의 번호여야 합니다.")
    try:
        run_demo(args.port, official=not args.demo_labels)
    except KeyboardInterrupt:
        return 0
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"로컬 시연 실행 실패. {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
