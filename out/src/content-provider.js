"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const atom_1 = require("atom");
const path = require("path");
const fs = require("fs");
const mume = require("@shd101wyy/mume");
// TODO: presentation PDF export.
// TODO: <!-- @import [toc] -->
/**
 * Key is editor.getPath()
 * Value is temp html file path.
 */
const HTML_FILES_MAP = {};
/**
 * The markdown previewer
 */
class MarkdownPreviewEnhancedView {
    constructor(uri, config) {
        this.element = null;
        this.iframe = null;
        this.uri = '';
        this.disposables = null;
        /**
         * The editor binded to this preview.
         */
        this.editor = null;
        /**
         * Configs.
         */
        this.config = null;
        /**
         * Markdown engine.
         */
        this.engine = null;
        this.editorScrollDelay = Date.now();
        this.scrollTimeout = null;
        this.zoomLevel = 1;
        this._destroyCB = null;
        this.uri = uri;
        this.config = config;
        this.element = document.createElement('div');
        this.iframe = document.createElement('iframe');
        this.iframe.style.width = '100%';
        this.iframe.style.height = '100%';
        this.iframe.style.border = 'none';
        this.iframe.src = path.resolve(__dirname, '../../html/loading.html');
        this.element.appendChild(this.iframe);
    }
    getURI() {
        return this.uri;
    }
    getIconName() {
        return 'markdown';
    }
    getTitle() {
        let fileName = 'unknown';
        if (this.editor) {
            fileName = this.editor['getFileName']();
        }
        return `${fileName} preview`;
    }
    updateTabTitle() {
        if (!this.config.singlePreview)
            return;
        const title = this.getTitle();
        const tabTitle = document.querySelector('[data-type="MarkdownPreviewEnhancedView"] div.title');
        if (tabTitle)
            tabTitle.innerText = title;
    }
    /**
     * Get the markdown editor for this preview
     */
    getEditor() {
        return this.editor;
    }
    /**
     * Get markdown engine
     */
    getMarkdownEngine() {
        return this.engine;
    }
    /**
     * Bind editor to preview
     * @param editor
     */
    bindEditor(editor) {
        if (!this.editor) {
            this.editor = editor; // this has to be put here, otherwise the tab title will be `unknown`
            atom.workspace.open(this.uri, {
                split: "right",
                activatePane: false,
                activateItem: true,
                searchAllPanes: false,
                initialLine: 0,
                initialColumn: 0,
                pending: false
            })
                .then(() => {
                this.initEvents();
            });
        }
        else {
            this.editor = editor;
            this.initEvents();
        }
    }
    initEvents() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.disposables) {
                this.disposables.dispose();
            }
            this.disposables = new atom_1.CompositeDisposable();
            // reset tab title
            this.updateTabTitle();
            // reset 
            this.JSAndCssFiles = [];
            // init markdown engine 
            this.engine = new mume.MarkdownEngine({
                filePath: this.editor.getPath(),
                projectDirectoryPath: this.getProjectDirectoryPath(),
                config: this.config
            });
            yield this.loadPreview();
            this.initEditorEvents();
        });
    }
    /**
     * This function will
     * 1. Create a temp *.html file
     * 2. Write preview html template
     * 3. this.iframe will load that *.html file.
     */
    loadPreview() {
        return __awaiter(this, void 0, void 0, function* () {
            const editorFilePath = this.editor.getPath();
            this.postMessage({ command: 'startParsingMarkdown' });
            // create temp html file for preview
            let htmlFilePath;
            if (editorFilePath in HTML_FILES_MAP) {
                htmlFilePath = HTML_FILES_MAP[editorFilePath];
            }
            else {
                const info = yield mume.utility.tempOpen({ prefix: 'mpe_preview', suffix: '.html' });
                htmlFilePath = info.path;
                HTML_FILES_MAP[editorFilePath] = htmlFilePath;
            }
            // load preview template
            const html = yield this.engine.generateHTMLTemplateForPreview({
                inputString: this.editor.getText(),
                config: {
                    sourceUri: this.editor.getPath(),
                    initialLine: this.editor.getCursorBufferPosition().row,
                    zoomLevel: this.zoomLevel
                },
                webviewScript: path.resolve(__dirname, './webview.js')
            });
            yield mume.utility.writeFile(htmlFilePath, html, { encoding: 'utf-8' });
            // load to iframe
            // background iframe
            const backgroundIframe = document.createElement('iframe');
            backgroundIframe.style.width = '100%';
            backgroundIframe.style.height = '100%';
            backgroundIframe.style.border = 'none';
            backgroundIframe.style.display = 'none';
            this.element.appendChild(backgroundIframe);
            /*
            if (this.iframe.src === htmlFilePath) {
              this.iframe.contentWindow.location.reload()
            } else {
              this.iframe.src = htmlFilePath
            }*/
            backgroundIframe.src = htmlFilePath;
            backgroundIframe.onload = () => {
                // replace this.iframe to backgroundIframe
                backgroundIframe.style.display = 'block';
                this.iframe.remove();
                this.iframe = backgroundIframe;
                if (!this.engine.isPreviewInPresentationMode) {
                    this.renderMarkdown();
                }
            };
            // test postMessage
            /*
            setTimeout(()=> {
              this.iframe.contentWindow.postMessage({type: 'update-html'}, 'file://')
            }, 2000)
            */
        });
    }
    initEditorEvents() {
        const editorElement = this.editor['getElement'](); // dunno why `getElement` not found.
        this.disposables.add(atom.commands.add(editorElement, {
            'markdown-preview-enhanced:sync-preview': () => {
                this.syncPreview();
            }
        }));
        this.disposables.add(this.editor.onDidDestroy(() => {
            if (this.disposables) {
                this.disposables.dispose();
                this.disposables = null;
            }
            this.editor = null;
            if (!this.config.singlePreview && this.config.closePreviewAutomatically) {
                const pane = atom.workspace.paneForItem(this);
                pane.destroyItem(this); // this will trigger @destroy()
            }
        }));
        this.disposables.add(this.editor.onDidStopChanging(() => {
            if (this.config.liveUpdate)
                this.renderMarkdown();
        }));
        this.disposables.add(this.editor.onDidSave(() => {
            this.renderMarkdown(true);
        }));
        this.disposables.add(editorElement['onDidChangeScrollTop'](() => {
            if (!this.config.scrollSync)
                return;
            if (Date.now() < this.editorScrollDelay)
                return;
            this.syncPreview();
        }));
        this.disposables.add(this.editor.onDidChangeCursorPosition((event) => {
            if (!this.config.scrollSync)
                return;
            if (Date.now() < this.editorScrollDelay)
                return;
            const screenRow = event.newScreenPosition.row;
            const firstVisibleScreenRow = this.editor['getFirstVisibleScreenRow']();
            const lastVisibleScreenRow = this.editor['getLastVisibleScreenRow']();
            const topRatio = (screenRow - firstVisibleScreenRow) / (lastVisibleScreenRow - firstVisibleScreenRow);
            this.postMessage({
                command: 'changeTextEditorSelection',
                line: event.newBufferPosition.row,
                topRatio: topRatio
            });
        }));
    }
    /**
     * sync preview to match source.
     */
    syncPreview() {
        if (!this.editor)
            return;
        const firstVisibleScreenRow = this.editor['getFirstVisibleScreenRow']();
        if (firstVisibleScreenRow === 0) {
            return this.postMessage({
                command: 'changeTextEditorSelection',
                line: 0,
                topRatio: 0
            });
        }
        const lastVisibleScreenRow = this.editor['getLastVisibleScreenRow']();
        if (lastVisibleScreenRow === this.editor.getLastScreenRow()) {
            return this.postMessage({
                command: 'changeTextEditorSelection',
                line: this.editor.getLastBufferRow(),
                topRatio: 1
            });
        }
        let midBufferRow = this.editor['bufferRowForScreenRow'](Math.floor((lastVisibleScreenRow + firstVisibleScreenRow) / 2));
        this.postMessage({
            command: 'changeTextEditorSelection',
            line: midBufferRow,
            topRatio: 0.5
        });
    }
    /**
     * Render markdown
     */
    renderMarkdown(triggeredBySave = false) {
        if (!this.editor)
            return;
        // presentation mode 
        if (this.engine.isPreviewInPresentationMode) {
            return this.loadPreview(); // restart preview.
        }
        // not presentation mode 
        const text = this.editor.getText();
        // notice iframe that we started parsing markdown
        this.postMessage({ command: 'startParsingMarkdown' });
        this.engine.parseMD(text, { isForPreview: true, useRelativeFilePath: false, hideFrontMatter: false, triggeredBySave })
            .then(({ markdown, html, tocHTML, JSAndCssFiles, yamlConfig }) => {
            if (!mume.utility.isArrayEqual(JSAndCssFiles, this.JSAndCssFiles) || yamlConfig['isPresentationMode']) {
                this.loadPreview(); // restart preview
            }
            else {
                this.postMessage({
                    command: 'updateHTML',
                    html,
                    tocHTML,
                    totalLineCount: this.editor.getLineCount(),
                    sourceUri: this.editor.getPath(),
                    id: yamlConfig.id || '',
                    class: yamlConfig.class || ''
                });
            }
        });
    }
    /**
     * Please notice that row is in center.
     * @param row The buffer row
     */
    scrollToBufferPosition(row) {
        if (!this.editor)
            return;
        if (row < 0)
            return;
        this.editorScrollDelay = Date.now() + 500;
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }
        const editorElement = this.editor['getElement']();
        const delay = 10;
        const screenRow = this.editor.screenPositionForBufferPosition([row, 0]).row;
        const scrollTop = screenRow * this.editor['getLineHeightInPixels']() - this.element.offsetHeight / 2;
        const helper = (duration = 0) => {
            this.scrollTimeout = setTimeout(() => {
                if (duration <= 0) {
                    this.editorScrollDelay = Date.now() + 500;
                    editorElement.setScrollTop(scrollTop);
                    return;
                }
                const difference = scrollTop - editorElement.getScrollTop();
                const perTick = difference / duration * delay;
                // disable editor onscroll
                this.editorScrollDelay = Date.now() + 500;
                const s = editorElement.getScrollTop() + perTick;
                editorElement.setScrollTop(s);
                if (s == scrollTop)
                    return;
                helper(duration - delay);
            }, delay);
        };
        const scrollDuration = 120;
        helper(scrollDuration);
    }
    /**
     * Get the project directory path of current this.editor
     */
    getProjectDirectoryPath() {
        if (!this.editor)
            return '';
        const editorPath = this.editor.getPath();
        const projectDirectories = atom.project.getDirectories();
        for (let i = 0; i < projectDirectories.length; i++) {
            const projectDirectory = projectDirectories[i];
            if (projectDirectory.contains(editorPath))
                return projectDirectory.getPath();
        }
        return '';
    }
    /**
     * Post message to this.iframe
     * @param data
     */
    postMessage(data) {
        if (this.iframe && this.iframe.contentWindow)
            this.iframe.contentWindow.postMessage(data, 'file://');
    }
    updateConfiguration() {
        if (this.engine) {
            this.engine.updateConfiguration(this.config);
        }
    }
    refreshPreview() {
        if (this.engine) {
            this.engine.clearCaches();
            // restart iframe 
            this.loadPreview();
        }
    }
    openInBrowser() {
        this.engine.openInBrowser({})
            .catch((error) => {
            atom.notifications.addError(error);
        });
    }
    htmlExport(offline) {
        atom.notifications.addInfo('Your document is being prepared');
        this.engine.htmlExport({ offline })
            .then((dest) => {
            atom.notifications.addSuccess(`File ${path.basename(dest)} was created at path: ${dest}`);
        })
            .catch((error) => {
            atom.notifications.addError(error);
        });
    }
    phantomjsExport(fileType = 'pdf') {
        atom.notifications.addInfo('Your document is being prepared');
        this.engine.phantomjsExport({ fileType })
            .then((dest) => {
            atom.notifications.addSuccess(`File ${path.basename(dest)} was created at path: ${dest}`);
        })
            .catch((error) => {
            atom.notifications.addError(error);
        });
    }
    princeExport() {
        atom.notifications.addInfo('Your document is being prepared');
        this.engine.princeExport({})
            .then((dest) => {
            atom.notifications.addSuccess(`File ${path.basename(dest)} was created at path: ${dest}`);
        })
            .catch((error) => {
            atom.notifications.addError(error);
        });
    }
    eBookExport(fileType) {
        atom.notifications.addInfo('Your document is being prepared');
        this.engine.eBookExport({ fileType })
            .then((dest) => {
            atom.notifications.addSuccess(`File ${path.basename(dest)} was created at path: ${dest}`);
        })
            .catch((error) => {
            atom.notifications.addError(error);
        });
    }
    pandocExport() {
        atom.notifications.addInfo('Your document is being prepared');
        this.engine.pandocExport({})
            .then((dest) => {
            atom.notifications.addSuccess(`File ${path.basename(dest)} was created at path: ${dest}`);
        })
            .catch((error) => {
            atom.notifications.addError(error);
        });
    }
    markdownExport() {
        atom.notifications.addInfo('Your document is being prepared');
        this.engine.markdownExport({})
            .then((dest) => {
            atom.notifications.addSuccess(`File ${path.basename(dest)} was created at path: ${dest}`);
        })
            .catch((error) => {
            atom.notifications.addError(error);
        });
    }
    cacheCodeChunkResult(id, result) {
        this.engine.cacheCodeChunkResult(id, result);
    }
    runCodeChunk(codeChunkId) {
        if (!this.engine)
            return;
        this.engine.runCodeChunk(codeChunkId)
            .then(() => {
            this.renderMarkdown();
        });
    }
    runAllCodeChunks() {
        if (!this.engine)
            return;
        this.engine.runAllCodeChunks()
            .then(() => {
            this.renderMarkdown();
        });
    }
    sendRunCodeChunkCommand() {
        this.postMessage({ command: 'runCodeChunk' });
    }
    startImageHelper() {
        this.postMessage({ command: 'openImageHelper' });
    }
    setZoomLevel(zoomLevel) {
        this.zoomLevel = zoomLevel || 1;
    }
    pasteImageFile(imageFilePath) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.editor)
                return;
            const imageFolderPath = this.config.imageFolderPath;
            let imageFileName = path.basename(imageFilePath);
            const projectDirectoryPath = this.getProjectDirectoryPath();
            let assetDirectoryPath, description;
            if (imageFolderPath[0] === '/') {
                assetDirectoryPath = path.resolve(projectDirectoryPath, '.' + imageFolderPath);
            }
            else {
                assetDirectoryPath = path.resolve(path.dirname(this.editor.getPath()), imageFolderPath);
            }
            const destPath = path.resolve(assetDirectoryPath, path.basename(imageFilePath));
            fs.mkdir(assetDirectoryPath, (error) => {
                fs.stat(destPath, (err, stat) => {
                    if (err == null) {
                        const lastDotOffset = imageFileName.lastIndexOf('.');
                        const uid = '_' + Math.random().toString(36).substr(2, 9);
                        if (lastDotOffset > 0) {
                            description = imageFileName.slice(0, lastDotOffset);
                            imageFileName = imageFileName.slice(0, lastDotOffset) + uid + imageFileName.slice(lastDotOffset, imageFileName.length);
                        }
                        else {
                            description = imageFileName;
                            imageFileName = imageFileName + uid;
                        }
                        fs.createReadStream(imageFilePath).pipe(fs.createWriteStream(path.resolve(assetDirectoryPath, imageFileName)));
                    }
                    else if (err.code === 'ENOENT') {
                        fs.createReadStream(imageFilePath).pipe(fs.createWriteStream(destPath));
                        if (imageFileName.lastIndexOf('.'))
                            description = imageFileName.slice(0, imageFileName.lastIndexOf('.'));
                        else
                            description = imageFileName;
                    }
                    else {
                        return atom.notifications.addError(err.toString());
                    }
                    atom.notifications.addInfo(`Image ${imageFileName} has been copied to folder ${assetDirectoryPath}`);
                    let url = `${imageFolderPath}/${imageFileName}`;
                    if (url.indexOf(' ') >= 0)
                        url = `<${url}>`;
                    this.editor.insertText(`![${description}](${url})`);
                });
            });
        });
    }
    replaceHint(bufferRow, hint, withStr) {
        if (!this.editor)
            return false;
        let textLine = this.editor.buffer.lines[bufferRow];
        if (textLine.indexOf(hint) >= 0) {
            this.editor.buffer.setTextInRange([
                [bufferRow, 0],
                [bufferRow, textLine.length],
            ], textLine.replace(hint, withStr));
            return true;
        }
        return false;
    }
    setUploadedImageURL(imageFileName, url, hint, bufferRow) {
        let description;
        if (imageFileName.lastIndexOf('.'))
            description = imageFileName.slice(0, imageFileName.lastIndexOf('.'));
        else
            description = imageFileName;
        const withStr = `![${description}](${url})`;
        if (!this.replaceHint(bufferRow, hint, withStr)) {
            let i = bufferRow - 20;
            while (i <= bufferRow + 20) {
                if (this.replaceHint(i, hint, withStr))
                    break;
                i++;
            }
        }
    }
    /**
     * Upload image at imageFilePath by this.config.imageUploader.
     * Then insert markdown image url to markdown file.
     * @param imageFilePath
     */
    uploadImageFile(imageFilePath) {
        if (!this.editor)
            return;
        const imageFileName = path.basename(imageFilePath);
        const uid = Math.random().toString(36).substr(2, 9);
        const hint = `![Uploading ${imageFileName}… (${uid})]()`;
        const bufferRow = this.editor.getCursorBufferPosition().row;
        this.editor.insertText(hint);
        mume.utility.uploadImage(imageFilePath, { method: this.config.imageUploader })
            .then((url) => {
            this.setUploadedImageURL(imageFileName, url, hint, bufferRow);
        })
            .catch((err) => {
            atom.notifications.addError(err);
        });
    }
    destroy() {
        if (this.disposables) {
            this.disposables.dispose();
            this.disposables = null;
        }
        this.element.remove();
        this.editor = null;
        if (this._destroyCB) {
            this._destroyCB(this);
        }
    }
    /**
     * cb will be called when this preview is destroyed.
     * @param cb
     */
    onPreviewDidDestroy(cb) {
        this._destroyCB = cb;
    }
}
exports.MarkdownPreviewEnhancedView = MarkdownPreviewEnhancedView;
function isMarkdownFile(sourcePath) {
    return false;
}
exports.isMarkdownFile = isMarkdownFile;