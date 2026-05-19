import { useMemo, useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Cloud,
  Folder,
  GitBranch,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { api } from "@/lib/tauri";
import type { BranchInfo } from "@/lib/types";
import { useActiveTab, useRepo } from "@/store/repoStore";

interface TreeNode {
  name: string;
  fullPath: string;
  branch: BranchInfo | null;
  children: TreeNode[];
}

function buildTree(branches: BranchInfo[]): TreeNode {
  const root: TreeNode = {
    name: "",
    fullPath: "",
    branch: null,
    children: [],
  };
  for (const branch of branches) {
    const segments = branch.name.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    let node = root;
    let acc = "";
    segments.forEach((seg, i) => {
      acc = acc ? `${acc}/${seg}` : seg;
      let child = node.children.find((c) => c.name === seg);
      if (!child) {
        child = { name: seg, fullPath: acc, branch: null, children: [] };
        node.children.push(child);
      }
      if (i === segments.length - 1) {
        child.branch = branch;
      }
      node = child;
    });
  }
  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    const aFolder = a.children.length > 0;
    const bFolder = b.children.length > 0;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

/**
 * Walk every folder on the path leading to HEAD so we auto-expand the chain
 * containing the currently checked-out branch.
 */
function pathToHead(branches: BranchInfo[]): Set<string> {
  const head = branches.find((b) => b.is_head);
  const set = new Set<string>();
  if (!head) return set;
  const segments = head.name.split("/").filter(Boolean);
  let acc = "";
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i] ?? "";
    acc = acc ? `${acc}/${seg}` : seg;
    set.add(acc);
  }
  return set;
}

