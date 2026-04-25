import { app, BaseWindow, WebContentsView, BrowserWindow, Menu, MenuItem, ipcMain, nativeTheme, shell, clipboard } from 'electron';
import windowStateKeeper from 'electron-window-state';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const URLS = {
    perplexity: 'https://perplexity.ai',
    claude: 'https://claude.ai/'
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function saveConfig(data) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {}
}

const createWindow = () => {
    const config = loadConfig();

    const mainWindowState = windowStateKeeper({ defaultWidth: 1000, defaultHeight: 800 });

    const win = new BaseWindow({
        x: mainWindowState.x,
        y: mainWindowState.y,
        width: mainWindowState.width,
        height: mainWindowState.height,
        icon: path.join(__dirname, 'img/icon.png'),
    });
    win.setTitle(app.getName() + ' - ' + app.getVersion());

    const views = {
        perplexity: new WebContentsView({
            webPreferences: { partition: 'persist:simplexity', spellcheck: true }
        }),
        claude: new WebContentsView({
            webPreferences: { partition: 'persist:simplexity', spellcheck: true }
        })
    };

    win.contentView.addChildView(views.perplexity);
    win.contentView.addChildView(views.claude);

    let activeKey = config.lastUrl === URLS.claude ? 'claude' : 'perplexity';

    const fitActiveView = () => {
        const { width, height } = win.getContentBounds();
        views[activeKey].setBounds({ x: 0, y: 0, width, height });
    };

    const switchTo = (key) => {
        views[activeKey].setBounds({ x: 0, y: 0, width: 0, height: 0 });
        activeKey = key;
        fitActiveView();
        saveConfig({ ...loadConfig(), lastUrl: URLS[key] });
    };

    // Initialize bounds: active view fills window, inactive is 0x0
    const { width: initW, height: initH } = win.getContentBounds();
    for (const [key, view] of Object.entries(views)) {
        view.setBounds(key === activeKey
            ? { x: 0, y: 0, width: initW, height: initH }
            : { x: 0, y: 0, width: 0, height: 0 }
        );
    }

    win.on('resize', fitActiveView);

    views.perplexity.webContents.loadURL(URLS.perplexity);
    views.claude.webContents.loadURL(URLS.claude);

    // --- Search (Ctrl+F) ---
    let currentRequestId = 0;

    const execSearch = () => {
        const activeWc = views[activeKey].webContents;
        const parentBounds = win.getBounds();
        const searchWidth = 500;
        const searchHeight = 130;

        const searchWin = new BrowserWindow({
            x: Math.round(parentBounds.x + (parentBounds.width - searchWidth) / 2),
            y: Math.round(parentBounds.y + (parentBounds.height - searchHeight) / 2),
            width: searchWidth,
            height: searchHeight,
            show: false,
            minimizable: false,
            maximizable: false,
            resizable: false,
            webPreferences: { nodeIntegration: true, contextIsolation: false }
        });
        searchWin.removeMenu();
        searchWin.loadFile('search.html').then(() => { searchWin.title = 'Find'; });
        searchWin.once('ready-to-show', () => searchWin.show());

        const doSearch = (event, { text, forward }) => {
            if (!text) { activeWc.stopFindInPage('clearSelection'); return; }
            currentRequestId = activeWc.findInPage(text, { forward, matchCase: false });
        };
        ipcMain.on('search', doSearch);

        const foundHandler = (event, result) => {
            if (result.requestId === currentRequestId) {
                searchWin.webContents.send('search-result', result);
            }
        };
        activeWc.on('found-in-page', foundHandler);

        const execQuietly = (fn) => { try { fn(); } catch (e) {} };
        const cleanup = () => {
            execQuietly(() => ipcMain.removeListener('search', doSearch));
            execQuietly(() => activeWc.removeListener('found-in-page', foundHandler));
            execQuietly(() => activeWc.stopFindInPage('clearSelection'));
            execQuietly(() => ipcMain.removeAllListeners('search-cancel'));
        };

        ipcMain.once('search-cancel', () => searchWin.close());
        win.once('closed', () => { searchWin.destroy(); cleanup(); });
        searchWin.once('closed', cleanup);
    };

    // --- About window ---
    let aboutWindow = null;

    const createAboutWindow = async () => {
        if (aboutWindow == null) {
            aboutWindow = new BrowserWindow({
                width: 450, height: 550,
                show: false, minimizable: false, maximizable: false,
            });
            aboutWindow.setIcon(path.join(__dirname, 'img/icon.png'));
            aboutWindow.removeMenu();
            aboutWindow.loadFile(path.join(__dirname, 'about.html'));
            aboutWindow.webContents.on('dom-ready', () => {
                aboutWindow.webContents.executeJavaScript(`document.getElementById('version').innerHTML = '${app.getVersion()}';`);
                aboutWindow.show();
            });
            aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
                shell.openExternal(url);
                return { action: 'deny' };
            });
            aboutWindow.on('closed', () => { aboutWindow = null; });
        } else {
            aboutWindow.focus();
        }
    };

    // --- Dark mode IPC ---
    ipcMain.handle('dark-mode:toggle', () => {
        nativeTheme.themeSource = nativeTheme.shouldUseDarkColors ? 'light' : 'dark';
        return nativeTheme.shouldUseDarkColors;
    });
    ipcMain.handle('dark-mode:system', () => { nativeTheme.themeSource = 'system'; });

    // --- URL routing + context menu on each view ---
    const openNewUrl = (url, e) => {
        const allowed = ['perplexity.ai', 'claude.ai', 'accounts.google.com', 'appleid.apple.com'];
        if (url && !allowed.some(h => url.includes(h))) {
            if (e) e.preventDefault();
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    };

    for (const view of Object.values(views)) {
        const wc = view.webContents;

        wc.on('will-navigate', (e, url) => openNewUrl(url, e));
        wc.setWindowOpenHandler(({ url }) => openNewUrl(url));

        wc.on('context-menu', (event, params) => {
            const menu = Menu.buildFromTemplate([
                { label: 'Copy',      role: 'copy',  enabled: params.selectionText.trim().length > 0 },
                { label: 'Cut',       role: 'cut',   enabled: params.editFlags.canCut },
                { label: 'Paste',     role: 'paste', enabled: params.editFlags.canPaste },
                { label: 'Copy Link', visible: !!params.linkURL, click: () => clipboard.writeText(params.linkURL) }
            ]);
            if (params.dictionarySuggestions?.length > 0) {
                menu.append(new MenuItem({ type: 'separator' }));
                for (const suggestion of params.dictionarySuggestions) {
                    menu.append(new MenuItem({
                        label: suggestion,
                        click: () => wc.replaceMisspelling(suggestion)
                    }));
                }
            }
            if (params.misspelledWord) {
                menu.append(new MenuItem({
                    label: 'Add to dictionary',
                    click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
                }));
            }
            menu.popup({ window: win });
        });
    }

    // --- Application menu ---
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        {
            label: 'Simplexity',
            submenu: [
                { label: 'Perplexity.AI', accelerator: 'CmdOrCtrl+P', click: () => switchTo('perplexity') },
                { label: 'Claude.AI',     accelerator: 'CmdOrCtrl+L', click: () => switchTo('claude') },
                { type: 'separator' },
                { label: 'Refresh', accelerator: 'CmdOrCtrl+R', click: () => views[activeKey].webContents.reload() },
                { type: 'separator' },
                { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { label: 'Find...', accelerator: 'CommandOrControl+F', click: () => execSearch() },
                { type: 'separator' },
                { role: 'copy' }, { role: 'cut' }, { role: 'paste' }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Zoom In', accelerator: 'CmdOrCtrl+=',
                    click: () => { const wc = views[activeKey].webContents; wc.setZoomLevel(wc.getZoomLevel() + 0.5); }
                },
                {
                    label: 'Zoom Out', accelerator: 'CmdOrCtrl+-',
                    click: () => { const wc = views[activeKey].webContents; wc.setZoomLevel(wc.getZoomLevel() - 0.5); }
                },
                { type: 'separator' },
                {
                    label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0',
                    click: () => views[activeKey].webContents.setZoomLevel(0)
                }
            ]
        },
        {
            label: 'Help',
            submenu: [
                { label: 'About',   accelerator: 'F1',          click: createAboutWindow },
                { label: 'Support', accelerator: 'CmdOrCtrl+H', click: () => shell.openExternal('https://github.com/dieg000w/simplexity-enhanced/issues') },
                { type: 'separator' },
                { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
            ]
        }
    ]));

    mainWindowState.manage(win);
};

app.whenReady().then(() => {
    createWindow();
});
