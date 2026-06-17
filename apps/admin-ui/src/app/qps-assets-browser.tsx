import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  ScrollArea,
  StatePanel,
  Separator,
} from "@brand/ui";

type BrowseEntry = { name: string; kind: "folder" | "file"; path: string };
type BrowsePayload = { path: string; entries: BrowseEntry[] };
type QpsMeta = {
  ok: boolean;
  write_mode?: "read-only" | "metadata";
  kind?: "icon" | "product" | "brand-art" | string;
  stat?: { size: number; mtimeMs: number };
  icon?: { tags?: string[] };
  product?: { tags?: string[] };
  art?: { tags?: string[] };
};

const isPreviewable = (name: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(name);

const fetchBrowse = async (targetPath: string) => {
  const response = await fetch(`/api/qps-assets/browse?path=${encodeURIComponent(targetPath)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Browse failed (${response.status})`);
  return (await response.json()) as BrowsePayload;
};

const fetchMeta = async (targetPath: string) => {
  const response = await fetch(`/api/qps-assets/meta?path=${encodeURIComponent(targetPath)}`, { cache: "no-store" });
  const payload = (await response.json()) as QpsMeta & { error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? `Meta failed (${response.status})`);
  return payload;
};

const saveMeta = async (targetPath: string, patch: unknown) => {
  const response = await fetch(`/api/qps-assets/meta?path=${encodeURIComponent(targetPath)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const payload = (await response.json()) as QpsMeta & { error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? `Save failed (${response.status})`);
  return payload;
};

const normTag = (t: string) => t.trim().toLowerCase();

export function QpsAssetsBrowser(props: { enabled: boolean; note?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "": true });
  const [browseByPath, setBrowseByPath] = useState<Record<string, BrowsePayload>>({});
  const [selectedFolder, setSelectedFolder] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [meta, setMeta] = useState<QpsMeta | null>(null);
  const [tagsDraft, setTagsDraft] = useState("");

  const loadPath = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      const payload = await fetchBrowse(path);
      setBrowseByPath((current) => ({ ...current, [path]: payload }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to browse");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!props.enabled) return;
    void loadPath("");
  }, [props.enabled]);

  useEffect(() => {
    if (!props.enabled) return;
    void loadPath(selectedFolder);
  }, [props.enabled, selectedFolder]);

  useEffect(() => {
    if (!selectedAsset || !props.enabled) {
      setMeta(null);
      setTagsDraft("");
      return;
    }
    setBusy(true);
    setError(null);
    fetchMeta(selectedAsset)
      .then((payload) => {
        setMeta(payload);
        const tags: string[] =
          payload.kind === "icon"
            ? payload.icon?.tags ?? []
            : payload.kind === "product"
              ? payload.product?.tags ?? []
              : payload.kind === "brand-art"
                ? payload.art?.tags ?? []
                : [];
        setTagsDraft(tags.join(", "));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load metadata"))
      .finally(() => setBusy(false));
  }, [props.enabled, selectedAsset]);

  const folderEntries = browseByPath[""]?.entries?.filter((e) => e.kind === "folder") ?? [];

  const galleryEntries = useMemo(() => {
    const entries = browseByPath[selectedFolder]?.entries ?? [];
    const q = filter.trim().toLowerCase();
    return entries
      .filter((e) => e.kind === "file")
      .filter((e) => (q ? e.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [browseByPath, selectedFolder, filter]);

  const toggleExpand = async (folderPath: string) => {
    const next = !expanded[folderPath];
    setExpanded((current) => ({ ...current, [folderPath]: next }));
    if (next && !browseByPath[folderPath]) {
      await loadPath(folderPath);
    }
  };

  const renderFolder = (entry: BrowseEntry, depth: number) => {
    const isExpanded = Boolean(expanded[entry.path]);
    const children = browseByPath[entry.path]?.entries?.filter((e) => e.kind === "folder") ?? [];
    const isSelected = selectedFolder === entry.path;
    return (
      <div key={entry.path}>
        <div className="flex items-center gap-2" style={{ paddingLeft: `${8 + depth * 14}px` }}>
          <Button
            type="button"
            size="sm"
            variant={isSelected ? "secondary" : "ghost"}
            className="h-auto flex-1 justify-start px-2 py-1"
            onClick={() => setSelectedFolder(entry.path)}
          >
            <span className="truncate">{entry.name}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto shrink-0 px-2 py-1"
            onClick={() => void toggleExpand(entry.path)}
          >
            <span className="text-xs text-muted-foreground">{isExpanded ? "−" : "+"}</span>
          </Button>
        </div>
        {isExpanded ? children.map((child) => renderFolder(child, depth + 1)) : null}
      </div>
    );
  };

  const saveTags = async () => {
    if (!selectedAsset || !meta) return;
    const tags = tagsDraft
      .split(",")
      .map(normTag)
      .filter((t) => t.length > 0);
    setBusy(true);
    setError(null);
    try {
      await saveMeta(selectedAsset, { tags });
      const updated = await fetchMeta(selectedAsset);
      setMeta(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save tags");
    } finally {
      setBusy(false);
    }
  };

  if (!props.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>QPS toolkit assets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <StatePanel
            kind="empty"
            title="QPS toolkit is not available"
            description={props.note ?? "mcp-qps-toolkit is not enabled or not configured."}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
      <Card className="h-[720px]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            Folders
            <Badge variant="secondary" className="font-mono text-xs">
              {selectedFolder || "/"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[660px] px-3 pb-3">
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                size="sm"
                variant={selectedFolder === "" ? "secondary" : "ghost"}
                className="h-auto w-full justify-start px-2 py-1"
                onClick={() => setSelectedFolder("")}
              >
                /
              </Button>
              {folderEntries.map((entry) => renderFolder(entry, 0))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="h-[720px]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            Gallery
            <Badge variant="secondary">{galleryEntries.length} file{galleryEntries.length === 1 ? "" : "s"}</Badge>
          </CardTitle>
          <Input placeholder="Filter files…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[612px] px-4 pb-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {galleryEntries.map((entry) => {
                const isSelected = selectedAsset === entry.path;
                return (
                  <Button
                    key={entry.path}
                    type="button"
                    onClick={() => setSelectedAsset(entry.path)}
                    variant="outline"
                    className={`h-auto w-full flex-col items-start justify-start gap-2 p-2 ${isSelected ? "ring-2 ring-ring" : ""}`}
                  >
                    <div className="relative aspect-square w-full overflow-hidden rounded-md bg-surface-muted">
                      {isPreviewable(entry.name) ? (
                        <Image
                          fill
                          unoptimized
                          alt={entry.name}
                          src={`/api/qps-assets/file?path=${encodeURIComponent(entry.path)}`}
                          className="object-contain"
                          sizes="(min-width: 1024px) 25vw, 50vw"
                        />
                      ) : (
                        <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">File</span>
                      )}
                    </div>
                    <div className="w-full truncate text-xs font-medium">{entry.name}</div>
                    <div className="w-full truncate font-mono text-xs text-muted-foreground">{entry.path}</div>
                  </Button>
                );
              })}
            </div>
            {galleryEntries.length === 0 ? (
              <div className="p-4">
                <StatePanel
                  kind="empty"
                  title="No files found"
                  description="Try a different folder or change the filter."
                />
              </div>
            ) : null}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="h-[720px]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            Details
            {meta?.kind ? <Badge variant="secondary">{meta.kind}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {busy ? <StatePanel kind="loading" size="sm" loadingLabel="Loading…" /> : null}
          {error ? <StatePanel kind="error" title="QPS toolkit error" description={error} /> : null}
          {selectedAsset ? (
            <div className="flex flex-col gap-2">
              <div className="font-mono text-xs text-muted-foreground">{selectedAsset}</div>
              {meta?.stat ? (
                <div className="text-xs text-muted-foreground">
                  {meta.stat.size} bytes · {new Date(meta.stat.mtimeMs).toLocaleString()}
                </div>
              ) : null}
            </div>
          ) : (
            <StatePanel
              kind="empty"
              title="Select an asset"
              description="Choose a file in the gallery to inspect metadata and manage tags."
            />
          )}

          {meta && (meta.kind === "icon" || meta.kind === "product" || meta.kind === "brand-art") ? (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">Tags</div>
                  <Button variant="outline-subtle" size="sm" onClick={saveTags} disabled={busy || meta.write_mode !== "metadata"}>
                    Save
                  </Button>
                </div>
                {meta.write_mode !== "metadata" ? (
                  <div className="text-xs text-muted-foreground">
                    Metadata writes are disabled for this toolkit mount.
                  </div>
                ) : null}
                <Input value={tagsDraft} onChange={(e) => setTagsDraft(e.target.value)} placeholder="comma,separated,tags" />
                <div className="flex flex-wrap gap-2">
                  {tagsDraft
                    .split(",")
                    .map(normTag)
                    .filter((t) => t.length > 0)
                    .slice(0, 30)
                    .map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
