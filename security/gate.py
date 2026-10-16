#!/usr/bin/env python3
"""Security gate: read all scanner reports, apply gate-policy.toml, exit 1 on violation.

Usage (from the repo root):
    python security/gate.py --reports security/reports [--policy security/gate-policy.toml]

Expected files in the reports dir (a missing report is a FAIL - a scan that
silently did not run must never count as a pass):
    bandit.json            bandit -f json
    pip-audit.json         pip-audit -f json
    npm-audit.json         npm audit --json
    gitleaks.json          gitleaks --report-format json
    trivy-image-*.json     trivy image -f json  (one per image, at least one)
"""

import argparse
import json
import os
import sys
import tomllib
from pathlib import Path

LEVELS = {"UNDEFINED": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}


def load(path: Path):
    if not path.exists():
        return None
    text = path.read_text().strip()
    return json.loads(text) if text else []


def check_sast(report, policy):
    sev, conf = LEVELS[policy["min_severity"]], LEVELS[policy["min_confidence"]]
    results = report.get("results", [])
    bad = [
        r for r in results if LEVELS[r["issue_severity"]] >= sev and LEVELS[r["issue_confidence"]] >= conf
    ]
    lines = [
        f"{r['test_id']} {r['issue_severity']}/{r['issue_confidence']} "
        f"{r['filename']}:{r['line_number']} {r['issue_text']}"
        for r in bad
    ]
    return not bad, f"{len(results)} total, {len(bad)} blocking", lines


def check_pip_audit(report, policy):
    allowed = {a["id"] for a in policy.get("allow", [])}
    vulns, seen = [], set()
    for dep in report.get("dependencies", []):
        for v in dep.get("vulns", []):
            key = (dep["name"], v["id"])
            if {v["id"], *v.get("aliases", [])} & allowed or key in seen:
                continue
            seen.add(key)
            fix = ",".join(v.get("fix_versions", [])) or "none"
            vulns.append(f"{dep['name']}=={dep['version']} {v['id']} (fix: {fix})")
    ok = len(vulns) <= policy["max_vulnerabilities"]
    return ok, f"{len(vulns)} vulnerable (limit {policy['max_vulnerabilities']})", vulns


def check_npm_audit(report, policy):
    block = set(policy.get("npm_block_severities", ["high", "critical"]))
    allowed = {a["id"] for a in policy.get("allow", [])}
    bad = []
    for name, v in (report.get("vulnerabilities") or {}).items():
        if v.get("severity") not in block:
            continue
        ids = {str(s.get("url", "")).rsplit("/", 1)[-1] for s in v.get("via", []) if isinstance(s, dict)}
        if ids & allowed:
            continue
        bad.append(f"{name} {v.get('severity')} range={v.get('range')}")
    counts = (report.get("metadata") or {}).get("vulnerabilities", {})
    total = counts.get("total", 0)
    return not bad, f"{total} total, {len(bad)} blocking ({'/'.join(sorted(block))})", bad


def check_secrets(report, policy):
    lines = [f"{f['RuleID']} {f['File']}:{f['StartLine']}" for f in report]
    ok = len(report) <= policy["max_findings"]
    return ok, f"{len(report)} findings (limit {policy['max_findings']})", lines


def check_image(report, policy):
    block = set(policy["block_severities"])
    bad, total = [], 0
    for res in report.get("Results", []) or []:
        for v in res.get("Vulnerabilities", []) or []:
            total += 1
            if v["Severity"] not in block:
                continue
            if policy["ignore_unfixed"] and not v.get("FixedVersion"):
                continue
            bad.append(
                f"{v['Severity']} {v['VulnerabilityID']} {v['PkgName']} "
                f"{v['InstalledVersion']} -> {v.get('FixedVersion')} ({res['Target']})"
            )
    return not bad, f"{total} total, {len(bad)} fixable {'/'.join(sorted(block))}", bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reports", default="security/reports", type=Path)
    ap.add_argument("--policy", default=Path(__file__).with_name("gate-policy.toml"), type=Path)
    args = ap.parse_args()
    policy = tomllib.loads(args.policy.read_text())

    checks = [
        ("SAST (bandit)", args.reports / "bandit.json", policy["sast"], check_sast),
        ("SCA (pip-audit)", args.reports / "pip-audit.json", policy["sca"], check_pip_audit),
        ("SCA (npm audit)", args.reports / "npm-audit.json", policy["sca"], check_npm_audit),
        ("Secrets (gitleaks)", args.reports / "gitleaks.json", policy["secrets"], check_secrets),
    ]
    images = sorted(args.reports.glob("trivy-image-*.json"))
    if not images:
        checks.append(("Image (trivy)", args.reports / "trivy-image-*.json", policy["image"], check_image))
    for img in images:
        name = img.stem.removeprefix("trivy-image-")
        checks.append((f"Image {name} (trivy)", img, policy["image"], check_image))

    failed = False
    print(f"Security gate - policy {os.path.relpath(args.policy)}, reports {args.reports}/")
    print("-" * 72)
    for title, path, pol, fn in checks:
        report = load(path)
        if report is None:
            print(f"[FAIL] {title:26} report {path.name} missing")
            failed = True
            continue
        ok, summary, details = fn(report, pol)
        print(f"[{'PASS' if ok else 'FAIL'}] {title:26} {summary}")
        for d in details[:20]:
            print(f"         - {d}")
        if len(details) > 20:
            print(f"         ... and {len(details) - 20} more")
        failed |= not ok
    print("-" * 72)
    print("GATE RESULT: " + ("FAILED - release blocked" if failed else "PASSED - ok to push and deploy"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
