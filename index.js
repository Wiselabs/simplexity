import {app, BrowserWindow, Menu, ipcMain, nativeTheme, shell, clipboard} from 'electron';
import windowStateKeeper from 'electron-window-state';
import path from 'path';
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createWindow = () => {
    let mainWindowState = windowStateKeeper({
        defaultWidth: 1000,
        defaultHeight: 800
    });
    const win = new BrowserWindow({
        x: mainWindowState.x,
        y: mainWindowState.y,
        width: mainWindowState.width,
        height: mainWindowState.height,
        webPreferences: {
            partition: 'persist:simplexity',
            spellcheck: true
        }
    });

    let aboutWindow = null;

    async function createAboutWindow() {
        // Define our main window size
        if (aboutWindow == null) {
            aboutWindow = new BrowserWindow({
                width: 450,
                height: 550,
                show: false,
                minimizable: false,
                maximizable: false,
                parent: win
            });
            aboutWindow.setIcon(path.join(__dirname, 'img/icon.png'));

            aboutWindow.removeMenu();

            aboutWindow.loadFile(path.join(__dirname, 'about.html'));
            aboutWindow.webContents.on('dom-ready', () => {
                aboutWindow.webContents.executeJavaScript(`document.getElementById('version').innerHTML = '${app.getVersion()}';`);
                aboutWindow.show();
            });
            aboutWindow.webContents.setWindowOpenHandler(({url}) => {
                // open url in a browser and prevent default
                shell.openExternal(url);
                return {action: 'deny'};
            });
            aboutWindow.on('closed', () => {
                aboutWindow = null;
            });
        } else {
            aboutWindow.focus();
        }
    }

    ipcMain.handle('dark-mode:toggle', () => {
        if (nativeTheme.shouldUseDarkColors) {
            nativeTheme.themeSource = 'light';
        } else {
            nativeTheme.themeSource = 'dark';
        }
        return nativeTheme.shouldUseDarkColors;
    });

    ipcMain.handle('dark-mode:system', () => {
        nativeTheme.themeSource = 'system';
    });

    // Menu
    const appMenu = [
        {
            label: 'Simplexity',
            submenu: [
                {
                    label: 'Perplexity.AI',
                    accelerator: "CmdOrCtrl+P",
                    click: async () => {
                        await win.loadURL("https://perplexity.ai");
                    }
                },
                {
                    label: 'Perplexity Labs',
                    accelerator: "CmdOrCtrl+L",
                    click: async () => {
                        await win.loadURL("https://labs.perplexity.ai");
                    }
                },
                {type: 'separator'},
                {
                    label: 'Refresh',
                    accelerator: "CmdOrCtrl+R",
                    click: async () => {
                        await win.reload();
                    }
                },
                {type: 'separator'},
                {
                    label: 'Quit',
                    accelerator: "CmdOrCtrl+Q",
                    click() {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'resetZoom' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About',
                    accelerator: "F1",
                    click: async () => {
                        await createAboutWindow();
                    }
                },
                {
                    label: 'Support',
                    accelerator: "CmdOrCtrl+H",
                    click: async () => {
                        await shell.openExternal('https://github.com/Wiselabs/simplexity/issues')
                    }
                },
                {type: 'separator'},
                {
                    label: 'Quit',
                    accelerator: "CmdOrCtrl+Q",
                    click() {
                        app.quit();
                    }
                }
            ]
        }
    ];

    const openNewUrl = function (url, e) {
        if (
            url !== null &&
            url.indexOf("perplexity.ai") < 0 &&
            url.indexOf("accounts.google.com") < 0 &&
            url.indexOf("appleid.apple.com") < 0
        ) {
            if (typeof e !== "undefined" && e !== null) {
                e.preventDefault();
            }
            shell.openExternal(url);
            return {action: 'deny'};
        } else {
            return {action: 'allow'};
        }
    }

    const handleRedirect = (e, url) => {
        openNewUrl(url, e);
    }

    Menu.setApplicationMenu(Menu.buildFromTemplate(appMenu));
    win.setIcon(path.join(__dirname, 'img/icon.png'));
    win.setTitle(app.getName() + ' - ' + app.getVersion());

    win.on('did-start-navigation', function () {
        session.defaultSession.cookies.flushStore();
    });

    win.on('did-navigate', function () {
        session.defaultSession.cookies.flushStore();
    });

    win.webContents.on('context-menu', (event, params) => {
        const menu = Menu.buildFromTemplate([
            {
                label: 'Copy',
                role: 'copy',
                enabled: params.selectionText.trim().length > 0,
            },
            {
                label: 'Cut',
                role: 'cut',
                enabled: params.editFlags.canCut,
            },
            {
                label: 'Paste',
                role: 'paste',
                enabled: params.editFlags.canPaste,
            },
            {
                label: 'Copy Link',
                visible: !!params.linkURL,
                click: () => clipboard.writeText(params.linkURL)
            }
        ]);

        menu.popup(win);
    });
    win.webContents.on('will-navigate', handleRedirect);
    win.webContents.on('new-window', handleRedirect);
    win.webContents.setWindowOpenHandler(({url}) => {
        return openNewUrl(url);
    });

    mainWindowState.manage(win);
    win.loadURL("https://perplexity.ai");
}

app.whenReady().then(() => {
    createWindow()
});