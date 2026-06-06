const { Menu, app, dialog, BrowserWindow } = require('electron');

function buildMenu(mainWindow) {
  const isMac = process.platform === 'darwin';

  const template = [
    // macOS app menu
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { label: `关于${app.name}`, role: 'about' },
        { type: 'separator' },
        {
          label: '设置...',
          accelerator: 'Cmd+,',
          click: () => mainWindow?.webContents.send('menu:action', 'open-settings'),
        },
        { type: 'separator' },
        { label: `隐藏${app.name}`, role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { type: 'separator' },
        { label: `退出${app.name}`, role: 'quit' },
      ],
    }] : []),

    // File
    {
      label: '文件',
      submenu: [
        {
          label: '导入文件...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:action', 'open-file'),
        },
        { type: 'separator' },
        {
          label: '导出知识图谱...',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => mainWindow?.webContents.send('menu:action', 'export-graph'),
        },
        { type: 'separator' },
        ...(isMac ? [] : [
          {
            label: '设置...',
            accelerator: 'Ctrl+,',
            click: () => mainWindow?.webContents.send('menu:action', 'open-settings'),
          },
          { type: 'separator' },
        ]),
        ...(isMac ? [] : [{ label: '退出', role: 'quit' }]),
      ],
    },

    // Edit
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },

    // View
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
      ],
    },

    // Window
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭', role: 'close' },
      ],
    },

    // Help
    {
      label: '帮助',
      submenu: [
        {
          label: `关于${app.name}`,
          click: () => {
            dialog.showMessageBox(mainWindow || BrowserWindow.getFocusedWindow(), {
              type: 'info',
              title: `关于${app.name}`,
              message: `${app.name} · AI 知识图谱学习助手`,
              detail: `版本 ${app.getVersion()}\n\n通过 AI 对话帮你梳理技术知识，自动生成结构化知识图谱。`,
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = { buildMenu };
