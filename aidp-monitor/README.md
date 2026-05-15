# AIDP Monitor

AIDP Monitor is an optional, read-only dashboard for `.aidp/*` owner-file projections and git state.

It is not AIDP canon and must not write to `.aidp/*`.

## Run

```bash
python3 aidp-monitor/server.py --repo /path/to/repo
```

Open the printed URL, usually:

```text
http://127.0.0.1:8765/
```

## UI notes

- The dashboard is tabbed: Overview, Work, Intelligence, Knowledge, Warnings, Raw.
- Raw monitor blocks are debug-only and collapsed by default.
- Auto-refresh pauses DOM updates while you select text, focus an input, or copy from a textarea.
- The suggested audit prompt has a Copy button.
- The monitor server sets `sys.dont_write_bytecode = True` to avoid creating `__pycache__` in normal use.

## Safety

- Read-only: the monitor does not modify `.aidp/*`.
- Monitor blocks are projections, not proof and not a second canon.
- Derived warnings are inferred signals; they should be surfaced to the operator but handled through normal AIDP routes.
- Local monitor cache, if you add one externally, must live outside `.aidp/`.


## 1.8.12 write-ahead work-state warnings

The monitor warns when product/source/config/test-like files change while AIDP live state is on `docs-operator`, `audit`, `bootstrap`, or repair-oriented work. It also warns when `work.md` appears to accumulate multiple current/latest sections instead of staying live memory. These warnings are read-only; fix them through AIDP repair/audit/docs-operator flow.

## Read-only check mode

AIDP 1.8.12 adds a read-only CLI check mode that uses the same monitor parsing/warning logic without starting the web UI.

If running from a project that already contains `aidp-monitor/`:

```bash
python3 ./aidp-monitor/server.py --repo . --check
python3 ./aidp-monitor/server.py --repo . --check --json
python3 ./aidp-monitor/server.py --repo . --check --strict
```

Exit codes:

- `0` — no hard failures;
- `1` — warnings only with `--strict`;
- `2` — hard failure.

Check mode is read-only. It does not write `.aidp/*` and does not replace AIDP owner-file truth.
