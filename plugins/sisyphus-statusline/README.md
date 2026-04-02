# Sisyphus Statusline

A tmux plugin that applies the Sisyphus statusline look:

- left-side window tabs with right-pointing powerline arrows
- right-side status bands with left-pointing powerline arrows
- spacing and separator behavior tuned to match the Sisyphus daemon output

## Install with TPM

Add this to `.tmux.conf`:

```tmux
set -g @plugin 'CaptainCrouton89/sisyphus'
run '~/.tmux/plugins/tpm/tpm'
```

Then source the plugin entrypoint explicitly:

```tmux
run-shell '~/.tmux/plugins/sisyphus/plugins/sisyphus-statusline/sisyphus-statusline.tmux'
```

Reload tmux or run `prefix + I`.

## Manual usage

Run:

```bash
plugins/sisyphus-statusline/scripts/apply-tmux-statusline.sh
```

## Notes

- Requires a Nerd Font for `` and ``.
- This plugin only applies tmux formatting.
- The dynamic `@sisyphus_status` content still comes from `sisyphusd`.
