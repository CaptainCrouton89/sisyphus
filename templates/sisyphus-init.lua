-- ~/.config/sisyphus/init.lua
-- Loaded only when nvim is invoked as `NVIM_APPNAME=sisyphus nvim ...` (compose popup).

vim.opt.swapfile = false
vim.opt.backup = false
vim.opt.writebackup = false
vim.opt.undofile = false
vim.opt.signcolumn = 'no'
vim.opt.number = false
vim.opt.relativenumber = false
vim.opt.wrap = true
vim.opt.linebreak = true

-- Force markdown filetype (compose temp files are .md)
vim.api.nvim_create_autocmd({ 'BufNewFile', 'BufRead' }, {
  pattern = '*',
  callback = function() vim.bo.filetype = 'markdown' end,
})

-- Enter insert mode automatically when the buffer opens.
vim.api.nvim_create_autocmd({ 'BufWinEnter' }, {
  pattern = '*',
  callback = function() vim.cmd('startinsert') end,
})

-- :w autosaves and quits. :q without :w cancels.
vim.api.nvim_create_autocmd('BufWritePost', {
  pattern = '*',
  callback = function() vim.cmd('quit!') end,
})
