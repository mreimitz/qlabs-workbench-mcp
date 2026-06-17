import os
import pathlib

from markitdown import MarkItDown
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.responses import JSONResponse


def _csv_env(name: str, fallback: str) -> list[str]:
    raw = os.getenv(name, fallback)
    return [entry.strip() for entry in raw.split(",") if entry.strip()]


app = FastMCP(
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=os.getenv(
            "MARKITDOWN_DISABLE_DNS_REBINDING_PROTECTION", ""
        ).lower()
        not in {"1", "true", "yes", "on"},
        allowed_hosts=_csv_env("MARKITDOWN_ALLOWED_HOSTS", "127.0.0.1:*,localhost:*,mcp-markitdown:*"),
        allowed_origins=_csv_env("MARKITDOWN_ALLOWED_ORIGINS", "http://127.0.0.1:*,http://localhost:*"),
    )
)

storage_root = os.getenv("STORAGE_ROOT", "/data/storage")
max_input_bytes = int(os.getenv("MAX_MARKITDOWN_INPUT_BYTES", os.getenv("MAX_UPLOAD_BYTES", "10485760")))
md = MarkItDown()
app.settings.host = os.getenv("FASTMCP_HOST", "0.0.0.0")
app.settings.port = int(os.getenv("FASTMCP_PORT", os.getenv("PORT", "7020")))


def _safe_path(root: str, rel: str) -> str:
    raw = (rel or "").replace("\\", "/")
    if raw.startswith("/") or "\x00" in raw:
        raise ValueError("invalid path")
    parts = pathlib.PurePosixPath(raw).parts
    if ".." in parts:
        raise ValueError("invalid path")
    rel_norm = pathlib.PurePosixPath(raw).as_posix().lstrip("/")
    full = pathlib.Path(root).joinpath(rel_norm).resolve()
    root_full = pathlib.Path(root).resolve()
    if full != root_full and root_full not in full.parents:
        raise ValueError("invalid path")
    return full.as_posix()


def _assert_input_file(path: str) -> None:
    p = pathlib.Path(path)
    if not p.exists() or not p.is_file():
        raise FileNotFoundError("input file not found")
    size = p.stat().st_size
    if size > max_input_bytes:
        raise ValueError(f"input file too large: {size} bytes")


@app.custom_route("/health", methods=["GET"])
async def health(_request):
    root = pathlib.Path(storage_root)
    return JSONResponse(
        {
            "ok": True,
            "service": "mcp-markitdown",
            "version": "0.1.0",
            "configured": root.exists(),
            "storageRoot": storage_root,
            "maxInputBytes": max_input_bytes,
        }
    )


@app.tool()
def markitdown_convert(input_path: str, output_path: str | None = None) -> dict:
    full_in = _safe_path(storage_root, input_path)
    _assert_input_file(full_in)
    result = md.convert(full_in)
    markdown = result.text_content
    if output_path:
        if pathlib.PurePosixPath(output_path).suffix.lower() != ".md":
            raise ValueError("output_path must end with .md")
        full_out = _safe_path(storage_root, output_path)
        pathlib.Path(full_out).parent.mkdir(parents=True, exist_ok=True)
        pathlib.Path(full_out).write_text(markdown, encoding="utf-8")
        return {"ok": True, "output_path": output_path}
    return {"ok": True, "markdown": markdown}


if __name__ == "__main__":
    app.run(transport="streamable-http")
