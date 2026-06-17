import os
import pathlib

from markitdown import MarkItDown
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

app = FastMCP(
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False)
)

storage_root = os.getenv("STORAGE_ROOT", "/data/storage")
md = MarkItDown()
app.settings.host = os.getenv("FASTMCP_HOST", "0.0.0.0")
app.settings.port = int(os.getenv("FASTMCP_PORT", os.getenv("PORT", "7020")))


def _safe_path(root: str, rel: str) -> str:
    rel_norm = pathlib.PurePosixPath("/" + (rel or "")).as_posix().lstrip("/")
    full = pathlib.PurePosixPath(root).joinpath(rel_norm).as_posix()
    root_norm = pathlib.PurePosixPath(root).as_posix().rstrip("/") + "/"
    if not pathlib.PurePosixPath(full).as_posix().startswith(root_norm):
        raise ValueError("invalid path")
    return full


@app.tool()
def markitdown_convert(input_path: str, output_path: str | None = None) -> dict:
    full_in = _safe_path(storage_root, input_path)
    result = md.convert(full_in)
    markdown = result.text_content
    if output_path:
        full_out = _safe_path(storage_root, output_path)
        pathlib.Path(full_out).parent.mkdir(parents=True, exist_ok=True)
        pathlib.Path(full_out).write_text(markdown, encoding="utf-8")
        return {"ok": True, "output_path": output_path}
    return {"ok": True, "markdown": markdown}


if __name__ == "__main__":
    app.run(transport="streamable-http")
