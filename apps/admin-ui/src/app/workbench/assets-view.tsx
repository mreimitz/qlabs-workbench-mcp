"use client";

import Image from "next/image";
import type { ChangeEvent } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SectionHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  StatePanel,
} from "@brand/ui";
import { QpsAssetsBrowser } from "../qps-assets-browser";
import type { AssetRecord, ServerStatus } from "./types";

const isImageFile = (filename: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(filename);

export function AssetsView(props: {
  assetKeywordFilter: string;
  assetKeywords: string;
  assetTagDrafts: Record<string, string>;
  assetViewMode: "qps" | "uploaded";
  busy: boolean;
  filteredAssets: AssetRecord[];
  onAddAssetTags: (filename: string) => void;
  onAssetKeywordFilterChange: (value: string) => void;
  onAssetKeywordsChange: (value: string) => void;
  onAssetTagDraftChange: (filename: string, value: string) => void;
  onAssetViewModeChange: (value: "qps" | "uploaded") => void;
  onUploadAsset: (event: ChangeEvent<HTMLInputElement>) => void;
  qpsToolkitServer: ServerStatus | null;
  totalAssets: number;
}) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Assets"
        description="Browse QPS toolkit assets or manage uploaded assets and keyword tags."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Select value={props.assetViewMode} onValueChange={(value) => props.onAssetViewModeChange(value as "qps" | "uploaded")}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Asset source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="qps">QPS toolkit</SelectItem>
                <SelectItem value="uploaded">Uploaded</SelectItem>
              </SelectContent>
            </Select>
            {props.assetViewMode === "uploaded" ? (
              <Input
                className="w-72 max-w-full"
                placeholder="Filter assets by file or keyword"
                value={props.assetKeywordFilter}
                onChange={(event) => props.onAssetKeywordFilterChange(event.target.value)}
              />
            ) : (
              <Badge variant="secondary">
                {props.qpsToolkitServer?.configured ? "Toolkit mounted" : "Toolkit not mounted"}
              </Badge>
            )}
          </div>
        }
      />

      {props.assetViewMode === "qps" ? (
        <QpsAssetsBrowser
          enabled={Boolean(props.qpsToolkitServer?.enabled && props.qpsToolkitServer?.configured)}
          note={props.qpsToolkitServer?.note}
        />
      ) : (
        <UploadedAssets
          assetKeywords={props.assetKeywords}
          assetTagDrafts={props.assetTagDrafts}
          busy={props.busy}
          filteredAssets={props.filteredAssets}
          onAddAssetTags={props.onAddAssetTags}
          onAssetKeywordsChange={props.onAssetKeywordsChange}
          onAssetTagDraftChange={props.onAssetTagDraftChange}
          onUploadAsset={props.onUploadAsset}
          totalAssets={props.totalAssets}
        />
      )}
    </div>
  );
}

function UploadedAssets(props: {
  assetKeywords: string;
  assetTagDrafts: Record<string, string>;
  busy: boolean;
  filteredAssets: AssetRecord[];
  onAddAssetTags: (filename: string) => void;
  onAssetKeywordsChange: (value: string) => void;
  onAssetTagDraftChange: (filename: string, value: string) => void;
  onUploadAsset: (event: ChangeEvent<HTMLInputElement>) => void;
  totalAssets: number;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Uploaded asset registry</CardTitle>
              <CardDescription>Upload files once, tag them, and keep the shared catalog organized.</CardDescription>
            </div>
            <Badge variant="secondary">
              {props.totalAssets} total asset{props.totalAssets === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="asset-file">Upload asset</Label>
            <Input id="asset-file" type="file" onChange={props.onUploadAsset} disabled={props.busy} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="asset-keywords">Keywords</Label>
            <Input
              id="asset-keywords"
              placeholder="hero, screenshot, dark"
              value={props.assetKeywords}
              onChange={(event) => props.onAssetKeywordsChange(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {props.filteredAssets.map((asset) => (
          <Card key={asset.filename} className="min-w-0 overflow-hidden">
            <div className="border-b">
              {isImageFile(asset.filename) ? (
                <div className="relative aspect-[16/9] overflow-hidden bg-surface-muted">
                  <Image
                    fill
                    unoptimized
                    alt={asset.filename}
                    src={`/api/assets/files/${encodeURIComponent(asset.filename)}`}
                    className="object-cover"
                    sizes="(min-width: 1280px) 40vw, 100vw"
                  />
                </div>
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center bg-surface-muted text-xs font-medium uppercase text-muted-foreground">
                  File
                </div>
              )}
            </div>
            <CardHeader className="pb-3">
              <CardTitle className="truncate text-base">{asset.filename}</CardTitle>
              <CardDescription className="truncate font-mono text-xs">{asset.url}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {asset.keywords.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No keywords yet.</span>
                ) : (
                  asset.keywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary">
                      {keyword}
                    </Badge>
                  ))
                )}
              </div>
              <Separator />
              <div className="flex gap-2">
                <Input
                  placeholder="add,tags"
                  value={props.assetTagDrafts[asset.filename] ?? ""}
                  onChange={(event) => props.onAssetTagDraftChange(asset.filename, event.target.value)}
                />
                <Button
                  variant="outline-subtle"
                  onClick={() => props.onAddAssetTags(asset.filename)}
                  disabled={props.busy}
                >
                  Tag
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {props.filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <StatePanel
              kind="empty"
              title="No assets found"
              description="Try a different filter, or upload a new asset and add keywords."
            />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
