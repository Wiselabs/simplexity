import {app, BrowserWindow, Menu, MenuItem, ipcMain, nativeTheme, shell, clipboard} from 'electron';
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

    let currentRequestId = 0;  // Para rastrear

    const execSearch = () => {
        const parentBounds = win.getBounds();
        const searchWidth = 450;
        const searchHeight = 140;
        const x = parentBounds.x + (parentBounds.width - searchWidth) / 2;
        const y = parentBounds.y + (parentBounds.height - searchHeight) / 2;
        const searchWin = new BrowserWindow({
            parent: win,
            modal: true,
            title: 'Loading...',
            x: Math.round(x),
            y: Math.round(y),
            width: 500,
            height: 130,
            show: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        searchWin.loadFile('search.html').then(() => {
            searchWin.title = 'Find';
        });

        searchWin.once('ready-to-show', () => searchWin.show());

        // Handler da busca
        const doSearch = (event, { text, forward }) => {
            if (!text) {
                win.webContents.stopFindInPage('clearSelection');
                return;
            }
            currentRequestId = win.webContents.findInPage(text, {
                forward,
                matchCase: false
            });
        };

        ipcMain.on('search', doSearch);

        const foundHandler = (event, result) => {
            if (result.requestId === currentRequestId) {
                searchWin.webContents.send('search-result', result);
            }
        };
        win.webContents.on('found-in-page', foundHandler);

        const execQuietly = (fn) => {
            try {
                fn();
            }catch (e) {
                //
            }
        }

        const cleanup = () => {
            execQuietly(() => ipcMain.removeListener('search', doSearch));
            execQuietly(() => win.webContents.removeListener('found-in-page', foundHandler));
            execQuietly(() => win.webContents.stopFindInPage('clearSelection'));
            execQuietly(() => ipcMain.removeAllListeners('search-cancel'));
        };

        ipcMain.once('search-cancel', () => {
            searchWin.close();
        });

        win.once('closed', () => {
            searchWin.destroy();
            cleanup();
        });

        searchWin.once('closed', () => {
            searchWin.destroy();
            cleanup();
        });
    }

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

            // noinspection ES6MissingAwait
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
                        win.reload();
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
            label: 'Edit',
            submenu: [
                {
                    label: 'Find...',
                    accelerator: "CommandOrControl+F",
                    click() {
                        execSearch();
                    }
                },
                { type: 'separator' },
                { role: 'copy' },
                { role: 'cut' },
                { role: 'paste' }
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
            // noinspection JSIgnoredPromiseFromCall
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
        if(params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
            menu.append(new MenuItem({type: 'separator'}));
            for (const suggestion of params.dictionarySuggestions) {
                menu.append(new MenuItem({
                    label: suggestion,
                    click: () => win.webContents.replaceMisspelling(suggestion)
                }))
            }
        }
        if (params.misspelledWord) {
            menu.append(
                new MenuItem({
                    label: 'Add to dictionary',
                    click: () => myWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
                })
            )
        }

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