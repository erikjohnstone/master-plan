# Prewarm cache backup

Snapshot of `~/.cache/opentakeoff-sheet-graph` (SheetGraph cache) and
`~/.cache/opentakeoff-odl` (OpenDataLoader-PDF JSON cache) from the
2026-09-02 cold-build session against the Vol1+Vol2 corpus.

This is a container-safety backup, not permanent repo content — the whole
point of it is that this session's container is ephemeral and everything
in `~/.cache` is lost if it dies. To restore in a fresh session:

```
mkdir -p ~/.cache
tar -xzf .cache-backup/opentakeoff-sheet-graph.tar.gz -C ~/.cache
tar -xzf .cache-backup/opentakeoff-odl.tar.gz -C ~/.cache
```

Safe to delete/replace with a fresher snapshot at any point — it's a
point-in-time backup, not a source of truth.
