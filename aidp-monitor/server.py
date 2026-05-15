#!/usr/bin/env python3
"""AIDP Monitor: read-only local dashboard server.

Stdlib only. Does not write `.aidp/*`. Raw blocks are debug projections, not proof.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import shutil
import subprocess
import sys
# Keep the optional monitor from creating __pycache__/pyc artifacts in repositories.
sys.dont_write_bytecode = True
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

# Python may create a bytecode cache for the main script before runtime flags apply.
# The monitor is optional tooling and should not leave repo artifacts behind.
shutil.rmtree(Path(__file__).with_name("__pycache__"), ignore_errors=True)

BLOCK_RE = re.compile(
    r"<!--\s*aidp-monitor:start\s+([a-zA-Z0-9_\-]+)\s+v(\d+)\s*-->\s*```(?:yaml|yml)?\s*(.*?)\s*```\s*<!--\s*aidp-monitor:end\s*-->",
    re.DOTALL,
)

BLOCK_PATHS = {
    "aidp_state": ".aidp/work.md",
    "aidp_open_ledger": ".aidp/work.md",
    "aidp_routes_index": ".aidp/routes.md",
    "aidp_verification_index": ".aidp/verification.md",
    "aidp_blueprint_index": ".aidp/blueprint.md",
    "aidp_history_index": ".aidp/history.md",
}

FORBIDDEN_SCAN = [
    "AGENTS.md",
    "CLAUDE.md",
    ".github/copilot-instructions.md",
    "README.md",
    "START-HERE.md",
    "QUICK-INSTALL.md",
]

TEMP_GENERATED_PATTERNS = [
    ("tmp-or-temp", r"(^|/)(tmp|temp|\.tmp|\.temp)(/|$)|\.(tmp|temp)$"),
    ("cache", r"(^|/)(\.cache|cache|\.pytest_cache|\.mypy_cache|\.ruff_cache|__pycache__)(/|$)|\.pyc$"),
    ("coverage", r"(^|/)(coverage|\.coverage|htmlcov)(/|$)"),
    ("build-or-dist", r"(^|/)(build|dist|out|target)(/|$)"),
    ("logs", r"\.(log|trace)$|(^|/)(logs?)(/|$)"),
    ("snapshots", r"(^|/)(__snapshots__|snapshots?)(/|$)|\.(snap|snapshot)$"),
    ("generated", r"(^|/)(generated|gen|\.generated)(/|$)|\.(generated|gen)$"),
    ("backup-or-swap", r"(~$|\.(bak|backup|orig|swp|swo)$)"),
    ("database-file", r"\.(sqlite|sqlite3|db)$"),
]

ELEVATED_PATH_PATTERNS = [
    ("secrets", r"(^|/)(\.env|\.env\.|secrets?|credentials?|tokens?|keys?|certs?)(/|\.|$)"),
    ("deployment", r"(^|/)(deploy|deployment|production|prod|release|publish|k8s|kubernetes|terraform|helm)(/|\.|$)"),
    ("ci-cd", r"(^|/)(\.github/workflows|\.gitlab-ci\.yml|jenkinsfile|circleci|ci|cd)(/|\.|$)"),
    ("database-migration", r"(^|/)(migrations?|db|database|schema)(/|\.|$)"),
    ("infra", r"(^|/)(infra|infrastructure|dockerfile|docker-compose|compose\.ya?ml)(/|\.|$)"),
    ("package-publish", r"(^|/)(package\.json|pyproject\.toml|setup\.py|cargo\.toml|go\.mod|requirements\.txt|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$"),
]

PRODUCT_WRITE_PATTERNS = [
    ("app-source", r"(^|/)(apps?|src|source|services?|server|client|web|api|worker)(/|$)"),
    ("package-source", r"(^|/)(packages?|libs?|modules?)(/|$)"),
    ("database-or-schema", r"(^|/)(prisma|migrations?|db|database|schema)(/|$)"),
    ("tests", r"(^|/)(tests?|__tests__|specs?)(/|$)|\.(test|spec)\."),
    ("config-build", r"(^|/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|pyproject\.toml|go\.mod|cargo\.toml|tsconfig|vite\.config|next\.config|dockerfile|compose\.ya?ml|docker-compose)(\.|/|$)"),
]

DEFAULT_DOCUMENT_SOURCE_PATTERNS = [
    "docs/**",
    "specs/**",
    "requirements/**",
    "designs/**",
    "*.spec.md",
    "*.prd.md",
]

DEFAULT_EXCLUDED_PATH_PATTERNS = [
    "aidp-monitor/**",
    "aidp-monitor/",
    ".aidp.backup*/**",
    ".aidp.backup*",
]


def parse_scalar(value: str):
    value = value.strip()
    if value == "":
        return ""
    if value == "[]":
        return []
    if value == "{}":
        return {}
    low = value.lower()
    if low == "true":
        return True
    if low == "false":
        return False
    if low in ("null", "none"):
        return None
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    try:
        return int(value)
    except ValueError:
        return value


def strip_comment(line: str) -> str:
    in_single = False
    in_double = False
    for i, ch in enumerate(line):
        if ch == "'" and not in_double:
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double
        elif ch == "#" and not in_single and not in_double:
            return line[:i]
    return line


def tokenize(yaml_text: str):
    out = []
    for raw in yaml_text.splitlines():
        line = strip_comment(raw.rstrip("\n"))
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        out.append((indent, line.strip()))
    return out


def parse_yaml_like(yaml_text: str):
    tokens = tokenize(yaml_text)
    if not tokens:
        return {}

    def parse_node(i: int, indent: int):
        if i >= len(tokens):
            return None, i
        if tokens[i][0] == indent and tokens[i][1].startswith("- "):
            arr = []
            while i < len(tokens) and tokens[i][0] == indent and tokens[i][1].startswith("- "):
                content = tokens[i][1][2:].strip()
                i += 1
                if content == "":
                    child, i = parse_node(i, indent + 2)
                    arr.append(child)
                elif ":" in content:
                    key, val = content.split(":", 1)
                    obj = {key.strip(): parse_scalar(val.strip())}
                    while i < len(tokens) and tokens[i][0] > indent:
                        if tokens[i][0] == indent + 2 and not tokens[i][1].startswith("- "):
                            kline = tokens[i][1]
                            if ":" in kline:
                                k, v = kline.split(":", 1)
                                k = k.strip(); v = v.strip()
                                i += 1
                                if v == "":
                                    child, i = parse_node(i, indent + 4)
                                    obj[k] = child
                                else:
                                    obj[k] = parse_scalar(v)
                            else:
                                i += 1
                        else:
                            break
                    arr.append(obj)
                else:
                    arr.append(parse_scalar(content))
            return arr, i
        obj = {}
        while i < len(tokens) and tokens[i][0] == indent and not tokens[i][1].startswith("- "):
            content = tokens[i][1]
            if ":" not in content:
                i += 1
                continue
            key, val = content.split(":", 1)
            key = key.strip(); val = val.strip()
            i += 1
            if val == "":
                if i < len(tokens) and tokens[i][0] > indent:
                    child, i = parse_node(i, tokens[i][0])
                    obj[key] = child
                else:
                    obj[key] = None
            else:
                obj[key] = parse_scalar(val)
        return obj, i

    root, _ = parse_node(0, tokens[0][0])
    return root


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, UnicodeDecodeError):
        return ""


def extract_blocks(repo: Path):
    results = {}
    warnings = []
    for block_name, rel in BLOCK_PATHS.items():
        text = read_text(repo / rel)
        found = []
        for match in BLOCK_RE.finditer(text):
            name, version, body = match.groups()
            if name == block_name:
                found.append((version, body))
        if not found:
            results[block_name] = {"present": False, "path": rel, "data": None, "error": None}
            warnings.append({"level": "yellow", "message": f"Missing monitor block {block_name} in {rel}"})
            continue
        version, body = found[0]
        try:
            data = parse_yaml_like(body)
            results[block_name] = {"present": True, "path": rel, "version": version, "data": data, "error": None}
        except Exception as exc:  # noqa
            results[block_name] = {"present": True, "path": rel, "version": version, "data": None, "error": str(exc)}
            warnings.append({"level": "red", "message": f"Invalid monitor block {block_name} in {rel}: {exc}"})
    return results, warnings


def git_info(repo: Path):
    empty = {"is_git_repo": False, "status": [], "ignored_status": [], "changed_files": [], "ignored_files": [], "branch": None, "head": None}
    if not (repo / ".git").exists():
        return empty

    def run(args):
        try:
            return subprocess.run(args, cwd=str(repo), text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3).stdout
        except Exception:
            return ""

    status = run(["git", "status", "--porcelain"]).splitlines()
    # Ignored matching paths are useful for generated/cache artifacts, but filtered later.
    ignored_status = run(["git", "status", "--porcelain", "--ignored=matching"]).splitlines()
    changed = run(["git", "diff", "--name-only", "HEAD"]).splitlines()
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).strip() or None
    head = run(["git", "rev-parse", "--short", "HEAD"]).strip() or None
    ignored_files = _status_paths([ln for ln in ignored_status if ln.startswith("!!")])
    return {"is_git_repo": True, "status": status, "ignored_status": ignored_status, "changed_files": changed, "ignored_files": ignored_files, "branch": branch, "head": head}


def scan_forbidden_blocks(repo: Path):
    warnings = []
    for rel in FORBIDDEN_SCAN:
        p = repo / rel
        if p.exists() and BLOCK_RE.search(read_text(p)):
            warnings.append({"level": "red", "message": f"Monitor block found in forbidden location: {rel}"})
    hdocs = repo / "human-docs"
    if hdocs.exists():
        for p in hdocs.rglob("*.md"):
            if BLOCK_RE.search(read_text(p)):
                warnings.append({"level": "red", "message": f"Monitor block found in forbidden location: {p.relative_to(repo)}"})
    return warnings


def get_nested(data, *keys):
    cur = data
    for k in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def _norm(v):
    return str(v or "").strip().lower()


def _as_list(value):
    return value if isinstance(value, list) else []


def _status_paths(status_lines):
    paths = []
    for line in status_lines or []:
        if len(line) < 4:
            continue
        path = line[3:].strip()
        if " -> " in path:
            path = path.split(" -> ", 1)[1].strip()
        if path:
            paths.append(path)
    return paths


def _changed_paths(git):
    paths = set(git.get("changed_files") or [])
    paths.update(_status_paths(git.get("status") or []))
    return sorted(paths)


def _all_observable_paths(git):
    paths = set(_changed_paths(git))
    paths.update(git.get("ignored_files") or [])
    return sorted(paths)


def _matches_allowed(path, patterns):
    if not patterns:
        return True
    for pat in patterns:
        if not pat:
            continue
        if fnmatch.fnmatch(path, pat) or fnmatch.fnmatch(path, pat.rstrip("/") + "/*"):
            return True
    return False


def _all_match_allowed(paths, allowed_paths):
    if not paths or not allowed_paths:
        return False
    return all(_matches_allowed(p, allowed_paths) for p in paths)


def _path_hits(paths, patterns):
    hits = []
    for path in paths or []:
        low = path.lower()
        for label, pattern in patterns:
            if re.search(pattern, low):
                hits.append({"label": label, "path": path})
                break
    return hits


def detect_temp_generated_paths(paths):
    return _path_hits(paths, TEMP_GENERATED_PATTERNS)


def detect_elevated_paths(paths):
    return _path_hits(paths, ELEVATED_PATH_PATTERNS)

def detect_product_write_paths(paths):
    return _path_hits(paths, PRODUCT_WRITE_PATTERNS)


def load_os_config(repo: Path):
    data = parse_yaml_like(read_text(repo / ".aidp" / "os.yaml"))
    return data if isinstance(data, dict) else {}


def _extract_yaml_list_by_path(text: str, path):
    """Small fallback for repo os.yaml files that use common YAML list indentation."""
    keys = list(path)
    if len(keys) != 2:
        return []
    parent_key, child_key = keys
    in_parent = False
    parent_indent = 0
    in_child = False
    child_indent = 0
    values = []
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        stripped = raw.strip()
        if not in_parent:
            if stripped.startswith(f"{parent_key}:"):
                in_parent = True
                parent_indent = indent
            continue
        if indent <= parent_indent and not stripped.startswith("- "):
            break
        if not in_child:
            if indent > parent_indent and stripped.startswith(f"{child_key}:"):
                in_child = True
                child_indent = indent
            continue
        if indent <= child_indent and not stripped.startswith("- "):
            break
        if stripped.startswith("- "):
            value = stripped[2:].strip()
            if value:
                values.append(parse_scalar(value))
    return [str(v) for v in values if v]


def _document_source_patterns(repo: Path):
    cfg = load_os_config(repo)
    policy = cfg.get("document_intake_policy") if isinstance(cfg.get("document_intake_policy"), dict) else {}
    patterns = policy.get("source_paths") if isinstance(policy.get("source_paths"), list) else []
    if not patterns:
        patterns = _extract_yaml_list_by_path(read_text(repo / ".aidp" / "os.yaml"), ("document_intake_policy", "source_paths"))
    return [str(p) for p in patterns if p] or DEFAULT_DOCUMENT_SOURCE_PATTERNS

def _excluded_path_patterns(repo: Path):
    cfg = load_os_config(repo)
    project = cfg.get("project") if isinstance(cfg.get("project"), dict) else {}
    patterns = list(DEFAULT_EXCLUDED_PATH_PATTERNS)
    extra = project.get("excluded_paths") if isinstance(project.get("excluded_paths"), list) else []
    if not extra:
        extra = _extract_yaml_list_by_path(read_text(repo / ".aidp" / "os.yaml"), ("project", "excluded_paths"))
    patterns.extend(str(p) for p in extra if p)
    # Preserve order while deduplicating.
    out = []
    seen = set()
    for pat in patterns:
        normalized = pat.replace("\\", "/")
        if normalized not in seen:
            out.append(normalized)
            seen.add(normalized)
    return out


def _matches_excluded_path(path: str, patterns):
    normalized = path.replace("\\", "/")
    for pat in patterns or []:
        pat = pat.replace("\\", "/")
        if not pat:
            continue
        if pat.endswith("/**"):
            base = pat[:-3].rstrip("/")
            if normalized == base or normalized.startswith(base + "/"):
                return True
        if pat.endswith("/"):
            base = pat.rstrip("/")
            if normalized == base or normalized.startswith(base + "/"):
                return True
        if fnmatch.fnmatch(normalized, pat):
            return True
    return False


def _filter_excluded_paths(paths, patterns):
    return [p for p in (paths or []) if not _matches_excluded_path(p, patterns)]


def _matches_source_path(path: str, patterns):
    normalized = path.replace("\\", "/")
    for pat in patterns or []:
        if fnmatch.fnmatch(normalized, pat):
            return True
        if pat.endswith("/**") and normalized.startswith(pat[:-3].rstrip("/") + "/"):
            return True
    return False


def detect_document_paths(paths, patterns):
    hits = []
    for path in paths or []:
        if path.startswith(".aidp/"):
            continue
        if _matches_source_path(path, patterns):
            hits.append(path)
    return sorted(set(hits))


def _approval_ok(state):
    req = _norm(state.get("approval_required"))
    status = _norm(state.get("approval_status"))
    return req in ("no", "not-required", "false", "") or status == "approved"


def _severity_score(sev):
    return {"high": 4, "medium": 2, "low": 1}.get(_norm(sev), 1)


def _add_reason(reasons, signal, score, detail, level="info"):
    if score <= 0:
        return 0
    reasons.append({"signal": signal, "score": score, "detail": detail, "level": level})
    return score




def _work_md_structure_warnings(repo: Path):
    text = read_text(repo / ".aidp" / "work.md")
    warnings = []
    latest_count = len(re.findall(r"^##\s+(Latest Item|Current Item):", text, flags=re.MULTILINE | re.IGNORECASE))
    active_count = len(re.findall(r"^##\s+Active item\b", text, flags=re.MULTILINE | re.IGNORECASE))
    if latest_count > 1:
        warnings.append({"level": "yellow", "message": f"work.md contains {latest_count} Latest/Current item sections; keep one current active area and archive completed detail"})
    if active_count > 1:
        warnings.append({"level": "yellow", "message": f"work.md contains {active_count} Active item sections; live state may be ambiguous"})
    if len(text.splitlines()) > 1200:
        warnings.append({"level": "yellow", "message": "work.md is very large; it may be accumulating archive detail instead of live memory"})
    return warnings

def _context_manifest_refs(state):
    cm = state.get("context_manifest") if isinstance(state.get("context_manifest"), dict) else {}
    refs = []
    for key in ("implementation_refs", "verification_refs", "research_refs"):
        items = cm.get(key) if isinstance(cm.get(key), list) else []
        for item in items:
            if isinstance(item, dict):
                refs.append({"category": key, "ref": item.get("ref", ""), "reason": item.get("reason", "")})
            elif item:
                refs.append({"category": key, "ref": str(item), "reason": ""})
    return refs


def _context_manifest_required(route, phase):
    phase = _norm(phase)
    if route == "capability":
        return True
    if route in ("sweep", "delivery") and any(x in phase for x in ("broad", "boundary", "complex", "migration", "delivery", "package", "implementation", "write")):
        return True
    if route == "docs-operator" and any(x in phase for x in ("migration", "runtime", "router", "document-intake", "requirement-intake")):
        return True
    return False


def compute_warnings(blocks, git, repo: Path):
    warnings = []
    excluded_patterns = _excluded_path_patterns(repo)
    state = get_nested(blocks.get("aidp_state", {}).get("data"), "aidp_state") or {}
    routes_idx = get_nested(blocks.get("aidp_routes_index", {}).get("data"), "aidp_routes_index") or {}
    ledger = get_nested(blocks.get("aidp_open_ledger", {}).get("data"), "aidp_open_ledger") or {}

    lifecycle = state.get("lifecycle_mode")
    work_route = state.get("work_route")
    proof_status = state.get("proof_status")
    risk = state.get("risk")
    approval_required = state.get("approval_required")
    approval_status = state.get("approval_status")
    planning_required = state.get("planning_required")
    plan_status = state.get("plan_status")
    plan_summary = state.get("plan_summary")
    blueprint_context = state.get("blueprint_context")
    cleanup_required = state.get("cleanup_required")
    cleanup_status = state.get("cleanup_status")
    projection_status = state.get("projection_status")
    allowed_paths = state.get("allowed_paths") if isinstance(state.get("allowed_paths"), list) else []
    refs = state.get("refs") if isinstance(state.get("refs"), dict) else {}
    capabilities = ledger.get("capabilities") if isinstance(ledger.get("capabilities"), list) else []
    context_refs = _context_manifest_refs(state)

    routes = []
    if isinstance(routes_idx.get("routes"), list):
        routes = [r.get("route") for r in routes_idx["routes"] if isinstance(r, dict)]

    if lifecycle == "normal" and not work_route:
        warnings.append({"level": "red", "message": "Lifecycle is normal but work_route is missing"})
    if work_route and routes and work_route not in routes:
        warnings.append({"level": "red", "message": f"Work route {work_route!r} not found in routes index"})
    if projection_status not in ("current", "unknown", "stale", "invalid"):
        warnings.append({"level": "yellow", "message": "aidp_state projection_status is missing or not recognized"})
    if projection_status in ("stale", "unknown", "invalid"):
        warnings.append({"level": "yellow" if projection_status != "invalid" else "red", "message": f"aidp_state projection_status is {projection_status}"})
    if proof_status == "passed" and not refs.get("proof"):
        warnings.append({"level": "red", "message": "proof_status is passed but refs.proof is empty"})
    if risk == "high" and (approval_required != "yes" or approval_status != "approved"):
        warnings.append({"level": "red", "message": "High risk work lacks approved approval state"})
    if planning_required == "yes" and plan_status not in ("accepted-for-this-item", "superseded", "rejected"):
        warnings.append({"level": "yellow", "message": "Planning is required but plan_status is not accepted/superseded/rejected"})
    if planning_required == "yes" and plan_status == "accepted-for-this-item" and not plan_summary and not refs.get("plan"):
        warnings.append({"level": "yellow", "message": "Accepted planning has no plan_summary and refs.plan is empty"})
    if _context_manifest_required(work_route, state.get("route_phase")) and not context_refs:
        warnings.append({"level": "yellow", "message": f"Work route {work_route} should have refs-only context_manifest entries for this phase"})
    for c in context_refs:
        if not c.get("ref"):
            warnings.append({"level": "yellow", "message": f"Context manifest entry in {c.get('category')} is missing ref"})
    if blueprint_context == "checked" and not refs.get("blueprint"):
        warnings.append({"level": "yellow", "message": "Blueprint context is checked but refs.blueprint is empty"})
    if cleanup_required == "yes" and cleanup_status not in ("done", "retained"):
        warnings.append({"level": "red", "message": "Cleanup is required but cleanup_status is not done/retained"})
    if cleanup_status in ("done", "retained") and not refs.get("cleanup"):
        warnings.append({"level": "yellow", "message": "Cleanup status is done/retained but refs.cleanup is empty"})

    observable_paths = _filter_excluded_paths(_all_observable_paths(git), excluded_patterns)
    temp_hits = detect_temp_generated_paths(observable_paths)
    if temp_hits and cleanup_status in ("done", "retained"):
        # Retained/done cleanup can still be shown elsewhere, but should not spam warnings.
        pass
    elif temp_hits and cleanup_required == "yes" and cleanup_status not in ("done", "retained"):
        sample = ", ".join([h["path"] for h in temp_hits[:6]])
        warnings.append({"level": "red", "message": "Temporary/generated artifacts detected and cleanup is not complete: " + sample})
    elif temp_hits:
        labels = sorted({h["label"] for h in temp_hits})
        sample = ", ".join([f"{h['label']}:{h['path']}" for h in temp_hits[:6]])
        all_allowed = bool(allowed_paths) and all(_matches_allowed(h["path"], allowed_paths) for h in temp_hits)
        level = "yellow" if not all_allowed else "info"
        prefix = "Advisory: possible temporary/generated artifacts detected without cleanup tracking"
        if all_allowed:
            prefix = "Advisory: temporary/generated-looking artifacts are within allowed paths but cleanup tracking is not active"
        warnings.append({"level": level, "message": prefix + " (" + ", ".join(labels) + "): " + sample})

    if work_route == "capability" and not capabilities:
        warnings.append({"level": "yellow", "message": "Work route is capability but aidp_open_ledger.capabilities is empty"})
    for cap in capabilities:
        if not isinstance(cap, dict):
            continue
        stages = cap.get("stages") if isinstance(cap.get("stages"), list) else []
        stage_ids = {st.get("id") for st in stages if isinstance(st, dict)}
        current_stage = cap.get("current_stage")
        if current_stage and current_stage not in stage_ids:
            warnings.append({"level": "yellow", "message": f"Capability {cap.get('id','<unknown>')} current_stage {current_stage!r} is not listed in stages"})
        cap_proof_status = cap.get("capability_proof_status") or cap.get("proof_status")
        if cap.get("proof_status") and not cap.get("capability_proof_status"):
            warnings.append({"level": "yellow", "message": f"Capability {cap.get('id','<unknown>')} uses ambiguous proof_status; prefer capability_proof_status"})
        if cap_proof_status == "passed" and not cap.get("capability_proof_ref"):
            warnings.append({"level": "red", "message": f"Capability {cap.get('id','<unknown>')} proof is passed but capability_proof_ref is empty"})
        for st in stages:
            if not isinstance(st, dict):
                continue
            if st.get("status") == "done" and st.get("proof_status") != "passed":
                warnings.append({"level": "red", "message": f"Stage {st.get('id','<unknown>')} is done but proof_status is not passed"})
            if st.get("proof_status") == "passed" and not st.get("proof_ref"):
                warnings.append({"level": "yellow", "message": f"Stage {st.get('id','<unknown>')} proof passed but proof_ref is empty"})

    if git.get("is_git_repo") and git.get("status"):
        status_paths = _filter_excluded_paths(_status_paths(git.get("status", [])), excluded_patterns)
        if status_paths:
            warnings.append({"level": "yellow", "message": f"Git worktree has {len(status_paths)} changed project entries"})
            if state.get("item_status") == "done":
                warnings.append({"level": "yellow", "message": "Item is done but git worktree is dirty; explain/accept/park changes or mark awaiting operator review before archive"})
            product_hits = detect_product_write_paths(status_paths)
            non_product_routes = {"docs-operator", "audit", "bootstrap", ""}
            if product_hits and (work_route in non_product_routes or lifecycle == "repair"):
                sample = ", ".join([h["path"] for h in product_hits[:8]])
                warnings.append({"level": "red", "message": f"Product/source/config/test files changed while work_route={work_route!r} lifecycle={lifecycle!r}: {sample}"})
            if product_hits and not state.get("active_item_id"):
                warnings.append({"level": "red", "message": "Product/source/config/test files changed but aidp_state.active_item_id is empty"})
            if allowed_paths:
                outside = [p for p in status_paths if not _matches_allowed(p, allowed_paths)]
                if outside:
                    warnings.append({"level": "red", "message": "Changed files outside aidp_state.allowed_paths: " + ", ".join(outside[:10])})
    history = get_nested(blocks.get("aidp_history_index", {}).get("data"), "aidp_history_index") or {}
    hist_ids = {str(e.get("id")) for e in _as_list(history.get("recent_entries")) if isinstance(e, dict) and e.get("id")}
    active_id = state.get("active_item_id")
    phase = _norm(state.get("route_phase"))
    if state.get("item_status") == "done" and active_id and str(active_id) not in hist_ids and not any(x in phase for x in ("review", "archive", "handoff", "delivery")):
        warnings.append({"level": "yellow", "message": "Done active item is not archived and has no review/archive/delivery phase reason"})
    return warnings


def compute_derived_signals(blocks, git, base_warnings, repo: Path):
    state = get_nested(blocks.get("aidp_state", {}).get("data"), "aidp_state") or {}
    ledger = get_nested(blocks.get("aidp_open_ledger", {}).get("data"), "aidp_open_ledger") or {}
    history = get_nested(blocks.get("aidp_history_index", {}).get("data"), "aidp_history_index") or {}

    route = state.get("work_route")
    phase = _norm(state.get("route_phase"))
    risk = _norm(state.get("risk"))
    proof_status = _norm(state.get("proof_status"))
    planning_required = _norm(state.get("planning_required"))
    plan_status = state.get("plan_status")
    plan_summary = state.get("plan_summary")
    blueprint_context = state.get("blueprint_context")
    refs = state.get("refs") if isinstance(state.get("refs"), dict) else {}
    capabilities = ledger.get("capabilities") if isinstance(ledger.get("capabilities"), list) else []
    context_refs = _context_manifest_refs(state)
    excluded_patterns = _excluded_path_patterns(repo)
    paths = _filter_excluded_paths(_all_observable_paths(git), excluded_patterns)

    elevated_hits = detect_elevated_paths(paths)
    temp_hits = detect_temp_generated_paths(paths)
    action_warnings = []
    if elevated_hits or risk == "high" or route == "delivery":
        level = "elevated"
        confidence = "medium" if git.get("is_git_repo") else "low"
    elif route in ("bugfix", "sweep", "capability") or _changed_paths(git):
        level = "limited"
        confidence = "medium" if git.get("is_git_repo") else "low"
    elif route in ("micro-patch", "docs-operator", "audit", "bootstrap"):
        level = "local"
        confidence = "medium"
    else:
        level = "unknown"
        confidence = "low"
    if level == "elevated" and not _approval_ok(state):
        action_warnings.append({"level": "red" if risk == "high" or any(h["label"] in ("secrets", "deployment") for h in elevated_hits) else "yellow", "message": "Derived action boundary appears elevated but approval is not approved/not-required"})
    if elevated_hits:
        labels = sorted({h["label"] for h in elevated_hits})
        action_warnings.append({"level": "yellow", "message": "Derived action boundary detected sensitive/elevated changed paths: " + ", ".join(labels)})
    if temp_hits and state.get("cleanup_required") != "yes" and state.get("cleanup_status") not in ("done", "retained"):
        labels = sorted({h["label"] for h in temp_hits})
        temp_paths = [h["path"] for h in temp_hits]
        level_for_temp = "info" if _all_match_allowed(temp_paths, state.get("allowed_paths") if isinstance(state.get("allowed_paths"), list) else []) else "yellow"
        action_warnings.append({"level": level_for_temp, "message": "Advisory derived cleanup/action warning: temp/generated artifacts visible without cleanup tracking: " + ", ".join(labels)})
    action_boundary = {
        "level": level,
        "confidence": confidence,
        "source": "inferred",
        "indicators": (elevated_hits + temp_hits)[:20],
        "warnings": action_warnings,
        "not_canonical_truth": True, "claim_requires_current_monitor_or_local_computation": True,
    }

    plan_required = planning_required == "yes" or route in ("capability", "bootstrap", "audit")
    reasons = []
    if not plan_required or route == "micro-patch":
        plan_state = "not-required"
    else:
        if _norm(plan_status) != "accepted-for-this-item":
            reasons.append("plan-not-accepted-for-this-item")
        if not plan_summary and not refs.get("plan"):
            reasons.append("missing-plan-summary-or-ref")
        if route == "capability":
            if not context_refs:
                reasons.append("missing-context-manifest-refs")
            if not capabilities:
                reasons.append("capability-without-capability-stage-projection")
            elif not any(isinstance(c, dict) and c.get("stages") for c in capabilities):
                reasons.append("capability-without-stage-list")
        if route in ("capability", "sweep", "delivery") and blueprint_context in ("unchecked", "gap", "unknown", None, ""):
            reasons.append("blueprint-context-not-checked-or-not-applicable")
        if route in ("capability", "sweep", "delivery", "docs-operator") and proof_status in ("unknown", "", None):
            reasons.append("proof-strategy-or-status-unknown")
        plan_state = "sufficient" if not reasons else "weak"
    plan_warnings = []
    if plan_state == "weak":
        lvl = "red" if route == "capability" and phase in ("implementation", "write", "coding", "execution") else "yellow"
        plan_warnings.append({"level": lvl, "message": "Derived plan sufficiency is weak: " + ", ".join(reasons[:6])})
    plan_sufficiency = {
        "status": plan_state,
        "confidence": "medium" if plan_state != "unknown" else "low",
        "source": "inferred",
        "reasons": reasons,
        "warnings": plan_warnings,
        "not_canonical_truth": True, "claim_requires_current_monitor_or_local_computation": True,
    }

    candidates = []
    repeated = _as_list(ledger.get("repeated_failed_attempts"))
    for i, item in enumerate(repeated[:10], 1):
        detail = item.get("reason") if isinstance(item, dict) else str(item)
        candidates.append({"id": f"DER-PC-FAILED-{i}", "reason": "repeated failed attempt" + (f": {detail}" if detail else ""), "suggested_artifact": "verification-checklist", "confidence": "medium", "source": "inferred", "status": "suggested-only"})
    if route == "bugfix" and proof_status in ("failed", "partial", "unavailable"):
        candidates.append({"id": "DER-PC-BUGFIX-PROOF", "reason": f"bugfix route has proof_status={proof_status}", "suggested_artifact": "regression-test", "confidence": "medium", "source": "inferred", "status": "suggested-only"})
    pending = _as_list(ledger.get("pending_proofs"))
    if len(pending) >= 3:
        candidates.append({"id": "DER-PC-PENDING-PROOFS", "reason": f"{len(pending)} pending proofs accumulated", "suggested_artifact": "verification-checklist", "confidence": "medium", "source": "inferred", "status": "suggested-only"})
    recent = _as_list(history.get("recent_entries"))
    bugfix_count = sum(1 for x in recent if isinstance(x, dict) and x.get("route") == "bugfix")
    if bugfix_count >= 3:
        candidates.append({"id": "DER-PC-REPEATED-BUGFIX", "reason": f"{bugfix_count} recent bugfix history entries", "suggested_artifact": "regression-test", "confidence": "low", "source": "inferred", "status": "suggested-only"})
    for w in base_warnings or []:
        msg = w.get("message", "") if isinstance(w, dict) else str(w)
        if "proof_status is passed but refs.proof is empty" in msg:
            candidates.append({"id": "DER-PC-PROOF-REF", "reason": "proof passed without proof reference warning", "suggested_artifact": "manual-proof-recipe", "confidence": "high", "source": "inferred", "status": "suggested-only"})
            break
    proof_warnings = []
    if candidates:
        proof_warnings.append({"level": "yellow", "message": f"Derived proof candidates suggested: {len(candidates)}"})
    proof_candidates = {"items": candidates[:20], "count": len(candidates), "source": "inferred", "not_canonical_truth": True, "claim_requires_current_monitor_or_local_computation": True, "warnings": proof_warnings}

    warnings = []
    warnings.extend(action_warnings)
    warnings.extend(plan_warnings)
    warnings.extend(proof_warnings)
    return {"action_boundary": action_boundary, "plan_sufficiency": plan_sufficiency, "proof_candidates": proof_candidates, "warnings": warnings, "not_canonical_truth": True}


def compute_document_intake(repo: Path, blocks, git):
    patterns = _document_source_patterns(repo)
    excluded_patterns = _excluded_path_patterns(repo)
    raw_changed_docs = detect_document_paths(_filter_excluded_paths(_changed_paths(git), excluded_patterns), patterns)
    expanded_docs = []
    for path in raw_changed_docs:
        candidate = repo / path
        if path.endswith("/") and candidate.is_dir():
            for child in candidate.rglob("*"):
                if child.is_file():
                    rel = str(child.relative_to(repo)).replace("\\", "/")
                    if _matches_source_path(rel, patterns):
                        expanded_docs.append(rel)
        else:
            expanded_docs.append(path)
    changed_docs = sorted(set(expanded_docs))
    ledger = get_nested(blocks.get("aidp_open_ledger", {}).get("data"), "aidp_open_ledger") or {}
    entries = _as_list(ledger.get("document_intake"))
    tracked = []
    active_sources = set()
    candidate_awaiting = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        src = entry.get("source_document") or entry.get("source") or entry.get("path")
        status = _norm(entry.get("status"))
        rec = dict(entry)
        tracked.append(rec)
        operator_decision = rec.get("operator_decision") or rec.get("decision")
        if src and status not in ("approved", "partially-approved", "rejected", "superseded"):
            active_sources.add(str(src))
        if status in ("observed", "candidate-prepared") and not operator_decision:
            candidate_awaiting.append(rec)
    pending = [p for p in changed_docs if p not in active_sources]
    warnings = []
    if pending:
        sample = ", ".join(pending[:6])
        warnings.append({"level": "yellow", "message": f"New/changed document(s) may need AIDP document intake: {sample}"})
    if candidate_awaiting:
        warnings.append({"level": "yellow", "message": f"Document intake candidate(s) awaiting operator decision: {len(candidate_awaiting)}"})
    return {
        "source_paths": patterns,
        "changed_documents": changed_docs,
        "tracked_intake": tracked,
        "pending_documents": pending,
        "candidate_awaiting_approval": candidate_awaiting,
        "operator_warning_required": bool(pending or candidate_awaiting),
        "recommended_route": "docs-operator" if (pending or candidate_awaiting) else "none",
        "recommended_phase": "document-intake" if (pending or candidate_awaiting) else "none",
        "not_canonical_truth": True,
        "warnings": warnings,
    }


def compute_consolidation_pressure(blocks, git, warnings, repo: Path):
    score = 0
    reasons = []
    ledger = get_nested(blocks.get("aidp_open_ledger", {}).get("data"), "aidp_open_ledger") or {}
    blueprint = get_nested(blocks.get("aidp_blueprint_index", {}).get("data"), "aidp_blueprint_index") or {}
    history = get_nested(blocks.get("aidp_history_index", {}).get("data"), "aidp_history_index") or {}
    state = get_nested(blocks.get("aidp_state", {}).get("data"), "aidp_state") or {}
    excluded_patterns = _excluded_path_patterns(repo)
    counted_risk_ids = set()

    parked = _as_list(ledger.get("parked_items"))
    if parked:
        score += _add_reason(reasons, "parked_items", len(parked), f"{len(parked)} parked item(s)")
        missing_review = [x for x in parked if isinstance(x, dict) and not x.get("review_trigger")]
        if missing_review:
            score += _add_reason(reasons, "parked_items_without_review_trigger", 2 * len(missing_review), f"{len(missing_review)} parked item(s) without review_trigger", "yellow")
    pending = _as_list(ledger.get("pending_proofs"))
    if pending:
        score += _add_reason(reasons, "pending_proofs", 2 * len(pending), f"{len(pending)} pending proof(s)", "yellow")
    blockers = _as_list(ledger.get("blockers"))
    if blockers:
        score += _add_reason(reasons, "open_blockers", 3 * len(blockers), f"{len(blockers)} open blocker(s)", "yellow")
    cleanup = _as_list(ledger.get("cleanup_obligations"))
    if cleanup:
        score += _add_reason(reasons, "cleanup_obligations", 3 * len(cleanup), f"{len(cleanup)} cleanup obligation(s)", "yellow")
    observable_paths = _filter_excluded_paths(_all_observable_paths(git), excluded_patterns)
    temp_hits = detect_temp_generated_paths(observable_paths)
    if temp_hits and not (state.get("cleanup_required") == "yes" or state.get("cleanup_status") in ("done", "retained")):
        labels = sorted({h["label"] for h in temp_hits})
        allowed_paths = state.get("allowed_paths") if isinstance(state.get("allowed_paths"), list) else []
        all_allowed = bool(allowed_paths) and all(_matches_allowed(h["path"], allowed_paths) for h in temp_hits)
        score += _add_reason(reasons, "possible_temp_generated_artifacts_without_cleanup_tracking", 1 if all_allowed else 2, "Advisory: possible temp/generated artifacts without cleanup tracking: " + ", ".join(labels), "info" if all_allowed else "yellow")
    repeated = _as_list(ledger.get("repeated_failed_attempts"))
    if repeated:
        score += _add_reason(reasons, "repeated_failed_attempts", 2 * len(repeated), f"{len(repeated)} repeated failed attempt(s)", "yellow")
    candidates = _as_list(ledger.get("consolidation_candidates"))
    if candidates:
        score += _add_reason(reasons, "consolidation_candidates", len(candidates), f"{len(candidates)} consolidation candidate(s)")
    for idx, risk in enumerate(_as_list(ledger.get("open_risks"))):
        if isinstance(risk, dict):
            rid = risk.get("id") or f"__ledger_risk_{idx}"
            counted_risk_ids.add(str(rid))
            sev = risk.get("severity") or risk.get("risk")
            score += _add_reason(reasons, "open_risks", _severity_score(sev), f"open risk {risk.get('id','<unknown>')} severity={sev or 'unknown'}", "red" if sev == "high" else "yellow")
            if not risk.get("mitigation"):
                score += _add_reason(reasons, "open_risk_without_mitigation", 2, f"open risk {risk.get('id','<unknown>')} has no mitigation", "yellow")
            if not risk.get("review_trigger"):
                score += _add_reason(reasons, "open_risk_without_review_trigger", 1, f"open risk {risk.get('id','<unknown>')} has no review_trigger")
    for idx, risk in enumerate(_as_list(blueprint.get("durable_risks"))):
        if isinstance(risk, dict) and risk.get("status") == "open":
            rid = str(risk.get("id") or f"__blueprint_risk_{idx}")
            if rid in counted_risk_ids:
                continue
            counted_risk_ids.add(rid)
            score += _add_reason(reasons, "blueprint_open_durable_risk", _severity_score(risk.get("severity")), f"blueprint risk {risk.get('id','<unknown>')} open", "red" if risk.get("severity") == "high" else "yellow")
    for entry in _as_list(history.get("recent_entries")):
        if isinstance(entry, dict) and entry.get("lesson_candidate") in ("yes", True):
            score += _add_reason(reasons, "lesson_candidates", 1, f"history lesson candidate {entry.get('id','<unknown>')}")
    for w in warnings or []:
        msg = w.get("message", "") if isinstance(w, dict) else str(w)
        if "New/changed document(s) may need AIDP document intake" in msg:
            score += _add_reason(reasons, "pending_document_intake", 2, msg, "yellow")
        elif "Document intake candidate(s) awaiting operator decision" in msg:
            score += _add_reason(reasons, "document_intake_candidates_awaiting_approval", 3, msg, "yellow")
        elif any(marker in msg for marker in ["proof_status is passed", "High risk work lacks", "Cleanup is required", "Advisory: possible temporary/generated artifacts", "Possible temporary/generated artifacts detected", "Invalid monitor block", "Changed files outside aidp_state.allowed_paths"]):
            score += _add_reason(reasons, "monitor_warning", 3, msg, w.get("level", "yellow") if isinstance(w, dict) else "yellow")
    critical = any(r["signal"] in ("monitor_projection_contradiction", "invalid_monitor_block") or r["level"] == "red" and r["score"] >= 3 for r in reasons)
    if critical or score >= 16:
        level = "critical"
    elif score >= 9:
        level = "high"
    elif score >= 4:
        level = "medium"
    else:
        level = "low"
    prompt = ""
    if level in ("high", "critical"):
        prompt = (
            "Проведи memory consolidation review по AIDP. Работай read-only сначала. "
            "Используй work route: audit. Проверь parked items, open risks, pending proofs, repeated failed attempts, "
            "history index, blueprint risks, cleanup obligations, temp/generated artifact warnings и monitor warnings. "
            "Не меняй owner files без отдельного approval; accepted fixes выполняй через docs-operator или repair."
        )
    return {"score": score, "level": level, "reasons": reasons[:50], "operator_warning_required": level in ("high", "critical"), "agent_warning_required": level in ("high", "critical"), "recommended_route": "audit" if level in ("high", "critical") else "none", "prompt": prompt, "not_canonical_truth": True}


def build_snapshot(repo: Path):
    blocks, warnings = extract_blocks(repo)
    warnings.extend(scan_forbidden_blocks(repo))
    warnings.extend(_work_md_structure_warnings(repo))
    git = git_info(repo)
    warnings.extend(compute_warnings(blocks, git, repo))
    document_intake = compute_document_intake(repo, blocks, git)
    warnings.extend(document_intake.get("warnings", []))
    derived_signals = compute_derived_signals(blocks, git, warnings, repo)
    warnings.extend(derived_signals.get("warnings", []))
    consolidation_pressure = compute_consolidation_pressure(blocks, git, warnings, repo)
    if consolidation_pressure.get("level") in ("high", "critical"):
        warnings.append({"level": "red" if consolidation_pressure.get("level") == "critical" else "yellow", "message": f"Consolidation pressure is {consolidation_pressure.get('level')} (score={consolidation_pressure.get('score')}); operator warning recommended"})
    return {"repo": str(repo), "ts": time.time(), "monitor_source": "current-projections-plus-git", "blocks": blocks, "git": git, "warnings": warnings, "consolidation_pressure": consolidation_pressure, "derived_signals": derived_signals, "document_intake": document_intake}


class Handler(BaseHTTPRequestHandler):
    repo: Path = Path.cwd()
    index_path: Path = Path(__file__).with_name("index.html")

    def _send(self, code: int, body: bytes, content_type: str):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            self._send(200, read_text(self.index_path).encode("utf-8"), "text/html; charset=utf-8")
            return
        if path == "/api/state":
            body = json.dumps(build_snapshot(self.repo), ensure_ascii=False, indent=2).encode("utf-8")
            self._send(200, body, "application/json; charset=utf-8")
            return
        self._send(404, b"not found", "text/plain")

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def _check_failure_keywords():
    return [
        "Invalid monitor block",
        "Lifecycle is normal but work_route is missing",
        "not found in routes index",
        "proof_status is passed but refs.proof is empty",
        "High risk work lacks approved approval state",
        "Cleanup is required but cleanup_status is not done/retained",
        "Cleanup status is done/retained but refs.cleanup is empty",
        "capability_proof_ref is empty",
        "Stage ",
        "Changed files outside aidp_state.allowed_paths",
        "Product/source/config/test files changed",
    ]


def classify_check(snapshot, strict=False):
    failures = []
    warnings = []
    info = []

    for block_name, block in (snapshot.get("blocks") or {}).items():
        if block.get("error"):
            failures.append({"source": "monitor-block", "level": "red", "message": f"{block_name} block parse/validation error: {block.get('error')}"})
        elif not block.get("present"):
            warnings.append({"source": "monitor-block", "level": "yellow", "message": f"{block_name} block is missing"})
        else:
            info.append({"source": "monitor-block", "level": "info", "message": f"{block_name} block present"})

    keywords = _check_failure_keywords()
    for w in snapshot.get("warnings") or []:
        msg = str(w.get("message", "")) if isinstance(w, dict) else str(w)
        level = str(w.get("level", "yellow")) if isinstance(w, dict) else "yellow"
        item = dict(w) if isinstance(w, dict) else {"level": level, "message": msg}
        if level == "red" or any(k in msg for k in keywords):
            failures.append(item)
        elif level == "yellow":
            warnings.append(item)
        else:
            info.append(item)

    pressure = snapshot.get("consolidation_pressure") or {}
    if pressure:
        level = pressure.get("level")
        info.append({"source": "consolidation_pressure", "level": "info", "message": f"consolidation_pressure={level} score={pressure.get('score')}"})
        if level in ("high", "critical"):
            warnings.append({"source": "consolidation_pressure", "level": "yellow", "message": f"consolidation pressure is {level}; operator review recommended"})

    context = snapshot.get("context_focus") or {}
    if context:
        info.append({"source": "context_focus", "level": "info", "message": f"context_focus={context.get('status')} refs={context.get('count')}"})

    document_intake = snapshot.get("document_intake") or {}
    if document_intake:
        info.append({"source": "document_intake", "level": "info", "message": f"document_intake={document_intake.get('status')}"})

    result = "fail" if failures else ("warn" if warnings else "pass")
    exit_code = 2 if failures else (1 if strict and warnings else 0)
    return {
        "result": result,
        "exit_code": exit_code,
        "strict": bool(strict),
        "failures": failures,
        "warnings": warnings,
        "info": info,
        "summary": {
            "failures": len(failures),
            "warnings": len(warnings),
            "info": len(info),
        },
        "repo": snapshot.get("repo"),
        "ts": snapshot.get("ts"),
        "read_only": True,
        "not_canonical_truth": True,
    }


def print_check_human(check):
    title = f"AIDP Check: {check['result'].upper()}"
    print(title)
    print("=" * len(title))
    print(f"Repo: {check.get('repo')}")
    print(f"Failures: {check['summary']['failures']} | Warnings: {check['summary']['warnings']} | Info: {check['summary']['info']}")
    print("Read-only: yes")
    if check["failures"]:
        print("\nFAIL")
        for item in check["failures"]:
            print(f"- {item.get('message', item)}")
    if check["warnings"]:
        print("\nWARN")
        for item in check["warnings"]:
            print(f"- {item.get('message', item)}")
    if check["info"]:
        print("\nINFO")
        for item in check["info"][:30]:
            print(f"- {item.get('message', item)}")
    print("\nExit code:", check["exit_code"])


def main():
    ap = argparse.ArgumentParser(description="AIDP read-only monitor server and check tool")
    ap.add_argument("--repo", default=os.getcwd(), help="Repository path containing .aidp")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--check", action="store_true", help="Run read-only AIDP checks and exit")
    ap.add_argument("--json", dest="json_output", action="store_true", help="With --check, print JSON result")
    ap.add_argument("--strict", action="store_true", help="With --check, return exit 1 for warnings")
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    if not (repo / ".aidp").exists():
        print(f"WARNING: {repo} does not contain .aidp/", file=sys.stderr)

    if args.check:
        snapshot = build_snapshot(repo)
        check = classify_check(snapshot, strict=args.strict)
        if args.json_output:
            print(json.dumps(check, indent=2, sort_keys=True))
        else:
            print_check_human(check)
        raise SystemExit(int(check.get("exit_code", 0)))

    Handler.repo = repo
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"AIDP Monitor serving {repo}")
    print(f"Open http://{args.host}:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping.")


if __name__ == "__main__":
    main()
