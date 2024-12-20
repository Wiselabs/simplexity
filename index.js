import {app, BrowserWindow, Menu, shell} from 'electron';
import windowStateKeeper from 'electron-window-state';
import path from 'path';
import { fileURLToPath } from "url";
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
            partition: 'persist:simplexity'
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
            aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
                // open url in a browser and prevent default
                shell.openExternal(url);
                return { action: 'deny' };
            });
            aboutWindow.on('closed', () => {
                aboutWindow = null;
            });
        } else {
            aboutWindow.focus();
        }
    }

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

    Menu.setApplicationMenu(Menu.buildFromTemplate(appMenu));
    win.setIcon(path.join(__dirname, 'img/icon.png'));
    win.setTitle(app.getName() + ' - ' + app.getVersion());

    win.on('did-start-navigation', function () {
        session.defaultSession.cookies.flushStore();
    });

    win.on('did-navigate', function () {
        session.defaultSession.cookies.flushStore();
    });
    mainWindowState.manage(win);
    win.loadURL("https://perplexity.ai");
}

app.whenReady().then(() => {
    createWindow()
});