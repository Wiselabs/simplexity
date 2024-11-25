import { app, BrowserWindow } from 'electron';
import windowStateKeeper from 'electron-window-state';

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
    })

    win.loadURL("https://perplexity.ai");
    win.setTitle("Simplexity");

    win.on('did-start-navigation', function() {
        session.defaultSession.cookies.flushStore();
    });

    win.on('did-navigate', function() {
        session.defaultSession.cookies.flushStore();
    });
    mainWindowState.manage(win);
}

app.whenReady().then(() => {
    createWindow()
});