export function Sidebar() {
  const active = useActiveTab();
  const withBusy = useRepo((s) => s.withBusy);
  const reloadAll = useRepo((s) => s.reloadAll);

  const [openSections, setOpenSections] = useState({
    local: true,
    remote: true,
    stash: true,
  });
  const [toggledLocal, setToggledLocal] = useState<Set<string>>(new Set());
  const [toggledRemote, setToggledRemote] = useState<Set<string>>(new Set());

  const localBranches = useMemo(
    () => (active?.branches ?? []).filter((b) => b.kind === "local"),
    [active?.branches],
  );
  const remoteBranches = useMemo(
    () => (active?.branches ?? []).filter((b) => b.kind === "remote"),
    [active?.branches],
  );
  const localTree = useMemo(() => buildTree(localBranches), [localBranches]);
  const remoteTree = useMemo(() => buildTree(remoteBranches), [remoteBranches]);
  const headPaths = useMemo(
    () => pathToHead(active?.branches ?? []),
    [active?.branches],
  );

  if (!active) return null;
  const tabId = active.id;

  const checkout = async (b: BranchInfo) => {
    const target =
      b.kind === "remote" ? b.name.replace(/^[^/]+\//, "") : b.name;
    await withBusy(`Checking out ${target}...`, () =>
      api.checkoutBranch(tabId, target),
    );
    await reloadAll(tabId);
  };

  const toggleFolder = (
    set: Set<string>,
    setter: (s: Set<string>) => void,
    path: string,
  ) => {
    const next = new Set(set);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setter(next);
  };

  // Depth-0 folders default open, deeper levels closed; the path to HEAD is
  // always considered default-open. Toggled paths flip whatever the default is.
  const isFolderOpen = (
    path: string,
    depth: number,
    toggled: Set<string>,
  ): boolean => {
    const def = depth === 0 || headPaths.has(path);
    return toggled.has(path) ? !def : def;
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900/30 text-sm scrollbar-thin">
      <Section
        label="Local"
        icon={<GitBranch size={14} />}
        count={localBranches.length}
        open={openSections.local}
        onToggle={() =>
          setOpenSections((s) => ({ ...s, local: !s.local }))
        }
      >
        {localTree.children.length === 0 ? (
          <Empty text="No local branches" />
        ) : (
          localTree.children.map((node) => (
            <TreeBranch
              key={node.fullPath}
              node={node}
              depth={0}
              isOpen={(p, d) => isFolderOpen(p, d, toggledLocal)}
              onToggle={(p) =>
                toggleFolder(toggledLocal, setToggledLocal, p)
              }
              onActivate={(b) => void checkout(b)}
            />
          ))
        )}
      </Section>

      <Section
        label="Remote"
        icon={<Cloud size={14} />}
        count={remoteBranches.length}
        open={openSections.remote}
        onToggle={() =>
          setOpenSections((s) => ({ ...s, remote: !s.remote }))
        }
      >
        {remoteTree.children.length === 0 ? (
          <Empty text="No remote branches" />
        ) : (
          remoteTree.children.map((node) => (
            <TreeBranch
              key={node.fullPath}
              node={node}
              depth={0}
              isOpen={(p, d) => isFolderOpen(p, d, toggledRemote)}
              onToggle={(p) =>
                toggleFolder(toggledRemote, setToggledRemote, p)
              }
              onActivate={(b) => void checkout(b)}
            />
          ))
        )}
      </Section>

      <Section
        label="Stashes"
        icon={<Archive size={14} />}
        count={active.stashes.length}
        open={openSections.stash}
        onToggle={() =>
          setOpenSections((s) => ({ ...s, stash: !s.stash }))
        }
      >
        {active.stashes.map((s) => (
          <div
            key={s.sha}
            className="px-6 py-1 text-xs text-zinc-300"
            title={s.message}
          >
            <span className="font-mono text-zinc-500">
              stash@{`{${s.index}}`}
            </span>{" "}
            <span className="truncate">{s.message}</span>
          </div>
        ))}
        {active.stashes.length === 0 && <Empty text="No stashes" />}
      </Section>
    </aside>
  );
}

function Section({
  label,
  icon,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-800/60 py-1">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <span className="text-zinc-600">{count}</span>
      </button>
      {open && <div className="py-1">{children}</div>}
    </div>
  );
}

const INDENT_PX = 12;
const FIRST_INDENT_PX = 14;

function TreeBranch({
  node,
  depth,
  isOpen,
  onToggle,
  onActivate,
}: {
  node: TreeNode;
  depth: number;
  isOpen: (path: string, depth: number) => boolean;
  onToggle: (path: string) => void;
  onActivate: (branch: BranchInfo) => void;
}) {
  const isFolder = node.children.length > 0;
  const isLeafOnly = !isFolder && node.branch;
  const padLeft = FIRST_INDENT_PX + depth * INDENT_PX;

  if (isLeafOnly) {
    return (
      <BranchRow
        branch={node.branch!}
        padLeft={padLeft}
        onActivate={() => onActivate(node.branch!)}
      />
    );
  }

  const open = isOpen(node.fullPath, depth);

  return (
    <>
      <button
        onClick={() => onToggle(node.fullPath)}
        onDoubleClick={
          node.branch ? () => onActivate(node.branch!) : undefined
        }
        className={cn(
          "flex w-full items-center gap-1.5 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800/50",
          node.branch?.is_head && "bg-zinc-800/70 font-semibold text-zinc-50",
        )}
        style={{ paddingLeft: padLeft, paddingRight: 12 }}
        title={node.fullPath}
      >
        {open ? (
          <ChevronDown size={11} className="shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight size={11} className="shrink-0 text-zinc-500" />
        )}
        <Folder size={12} className="shrink-0 text-zinc-500" />
        <span className="truncate">{node.name}</span>
        <span className="ml-auto pl-2 text-[10px] text-zinc-600">
          {countLeaves(node)}
        </span>
      </button>
      {open &&
        node.children.map((child) => (
          <TreeBranch
            key={child.fullPath}
            node={child}
            depth={depth + 1}
            isOpen={isOpen}
            onToggle={onToggle}
            onActivate={onActivate}
          />
        ))}
    </>
  );
}

function countLeaves(node: TreeNode): number {
  if (node.children.length === 0) return node.branch ? 1 : 0;
  return node.children.reduce(
    (n, c) => n + countLeaves(c),
    node.branch ? 1 : 0,
  );
}

function BranchRow({
  branch,
  padLeft,
  onActivate,
}: {
  branch: BranchInfo;
  padLeft: number;
  onActivate: () => void;
}) {
  return (
    <button
      onDoubleClick={onActivate}
      className={cn(
        "flex w-full items-center gap-1.5 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800/50",
        branch.is_head && "bg-zinc-800/70 font-semibold text-zinc-50",
      )}
      style={{ paddingLeft: padLeft, paddingRight: 12 }}
      title={`${branch.full_ref}\nDouble-click to checkout`}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
        style={{ opacity: branch.is_head ? 1 : 0 }}
      />
      <GitBranch size={11} className="shrink-0 text-zinc-500" />
      <span className="truncate">{branch.name.split("/").pop() ?? branch.name}</span>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-6 py-1 text-xs italic text-zinc-600">{text}</div>;
}
