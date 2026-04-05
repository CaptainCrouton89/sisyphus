-- Sisyphus: ANSI escape code rendering for neovim
-- Auto-detects buffers containing ANSI escape codes and colorizes them.
-- Installed by `sisyphus setup`. Safe to customize or remove.
return {
  "m00qek/baleia.nvim",
  version = "*",
  event = "BufReadPost",
  config = function()
    local b = require("baleia").setup({ async = false })

    local function has_ansi(buf)
      local count = vim.api.nvim_buf_line_count(buf)
      local lines = vim.api.nvim_buf_get_lines(buf, 0, math.min(100, count), false)
      for _, line in ipairs(lines) do
        if line:find("\27%[") then
          return true
        end
      end
      return false
    end

    -- Colorize the buffer that triggered the plugin load
    if has_ansi(0) then
      b.once(0)
    end

    -- Auto-detect for all future buffers
    vim.api.nvim_create_autocmd("BufReadPost", {
      callback = function(ev)
        if has_ansi(ev.buf) then
          vim.defer_fn(function()
            b.once(ev.buf)
          end, 10)
        end
      end,
    })

    vim.api.nvim_create_user_command("BaleiaColorize", function()
      b.once(vim.api.nvim_get_current_buf())
    end, {})
  end,
}
